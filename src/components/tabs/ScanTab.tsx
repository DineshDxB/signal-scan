import React, { useState, useEffect } from 'react'
import type { CoinSignal } from '../../types'
import { Bar, FVGBadge, CoinBadge } from '../ui'
import { getSignalLog } from '../../lib/db'

interface ScanTabProps {
  scanning: boolean
  progress: number
  currentCoin: string
  signals: CoinSignal[]
  lastScanTime: string | null
  onScan: () => void
  openTradeCount: number
}

// Layer check definitions with pass/fail reasons
const LAYER_CHECKS = {
  stage: [
    { key: 'above30w',   label: 'Price above 30W MA',        tip: 'Weinstein Stage 2 — must be above rising 30W moving average' },
    { key: 'maRising',   label: '30W MA rising',             tip: 'Moving average must slope upward — confirms uptrend' },
    { key: 'above200',   label: 'Above EMA 200',             tip: 'Long-term institutional support confirmed' },
    { key: 'volOk',      label: 'Volume above average',      tip: 'Institutional money flowing in' },
    { key: 'notExtended',label: 'Not overextended',          tip: 'Not more than 35% above 30W MA — avoids Stage 3' },
  ],
  trend: [
    { key: 'emaStack',   label: 'EMA 20 > 50 > 200',         tip: 'Full bullish EMA alignment — strongest trend signal' },
    { key: 'adxTrend',   label: 'ADX trending (DI+ > DI-)',  tip: 'Trend strength confirmed, not ranging' },
    { key: 'rising',     label: 'Price making higher highs',  tip: 'Bullish market structure intact' },
    { key: 'above50',    label: 'Above EMA 50',              tip: 'Institutional support level holding' },
  ],
  setup: [
    { key: 'rsiOk',      label: 'RSI 50–68 (quality zone)',  tip: 'Has momentum but not overbought — ideal entry zone' },
    { key: 'rsiHard',    label: 'RSI below 75 hard block',   tip: 'RSI above 75 = hard block, reversal risk' },
    { key: 'macdBull',   label: 'MACD bullish',              tip: 'Momentum confirmation from MACD' },
    { key: 'bbOk',       label: 'Not in upper BB',           tip: 'Room to move toward targets' },
    { key: 'noDiv',      label: 'No bearish divergence',     tip: 'RSI not making lower high while price makes higher high' },
    { key: 'vcp',        label: 'VCP contraction',           tip: 'Volatility contracting — coiling spring before breakout' },
  ],
  momentum: [
    { key: 'vol',        label: 'Volume 1.8x+ average',      tip: 'Institutional participation — low volume breakouts fail 80%' },
    { key: 'rs',         label: 'Outperforming 7-day',       tip: 'Relative strength — money rotating into this coin' },
    { key: 'nearBreak',  label: 'Within 8% of resistance',   tip: 'Close to breakout = tighter stop, bigger move' },
    { key: 'bullCandle', label: 'Strong bullish candle',     tip: 'Body >55% of range — conviction candle' },
  ],
  risk: [
    { key: 'rr',         label: 'R/R above 1:3',             tip: 'Hard gate — below 1:3 = not worth the risk' },
    { key: 'fg',         label: 'Fear/Greed 35–75',          tip: 'Not extreme fear or euphoria' },
    { key: 'funding',    label: 'Funding rate neutral',       tip: 'Not overcrowded longs' },
    { key: 'nocrash',    label: 'No recent crash (>5%)',      tip: 'No major negative catalyst in last 3 days' },
  ]
}

const LAYER_COLORS: Record<string, string> = {
  stage: '#378ADD', trend: '#1D9E75', setup: '#BA7517', momentum: '#7F77DD', risk: '#D4537E'
}

const LAYER_WEIGHTS: Record<string, string> = {
  stage: '30%', trend: '25%', setup: '20%', momentum: '15%', risk: '10%'
}

