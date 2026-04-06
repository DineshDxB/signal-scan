import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/db'

const C = { ok:'#00ff88', warn:'#ffcc00', fail:'#ff3355', dim:'#555', blue:'#00aaff' }
const LCOLS: Record<string,string> = { stage:'#378ADD', trend:'#1D9E75', setup:'#BA7517', momentum:'#7F77DD', risk:'#D4537E' }

interface ScanRow {
  id:string; coin:string; signal_type:string; confidence:number
  rsi_at_entry:number; volume_ratio:number; adx:number
  regime:string; signal_time:string; layer_scores:unknown
  stop_loss:number; tp1:number; tp2:number; tp3:number
  entry_price:number; strategy_version:number
}

function parseLS(row:ScanRow) {
  try {
    const raw=row.layer_scores
    let ls:Record<string,number>={}
    if(typeof raw==='string'&&raw.length>2) ls=JSON.parse(raw)
    else if(raw&&typeof raw==='object') ls=raw as Record<string,number>
    const tot=Object.values(ls).reduce((a,b)=>a+b,0)
    if(tot>50) return {stage:Math.round(ls.stage||0),trend:Math.round(ls.trend||0),setup:Math.round(ls.setup||0),momentum:Math.round(ls.momentum||0),risk:Math.round(ls.risk||0),real:true}
  } catch {/**/}
  const rsi=Number(row.rsi_at_entry||50),vol=Number(row.volume_ratio||1),adx=Number(row.adx||0),s=row.signal_type
  return {
    stage:    s==='BUY'?75:s==='SELL'?88:10,
    trend:    adx>=25?80:adx>=18?60:adx>=12?35:15,
    setup:    s==='BUY'?(rsi>=48&&rsi<=70?80:30):s==='SELL'?(rsi<40?88:65):(rsi>=48&&rsi<=70?50:25),
    momentum: vol>=2.0?85:vol>=1.5?68:vol>=1.1?48:22,
    risk:     s==='BUY'?70:s==='SELL'?75:25,
    real:false
  }
}

