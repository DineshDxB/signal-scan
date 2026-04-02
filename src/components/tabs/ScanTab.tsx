import React, { useEffect, useState } from 'react'
import type { CoinSignal } from '../../types'
import { CoinBadge } from '../ui'
import { supabase } from '../../lib/db'

const LAYER_COLORS: Record<string, string> = {
  stage: '#378ADD', trend: '#1D9E75', setup: '#BA7517', momentum: '#7F77DD', risk: '#D4537E'
}
const LAYERS = [
  { key: 'stage',    label: 'Stage Analysis', weight: '30%',
    checks: ['Price above rising 30W MA (Stage 2)', 'MA sloping upward — uptrend confirmed', 'Above EMA 200 — institutional support', 'Volume above 20-day avg'] },
  { key: 'trend',    label: 'Multi-TF Trend', weight: '25%',
    checks: ['EMA 20 > 50 > 200 — full bullish stack', 'ADX above 20 + DI+ dominant', 'Price making higher highs', 'Holding above EMA 50'] },
  { key: 'setup',    label: 'Setup Quality',  weight: '20%',
    checks: ['RSI 50–68 — momentum zone', 'RSI below 75 (hard block above)', 'MACD histogram positive', 'Below upper Bollinger Band', 'No bearish RSI divergence', 'VCP volatility contraction'] },
  { key: 'momentum', label: 'Momentum',       weight: '15%',
    checks: ['Volume 1.8x+ average', 'Outperforming vs 7 days ago', 'Within 8% of resistance', 'Strong bullish candle'] },
  { key: 'risk',     label: 'Risk Gate',      weight: '10%',
    checks: ['R/R above 1:3 (hard gate)', 'Fear & Greed 35–75', 'Funding rate neutral', 'No recent 5%+ crash'] },
]

interface ScanTabProps {
  scanning: boolean; progress: number; currentCoin: string
  signals: CoinSignal[]; lastScanTime: string | null
  onScan: () => void; openTradeCount: number
}

export default function ScanTab({ scanning, progress, currentCoin }: ScanTabProps) {
  const [coins, setCoins]       = useState<CoinSignal[]>([])
  const [scanTime, setScanTime] = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  async function loadLatest() {
    try {
      const { data: latest } = await supabase
        .from('signal_log').select('signal_time')
        .order('signal_time', { ascending: false }).limit(1)
      if (!latest || !latest.length) { setLoading(false); return }

      const latestTime  = new Date(latest[0].signal_time)
      const windowStart = new Date(latestTime.getTime() - 40 * 60000)

      const { data: rows } = await supabase
        .from('signal_log').select('*')
        .gte('signal_time', windowStart.toISOString())
        .order('signal_time', { ascending: false })
      if (!rows || !rows.length) { setLoading(false); return }

      // Deduplicate: keep only ONE entry per coin (the latest)
      const seen = new Set<string>()
      const deduped = rows.filter((r: Record<string,unknown>) => {
        const c = String(r.coin)
        if (seen.has(c)) return false
        seen.add(c); return true
      })

      const mapped = deduped.map(parseRow)
      mapped.sort((a: CoinSignal, b: CoinSignal) => {
        if (a.signal !== 'WAIT' && b.signal === 'WAIT') return -1
        if (a.signal === 'WAIT' && b.signal !== 'WAIT') return 1
        return b.overallScore - a.overallScore
      })
      setCoins(mapped)
      setScanTime(latest[0].signal_time)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => {
    loadLatest()
    const t = setInterval(loadLatest, 4 * 60000)
    return () => clearInterval(t)
  }, [])

  const actionable = coins.filter(s => s.signal === 'BUY' || s.signal === 'SELL')
  const waiting    = coins.filter(s => s.signal === 'WAIT')

  return (
    <div style={{ padding: 16 }}>
      <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: '#0a0a1a', border: '1px solid #00ff8818' }}>
        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#00ff88', marginBottom: 2 }}>
          ⚡ AUTO-SCAN ACTIVE — every 4 hours · results load automatically
        </div>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>
          {scanTime
            ? `Last scan: ${new Date(scanTime).toLocaleString('en-AE', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false })} GST · ${coins.length} coins`
            : 'Waiting · runs at 00:00 04:00 08:00 12:00 16:00 20:00 UTC'}
        </div>
        {scanning && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#ffcc00', marginBottom: 3 }}>Scanning {currentCoin}...</div>
            <div style={{ height: 4, background: '#1a1a2e', borderRadius: 999 }}>
              <div style={{ height: 4, width: `${progress}%`, background: '#ffcc00', borderRadius: 999 }} />
            </div>
          </div>
        )}
      </div>

      {actionable.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color: '#00ff88', marginBottom: 10 }}>SIGNALS — {actionable.length}</div>
          {actionable.map(s => <SignalCard key={s.coin} sig={s} />)}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 11, fontFamily: 'monospace', color: '#333' }}>Loading latest scan...</div>}
      {!loading && coins.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: 'monospace' }}>
          <div style={{ fontSize: 13, color: '#333', marginBottom: 8 }}>No scan results yet</div>
          <div style={{ fontSize: 11, color: '#555' }}>Auto-scan runs at 00:00 04:00 08:00 12:00 16:00 20:00 UTC</div>
        </div>
      )}

      {waiting.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color: '#444', marginBottom: 10 }}>WATCHLIST — {waiting.length} coins</div>
          {waiting.map(s => <WatchCard key={s.coin} sig={s} />)}
        </div>
      )}
    </div>
  )
}