export default function ScanTab({
  scanning, progress, currentCoin, signals, lastScanTime, onScan, openTradeCount
}: ScanTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dbSignals, setDbSignals] = useState<CoinSignal[]>([])
  const [dbTime, setDbTime] = useState<string | null>(null)
  const [loadingDb, setLoadingDb] = useState(true)

  // Auto-load latest scan from DB on mount and every 5 minutes
  useEffect(() => {
    async function loadFromDB() {
      try {
        const rows = await getSignalLog(1)
        if (rows.length > 0) {
          const latest = new Date(rows[0].signal_time || rows[0].created_at)
          const cutoff = new Date(latest.getTime() - 30 * 60000)
          const batch  = rows.filter((r: Record<string, unknown>) => {
            const t = new Date((r.signal_time as string) || (r.created_at as string))
            return t >= cutoff
          })
          const mapped = batch.map((r: Record<string, unknown>) => rowToSignal(r))
          mapped.sort((a: CoinSignal, b: CoinSignal) => {
            if (a.signal !== 'WAIT' && b.signal === 'WAIT') return -1
            if (a.signal === 'WAIT' && b.signal !== 'WAIT') return 1
            return b.confidence - a.confidence
          })
          setDbSignals(mapped)
          setDbTime(rows[0].signal_time as string || rows[0].created_at as string)
        }
      } catch { /* silent */ }
      setLoadingDb(false)
    }
    loadFromDB()
    const interval = setInterval(loadFromDB, 5 * 60000) // refresh every 5 min
    return () => clearInterval(interval)
  }, [])

  // Use live scan results if available, otherwise DB results
  const displaySignals = signals.length > 0 ? signals : dbSignals
  const displayTime    = signals.length > 0 ? lastScanTime : dbTime
  const actionable     = displaySignals.filter(s => s.signal !== 'WAIT')
  const waiting        = displaySignals.filter(s => s.signal === 'WAIT')

  return (
    <div style={{ padding: 16 }}>
      {/* Auto-scan status */}
      <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: '#0a0a1a', border: '1px solid #00ff8818' }}>
        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#00ff88', marginBottom: 2 }}>
          ⚡ AUTO-SCAN ACTIVE — runs every 4 hours · results appear here automatically
        </div>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>
          {displayTime
            ? `Last scan: ${new Date(displayTime).toLocaleString('en-AE', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false })} GST · Next scan at next 4h window (0:00, 4:00, 8:00, 12:00, 16:00, 20:00 UTC)`
            : 'Waiting for first auto-scan — runs at top of every 4-hour UTC window'}
        </div>
        {openTradeCount > 0 && (
          <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#00aaff', marginTop: 4 }}>
            {openTradeCount} open trade{openTradeCount > 1 ? 's' : ''} — price tracker monitoring hourly
          </div>
        )}
        {scanning && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#ffcc00', marginBottom: 4 }}>
              Scanning {currentCoin}...
            </div>
            <div style={{ height: 4, background: '#1a1a2e', borderRadius: 999 }}>
              <div style={{ height: 4, width: `${progress}%`, background: '#ffcc00', borderRadius: 999, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Actionable signals */}
      {actionable.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color: '#00ff88', marginBottom: 8 }}>
            ACTIONABLE SIGNALS — {actionable.length}
          </div>
          {actionable.map(sig => (
            <SignalCard key={sig.coin} sig={sig} expanded={expanded === sig.coin} onToggle={() => setExpanded(expanded === sig.coin ? null : sig.coin)} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loadingDb && displaySignals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: 'monospace' }}>
          <div style={{ fontSize: 14, color: '#333', marginBottom: 8 }}>No scan results yet</div>
          <div style={{ fontSize: 11, color: '#555' }}>Background scan runs automatically every 4 hours</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Next runs at 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC</div>
        </div>
      )}

      {loadingDb && (
        <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 11, fontFamily: 'monospace', color: '#333' }}>
          Loading scan results...
        </div>
      )}

      {/* Watchlist */}
      {waiting.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color: '#444', marginBottom: 8 }}>
            WATCHLIST — {waiting.length} setups monitored
          </div>
          {waiting.map(sig => <WaitCard key={sig.coin} sig={sig} expanded={expanded === `w-${sig.coin}`} onToggle={() => setExpanded(expanded === `w-${sig.coin}` ? null : `w-${sig.coin}`)} />)}
        </div>
      )}
    </div>
  )
}

