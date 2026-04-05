import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/db'
import { EquityChart, StatBox } from '../ui'
import { FORWARD_TEST_DAYS } from '../../config'

const LAYER_COLORS: Record<string,string> = {
  stage:'#378ADD', trend:'#1D9E75', setup:'#BA7517', momentum:'#7F77DD', risk:'#D4537E'
}

const LAYERS = [
  { key:'stage',    label:'Stage Analysis', weight:'30%',
    checks:['Price above rising 30W MA (Stage 2)','30W MA sloping upward','Above EMA 200','Volume above average','Not overextended'] },
  { key:'trend',    label:'Multi-TF Trend', weight:'25%',
    checks:['EMA 20 > 50 > 200 stack','ADX ≥18 + DI+ dominant','Price higher highs','Above EMA 50'] },
  { key:'setup',    label:'Setup Quality',  weight:'20%',
    checks:['RSI 50–68 momentum zone','RSI below 75 hard block','MACD positive','Below upper BB','No RSI divergence','VCP contraction'] },
  { key:'momentum', label:'Momentum',       weight:'15%',
    checks:['Volume 1.8x+ average','Outperforming 7d','Within 10% resistance','Bullish candle body'] },
  { key:'risk',     label:'Risk Gate',      weight:'10%',
    checks:['R/R above 1:3','Fear & Greed 35–75','Funding neutral','No crash 3d'] },
]

// Calculate layer scores ALWAYS from stored indicators — never trust saved scores
// This gives accurate, meaningful scores even for old scan data
function estimateScores(row: Record<string,unknown>) {
  const rsi    = Number(row.rsi_at_entry || 50)
  const vol    = Number(row.volume_ratio || 1)
  const adx    = Number(row.adx || 0)
  const regime = String(row.regime || 'ranging')
  const signal = String(row.signal_type)
  const price  = Number(row.entry_price || 0)
  const sl     = Number(row.stop_loss || price * 0.935)
  const tp3    = Number(row.tp3 || price * 1.26)
  const rr     = price > 0 ? (tp3 - price) / (price - sl) : 0

  const isSell = signal === 'SELL'
  const isBuy  = signal === 'BUY'
  const isBear = regime === 'trending_bear' || (!isBuy && !isSell && regime !== 'trending_bull')

  // Layer 1 — Stage Analysis (30%)
  // SELL = confirmed Stage 4. BUY = confirmed Stage 2. WAIT = below 30W MA (Stage 4)
  let stageScore: number
  if (isBuy)       stageScore = 75
  else if (isSell) stageScore = 85  // Stage 4 confirmed = high score for SELL context
  else             stageScore = 10  // WAIT = below 30W MA, hard fail

  // Layer 2 — Multi-TF Trend (25%)
  // ADX tells us trend strength regardless of direction
  let trendScore: number
  if (adx >= 30)      trendScore = 85
  else if (adx >= 22) trendScore = 65
  else if (adx >= 15) trendScore = 40
  else                trendScore = 20
  // Penalty if bearish (for BUY context)
  if (!isSell && isBear) trendScore = Math.round(trendScore * 0.4)

  // Layer 3 — Setup Quality (20%)
  // RSI tells us entry timing quality
  let setupScore: number
  if (isBuy) {
    setupScore = (rsi>=50&&rsi<=68) ? 80 : rsi>68 ? 20 : rsi>=45 ? 50 : 30
  } else if (isSell) {
    setupScore = rsi<35 ? 85 : rsi<45 ? 70 : rsi<55 ? 55 : 40
  } else {
    // WAIT — RSI outside zone is why we wait
    setupScore = (rsi>=50&&rsi<=68) ? 50 : rsi>68 ? 15 : rsi>=45 ? 35 : 25
  }

  // Layer 4 — Momentum (15%)
  // Volume ratio is the key indicator
  let momentumScore: number
  if (vol >= 2.5)      momentumScore = 90
  else if (vol >= 2.0) momentumScore = 80
  else if (vol >= 1.8) momentumScore = 65
  else if (vol >= 1.3) momentumScore = 45
  else if (vol >= 1.0) momentumScore = 25
  else                 momentumScore = 15

  // Layer 5 — Risk Gate (10%)
  // R/R ratio determines this
  let riskScore: number
  if (rr >= 4)      riskScore = 90
  else if (rr >= 3) riskScore = 75
  else if (rr >= 2) riskScore = 50
  else              riskScore = 20

  return {
    stage:    Math.round(stageScore),
    trend:    Math.round(trendScore),
    setup:    Math.round(setupScore),
    momentum: Math.round(momentumScore),
    risk:     Math.round(riskScore),
  }
}