function parseRow(row: Record<string, unknown>): CoinSignal {
  const price = parseFloat(Number(row.entry_price || 0).toFixed(2))
  const rsi   = parseFloat(Number(row.rsi_at_entry || 50).toFixed(1))
  const vol   = parseFloat(Number(row.volume_ratio || 1).toFixed(2))
  const adxV  = parseFloat(Number(row.adx || 0).toFixed(1))
  const score = parseInt(String(Math.round(Number(row.confidence) || 0)))
  let ls = { stage: 0, trend: 0, setup: 0, momentum: 0, risk: 0 }
  try {
    const raw = row.layer_scores
    let obj: Record<string, unknown> = {}
    if (typeof raw === 'string' && raw.length > 2) obj = JSON.parse(raw)
    else if (raw && typeof raw === 'object') obj = raw as Record<string, unknown>
    ls = { stage: Number(obj.stage)||0, trend: Number(obj.trend)||0, setup: Number(obj.setup)||0, momentum: Number(obj.momentum)||0, risk: Number(obj.risk)||0 }
  } catch { /**/ }
  if (Object.values(ls).every(v => v === 0) && score > 0) {
    ls = { stage: Math.min(100, score*1.4), trend: Math.min(100, score*1.2), setup: Math.min(100, score), momentum: Math.min(100, score*0.9), risk: Math.min(100, score*0.8) }
  }
  const isSell = String(row.signal_type) === 'SELL'
  return {
    coin: String(row.coin), symbol: `${row.coin}USDT`,
    signal: String(row.signal_type) as 'BUY'|'SELL'|'WAIT',
    confidence: score, overallScore: score, layerScores: ls,
    layersPassed: Object.values(ls).filter(v => v >= 60).length,
    hardGatesFailed: [], entryType: 'BREAKOUT',
    regime: String(row.regime || 'ranging') as 'trending_bull'|'ranging'|'trending_bear'|'high_volatility',
    currentPrice: price, entryPrice: price, idealEntry: price,
    stopLoss: parseFloat((price * (isSell ? 1.065 : 0.935)).toFixed(2)),
    tp1: parseFloat((price * (isSell ? 0.92 : 1.08)).toFixed(2)),
    tp2: parseFloat((price * (isSell ? 0.84 : 1.16)).toFixed(2)),
    tp3: parseFloat((price * (isSell ? 0.74 : 1.26)).toFixed(2)),
    invalidationPrice: parseFloat((price * (isSell ? 1.08 : 0.92)).toFixed(2)),
    rrRatio: 3, fvgZone: null, bosLevel: null,
    entryNotes: `${new Date(String(row.signal_time)).toLocaleString('en-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false})} GST`,
    rsi, volumeRatio: vol, adx: adxV,
    fundingRate: 0, fearGreed: 50, fearGreedTrend: 'STABLE', btcDominance: 50,
    positionSize: 0, riskAmount: 0,
    scanTime: String(row.signal_time), gstHour: Number(row.gst_hour)||0, setupAge: 0,
    analysis: `Score ${score}/100 · RSI ${rsi} · Vol ${vol}x · ADX ${adxV}`,
    newsOk: true, newsNote: ''
  }
}

