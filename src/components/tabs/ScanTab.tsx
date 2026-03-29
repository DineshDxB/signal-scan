import React, { useState } from 'react'
import { deepAnalyzeCoin } from '../../lib/claude'
import type { CoinSignal } from '../../types'
import { Bar, FVGBadge, LayerRow, CoinBadge, Spinner } from '../ui'

interface ScanTabProps {
  scanning: boolean
  progress: number
  currentCoin: string
  signals: CoinSignal[]
  lastScanTime: string | null
  onScan: () => void
  openTradeCount: number
}

export default function ScanTab({
  scanning, progress, currentCoin, signals, lastScanTime, onScan, openTradeCount
}: ScanTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const actionable = signals.filter(s => s.signal !== 'WAIT')
  const waiting    = signals.filter(s => s.signal === 'WAIT')

  return (
    <div style={{ padding: 16 }}>
      {/* Scan button */}
      {/* Auto-scan status banner */}
      <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: '#0a0a1a', border: '1px solid #00ff8818' }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#00ff88', marginBottom: 2 }}>
              ⚡ AUTO-SCAN RUNNING — every 4 hours automatically
            </div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>
              {lastScanTime
                ? `Last scan: ${new Date(lastScanTime).toLocaleTimeString('en-AE', { timeZone: 'Asia/Dubai' })} GST · Results load automatically`
                : 'Waiting for first auto-scan · Next scan at top of 4-hour window'}
            </div>
            {openTradeCount > 0 && (
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#00aaff', marginTop: 2 }}>
                {openTradeCount} open trade{openTradeCount > 1 ? 's' : ''} active — price-tracker monitoring hourly
              </div>
            )}
          </div>
          <button
            onClick={onScan}
            disabled={scanning}
            style={{
              padding: '8px 18px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
              letterSpacing: 1, cursor: scanning ? 'not-allowed' : 'pointer',
              background: scanning ? '#1a1a2e' : 'transparent',
              border: `1px solid ${scanning ? '#333' : '#ffffff22'}`,
              borderRadius: 6, color: scanning ? '#555' : '#555',
              transition: 'all 0.2s'
            }}
          >
            {scanning ? 'SCANNING...' : 'Manual scan'}
          </button>
        </div>
      </div>

      {/* Scan progress */}
      {scanning && (
        <div style={{ padding: 16, borderRadius: 10, background: '#0a0a1a', border: '1px solid #00ff8822', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#00ff88', marginBottom: 8, letterSpacing: 2 }}>
            SCANNING — {currentCoin || 'INITIALISING'}...
          </div>
          <div style={{ height: 6, background: '#1a1a2e', borderRadius: 999, marginBottom: 6 }}>
            <div style={{ height: 6, width: `${progress}%`, background: '#00ff88', borderRadius: 999, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>{progress}% complete</div>
        </div>
      )}

      {/* Actionable signals */}
      {actionable.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color: '#00ff88', marginBottom: 8 }}>
            ACTIONABLE SIGNALS — {actionable.length}
          </div>
          {actionable.map(sig => (
            <SignalCard
              key={sig.coin}
              sig={sig}
              expanded={expanded === sig.coin}
              onToggle={() => setExpanded(expanded === sig.coin ? null : sig.coin)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!scanning && signals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#333', fontFamily: 'monospace', fontSize: 12 }}>
          Run a scan to see signals
        </div>
      )}

      {/* Wait signals */}
      {waiting.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color: '#444', marginBottom: 8 }}>
            WATCHLIST — {waiting.length} setups developing
          </div>
          {waiting.map(sig => (
            <WaitCard key={sig.coin} sig={sig} />
          ))}
        </div>
      )}
    </div>
  )
}

function SignalCard({ sig, expanded, onToggle }: { sig: CoinSignal; expanded: boolean; onToggle: () => void }) {
  const [deepText, setDeepText] = React.useState('')
  const [deepLoading, setDeepLoading] = React.useState(false)

  async function handleDeepAnalysis(e: React.MouseEvent) {
    e.stopPropagation()
    setDeepLoading(true)
    const text = await deepAnalyzeCoin(sig)
    setDeepText(text)
    setDeepLoading(false)
  }
  const isBuy = sig.signal === 'BUY'
  const borderCol = isBuy ? '#00ff88' : '#ff3355'
  const scoreCol  = sig.overallScore >= 80 ? '#00ff88' : sig.overallScore >= 70 ? '#ffcc00' : '#ff9900'

  return (
    <div
      style={{ borderRadius: 10, border: `1.5px solid ${borderCol}33`, marginBottom: 10, overflow: 'hidden', background: '#0a0a1a' }}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-3 flex-wrap cursor-pointer"
        style={{ padding: '12px 14px', background: expanded ? `${borderCol}08` : 'transparent' }}
        onClick={onToggle}
      >
        <div style={{ width: 4, height: 36, background: borderCol, borderRadius: 2, flexShrink: 0 }} />
        <div>
          <CoinBadge coin={sig.coin} size={20} />
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>{sig.regime}</div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: borderCol }}>
          {sig.signal}
        </div>

        <FVGBadge type={sig.entryType} />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: '#fff' }}>
              ${sig.entryPrice.toFixed(2)}
            </div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>entry</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: scoreCol }}>
              {sig.overallScore}
            </div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>score</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#00ff88' }}>
            {sig.confidence}%
          </div>
          <span style={{ color: '#333', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Quick levels strip */}
      <div className="flex gap-4 flex-wrap" style={{ padding: '8px 14px', borderTop: '1px solid #ffffff06', fontSize: 10, fontFamily: 'monospace' }}>
        <span><span style={{ color: '#555' }}>SL </span><span style={{ color: '#ff3355' }}>${sig.stopLoss.toFixed(2)}</span></span>
        <span><span style={{ color: '#555' }}>TP1 </span><span style={{ color: '#00cc66' }}>${sig.tp1.toFixed(2)}</span></span>
        <span><span style={{ color: '#555' }}>TP2 </span><span style={{ color: '#00ff88' }}>${sig.tp2.toFixed(2)}</span></span>
        <span><span style={{ color: '#555' }}>TP3 </span><span style={{ color: '#00ffaa' }}>${sig.tp3.toFixed(2)}</span></span>
        <span><span style={{ color: '#555' }}>R/R </span><span style={{ color: '#7F77DD' }}>1:{sig.rrRatio}</span></span>
        <span><span style={{ color: '#555' }}>RSI </span><span style={{ color: sig.rsi > 68 ? '#ff3355' : '#aaa' }}>{sig.rsi}</span></span>
        <span><span style={{ color: '#555' }}>Vol </span><span style={{ color: sig.volumeRatio >= 1.8 ? '#00ff88' : '#ffcc00' }}>{sig.volumeRatio}x</span></span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid #ffffff06' }}>
          {/* Entry notes */}
          <div style={{ padding: '10px 14px', background: `${borderCol}06`, fontSize: 10, fontFamily: 'monospace', color: '#aaa', lineHeight: 1.6 }}>
            {sig.entryNotes}
          </div>

          <div className="grid grid-cols-3 gap-4" style={{ padding: '12px 14px' }}>
            {/* Layers */}
            <div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#444', marginBottom: 8 }}>5 LAYERS</div>
              {Object.entries(sig.layerScores).map(([name, score]) => (
                <LayerRow key={name} name={name} score={score} passed={score >= 60} />
              ))}
            </div>

            {/* Context */}
            <div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#444', marginBottom: 8 }}>MARKET CONTEXT</div>
              {[
                ['ADX', sig.adx.toString(), sig.adx >= 22 ? '#00ff88' : '#ffcc00'],
                ['Funding', `${(sig.fundingRate * 100).toFixed(4)}%`, Math.abs(sig.fundingRate) < 0.001 ? '#00ff88' : '#ffcc00'],
                ['Fear/Greed', `${sig.fearGreed} ${sig.fearGreedTrend}`, sig.fearGreed >= 35 && sig.fearGreed <= 75 ? '#00ff88' : '#ffcc00'],
                ['BTC Dom', `${sig.btcDominance}%`, '#aaa'],
                ['News', sig.newsOk ? 'Clear' : 'Check notes', sig.newsOk ? '#00ff88' : '#ff3355'],
              ].map(([l, v, c]) => (
                <div key={l as string} className="flex justify-between py-1" style={{ borderBottom: '1px solid #ffffff05', fontSize: 10, fontFamily: 'monospace' }}>
                  <span style={{ color: '#555' }}>{l}</span>
                  <span style={{ color: c as string }}>{v}</span>
                </div>
              ))}
            </div>

            {/* FVG / BOS */}
            <div>
              <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#444', marginBottom: 8 }}>ENTRY PRECISION</div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555', marginBottom: 4 }}>Ideal entry (FVG)</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: '#00aaff' }}>
                  ${sig.idealEntry.toFixed(2)}
                </div>
                <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>vs breakout ${sig.entryPrice.toFixed(2)}</div>
              </div>
              {sig.fvgZone && (
                <div style={{ padding: '6px 8px', borderRadius: 6, background: '#00aaff11', border: '1px solid #00aaff22', fontSize: 10, fontFamily: 'monospace' }}>
                  <div style={{ color: '#00aaff' }}>FVG Zone</div>
                  <div style={{ color: '#555' }}>${sig.fvgZone.bottom.toFixed(2)} – ${sig.fvgZone.top.toFixed(2)}</div>
                  <div style={{ color: '#00aaff77' }}>{sig.fvgZone.sizePercent.toFixed(1)}% gap</div>
                </div>
              )}
              {sig.bosLevel && (
                <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 6, background: '#ffcc0011', border: '1px solid #ffcc0022', fontSize: 10, fontFamily: 'monospace' }}>
                  <div style={{ color: '#ffcc00' }}>BOS {sig.bosLevel.direction === 'bullish' ? '▲' : '▼'}</div>
                  <div style={{ color: '#555' }}>${sig.bosLevel.price.toFixed(2)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Analysis text + optional deep analysis */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid #ffffff06', fontSize: 10, fontFamily: 'monospace', color: '#666', lineHeight: 1.6 }}>
            {sig.analysis}
          </div>
          <div style={{ padding: '8px 14px', borderTop: '1px solid #ffffff06', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={handleDeepAnalysis} disabled={deepLoading} style={{ fontSize: 9, fontFamily: 'monospace', padding: '4px 10px', borderRadius: 5, cursor: deepLoading ? 'wait' : 'pointer', background: '#7F77DD11', border: '1px solid #7F77DD33', color: '#7F77DD77' }}>
              {deepLoading ? 'analysing...' : '🧠 Deep analysis (~$0.001)'}
            </button>
            {!import.meta.env.VITE_ANTHROPIC_KEY && <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#333' }}>Add API key to enable</span>}
          </div>
          {deepText && (
            <div style={{ padding: '10px 14px', background: '#7F77DD08', borderTop: '1px solid #7F77DD22', fontSize: 10, fontFamily: 'monospace', color: '#aaa', lineHeight: 1.7 }}>
              {deepText}
            </div>
          )}

          {sig.hardGatesFailed.length > 0 && (
            <div style={{ padding: '8px 14px', background: '#ff335508', fontSize: 10, fontFamily: 'monospace', color: '#ff335577' }}>
              ⚡ Hard gates failed: {sig.hardGatesFailed.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function WaitCard({ sig }: { sig: CoinSignal }) {
  return (
    <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ffffff06', background: '#0a0a1a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <CoinBadge coin={sig.coin} size={14} />
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>Score: {sig.overallScore}/100</span>
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>{sig.layersPassed}/5 layers</span>
      {sig.hardGatesFailed.length > 0 && (
        <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#ff335566', background: '#ff335511', padding: '2px 6px', borderRadius: 3 }}>
          {sig.hardGatesFailed[0]}
        </span>
      )}
      <Bar value={sig.overallScore} color="#444" height={3} />
    </div>
  )
}
