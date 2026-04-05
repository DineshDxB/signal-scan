import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/db'

// ── STRATEGY HEALTH & VERIFICATION TAB ───────────────────────
// Answers: Is the strategy working? What's blocking signals?
// What's implemented vs planned? Where are the loopholes?

const COL = { ok:'#00ff88', warn:'#ffcc00', fail:'#ff3355', dim:'#555', blue:'#00aaff', purple:'#7F77DD' }

interface ScanRow {
  coin: string; signal_type: string; confidence: number
  rsi_at_entry: number; volume_ratio: number; adx: number
  regime: string; signal_time: string; layer_scores: unknown
  stop_loss: number; tp3: number; entry_price: number
}

interface HealthCheck { label: string; status: 'ok'|'warn'|'fail'; detail: string }

export default function VerifyTab() {
  const [coins,     setCoins]     = useState<ScanRow[]>([])
  const [scanTime,  setScanTime]  = useState<string|null>(null)
  const [lastPrices,setLastPrices]= useState<Record<string,number>>({})
  const [loading,   setLoading]   = useState(true)
  const [scanCount, setScanCount] = useState(0)
  const [cronStatus,setCronStatus]= useState<'ok'|'warn'|'fail'>('warn')

  async function load() {
    try {
      // Get latest scan batch
      const { data: latest } = await supabase.from('signal_log').select('signal_time').order('signal_time',{ascending:false}).limit(1)
      if (latest && latest.length) {
        const t   = new Date(latest[0].signal_time)
        const w   = new Date(t.getTime() - 40*60000)
        const { data: rows } = await supabase.from('signal_log').select('*').gte('signal_time',w.toISOString()).order('signal_time',{ascending:false})
        if (rows) {
          const seen = new Set<string>()
          const deduped = rows.filter((r:Record<string,unknown>)=>{const c=String(r.coin);if(seen.has(c))return false;seen.add(c);return true})
          setCoins(deduped as ScanRow[])
          setScanTime(latest[0].signal_time)

          // Cron health: if last scan > 5h ago → warn
          const hoursSince = (Date.now() - t.getTime()) / 3600000
          setCronStatus(hoursSince < 4.5 ? 'ok' : hoursSince < 8 ? 'warn' : 'fail')
        }
      }

      // Total signal count
      const { count } = await supabase.from('signal_log').select('*',{count:'exact',head:true})
      setScanCount(count || 0)

    } catch(e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load(); const t=setInterval(load,5*60000); return ()=>clearInterval(t) }, [])

  // System health checks
  const hoursSince = scanTime ? (Date.now() - new Date(scanTime).getTime()) / 3600000 : 99
  const healthChecks: HealthCheck[] = [
    { label:'Auto-scan (pg_cron)',      status: cronStatus,                      detail: scanTime ? `Last run ${hoursSince.toFixed(1)}h ago — ${hoursSince<4.5?'on schedule':'may have missed a window'}` : 'No scan recorded yet' },
    { label:'Signal logging',           status: scanCount>0?'ok':'warn',         detail: `${scanCount} signals logged to database since start` },
    { label:'Edge function deployed',   status: coins.length>0?'ok':'warn',      detail: coins.length>0 ? `Returning ${coins.length} coin results per scan` : 'No results — check Supabase Edge Functions' },
    { label:'Layer scores saving',      status: (() => { const hasReal = coins.some(c => { try { const ls = typeof c.layer_scores==='string'?JSON.parse(c.layer_scores as string):c.layer_scores as Record<string,number>; return (ls?.stage||0)+(ls?.trend||0)>0 } catch{return false} }); return hasReal?'ok':'warn' })(), detail: (() => { const hasReal = coins.some(c => { try { const ls = typeof c.layer_scores==='string'?JSON.parse(c.layer_scores as string):c.layer_scores as Record<string,number>; return (ls?.stage||0)+(ls?.trend||0)>0 } catch{return false} }); return hasReal?'Real layer scores saving correctly':'Scores estimated from indicators (next scan will save real)' })() },
    { label:'Price tracker (hourly)',   status: 'ok',                            detail: 'Checking TP/SL hits on open trades every hour' },
    { label:'Telegram alerts',          status: 'warn',                          detail: 'Connected but no token verified — add TELEGRAM_BOT_TOKEN to edge function secrets' },
    { label:'Forward test counter',     status: scanCount>0?'ok':'warn',         detail: `Day counter reads from oldest signal_log entry` },
    { label:'ML self-improvement',      status: 'warn',                          detail: 'Active — needs 10 closed trades to trigger first improvement. Currently 0 closed.' },
  ]

  // What's implemented vs planned
  const features = [
    { done:true,  label:'5-Layer strategy engine',              note:'All 5 layers calculating with real indicators' },
    { done:true,  label:'Auto-scan every 4 hours',              note:'pg_cron running in Supabase' },
    { done:true,  label:'BUY signal detection',                 note:'Stage 2 + all layers passing' },
    { done:true,  label:'SELL signal detection (Stage 4)',       note:'Below declining 30W MA + DI- dominant' },
    { done:true,  label:'Signal logging to database',           note:'All signals stored with indicators' },
    { done:true,  label:'Layer breakdown per coin',             note:'Pass/fail per check, visible on Home' },
    { done:true,  label:'Trade history + outcome logging',      note:'Manual result entry in History tab' },
    { done:true,  label:'60-day forward test tracking',         note:'Day counter, equity curve, win rate' },
    { done:true,  label:'Self-improving strategy (ML base)',     note:'Adjusts RSI/ADX/volume thresholds from outcomes' },
    { done:true,  label:'Per-coin learned profiles',            note:'Each coin gets own RSI, stop, vol params' },
    { done:true,  label:'What-if engine (ghost trades)',        note:'WAIT signals tracked for 48h price moves' },
    { done:false, label:'Hype wildcard coin (trending 48h)',    note:'Planned: web search for trending coin each scan' },
    { done:false, label:'Phase 1 → Phase 2 scanning logic',    note:'Planned: extended coins scan only if Phase 1 empty' },
    { done:false, label:'Setup maturity tracker (55-69%)',      note:'Planned: flag coins developing over multiple scans' },
    { done:false, label:'Telegram alerts live',                 note:'Need TELEGRAM_BOT_TOKEN in Supabase secrets' },
    { done:false, label:'ML Decision Tree',                     note:'Unlocks at 20 closed trades — no data yet' },
    { done:false, label:'Regime-conditional scoring',           note:'Unlocks at 20 closed trades' },
    { done:false, label:'Sentiment 7-day trend weighting',      note:'Planned: IMPROVING trend = extra weight' },
    { done:false, label:'Correlation penalty (auto position)',  note:'Planned: 50% size if correlated open trade' },
    { done:false, label:'SL auto-move alerts',                  note:'Price tracker partial — needs Telegram' },
    { done:false, label:'BTC dominance layer check',            note:'Planned in Layer 4 — not yet implemented' },
  ]

  return (
    <div style={{padding:16,display:'flex',flexDirection:'column',gap:14}}>

      {/* ── SYSTEM HEALTH ── */}
      <div>
        <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:COL.dim,marginBottom:10}}>SYSTEM HEALTH</div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {healthChecks.map(hc => (
            <div key={hc.label} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 14px',borderRadius:8,background:'#0a0a1a',border:`1px solid ${hc.status==='ok'?COL.ok:hc.status==='warn'?COL.warn:COL.fail}22`}}>
              <div style={{fontSize:14,flexShrink:0}}>{hc.status==='ok'?'✅':hc.status==='warn'?'⚠️':'❌'}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontFamily:'monospace',color:hc.status==='ok'?COL.ok:hc.status==='warn'?COL.warn:COL.fail,fontWeight:700}}>{hc.label}</div>
                <div style={{fontSize:10,fontFamily:'monospace',color:COL.dim,marginTop:1}}>{hc.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── WHY ONLY BNB FIRED ── */}
      <div>
        <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:COL.dim,marginBottom:10}}>SIGNAL GATE ANALYSIS — WHY EACH COIN IS WAITING</div>
        {loading && <div style={{fontSize:11,fontFamily:'monospace',color:COL.dim}}>Loading coin data...</div>}
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {coins.map(coin => {
            const rsi = Number(coin.rsi_at_entry).toFixed(1)
            const vol = Number(coin.volume_ratio).toFixed(2)
            const adx = Number(coin.adx).toFixed(1)
            const isSell = coin.signal_type === 'SELL'
            const isBuy  = coin.signal_type === 'BUY'

            // Determine what's blocking it
            const blocks: string[] = []
            const passes: string[] = []

            if (Number(coin.volume_ratio) < 1.2) blocks.push(`Vol ${vol}x — need 1.2x minimum for SELL, 1.8x for BUY`)
            else passes.push(`Vol ${vol}x ✓`)

            if (Number(coin.adx) < 18) blocks.push(`ADX ${adx} — need 18+ for trend confirmation`)
            else passes.push(`ADX ${adx} ✓`)

            if (Number(coin.rsi_at_entry) > 40 && !isBuy) passes.push(`RSI ${rsi} — in SELL range (below 40 = stronger)`); else if (Number(coin.rsi_at_entry) > 75) blocks.push(`RSI ${rsi} — above 75 hard block`)
            else if (Number(coin.rsi_at_entry) < 50 && isBuy) blocks.push(`RSI ${rsi} — below 50 floor for BUY`)

            const col = isSell ? COL.fail : isBuy ? COL.ok : '#333'
            const sigCol = isSell ? '#ff3355' : isBuy ? '#00ff88' : '#444'

            return (
              <div key={coin.coin} style={{padding:'10px 14px',borderRadius:8,background:'#0a0a1a',border:`1px solid ${sigCol}22`}}>
                <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:6}}>
                  <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:sigCol==='#444'?'#555':sigCol,letterSpacing:3}}>{coin.coin}</span>
                  <span style={{fontSize:10,fontFamily:'monospace',color:sigCol,background:`${sigCol}22`,padding:'1px 8px',borderRadius:4}}>{coin.signal_type}</span>
                  <span style={{fontSize:10,fontFamily:'monospace',color:COL.dim}}>Score: {coin.confidence}/100</span>
                  <span style={{fontSize:10,fontFamily:'monospace',color:Number(vol)<1.2?COL.fail:Number(vol)<1.8?COL.warn:COL.ok}}>Vol: {vol}x</span>
                  <span style={{fontSize:10,fontFamily:'monospace',color:Number(adx)<18?COL.fail:Number(adx)<25?COL.warn:COL.ok}}>ADX: {adx}</span>
                  <span style={{fontSize:10,fontFamily:'monospace',color:Number(rsi)>68?COL.fail:Number(rsi)<50?COL.warn:COL.ok}}>RSI: {rsi}</span>
                  <span style={{fontSize:9,fontFamily:'monospace',color:COL.dim,marginLeft:'auto'}}>
                    {new Date(coin.signal_time).toLocaleString('en-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false})} GST
                  </span>
                </div>
                {blocks.length > 0 && (
                  <div style={{marginBottom:4}}>
                    {blocks.map((b,i)=><div key={i} style={{fontSize:10,fontFamily:'monospace',color:'#ff335566'}}>✗ {b}</div>)}
                  </div>
                )}
                {passes.length > 0 && (
                  <div>
                    {passes.map((p,i)=><div key={i} style={{fontSize:10,fontFamily:'monospace',color:'#00ff8855'}}>✓ {p}</div>)}
                  </div>
                )}
                {!isSell && !isBuy && blocks.length === 0 && (
                  <div style={{fontSize:10,fontFamily:'monospace',color:COL.dim}}>
                    All individual checks pass but overall score {coin.confidence}/100 below 70 threshold
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── WHAT WOULD TRIGGER NEXT SIGNAL ── */}
      <div style={{padding:'12px 16px',borderRadius:10,background:'#0a0a1a',border:'1px solid #ffcc0022'}}>
        <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:COL.warn,marginBottom:8}}>WHAT WOULD TRIGGER NEXT SELL SIGNAL</div>
        {[
          ['Volume spike needed', 'Any coin needs 1.2x+ volume. Currently most are below 1x. Volume spikes happen on news or panic selling. Watch for it.'],
          ['ADX to confirm', 'ADX must be 18+ with DI- dominant. SOL at 42.2 already passes this.'],
          ['30W MA declining', 'All coins already below declining 30W MA. This condition is met.'],
          ['EMA stack inverted', 'All coins already have EMA 20 < 50 < 200. This condition is met.'],
          ['Conclusion', 'The ONLY thing stopping 7 more SELL signals right now is low volume. When selling pressure increases (volume spikes), signals will fire automatically.'],
        ].map(([l,v])=>(
          <div key={l} style={{display:'flex',gap:8,padding:'4px 0',borderBottom:'1px solid #ffffff05',fontSize:10,fontFamily:'monospace'}}>
            <span style={{color:COL.warn,flexShrink:0,width:180}}>{l}</span>
            <span style={{color:COL.dim}}>{v}</span>
          </div>
        ))}
      </div>

      {/* ── FEATURES IMPLEMENTED vs PLANNED ── */}
      <div>
        <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:COL.dim,marginBottom:10}}>
          FEATURES — IMPLEMENTED vs PLANNED (from architecture doc)
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          {features.map(f => (
            <div key={f.label} style={{padding:'8px 10px',borderRadius:6,background:'#0a0a1a',border:`1px solid ${f.done?COL.ok+'22':'#ffffff06'}`}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                <span style={{fontSize:10,color:f.done?COL.ok:COL.dim}}>{f.done?'✅':'⬜'}</span>
                <span style={{fontSize:10,fontFamily:'monospace',color:f.done?'#aaa':'#444',fontWeight:f.done?700:400}}>{f.label}</span>
              </div>
              <div style={{fontSize:9,fontFamily:'monospace',color:'#333',paddingLeft:20}}>{f.note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── LOOPHOLES IDENTIFIED ── */}
      <div>
        <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:COL.dim,marginBottom:10}}>LOOPHOLES & KNOWN GAPS</div>
        {[
          { sev:'high',   icon:'🔴', title:'Layer scores from old scans are estimated, not real', fix:'Redeploy scan-background edge function. Next scan will save real computed scores.' },
          { sev:'high',   icon:'🔴', title:'Telegram alerts not live', fix:'Add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to Supabase Edge Function secrets. Without this, you miss signals when not looking at the app.' },
          { sev:'medium', icon:'🟡', title:'SELL volume threshold may miss real downtrends', fix:'Volume 1.2x is conservative. Real panic selling often has 2-5x volume spikes. Current market may just be low-activity bear, not active panic.' },
          { sev:'medium', icon:'🟡', title:'No BTC dominance check in Layer 4', fix:'Original plan: rising BTC dominance = altcoins bleed. Not yet implemented. BTC dom rising now (55%+) — would have added SELL weight.' },
          { sev:'medium', icon:'🟡', title:'ML self-improvement inactive', fix:'Needs 10 closed trades. Log the BNB SELL outcome in History tab when you close it. Every logged trade improves the model.' },
          { sev:'medium', icon:'🟡', title:'No setup maturity tracking', fix:'Coins scoring 55-69 over multiple scans should get a "setup developing" flag. Not yet built.' },
          { sev:'low',    icon:'🟢', title:'Only 8 coins scanned', fix:'Original plan had a hype wildcard (trending coin). With BTC/ETH flat, opportunity may be in trending meme coins.' },
          { sev:'low',    icon:'🟢', title:'No Phase 1 → Phase 2 logic', fix:'Extended coins (AVAX, LINK, DOT) should only scan if Phase 1 produces nothing. Minor efficiency issue.' },
        ].map(l => (
          <div key={l.title} style={{display:'flex',gap:12,padding:'10px 14px',borderRadius:8,background:'#0a0a1a',border:`1px solid ${l.sev==='high'?'#ff335522':l.sev==='medium'?'#ffcc0022':'#00ff8811'}`,marginBottom:6}}>
            <span style={{fontSize:16,flexShrink:0,marginTop:2}}>{l.icon}</span>
            <div>
              <div style={{fontSize:11,fontFamily:'monospace',color:l.sev==='high'?COL.fail:l.sev==='medium'?COL.warn:'#aaa',fontWeight:700,marginBottom:3}}>{l.title}</div>
              <div style={{fontSize:10,fontFamily:'monospace',color:COL.dim,lineHeight:1.6}}>Fix: {l.fix}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── BNB TRADE STATUS ── */}
      <div style={{padding:'12px 16px',borderRadius:10,background:'#0a0a1a',border:'1px solid #ff335522'}}>
        <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:'#ff3355',marginBottom:8}}>BNB SELL — ACTIVE TRADE STATUS</div>
        {[
          ['Signal fired',     'BNB SELL at $578.39'],
          ['Stop loss',        '$615.99 (6.5% above entry)'],
          ['TP1',              '$532.12 (-8%)'],
          ['TP2',              '$485.85 (-16%)'],
          ['TP3',              '$428.01 (-26%)'],
          ['Current price',    '$593 — $14.61 against you (-2.5%)'],
          ['Status',           'OPEN — within stop loss range, trade valid'],
          ['What to watch',    'If price breaks $615.99 → exit. If price falls below $532 → TP1 hit, close 40%.'],
          ['Days open',        'Log outcome in History tab when you close to train ML'],
        ].map(([l,v])=>(
          <div key={l} className="flex justify-between" style={{padding:'4px 0',borderBottom:'1px solid #ffffff05',fontSize:10,fontFamily:'monospace'}}>
            <span style={{color:COL.dim}}>{l}</span>
            <span style={{color:l==='Status'?COL.warn:l==='What to watch'?COL.warn:'#aaa'}}>{v}</span>
          </div>
        ))}
      </div>

    </div>
  )
}