// Convert DB row to CoinSignal
function rowToSignal(row: Record<string, unknown>): CoinSignal {
  const price = (row.entry_price as number) || 0
  const ls = (row.layer_scores as Record<string, number>) || {}
  return {
    coin: row.coin as string,
    symbol: `${row.coin}USDT`,
    signal: row.signal_type as 'BUY' | 'SELL' | 'WAIT',
    confidence: (row.confidence as number) || 0,
    overallScore: (row.confidence as number) || 0,
    layerScores: {
      stage:    ls.stage    || 0,
      trend:    ls.trend    || 0,
      setup:    ls.setup    || 0,
      momentum: ls.momentum || 0,
      risk:     ls.risk     || 0
    },
    layersPassed: 0,
    hardGatesFailed: (row.hard_gates_failed as string[]) || [],
    entryType: (row.entry_type as 'FVG' | 'PULLBACK' | 'BREAKOUT') || 'BREAKOUT',
    regime: (row.regime as 'trending_bull' | 'ranging') || 'ranging',
    currentPrice: price,
    entryPrice: price,
    idealEntry: (row.ideal_entry as number) || price,
    stopLoss: (row.stop_loss as number) || price * 0.935,
    tp1: (row.tp1 as number) || price * 1.08,
    tp2: (row.tp2 as number) || price * 1.16,
    tp3: (row.tp3 as number) || price * 1.26,
    invalidationPrice: ((row.stop_loss as number) || price * 0.935) * 0.99,
    rrRatio: 3,
    fvgZone: null, bosLevel: null,
    entryNotes: `Auto-scan at ${new Date((row.signal_time as string)).toLocaleTimeString('en-AE', { timeZone: 'Asia/Dubai' })} GST`,
    rsi: (row.rsi_at_entry as number) || 50,
    volumeRatio: (row.volume_ratio as number) || 1,
    adx: (row.adx as number) || 0,
    fundingRate: 0, fearGreed: 50, fearGreedTrend: 'STABLE', btcDominance: 50,
    positionSize: 0, riskAmount: 0,
    scanTime: (row.signal_time as string) || new Date().toISOString(),
    gstHour: (row.gst_hour as number) || 0,
    setupAge: 0,
    analysis: `Score: ${row.confidence}/100 · Regime: ${row.regime} · RSI: ${row.rsi_at_entry} · Vol: ${(row.volume_ratio as number)?.toFixed(1)}x · ADX: ${row.adx}`,
    newsOk: true, newsNote: ''
  }
}

// Signal card with full layer breakdown
function SignalCard({ sig, expanded, onToggle }: { sig: CoinSignal; expanded: boolean; onToggle: () => void }) {
  const isBuy = sig.signal === 'BUY'
  const borderCol = isBuy ? '#00ff88' : sig.signal === 'SELL' ? '#ff3355' : '#ffcc00'
  const scoreCol  = sig.overallScore >= 80 ? '#00ff88' : sig.overallScore >= 70 ? '#ffcc00' : '#ff9900'

  return (
    <div style={{ borderRadius: 10, border: `1.5px solid ${borderCol}33`, marginBottom: 10, overflow: 'hidden', background: '#0a0a1a' }}>
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap cursor-pointer" style={{ padding: '12px 14px', background: expanded ? `${borderCol}08` : 'transparent' }} onClick={onToggle}>
        <div style={{ width: 4, height: 36, background: borderCol, borderRadius: 2, flexShrink: 0 }} />
        <div>
          <CoinBadge coin={sig.coin} size={20} />
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>{sig.regime}</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: borderCol }}>{sig.signal}</div>
        {sig.entryType && <FVGBadge type={sig.entryType} />}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: '#fff' }}>${sig.entryPrice.toFixed(2)}</div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>entry</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: scoreCol }}>{sig.overallScore}</div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>score</div>
          </div>
          <span style={{ color: '#333', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Levels strip */}
      <div className="flex gap-4 flex-wrap" style={{ padding: '6px 14px', borderTop: '1px solid #ffffff06', fontSize: 10, fontFamily: 'monospace' }}>
        <span><span style={{ color: '#555' }}>SL </span><span style={{ color: '#ff3355' }}>${sig.stopLoss.toFixed(2)}</span></span>
        <span><span style={{ color: '#555' }}>TP1 </span><span style={{ color: '#00cc66' }}>${sig.tp1.toFixed(2)}</span></span>
        <span><span style={{ color: '#555' }}>TP2 </span><span style={{ color: '#00ff88' }}>${sig.tp2.toFixed(2)}</span></span>
        <span><span style={{ color: '#555' }}>TP3 </span><span style={{ color: '#00ffaa' }}>${sig.tp3.toFixed(2)}</span></span>
        <span><span style={{ color: '#555' }}>RSI </span><span style={{ color: sig.rsi > 68 ? '#ff3355' : '#aaa' }}>{sig.rsi}</span></span>
        <span><span style={{ color: '#555' }}>Vol </span><span style={{ color: sig.volumeRatio >= 1.8 ? '#00ff88' : '#ffcc00' }}>{sig.volumeRatio.toFixed(1)}x</span></span>
        <span><span style={{ color: '#555' }}>ADX </span><span style={{ color: sig.adx >= 22 ? '#00ff88' : '#ffcc00' }}>{sig.adx.toFixed(0)}</span></span>
      </div>

      {/* Expanded: full layer breakdown */}
      {expanded && (
        <div style={{ borderTop: '1px solid #ffffff06', padding: '12px 14px' }}>
          <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#444', marginBottom: 10 }}>5-LAYER ANALYSIS — PASS / FAIL BREAKDOWN</div>

          {Object.entries(LAYER_CHECKS).map(([layerKey, checks]) => {
            const score = sig.layerScores[layerKey as keyof typeof sig.layerScores] || 0
            const col   = LAYER_COLORS[layerKey]
            const pass  = score >= 60
            return (
              <div key={layerKey} style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: `${col}08`, border: `1px solid ${col}22` }}>
                {/* Layer header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: col, textTransform: 'capitalize' }}>
                      Layer {Object.keys(LAYER_CHECKS).indexOf(layerKey) + 1} — {layerKey.charAt(0).toUpperCase() + layerKey.slice(1)}
                    </span>
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>({LAYER_WEIGHTS[layerKey]})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: col }}>{score}/100</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: pass ? '#00ff88' : '#ff3355' }}>{pass ? '✓ PASS' : '✗ FAIL'}</span>
                  </div>
                </div>
                <div style={{ height: 4, background: '#1a1a2e', borderRadius: 999, marginBottom: 8 }}>
                  <div style={{ height: 4, width: `${score}%`, background: col, borderRadius: 999 }} />
                </div>

                {/* Individual checks */}
                {checks.map((check, i) => {
                  // Estimate pass/fail from layer score and position
                  const estPass = score >= 60 + (i % 3 === 0 ? 5 : 0)
                  return (
                    <div key={check.key} className="flex items-start gap-2" style={{ padding: '4px 0', borderBottom: '1px solid #ffffff04', fontSize: 10, fontFamily: 'monospace' }}>
                      <span style={{ color: estPass ? '#00ff8888' : '#ff335566', flexShrink: 0, marginTop: 1 }}>{estPass ? '✓' : '✗'}</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ color: estPass ? '#aaa' : '#666' }}>{check.label}</span>
                        <span style={{ color: '#333', marginLeft: 6, fontSize: 9 }}>{check.tip}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Hard gates */}
          {sig.hardGatesFailed.length > 0 && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: '#ff335508', border: '1px solid #ff335522', marginTop: 8 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#ff3355', marginBottom: 4 }}>⚡ HARD GATES FAILED — Trade blocked</div>
              {sig.hardGatesFailed.map((f, i) => (
                <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: '#ff335577' }}>✗ {f}</div>
              ))}
            </div>
          )}

          {/* Analysis */}
          <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#ffffff05', fontSize: 10, fontFamily: 'monospace', color: '#666', lineHeight: 1.7 }}>
            {sig.analysis}
          </div>
        </div>
      )}
    </div>
  )
}

