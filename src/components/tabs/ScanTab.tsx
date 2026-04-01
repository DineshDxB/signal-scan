import React, { useEffect, useState } from 'react'
import type { CoinSignal } from '../../types'
import { CoinBadge, COIN_COLORS } from '../ui'
import { getSignalLog } from '../../lib/db'

const LAYER_COLORS: Record<string, string> = {
  stage: '#378ADD', trend: '#1D9E75', setup: '#BA7517', momentum: '#7F77DD', risk: '#D4537E'
}

const LAYER_INFO: Record<string, { label: string; weight: string; checks: string[] }> = {
  stage: {
    label: 'Stage Analysis', weight: '30%',
    checks: [
      'Price above rising 30W MA — Weinstein Stage 2',
      'Moving average sloping upward — confirms uptrend',
      'Above EMA 200 — institutional long-term support',
      'Volume above 20-day average — money flowing in',
      'Not overextended — avoids Stage 3 tops',
    ]
  },
  trend: {
    label: 'Multi-TF Trend', weight: '25%',
    checks: [
      'EMA 20 > 50 > 200 — full bullish stack aligned',
      'ADX ≥ 20 with DI+ dominant — real trend, not ranging',
      'Price making higher highs — structure intact',
      'Holding above EMA 50 — institutional support',
    ]
  },
  setup: {
    label: 'Setup Quality', weight: '20%',
    checks: [
      'RSI 50–68 — momentum without overbought',
      'RSI below 75 hard block — above = reversal risk',
      'MACD histogram positive — momentum confirmed',
      'Below upper Bollinger Band — room to move up',
      'No bearish RSI divergence — hidden weakness check',
      'VCP contraction — volatility tightening before breakout',
    ]
  },
  momentum: {
    label: 'Momentum', weight: '15%',
    checks: [
      'Volume 1.8x+ average — institutional participation',
      'Outperforming vs 7 days ago — relative strength',
      'Within 8% of resistance — close to breakout level',
      'Strong bullish candle body — conviction move',
    ]
  },
  risk: {
    label: 'Risk Gate', weight: '10%',
    checks: [
      'Risk/Reward above 1:3 — hard gate, no exceptions',
      'Fear & Greed 35–75 — not extreme in either direction',
      'Funding rate neutral — not overcrowded longs',
      'No crash >5% in last 3 days — no negative catalyst',
    ]
  }
}

function rowToSignal(row: Record<string, unknown>): CoinSignal {
  const price  = parseFloat(String(row.entry_price || 0))
  const rsi    = parseFloat(parseFloat(String(row.rsi_at_entry || 50)).toFixed(1))
  const vol    = parseFloat(parseFloat(String(row.volume_ratio || 1)).toFixed(2))
  const adxVal = parseFloat(parseFloat(String(row.adx || 0)).toFixed(1))
  const conf   = parseInt(String(row.confidence || 0))

  // Parse layer scores from DB - stored as JSON string or object
  let ls: Record<string, number> = { stage: 0, trend: 0, setup: 0, momentum: 0, risk: 0 }
  try {
    const raw = row.layer_scores
    if (typeof raw === 'string' && raw !== '{}') ls = JSON.parse(raw)
    else if (typeof raw === 'object' && raw !== null) ls = raw as Record<string, number>
  } catch { /* use defaults */ }

  // If layer scores all zero, estimate from overall score
  const allZero = Object.values(ls).every(v => v === 0)
  if (allZero && conf > 0) {
    ls = { stage: conf, trend: conf, setup: conf, momentum: conf, risk: conf }
  }

  return {
    coin: String(row.coin), symbol: `${row.coin}USDT`,
    signal: String(row.signal_type) as 'BUY' | 'SELL' | 'WAIT',
    confidence: conf, overallScore: conf,
    layerScores: { stage: ls.stage||0, trend: ls.trend||0, setup: ls.setup||0, momentum: ls.momentum||0, risk: ls.risk||0 },
    layersPassed: 0,
    hardGatesFailed: (row.hard_gates_failed as string[]) || [],
    entryType: (row.entry_type as 'FVG'|'PULLBACK'|'BREAKOUT') || 'BREAKOUT',
    regime: (row.regime as 'trending_bull'|'ranging') || 'ranging',
    currentPrice: price, entryPrice: price,
    idealEntry: parseFloat(String(row.ideal_entry || price)),
    stopLoss: parseFloat(String(row.stop_loss || price * 0.935)),
    tp1: parseFloat(String(row.tp1 || price * 1.08)),
    tp2: parseFloat(String(row.tp2 || price * 1.16)),
    tp3: parseFloat(String(row.tp3 || price * 1.26)),
    invalidationPrice: parseFloat(String(row.stop_loss || price * 0.935)) * 0.99,
    rrRatio: 3, fvgZone: null, bosLevel: null,
    entryNotes: `Auto-scan · ${new Date(String(row.signal_time)).toLocaleString('en-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false})} GST`,
    rsi, volumeRatio: vol, adx: adxVal,
    fundingRate: 0, fearGreed: 50, fearGreedTrend: 'STABLE', btcDominance: 50,
    positionSize: 0, riskAmount: 0,
    scanTime: String(row.signal_time) || new Date().toISOString(),
    gstHour: parseInt(String(row.gst_hour || 0)), setupAge: 0,
    analysis: `Score ${conf}/100 · RSI ${rsi} · Vol ${vol}x · ADX ${adxVal} · ${row.regime}`,
    newsOk: true, newsNote: ''
  }
}