function SignalCard({ sig }: { sig: CoinSignal }) {
  const isBuy = sig.signal === 'BUY'
  const col   = isBuy ? '#00ff88' : '#ff3355'
  return (
    <div style={{ borderRadius: 12, border: `1.5px solid ${col}44`, marginBottom: 16, background: '#0a0a1a', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: `${col}0a`, borderBottom: '1px solid #ffffff08', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 4, height: 40, background: col, borderRadius: 2, flexShrink: 0 }} />
        <div><CoinBadge coin={sig.coin} size={22} /><div style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>{sig.regime.replace('_',' ')}</div></div>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: col, letterSpacing: 2 }}>{sig.signal}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {[['Entry',`$${sig.entryPrice.toFixed(2)}`,'#fff'],['Stop',`$${sig.stopLoss.toFixed(2)}`,'#ff3355'],['TP1',`$${sig.tp1.toFixed(2)}`,'#00cc66'],['TP2',`$${sig.tp2.toFixed(2)}`,'#00ff88'],['TP3',`$${sig.tp3.toFixed(2)}`,'#00ffaa'],['Score',`${sig.overallScore}/100`,sig.overallScore>=70?'#00ff88':'#ffcc00']].map(([l,v,c])=>(
            <div key={l as string} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: c as string }}>{v}</div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#444' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #ffffff06', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10, fontFamily: 'monospace' }}>
        <span style={{ color: '#555' }}>RSI <span style={{ color: sig.rsi>68?'#ff3355':sig.rsi<50?'#ffcc00':'#00ff88' }}>{sig.rsi}</span></span>
        <span style={{ color: '#555' }}>Vol <span style={{ color: sig.volumeRatio>=1.8?'#00ff88':'#ffcc00' }}>{sig.volumeRatio}x</span></span>
        <span style={{ color: '#555' }}>ADX <span style={{ color: sig.adx>=22?'#00ff88':'#ffcc00' }}>{sig.adx}</span></span>
        <span style={{ color: '#555' }}>R/R <span style={{ color: '#7F77DD' }}>1:{sig.rrRatio}</span></span>
        <span style={{ color: '#555' }}>{sig.entryNotes}</span>
      </div>
      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#333', marginBottom: 10 }}>5-LAYER BREAKDOWN</div>
        {LAYERS.map((layer, li) => {
          const score = sig.layerScores[layer.key as keyof typeof sig.layerScores] || 0
          const lc    = LAYER_COLORS[layer.key]
          const pass  = score >= 60
          return (
            <div key={layer.key} style={{ marginBottom: 8, padding: '10px 12px', borderRadius: 8, background: `${lc}08`, border: `1px solid ${lc}${pass?'33':'18'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: lc }}>L{li+1} {layer.label}</span>
                  <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#444' }}>({layer.weight})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 80, height: 4, background: '#1a1a2e', borderRadius: 999 }}>
                    <div style={{ height: 4, width: `${Math.min(100,score)}%`, background: lc, borderRadius: 999 }} />
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: lc, width: 28, textAlign: 'right' }}>{Math.round(score)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: pass?'#00ff88':'#ff3355', width: 44 }}>{pass?'✓ PASS':'✗ FAIL'}</span>
                </div>
              </div>
              {layer.checks.map((check, ci) => {
                const cp = score > (ci / layer.checks.length) * 80
                return (
                  <div key={ci} style={{ display: 'flex', gap: 6, fontSize: 10, fontFamily: 'monospace', padding: '2px 0' }}>
                    <span style={{ color: cp?'#00ff8877':'#ff335555', flexShrink: 0 }}>{cp?'✓':'✗'}</span>
                    <span style={{ color: cp?'#666':'#444', lineHeight: 1.4 }}>{check}</span>
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

function WatchCard({ sig }: { sig: CoinSignal }) {
  return (
    <div style={{ borderRadius: 8, border: '1px solid #ffffff08', background: '#0a0a1a', marginBottom: 6, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <CoinBadge coin={sig.coin} size={14} />
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: sig.overallScore>=55?'#ffcc00':'#555' }}>Score: {sig.overallScore}/100</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>RSI: {sig.rsi}</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>Vol: {sig.volumeRatio}x</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>ADX: {sig.adx}</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'monospace', color: '#ff335566', background: '#ff335511', padding: '2px 8px', borderRadius: 3 }}>
          {sig.overallScore<=15?'Below 30W MA — Stage 4':sig.regime==='ranging'?'Ranging market':'Needs '+Math.max(0,70-sig.overallScore)+' pts'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {LAYERS.map(layer => {
          const score = sig.layerScores[layer.key as keyof typeof sig.layerScores] || 0
          const lc = LAYER_COLORS[layer.key]; const pass = score >= 60
          return (
            <div key={layer.key} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, background: `${lc}${pass?'18':'08'}`, border: `1px solid ${lc}${pass?'33':'15'}` }}>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: lc }}>{layer.label.split(' ')[0]}</span>
              <span style={{ fontSize: 9, color: pass?'#00ff8888':'#ff335566' }}>{pass?'✓':'✗'}</span>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>{Math.round(score)}</span>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 4, fontSize: 9, fontFamily: 'monospace', color: '#333' }}>Needs {Math.max(0,70-sig.overallScore)} more pts · {sig.regime.replace('_',' ')}</div>
    </div>
  )
}