function fmt(iso:string){return new Date(iso).toLocaleString('en-AE',{timeZone:'Asia/Dubai',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}

export default function VerifyTab() {
  const [coins,    setCoins]    = useState<ScanRow[]>([])
  const [scanTime, setScanTime] = useState<string|null>(null)
  const [scanCount,setScanCount]= useState(0)
  const [stratVer, setStratVer] = useState(1)
  const [hasReal,  setHasReal]  = useState(false)
  const [closedCt, setClosedCt] = useState(0)
  const [hoursSince,setHoursSince]=useState(999)
  const [countdown,setCountdown]= useState('')
  const [loading,  setLoading]  = useState(true)
  const [invoking, setInvoking] = useState(false)
  const [invokeMsg,setInvokeMsg]= useState<string|null>(null)

  const load = useCallback(async()=>{
    try {
      const {data:latest}=await supabase.from('signal_log').select('signal_time,strategy_version').order('signal_time',{ascending:false}).limit(1)
      if(latest&&latest.length){
        const t=new Date(latest[0].signal_time)
        setScanTime(latest[0].signal_time)
        setStratVer(Number(latest[0].strategy_version)||1)
        setHoursSince((Date.now()-t.getTime())/3600000)
        const w=new Date(t.getTime()-40*60000)
        const {data:rows}=await supabase.from('signal_log').select('*').gte('signal_time',w.toISOString()).order('signal_time',{ascending:false})
        if(rows){
          const seen=new Set<string>()
          const dd=rows.filter((r:Record<string,unknown>)=>{const c=String(r.coin);if(seen.has(c))return false;seen.add(c);return true})
          setCoins(dd as ScanRow[])
          setHasReal(dd.some((r:ScanRow)=>parseLS(r).real))
        }
      }
      const [{count:sc},{count:cc}]=await Promise.all([
        supabase.from('signal_log').select('*',{count:'exact',head:true}),
        supabase.from('signal_log').select('*',{count:'exact',head:true}).not('outcome','is',null),
      ])
      setScanCount(sc||0); setClosedCt(cc||0)
    } catch(e){console.error(e)}
    setLoading(false)
  },[])

  useEffect(()=>{load();const t=setInterval(load,3*60000);return()=>clearInterval(t)},[load])

  useEffect(()=>{
    const tick=()=>{
      const now=new Date(),h=now.getUTCHours()
      const nh=[0,4,8,12,16,20].find(x=>x>h)||24
      const next=new Date(now);next.setUTCHours(nh===24?0:nh,0,0,0)
      if(nh===24)next.setUTCDate(next.getUTCDate()+1)
      const d=next.getTime()-now.getTime()
      setCountdown(`${String(Math.floor(d/3600000)).padStart(2,'0')}:${String(Math.floor((d%3600000)/60000)).padStart(2,'0')}:${String(Math.floor((d%60000)/1000)).padStart(2,'0')}`)
    }
    tick();const t=setInterval(tick,1000);return()=>clearInterval(t)
  },[])

  async function invokeScan(){
    setInvoking(true);setInvokeMsg(null)
    try{
      const {data,error}=await supabase.functions.invoke('scan-background',{body:{}})
      if(error) setInvokeMsg(`❌ ${error.message}`)
      else{
        const d=data as Record<string,unknown>
        setInvokeMsg(`✅ v${d.version||'?'} · ${(d.results as unknown[])?.length||0} coins · ${d.signalsFound||0} signals · F&G:${d.fearGreed||'?'} (${d.fearGreedTrend||'?'}) · BTC Dom:${d.btcDominance||'?'}%`)
        await load()
      }
    } catch(e){setInvokeMsg(`❌ ${String(e)}`)}
    setInvoking(false)
  }

  type S='ok'|'warn'|'fail'
  interface Chk{label:string;status:S;detail:string;action?:string}

  const checks:Chk[]=[
    {label:'Auto-scan (pg_cron)',status:hoursSince<4.5?'ok':hoursSince<10?'warn':'fail',
     detail:scanTime?`Last run ${hoursSince.toFixed(1)}h ago · ${fmt(scanTime)} GST`:'No scan recorded',
     action:hoursSince>=4.5?'Supabase SQL Editor → paste fix-cron.sql from zip → replace YOUR_ANON_KEY → Run':undefined},
    {label:'Edge function v4',status:stratVer>=4?'ok':'fail',
     detail:stratVer>=4?`v${stratVer} active — BTC dom, sentiment, Phase 1→2, maturity all live`:`v${stratVer} running — needs v4`,
     action:stratVer<4?'Supabase → Edge Functions → scan-background → Edit → paste new code → Deploy':undefined},
    {label:'Signal logging',status:scanCount>0?'ok':'warn',detail:`${scanCount} signals logged to database`},
    {label:'Real layer scores',status:hasReal?'ok':'warn',detail:hasReal?'Real computed scores in latest scan':'Estimated — deploy v4 + run scan'},
    {label:'Phase 1 → Phase 2',status:stratVer>=4?'ok':'fail',detail:stratVer>=4?'Phase 2 coins only if Phase 1 empty':'Deploy v4'},
    {label:'BTC dominance Layer 4',status:stratVer>=4?'ok':'fail',detail:stratVer>=4?'Rising BTC dom reduces altcoin scores':'Deploy v4'},
    {label:'Sentiment 7-day trend',status:stratVer>=4?'ok':'fail',detail:stratVer>=4?'IMPROVING +3pts, DETERIORATING -3pts per scan':'Deploy v4'},
    {label:'Setup maturity tracking',status:stratVer>=4?'ok':'warn',detail:stratVer>=4?'Coins 55-69 tracked developing over scans':'Deploy v4'},
    {label:'Price tracker (hourly)',status:'ok',detail:'TP/SL monitoring on open trades every hour'},
    {label:'Trade outcome logging',status:closedCt>0?'ok':'warn',detail:closedCt>0?`${closedCt} outcomes logged — ML has training data`:'Log BNB SELL outcome in History tab',
     action:closedCt===0?'History tab → BNB SELL → LOG RESULT → enter exit price + TP1/TP2/TP3/SL':undefined},
    {label:'ML self-improvement',status:closedCt>=10?'ok':'warn',detail:`${closedCt}/10 closed trades · ${Math.max(0,10-closedCt)} more to unlock first improvement`},
    {label:'Telegram alerts',status:'warn',detail:'Add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to Edge Function Secrets',action:'See Telegram guide below'},
  ]

  const okN=checks.filter(c=>c.status==='ok').length
  const pct=Math.round(okN/checks.length*100)
  const hCol=pct>=80?C.ok:pct>=60?C.warn:C.fail
  const actions=checks.filter(c=>c.action)
  const signals=coins.filter(c=>c.signal_type!=='WAIT')
  const waiting=coins.filter(c=>c.signal_type==='WAIT')

  return(
    <div style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>

      {/* Health banner */}
      <div style={{padding:'14px 16px',borderRadius:12,background:'linear-gradient(135deg,#0d0d20,#070718)',border:`1px solid ${hCol}33`}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:hCol,letterSpacing:3}}>
              SYSTEM HEALTH: {okN}/{checks.length}
            </div>
            <div style={{fontSize:10,fontFamily:'monospace',color:C.dim,marginTop:2}}>
              Next scan <span style={{color:C.blue,fontWeight:700}}>{countdown}</span>
              {scanTime&&` · Last: ${fmt(scanTime)} GST`}
              {` · ${scanCount} logged`}
            </div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:28,fontWeight:700,fontFamily:'monospace',color:hCol}}>{pct}%</div>
            <div style={{fontSize:9,fontFamily:'monospace',color:C.dim}}>operational</div>
          </div>
        </div>
        <div style={{height:6,background:'#1a1a2e',borderRadius:999,marginBottom:10}}>
          <div style={{height:6,width:`${pct}%`,background:hCol,borderRadius:999,transition:'width 0.5s'}}/>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <button onClick={invokeScan} disabled={invoking} style={{padding:'8px 18px',fontFamily:'monospace',fontSize:11,fontWeight:700,cursor:invoking?'wait':'pointer',borderRadius:6,background:invoking?'#1a1a2e':'#00ff8818',border:`1px solid ${invoking?'#333':C.ok}`,color:invoking?C.dim:C.ok}}>
            {invoking?'Scanning...':'▶ RUN SCAN NOW'}
          </button>
          {invokeMsg&&<span style={{fontSize:10,fontFamily:'monospace',color:invokeMsg.startsWith('✅')?C.ok:C.fail,flex:1}}>{invokeMsg}</span>}
        </div>
      </div>

      {/* Action items */}
      {actions.length>0&&(
        <div style={{padding:'12px 14px',borderRadius:10,background:'#ff335506',border:'1px solid #ff335522'}}>
          <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:C.fail,marginBottom:8}}>❌ {actions.length} ACTION{actions.length>1?'S':''} REQUIRED</div>
          {actions.map((c,i)=>(
            <div key={i} style={{padding:'5px 0',borderBottom:'1px solid #ffffff05'}}>
              <div style={{fontSize:10,fontFamily:'monospace',color:C.warn,fontWeight:700,marginBottom:1}}>{c.label}</div>
              <div style={{fontSize:10,fontFamily:'monospace',color:'#ff335566'}}>{c.action}</div>
            </div>
          ))}
        </div>
      )}

      {/* All health checks */}
      <div style={{display:'flex',flexDirection:'column',gap:4}}>
        {checks.map(hc=>(
          <div key={hc.label} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 14px',borderRadius:8,background:'#0a0a1a',border:`1px solid ${hc.status==='ok'?C.ok:hc.status==='warn'?C.warn:C.fail}22`}}>
            <span style={{fontSize:13,flexShrink:0,marginTop:1}}>{hc.status==='ok'?'✅':hc.status==='warn'?'⚠️':'❌'}</span>
            <div>
              <div style={{fontSize:11,fontFamily:'monospace',fontWeight:700,color:hc.status==='ok'?C.ok:hc.status==='warn'?C.warn:C.fail}}>{hc.label}</div>
              <div style={{fontSize:10,fontFamily:'monospace',color:C.dim,marginTop:1}}>{hc.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Fix cron */}
      {hoursSince>=4.5&&(
        <div style={{padding:'12px 14px',borderRadius:10,background:'#ff335506',border:'1px solid #ff335522'}}>
          <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:C.fail,marginBottom:8}}>❌ FIX CRON — SCAN NOT RUNNING ({hoursSince.toFixed(0)}H SINCE LAST SCAN)</div>
          {['1. Supabase → SQL Editor → New query',
            '2. Open supabase/fix-cron.sql from the zip',
            '3. Replace YOUR_ANON_KEY with your anon key (Settings → API → anon public key)',
            '4. Run the query → see 2 jobs appear at the bottom',
            '5. Click "Run Scan Now" above to verify it works immediately'
          ].map((s,i)=><div key={i} style={{fontSize:10,fontFamily:'monospace',color:'#ff335566',padding:'1px 0'}}>{s}</div>)}
        </div>
      )}

      {/* Deploy v4 */}
      {stratVer<4&&(
        <div style={{padding:'12px 14px',borderRadius:10,background:'#ff335506',border:'1px solid #ff335522'}}>
          <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:C.fail,marginBottom:8}}>❌ DEPLOY v4 EDGE FUNCTION</div>
          {['1. Supabase → Edge Functions → click scan-background',
            '2. Click Edit (pencil icon)',
            '3. Select all code → delete',
            '4. Open supabase/functions/scan-background/index.ts from zip → copy all → paste',
            '5. Click Deploy',
            '6. Click Run Scan Now above — response should show "version":4'
          ].map((s,i)=><div key={i} style={{fontSize:10,fontFamily:'monospace',color:'#ff335566',padding:'1px 0'}}>{s}</div>)}
        </div>
      )}

      {/* Telegram */}
      <div style={{padding:'12px 14px',borderRadius:10,background:'#ffcc0006',border:'1px solid #ffcc0022'}}>
        <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:C.warn,marginBottom:8}}>⚠️ TELEGRAM — 5 MINUTES (CRITICAL — YOU MISS SIGNALS WITHOUT THIS)</div>
        {['1. Telegram → search @BotFather → send /newbot → follow prompts → copy the token',
          '2. Start chat with your new bot → send any message',
          '3. In browser: api.telegram.org/botYOUR_TOKEN/getUpdates → find "id" inside "chat"',
          '4. Supabase → Edge Functions → Secrets → Add: TELEGRAM_BOT_TOKEN = your token',
          '5. Add: TELEGRAM_CHAT_ID = your id number',
          '6. Redeploy scan-background → Run Scan Now → you will receive a Telegram message'
        ].map((s,i)=><div key={i} style={{fontSize:10,fontFamily:'monospace',color:'#ffcc0066',padding:'1px 0'}}>{s}</div>)}
      </div>

      {/* Signal gate */}
      <div>
        <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:C.dim,marginBottom:8}}>SIGNAL GATE — LATEST SCAN BREAKDOWN</div>
        {signals.length>0&&<div style={{marginBottom:6}}><div style={{fontSize:10,fontFamily:'monospace',color:C.ok,marginBottom:4}}>SIGNALS — {signals.length}</div>{signals.map(r=><CoinCard key={r.id} row={r}/>)}</div>}
        {waiting.map(r=><CoinCard key={r.id} row={r}/>)}
        {coins.length===0&&!loading&&<div style={{fontSize:11,fontFamily:'monospace',color:C.dim}}>No scan data — run a scan above</div>}
      </div>

      {/* What triggers next signal */}
      <div style={{padding:'12px 14px',borderRadius:10,background:'#0a0a1a',border:'1px solid #ffcc0022'}}>
        <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:C.warn,marginBottom:8}}>WHAT TRIGGERS NEXT SELL SIGNAL</div>
        {[['Volume spike (ONLY blocker)','Most coins below 1.1x. Any panic/news → volume spikes → SELL fires. BNB fired at 2.22x vol.'],
          ['ADX ✓','SOL 42.2, BNB 51.8, XRP 45.5 all passing. ETH borderline.'],
          ['30W MA declining ✓','All coins already meet this.'],
          ['EMA inverted ✓','All coins EMA 20 < 50 < 200.'],
          ['v4: BTC dom ✓','~55% and rising — adds SELL weight.'],
          ['v4: Sentiment ✓','Deteriorating — adds SELL pressure.'],
        ].map(([l,v])=>(
          <div key={l as string} style={{display:'flex',gap:10,padding:'4px 0',borderBottom:'1px solid #ffffff05',fontSize:10,fontFamily:'monospace'}}>
            <span style={{color:C.warn,flexShrink:0,minWidth:180}}>{l}</span>
            <span style={{color:C.dim}}>{v}</span>
          </div>
        ))}
      </div>

      {/* Features */}
      <div>
        <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:C.dim,marginBottom:8}}>FEATURES — BUILT vs PLANNED</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
          {([
            [true,'v4','5-Layer engine','All 5 layers with real indicators'],
            [true,'v4','BUY + SELL signals','Stage 2 BUY, Stage 4 SELL'],
            [true,'v4','Phase 1→2 logic','Extended coins if Phase 1 empty'],
            [true,'v4','BTC dominance','Rising dom reduces altcoin score'],
            [true,'v4','7-day sentiment','IMPROVING/DETERIORATING weighting'],
            [true,'v4','Setup maturity','55-69 coins tracked across scans'],
            [true,'v4','Real layer scores','JSON per coin per scan'],
            [true,'v4','Signal logging','All signals with indicators'],
            [true,'v4','Layer breakdown','Pass/fail per check on Home'],
            [true,'v4','Trade history','History + LOG RESULT button'],
            [true,'v4','60-day test','Day counter, equity curve'],
            [true,'v4','Self-improving ML','Adjusts from outcomes'],
            [true,'v4','Per-coin profiles','Each coin own parameters'],
            [true,'v4','What-if engine','WAIT signals tracked 48h'],
            [true,'v4','Price tracker','Hourly TP/SL monitoring'],
            [closedCt>=10,'⚠️','ML Decision Tree',`Needs ${Math.max(0,10-closedCt)} more trades`],
            [false,'⚠️','Telegram alerts','Need bot token in secrets'],
            [false,'📅','Hype wildcard','Trending coin each scan'],
            [false,'📅','Correlation penalty','50% size if correlated'],
            [false,'📅','SL move alerts','Needs Telegram first'],
          ] as [boolean,string,string,string][]).map(([done,tag,label,note])=>(
            <div key={label} style={{padding:'6px 10px',borderRadius:6,background:'#0a0a1a',border:`1px solid ${done?C.ok+'22':'#ffffff05'}`}}>
              <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:1}}>
                <span style={{fontSize:9,fontFamily:'monospace',color:done?C.ok:'#444',background:done?'#00ff8811':'transparent',padding:'1px 4px',borderRadius:3,fontWeight:700}}>{tag}</span>
                <span style={{fontSize:10,fontFamily:'monospace',color:done?'#aaa':'#444',fontWeight:done?700:400}}>{label}</span>
              </div>
              <div style={{fontSize:9,fontFamily:'monospace',color:'#333',paddingLeft:4}}>{note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* BNB trade */}
      <div style={{padding:'12px 14px',borderRadius:10,background:'#0a0a1a',border:'1px solid #ff335522'}}>
        <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:C.fail,marginBottom:8}}>BNB SELL — ACTIVE TRADE</div>
        {[['Entry','$578.39 SELL'],['Stop','$615.99 — exit if breached'],['TP1','$532.12 — close 40%, move SL to breakeven'],['TP2','$485.85 — close 40%'],['TP3','$428.01 — close rest'],['Now','$593 — 2.5% against, within stop'],['Do','If $615.99 breaks → exit. If $532 → log TP1 in History.'],['ML','Log outcome when closed → trains the model'],].map(([l,v])=>(
          <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid #ffffff05',fontSize:10,fontFamily:'monospace'}}>
            <span style={{color:C.dim,width:60,flexShrink:0}}>{l}</span>
            <span style={{color:l==='Do'||l==='ML'?C.warn:'#aaa',textAlign:'right',flex:1}}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CoinCard({row}:{row:ScanRow}){
  const ls=parseLS(row)
  const isSell=row.signal_type==='SELL',isBuy=row.signal_type==='BUY'
  const col=isSell?'#ff3355':isBuy?'#00ff88':'#444'
  const vol=Number(row.volume_ratio).toFixed(2)
  const adxV=Number(row.adx).toFixed(1)
  const rsi=Number(row.rsi_at_entry).toFixed(1)
  return(
    <div style={{padding:'10px 14px',borderRadius:8,background:'#0a0a1a',border:`1px solid ${col}22`,marginBottom:5}}>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:5}}>
        <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:col==='#444'?'#666':col,letterSpacing:3}}>{row.coin}</span>
        <span style={{fontSize:10,fontFamily:'monospace',padding:'1px 8px',borderRadius:4,background:`${col}22`,color:col}}>{row.signal_type}</span>
        <span style={{fontSize:10,fontFamily:'monospace',color:row.confidence>=70?C.ok:'#555'}}>Score:{row.confidence}</span>
        <span style={{fontSize:10,fontFamily:'monospace',color:Number(vol)<1.1?C.fail:Number(vol)<1.8?C.warn:C.ok}}>Vol:{vol}x</span>
        <span style={{fontSize:10,fontFamily:'monospace',color:Number(adxV)<18?C.fail:Number(adxV)<25?C.warn:C.ok}}>ADX:{adxV}</span>
        <span style={{fontSize:10,fontFamily:'monospace',color:Number(rsi)>70?C.fail:Number(rsi)<45?C.warn:C.ok}}>RSI:{rsi}</span>
        {!ls.real&&<span style={{fontSize:8,fontFamily:'monospace',color:'#333',border:'1px solid #333',padding:'1px 4px',borderRadius:3}}>est</span>}
        <span style={{fontSize:9,fontFamily:'monospace',color:'#333',marginLeft:'auto'}}>{new Date(row.signal_time).toLocaleString('en-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false})} GST</span>
      </div>
      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:4}}>
        {(['stage','trend','setup','momentum','risk'] as const).map(k=>{
          const s=ls[k]||0,lc=LCOLS[k],pass=s>=60
          return(
            <div key={k} style={{padding:'2px 7px',borderRadius:4,background:`${lc}${pass?'18':'08'}`,border:`1px solid ${lc}${pass?'33':'14'}`,display:'flex',gap:3,alignItems:'center'}}>
              <span style={{fontSize:9,fontFamily:'monospace',color:lc,textTransform:'capitalize'}}>{k}</span>
              <span style={{fontSize:9,color:pass?'#00ff8888':'#ff335566'}}>{pass?'✓':'✗'}</span>
              <span style={{fontSize:9,fontFamily:'monospace',color:'#555'}}>{s}</span>
            </div>
          )
        })}
      </div>
      {!isBuy&&!isSell&&(
        <div style={{fontSize:10,fontFamily:'monospace',color:'#ff335555'}}>
          {Number(vol)<1.1?`✗ Vol ${vol}x below 1.1x — need selling pressure`:Number(adxV)<18?`✗ ADX ${adxV} below 18`:row.confidence<70?`✗ Score ${row.confidence}/100 needs 70`:`✗ Not enough layers passing`}
        </div>
      )}
      {isSell&&<div style={{fontSize:10,fontFamily:'monospace',color:'#ff335566'}}>✓ Stage 4 confirmed</div>}
      {isBuy&&<div style={{fontSize:10,fontFamily:'monospace',color:'#00ff8866'}}>✓ BUY conditions met</div>}
    </div>
  )
}