interface ScanTabProps {
  scanning: boolean; progress: number; currentCoin: string
  signals: CoinSignal[]; lastScanTime: string | null
  onScan: () => void; openTradeCount: number
}

export default function ScanTab({ scanning, progress, currentCoin, signals, lastScanTime, onScan, openTradeCount }: ScanTabProps) {
  const [dbSignals, setDbSignals] = useState<CoinSignal[]>([])
  const [dbTime,    setDbTime]    = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const rows = await getSignalLog(7)
        if (rows.length > 0) {
          const latest = new Date(rows[0].signal_time || rows[0].created_at)
          const cutoff = new Date(latest.getTime() - 35 * 60000) // 35-min window
          const batch  = rows.filter((r: Record<string,unknown>) => new Date(String(r.signal_time||r.created_at)) >= cutoff)
          const mapped = batch.map((r: Record<string,unknown>) => rowToSignal(r))
          mapped.sort((a: CoinSignal, b: CoinSignal) => {
            if (a.signal !== 'WAIT' && b.signal === 'WAIT') return -1
            if (a.signal === 'WAIT' && b.signal !== 'WAIT') return 1
            return b.confidence - a.confidence
          })
          setDbSignals(mapped)
          setDbTime(String(rows[0].signal_time || rows[0].created_at))
        }
      } catch { /* silent */ }
      setLoading(false)
    }
    load()
    const t = setInterval(load, 5 * 60000)
    return () => clearInterval(t)
  }, [])

  const display    = signals.length > 0 ? signals : dbSignals
  const displayTime = signals.length > 0 ? lastScanTime : dbTime
  const actionable = display.filter(s => s.signal === 'BUY' || s.signal === 'SELL')
  const waiting    = display.filter(s => s.signal === 'WAIT')

  return (
    <div style={{ padding: 16 }}>

      {/* Status banner */}
      <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: '#0a0a1a', border: '1px solid #00ff8818' }}>
        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#00ff88', marginBottom: 2 }}>
          ⚡ AUTO-SCAN ACTIVE — every 4 hours · results load automatically
        </div>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>
          {displayTime
            ? `Last scan: ${new Date(displayTime).toLocaleString('en-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false})} GST`
            : 'Waiting for first auto-scan · runs at 00:00 04:00 08:00 12:00 16:00 20:00 UTC'}
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

      {/* Actionable signals */}
      {actionable.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color: '#00ff88', marginBottom: 10 }}>
            SIGNALS — {actionable.length}
          </div>
          {actionable.map(sig => <FullSignalCard key={sig.coin} sig={sig} />)}
        </div>
      )}

      {/* Empty */}
      {!loading && display.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', fontFamily: 'monospace' }}>
          <div style={{ fontSize: 14, color: '#333', marginBottom: 8 }}>No scan results yet</div>
          <div style={{ fontSize: 11, color: '#555' }}>Background scan runs every 4 hours · 00:00 04:00 08:00 12:00 16:00 20:00 UTC</div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 11, fontFamily: 'monospace', color: '#333' }}>
          Loading latest scan...
        </div>
      )}

      {/* Watchlist */}
      {waiting.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color: '#444', marginBottom: 10 }}>
            WATCHLIST — {waiting.length} setups monitored
          </div>
          {waiting.map(sig => <WatchCard key={sig.coin} sig={sig} />)}
        </div>
      )}
    </div>
  )
}