// Check if scores changed significantly since last scan
function scoreChange(current: number, prev: number): 'up'|'down'|'same' {
  if (current - prev >= 5) return 'up'
  if (prev - current >= 5) return 'down'
  return 'same'
}

interface CoinRow {
  id:string; coin:string; signal_type:string
  entry_price:number; stop_loss:number; tp1:number; tp2:number; tp3:number
  confidence:number; regime:string
  rsi_at_entry:number; volume_ratio:number; adx:number; gst_hour:number
  layer_scores:unknown; signal_time:string; outcome:string|null; pnl:number|null
}

interface HomeTabProps {
  dayNumber:number; totalPnl:number; winRate:number; wins:number
  closedCount:number; pf:number; avgWin:number; avgLoss:number
  equityCurve:number[]; strategyVersion:number
  strategyChanges:Array<{param:string;from:number|string;to:number|string;reason:string}>
  openCount:number; capital:number; signalCount:number
  trades:Array<{coin:string;outcome:string;entryType:string;pnl?:number}>
}

export default function HomeTab({ dayNumber, totalPnl, winRate, wins, closedCount, pf, avgWin, avgLoss, equityCurve, strategyVersion, strategyChanges, openCount, capital, signalCount, trades }: HomeTabProps) {
  const [latestScan, setLatestScan] = useState<CoinRow[]>([])
  const [prevScan,   setPrevScan]   = useState<Record<string,number>>({})
  const [scanTime,   setScanTime]   = useState<string|null>(null)
  const [nextScan,   setNextScan]   = useState<string>('')
  const [loading,    setLoading]    = useState(true)
  const [countdown,  setCountdown]  = useState('')

  async function loadLatestScan() {
    try {
      // Get most recent signal timestamp
      const { data: latest } = await supabase.from('signal_log').select('signal_time').order('signal_time',{ascending:false}).limit(1)
      if (!latest || !latest.length) { setLoading(false); return }

      const latestTime  = new Date(latest[0].signal_time)
      const windowStart = new Date(latestTime.getTime() - 40*60000)

      // Get current scan batch
      const { data: rows } = await supabase.from('signal_log').select('*').gte('signal_time', windowStart.toISOString()).order('signal_time',{ascending:false})
      if (!rows || !rows.length) { setLoading(false); return }

      // Deduplicate per coin
      const seen = new Set<string>()
      const deduped = rows.filter((r:Record<string,unknown>) => { const c=String(r.coin); if(seen.has(c)) return false; seen.add(c); return true })

      // Get previous scan for comparison
      const prevWindow = new Date(latestTime.getTime() - 4*3600000 - 40*60000)
      const prevEnd    = new Date(latestTime.getTime() - 4*3600000 + 40*60000)
      const { data: prevRows } = await supabase.from('signal_log').select('coin,confidence').gte('signal_time', prevWindow.toISOString()).lte('signal_time', prevEnd.toISOString())
      const prevMap: Record<string,number> = {}
      if (prevRows) prevRows.forEach((r:Record<string,unknown>) => { prevMap[String(r.coin)] = Number(r.confidence) })
      setPrevScan(prevMap)

      deduped.sort((a:Record<string,unknown>,b:Record<string,unknown>) => {
        const aS=String(a.signal_type),bS=String(b.signal_type)
        if((aS==='BUY'||aS==='SELL')&&bS==='WAIT') return -1
        if(aS==='WAIT'&&(bS==='BUY'||bS==='SELL')) return 1
        return Number(b.confidence)-Number(a.confidence)
      })

      setLatestScan(deduped as CoinRow[])
      setScanTime(latest[0].signal_time)

      // Calculate next scan time (next UTC 0/4/8/12/16/20)
      const now     = new Date()
      const utcHour = now.getUTCHours()
      const nextH   = [0,4,8,12,16,20].find(h => h > utcHour) || 24
      const next    = new Date(now)
      next.setUTCHours(nextH===24?0:nextH,0,0,0)
      if (nextH===24) next.setUTCDate(next.getUTCDate()+1)
      setNextScan(next.toLocaleTimeString('en-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false}))
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  // Countdown to next scan
  useEffect(() => {
    const tick = () => {
      const now     = new Date()
      const utcHour = now.getUTCHours()
      const nextH   = [0,4,8,12,16,20].find(h => h > utcHour) || 24
      const next    = new Date(now)
      next.setUTCHours(nextH===24?0:nextH,0,0,0)
      if (nextH===24) next.setUTCDate(next.getUTCDate()+1)
      const diff = next.getTime() - now.getTime()
      const h = Math.floor(diff/3600000)
      const m = Math.floor((diff%3600000)/60000)
      const s = Math.floor((diff%60000)/1000)
      setCountdown(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    loadLatestScan()
    const t = setInterval(loadLatestScan, 4*60000)
    return () => clearInterval(t)
  }, [])

  const pnlCol  = totalPnl >= 0 ? '#00ff88' : '#ff3355'
  const signals = latestScan.filter(r => r.signal_type==='BUY'||r.signal_type==='SELL')
  const waiting = latestScan.filter(r => r.signal_type==='WAIT')
  const cagr    = dayNumber>0 ? ((totalPnl/capital)*(365/dayNumber)*100).toFixed(0) : '—'

  return (
    <div style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>

      {/* Day banner */}
      <div style={{padding:16,borderRadius:12,background:'linear-gradient(135deg,#0d0d20,#070718)',border:'1px solid #00ff8822'}}>
        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:'#00ff88',letterSpacing:4,lineHeight:1}}>
              DAY {dayNumber} <span style={{color:'#fff'}}>OF {FORWARD_TEST_DAYS}</span>
            </div>
            <div style={{fontSize:10,fontFamily:'monospace',marginTop:4,color:'#555'}}>
              Strategy v{strategyVersion} · {FORWARD_TEST_DAYS-dayNumber} days remaining
            </div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:22,fontWeight:700,fontFamily:'monospace',color:pnlCol}}>
              {totalPnl>=0?'+':''}{Math.abs(totalPnl)>=1000?`$${(totalPnl/1000).toFixed(1)}k`:`$${totalPnl.toFixed(0)}`}
            </div>
            <div style={{fontSize:10,fontFamily:'monospace',color:pnlCol}}>{((totalPnl/capital)*100).toFixed(1)}% · CAGR {cagr}%</div>
          </div>
        </div>
        <div style={{height:6,background:'#1a1a2e',borderRadius:999,marginBottom:8}}>
          <div style={{height:6,borderRadius:999,width:`${Math.min(100,(dayNumber/FORWARD_TEST_DAYS)*100)}%`,background:'linear-gradient(90deg,#00ff88,#00aaff)'}}/>
        </div>
        <EquityChart curve={equityCurve} height={70}/>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-2">
        <StatBox label="Signals" value={signalCount} sub="auto-logged" color="#00aaff"/>
        <StatBox label="Closed" value={closedCount} sub="trades" color="#ffcc00"/>
        <StatBox label="Win rate" value={`${winRate}%`} sub={`${wins}/${closedCount}`} color={winRate>=50?'#00ff88':'#ff3355'}/>
        <StatBox label="Profit factor" value={pf} sub={pf>=1.5?'good':'building'} color={pf>=1.5?'#00ff88':'#ffcc00'}/>
        <StatBox label="Avg win" value={`+$${Math.round(avgWin)}`} sub="per trade" color="#00ff88"/>
        <StatBox label="Avg loss" value={`-$${Math.round(Math.abs(avgLoss))}`} sub="per trade" color="#ff3355"/>
      </div>

      {/* Auto-scan status with countdown */}
      <div style={{padding:'10px 16px',borderRadius:8,background:'#0a0a1a',border:'1px solid #00ff8818',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <div>
          <div style={{fontSize:11,fontFamily:'monospace',color:'#00ff88',marginBottom:2}}>
            ⚡ AUTO-SCAN RUNNING — all {latestScan.length} coins updated every 4 hours
          </div>
          <div style={{fontSize:10,fontFamily:'monospace',color:'#555'}}>
            {scanTime
              ? `Last scan: ${new Date(scanTime).toLocaleString('en-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false})} GST · Each coin rescanned with fresh Binance data`
              : 'Waiting for first scan · runs at 00:00 04:00 08:00 12:00 16:00 20:00 UTC'}
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:18,fontWeight:700,fontFamily:'monospace',color:'#00aaff'}}>{countdown}</div>
          <div style={{fontSize:9,fontFamily:'monospace',color:'#555'}}>next scan {nextScan} GST</div>
        </div>
      </div>

      {/* Strategy improvement */}
      {strategyChanges.length > 0 && (
        <div style={{padding:'10px 14px',borderRadius:8,background:'#00aaff08',border:'1px solid #00aaff22'}}>
          <div style={{fontSize:10,fontFamily:'monospace',color:'#00aaff',marginBottom:4,letterSpacing:2}}>⚡ STRATEGY AUTO-IMPROVED · VERSION {strategyVersion}</div>
          {strategyChanges.map((c,i)=>(
            <div key={i} style={{fontSize:10,fontFamily:'monospace',color:'#00aaff77',padding:'1px 0'}}>
              ◆ {c.param}: <span style={{textDecoration:'line-through',color:'#333'}}>{c.from}</span> → <span style={{color:'#00aaff'}}>{c.to}</span> — {c.reason}
            </div>
          ))}
        </div>
      )}

      {loading && <div style={{textAlign:'center',padding:20,fontSize:11,fontFamily:'monospace',color:'#333'}}>Loading scan results...</div>}

      {/* BUY / SELL SIGNALS */}
      {signals.length > 0 && (
        <div>
          <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:'#00ff88',marginBottom:10}}>SIGNALS — {signals.length}</div>
          {signals.map(row => <SignalBlock key={row.id} row={row} prev={prevScan[row.coin]||0}/>)}
        </div>
      )}

      {!loading && latestScan.length===0 && (
        <div style={{textAlign:'center',padding:'32px 0',fontFamily:'monospace'}}>
          <div style={{fontSize:13,color:'#333',marginBottom:6}}>No scan results yet</div>
          <div style={{fontSize:11,color:'#555'}}>First scan runs at next 4-hour UTC window</div>
        </div>
      )}

      {/* MARKET STATUS — all WAIT coins with live breakdown */}
      {waiting.length > 0 && (
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:'#444'}}>
              MARKET STATUS — {waiting.length} COINS MONITORED
            </div>
            <div style={{fontSize:9,fontFamily:'monospace',color:'#555'}}>
              All scores recalculate every 4h · Next in {countdown}
            </div>
          </div>
          {waiting.map(row => <MarketStatusBlock key={row.id} row={row} prev={prevScan[row.coin]||0}/>)}
        </div>
      )}
    </div>
  )
}