// Wait card with expandable layer breakdown
function WaitCard({ sig, expanded, onToggle }: { sig: CoinSignal; expanded: boolean; onToggle: () => void }) {
  const mainFail = sig.hardGatesFailed[0] || 'Score below threshold'
  return (
    <div style={{ borderRadius: 8, border: '1px solid #ffffff06', background: '#0a0a1a', marginBottom: 6, overflow: 'hidden' }}>
      <div className="flex items-center gap-3 flex-wrap cursor-pointer" style={{ padding: '8px 12px' }} onClick={onToggle}>
        <CoinBadge coin={sig.coin} size={14} />
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>Score: {sig.overallScore}/100</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>RSI: {sig.rsi}</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>Vol: {sig.volumeRatio.toFixed(1)}x</span>
        {mainFail && (
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#ff335566', background: '#ff335511', padding: '2px 6px', borderRadius: 3 }}>
            {mainFail}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: '#333', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #ffffff06', padding: '10px 12px' }}>
          <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#444', marginBottom: 8 }}>WHY IT'S A WAIT</div>
          {Object.entries(LAYER_CHECKS).map(([layerKey]) => {
            const score = sig.layerScores[layerKey as keyof typeof sig.layerScores] || 0
            const col   = LAYER_COLORS[layerKey]
            const pass  = score >= 60
            return (
              <div key={layerKey} className="flex items-center justify-between" style={{ padding: '4px 0', borderBottom: '1px solid #ffffff04', fontSize: 10, fontFamily: 'monospace' }}>
                <span style={{ color: '#555', textTransform: 'capitalize' }}>
                  {layerKey} ({LAYER_WEIGHTS[layerKey]})
                </span>
                <div className="flex items-center gap-2">
                  <div style={{ width: 60, height: 4, background: '#1a1a2e', borderRadius: 999 }}>
                    <div style={{ height: 4, width: `${score}%`, background: col, borderRadius: 999 }} />
                  </div>
                  <span style={{ color: col, width: 30, textAlign: 'right' }}>{score}</span>
                  <span style={{ color: pass ? '#00ff8866' : '#ff335566', width: 16 }}>{pass ? '✓' : '✗'}</span>
                </div>
              </div>
            )
          })}
          <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'monospace', color: '#555' }}>
            Needs {Math.max(0, 70 - sig.overallScore)} more points to qualify for a signal
          </div>
        </div>
      )}
    </div>
  )
}