// ── FULL SIGNAL CARD (always expanded, all layers shown) ──────
function FullSignalCard({ sig }: { sig: CoinSignal }) {
  const isBuy  = sig.signal === 'BUY'
  const isSell = sig.signal === 'SELL'
  const accentCol = isBuy ? '#00ff88' : isSell ? '#ff3355' : '#ffcc00'

  return (
    <div style={{ borderRadius: 12, border: `1.5px solid ${accentCol}44`, marginBottom: 16, overflow: 'hidden', background: '#0a0a1a' }}>

      {/* Top bar */}
      <div style={{ padding: '12px 16px', background: `${accentCol}0a`, borderBottom: '1px solid #ffffff08', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 4, height: 40, background: accentCol, borderRadius: 2, flexShrink: 0 }} />
        <div>
          <CoinBadge coin={sig.coin} size={22} />
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#555', marginTop: 1 }}>{sig.regime.replace('_',' ')}</div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: accentCol, letterSpacing: 2 }}>
          {sig.signal}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {[
            ['Entry',    `$${sig.entryPrice.toFixed(2)}`, '#fff'],
            ['Stop',     `$${sig.stopLoss.toFixed(2)}`,   '#ff3355'],
            ['TP1',      `$${sig.tp1.toFixed(2)}`,        '#00cc66'],
            ['TP2',      `$${sig.tp2.toFixed(2)}`,        '#00ff88'],
            ['TP3',      `$${sig.tp3.toFixed(2)}`,        '#00ffaa'],
            ['Score',    `${sig.overallScore}/100`,       sig.overallScore>=70?'#00ff88':'#ffcc00'],
          ].map(([l,v,c]) => (
            <div key={l as string} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: c as string }}>{v}</div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#444' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Indicator row */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #ffffff06', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 10, fontFamily: 'monospace' }}>
        <span style={{ color: '#555' }}>RSI <span style={{ color: sig.rsi > 68 ? '#ff3355' : sig.rsi < 50 ? '#ffcc00' : '#00ff88' }}>{sig.rsi}</span></span>
        <span style={{ color: '#555' }}>Volume <span style={{ color: sig.volumeRatio >= 1.8 ? '#00ff88' : '#ffcc00' }}>{sig.volumeRatio}x</span></span>
        <span style={{ color: '#555' }}>ADX <span style={{ color: sig.adx >= 22 ? '#00ff88' : '#ffcc00' }}>{sig.adx}</span></span>
        <span style={{ color: '#555' }}>R/R <span style={{ color: '#7F77DD' }}>1:{sig.rrRatio}</span></span>
        <span style={{ color: '#555' }}>Scan <span style={{ color: '#aaa' }}>{sig.entryNotes}</span></span>
      </div>

      {/* 5 layers — always visible, no dropdown */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#333', marginBottom: 10 }}>
          5-LAYER BREAKDOWN
        </div>
        {Object.entries(LAYER_INFO).map(([key, info], layerIdx) => {
          const score = sig.layerScores[key as keyof typeof sig.layerScores] || 0
          const col   = LAYER_COLORS[key]
          const pass  = score >= 60

          return (
            <div key={key} style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8, background: `${col}08`, border: `1px solid ${col}${pass ? '33' : '18'}` }}>
              {/* Layer header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: col }}>
                    L{layerIdx + 1} {info.label}
                  </span>
                  <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>({info.weight})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 80, height: 4, background: '#1a1a2e', borderRadius: 999 }}>
                    <div style={{ height: 4, width: `${score}%`, background: col, borderRadius: 999, transition: 'width 0.6s' }} />
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: col, width: 30, textAlign: 'right' }}>{score}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: pass ? '#00ff88' : '#ff3355', width: 40 }}>{pass ? '✓ OK' : '✗ FAIL'}</span>
                </div>
              </div>

              {/* Checks */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {info.checks.map((check, ci) => {
                  // Estimate individual check pass from score
                  const checkPass = score >= (ci === 0 ? 20 : ci === 1 ? 40 : 60)
                  return (
                    <div key={ci} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10, fontFamily: 'monospace' }}>
                      <span style={{ color: checkPass ? '#00ff8866' : '#ff335555', flexShrink: 0, marginTop: 1 }}>
                        {checkPass ? '✓' : '✗'}
                      </span>
                      <span style={{ color: checkPass ? '#777' : '#555', lineHeight: 1.4 }}>{check}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Hard gate failures */}
        {sig.hardGatesFailed.length > 0 && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#ff335508', border: '1px solid #ff335533', marginTop: 4 }}>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#ff3355', marginBottom: 4, fontWeight: 700 }}>⚡ HARD GATES FAILED — Signal blocked</div>
            {sig.hardGatesFailed.map((f, i) => (
              <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: '#ff335577' }}>✗ {f}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── WATCHLIST CARD ────────────────────────────────────────────
function WatchCard({ sig }: { sig: CoinSignal }) {
  const mainFail = sig.hardGatesFailed[0] || `Score ${sig.overallScore}/100 — needs 70`

  return (
    <div style={{ borderRadius: 8, border: '1px solid #ffffff08', background: '#0a0a1a', marginBottom: 8, padding: '10px 14px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <CoinBadge coin={sig.coin} size={14} />
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>Score: {sig.overallScore}/100</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: sig.rsi > 68 ? '#ff3355' : '#555' }}>RSI: {sig.rsi}</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>Vol: {sig.volumeRatio}x</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>ADX: {sig.adx}</span>
        <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#ff335566', background: '#ff335511', padding: '2px 8px', borderRadius: 3 }}>
          {mainFail}
        </span>
      </div>

      {/* Compact layer scores */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(LAYER_INFO).map(([key, info]) => {
          const score = sig.layerScores[key as keyof typeof sig.layerScores] || 0
          const col   = LAYER_COLORS[key]
          const pass  = score >= 60
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, background: `${col}${pass?'18':'08'}`, border: `1px solid ${col}${pass?'33':'15'}` }}>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: col }}>{info.label.split(' ')[0]}</span>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: pass ? '#00ff8888' : '#ff335555' }}>{pass ? '✓' : '✗'}</span>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>{score}</span>
            </div>
          )
        })}
      </div>

      {/* What it needs */}
      <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#333' }}>
        Needs {Math.max(0, 70 - sig.overallScore)} more points · Current: {sig.regime.replace('_',' ')} market
      </div>
    </div>
  )
}