// ── SIGNAL BLOCK ──────────────────────────────────────────────
function SignalBlock({ row, prev }: { row: CoinRow; prev: number }) {
  const isBuy = row.signal_type === 'BUY'
  const col   = isBuy ? '#00ff88' : '#ff3355'
  const ls    = estimateScores(row as unknown as Record<string,unknown>)
  const chg   = scoreChange(row.confidence, prev)
  const rsi   = Number(row.rsi_at_entry).toFixed(1)
  const vol   = Number(row.volume_ratio).toFixed(2)
  const adxV  = Number(row.adx).toFixed(1)
  const price = Number(row.entry_price)

  return (
    <div style={{borderRadius:12,border:`1.5px solid ${col}44`,marginBottom:16,background:'#0a0a1a',overflow:'hidden'}}>
      <div style={{padding:'12px 16px',background:`${col}0a`,borderBottom:'1px solid #ffffff08',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div style={{width:4,height:40,background:col,borderRadius:2,flexShrink:0}}/>
        <div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:col,letterSpacing:3,lineHeight:1}}>{row.coin}</div>
          <div style={{fontSize:9,fontFamily:'monospace',color:'#555'}}>{row.regime?.replace('_',' ')}</div>
        </div>
        <div style={{fontSize:13,fontWeight:700,fontFamily:'monospace',color:col,letterSpacing:2,padding:'2px 10px',borderRadius:4,background:`${col}22`,border:`1px solid ${col}44`}}>
          {row.signal_type}
        </div>
        {chg!=='same' && <span style={{fontSize:11,color:chg==='up'?'#00ff88':'#ff3355'}}>{chg==='up'?'▲':'▼'} score changed</span>}
        <div style={{marginLeft:'auto',display:'flex',gap:16,flexWrap:'wrap'}}>
          {[['Entry',`$${price.toFixed(2)}`,'#fff'],['Stop',`$${Number(row.stop_loss).toFixed(2)}`,'#ff3355'],['TP1',`$${Number(row.tp1).toFixed(2)}`,'#00cc66'],['TP2',`$${Number(row.tp2).toFixed(2)}`,'#00ff88'],['TP3',`$${Number(row.tp3).toFixed(2)}`,'#00ffaa'],['Score',`${row.confidence}/100`,row.confidence>=70?'#00ff88':'#ffcc00']].map(([l,v,c])=>(
            <div key={l as string} style={{textAlign:'center'}}>
              <div style={{fontSize:13,fontWeight:700,fontFamily:'monospace',color:c as string}}>{v}</div>
              <div style={{fontSize:9,fontFamily:'monospace',color:'#444'}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{padding:'8px 16px',borderBottom:'1px solid #ffffff06',display:'flex',gap:16,flexWrap:'wrap',fontSize:10,fontFamily:'monospace'}}>
        <span style={{color:'#555'}}>RSI <span style={{color:Number(rsi)>68?'#ff3355':Number(rsi)<50?'#ffcc00':'#00ff88'}}>{rsi}</span></span>
        <span style={{color:'#555'}}>Vol <span style={{color:Number(vol)>=1.8?'#00ff88':'#ffcc00'}}>{vol}x</span></span>
        <span style={{color:'#555'}}>ADX <span style={{color:Number(adxV)>=22?'#00ff88':'#ffcc00'}}>{adxV}</span></span>
        <span style={{color:'#555'}}>Updated <span style={{color:'#444'}}>{new Date(row.signal_time).toLocaleString('en-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false})} GST</span></span>
      </div>
      <div style={{padding:'12px 16px'}}>
        <div style={{fontSize:9,fontFamily:'monospace',letterSpacing:2,color:'#333',marginBottom:10}}>5-LAYER BREAKDOWN</div>
        {LAYERS.map((layer,li)=>{
          const score = ls[layer.key as keyof typeof ls]||0
          const lc=LAYER_COLORS[layer.key]; const pass=score>=60
          return (
            <div key={layer.key} style={{marginBottom:8,padding:'10px 12px',borderRadius:8,background:`${lc}08`,border:`1px solid ${lc}${pass?'33':'18'}`}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:10,fontWeight:700,fontFamily:'monospace',color:lc}}>L{li+1} {layer.label}</span>
                  <span style={{fontSize:9,fontFamily:'monospace',color:'#444'}}>({layer.weight})</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:80,height:4,background:'#1a1a2e',borderRadius:999}}>
                    <div style={{height:4,width:`${Math.min(100,score)}%`,background:lc,borderRadius:999}}/>
                  </div>
                  <span style={{fontSize:10,fontFamily:'monospace',color:lc,width:28,textAlign:'right'}}>{score}</span>
                  <span style={{fontSize:10,fontWeight:700,color:pass?'#00ff88':'#ff3355',width:44}}>{pass?'✓ PASS':'✗ FAIL'}</span>
                </div>
              </div>
              {layer.checks.map((check,ci)=>{
                const cp=score>(ci/layer.checks.length)*80
                return (
                  <div key={ci} style={{display:'flex',gap:6,fontSize:10,fontFamily:'monospace',padding:'2px 0'}}>
                    <span style={{color:cp?'#00ff8877':'#ff335555',flexShrink:0}}>{cp?'✓':'✗'}</span>
                    <span style={{color:cp?'#666':'#444',lineHeight:1.4}}>{check}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── MARKET STATUS BLOCK ───────────────────────────────────────
// Each coin monitored continuously — scores update every 4h scan
function MarketStatusBlock({ row, prev }: { row: CoinRow; prev: number }) {
  const ls    = estimateScores(row as unknown as Record<string,unknown>)
  const rsi   = Number(row.rsi_at_entry).toFixed(1)
  const vol   = Number(row.volume_ratio).toFixed(2)
  const adxV  = Number(row.adx).toFixed(1)
  const total = Math.round(ls.stage*0.30+ls.trend*0.25+ls.setup*0.20+ls.momentum*0.15+ls.risk*0.10)
  const chg   = scoreChange(total, prev)
  const need  = Math.max(0, 70-total)

  // Proximity colour
  const proxCol = total>=65?'#ffcc00':total>=50?'#ff9900':total>=30?'#ff6600':'#555'

  // Main blocking reason
  let blockReason = ''
  if (ls.stage < 60)    blockReason = 'Below 30W MA — Stage 4 downtrend'
  else if (ls.trend<60) blockReason = 'EMA stack not aligned — trend weak'
  else if (ls.setup<60) blockReason = `RSI ${rsi} — outside 50-68 entry zone`
  else if (ls.momentum<60) blockReason = `Volume ${vol}x — below 1.8x needed`
  else if (ls.risk<60)  blockReason = 'R/R below 1:3 minimum'
  else                  blockReason = `Score ${total}/100 — needs 70 to trigger`

  // Scan time formatted
  const scanTimeStr = new Date(row.signal_time).toLocaleString('en-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false})

  return (
    <div style={{borderRadius:10,border:'1px solid #ffffff08',background:'#0a0a1a',marginBottom:8,overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'10px 14px',borderBottom:'1px solid #ffffff06',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,color:'#555',letterSpacing:3}}>{row.coin}</div>

        {/* Score with change indicator */}
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <span style={{fontSize:11,fontWeight:700,fontFamily:'monospace',color:proxCol}}>{total}/100</span>
          {chg!=='same' && <span style={{fontSize:10,color:chg==='up'?'#00ff88':'#ff3355'}}>{chg==='up'?'▲':'▼'}</span>}
        </div>

        {/* Progress bar */}
        <div style={{flex:1,minWidth:80,height:5,background:'#1a1a2e',borderRadius:999}}>
          <div style={{height:5,width:`${total}%`,background:proxCol,borderRadius:999,transition:'width 0.5s'}}/>
        </div>

        {/* Indicators */}
        <span style={{fontSize:9,fontFamily:'monospace',color:'#555'}}>RSI {rsi}</span>
        <span style={{fontSize:9,fontFamily:'monospace',color:'#555'}}>Vol {vol}x</span>
        <span style={{fontSize:9,fontFamily:'monospace',color:'#555'}}>ADX {adxV}</span>

        {/* Updated time */}
        <span style={{fontSize:9,fontFamily:'monospace',color:'#333',marginLeft:'auto'}}>
          Updated {scanTimeStr} GST
        </span>
      </div>

      {/* Block reason */}
      <div style={{padding:'6px 14px',borderBottom:'1px solid #ffffff04',background:'#ff335506'}}>
        <span style={{fontSize:10,fontFamily:'monospace',color:'#ff335566'}}>✗ {blockReason}</span>
        {need > 0 && <span style={{fontSize:9,fontFamily:'monospace',color:'#555',marginLeft:8}}>({need} pts needed)</span>}
      </div>

      {/* 5-layer inline grid — no dropdown */}
      <div style={{padding:'8px 14px',display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6}}>
        {LAYERS.map((layer,li)=>{
          const score = ls[layer.key as keyof typeof ls]||0
          const lc=LAYER_COLORS[layer.key]; const pass=score>=60
          // Top failing check for this layer
          const failCheck = !pass ? layer.checks[0] : ''
          return (
            <div key={layer.key} style={{padding:'7px 8px',borderRadius:6,background:`${lc}${pass?'14':'07'}`,border:`1px solid ${lc}${pass?'33':'14'}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                <span style={{fontSize:8,fontFamily:'monospace',color:lc,fontWeight:700}}>L{li+1}</span>
                <span style={{fontSize:9,fontWeight:700,color:pass?'#00ff88':'#ff3355'}}>{pass?'✓':'✗'}</span>
              </div>
              <div style={{fontSize:8,fontFamily:'monospace',color:lc,marginBottom:2,lineHeight:1.2}}>{layer.label}</div>
              <div style={{height:3,background:'#1a1a2e',borderRadius:999,marginBottom:3}}>
                <div style={{height:3,width:`${Math.min(100,score)}%`,background:lc,borderRadius:999}}/>
              </div>
              <div style={{fontSize:9,fontFamily:'monospace',color:pass?lc:'#555',marginBottom:pass?0:3}}>{score}</div>
              {!pass && failCheck && (
                <div style={{fontSize:7,fontFamily:'monospace',color:'#ff335555',lineHeight:1.3,marginTop:2}}>✗ {failCheck}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Proximity alert for coins close to triggering */}
      {total >= 55 && total < 70 && (
        <div style={{padding:'6px 14px',background:'#ffcc0008',borderTop:'1px solid #ffcc0022'}}>
          <span style={{fontSize:10,fontFamily:'monospace',color:'#ffcc00'}}>
            🔔 CLOSE TO SIGNAL — {need} more points needed. Monitoring closely.
          </span>
        </div>
      )}
    </div>
  )
}
