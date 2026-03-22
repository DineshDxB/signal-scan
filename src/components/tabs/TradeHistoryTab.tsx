import React, { useState } from 'react'
import type { Trade } from '../../types'
import { Pill, FVGBadge, CoinBadge, Bar, StatBox } from '../ui'

interface TradeHistoryTabProps {
  trades: Trade[]
  onUpdateOutcome: (id: string, outcome: string, exitPrice: number, pnl: number) => void
}

const LAYER_COLS: Record<string, string> = {
  stage: '#378ADD', trend: '#1D9E75', setup: '#BA7517', momentum: '#7F77DD', risk: '#D4537E'
}

export default function TradeHistoryTab({ trades, onUpdateOutcome }: TradeHistoryTabProps) {
  const [filter, setFilter]   = useState('ALL')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [logForm, setLogForm]   = useState<{ id: string; exitPrice: string; outcome: string } | null>(null)

  const FILTERS = ['ALL', 'SOL', 'BTC', 'ETH', 'LINK', 'BNB', 'WINS', 'LOSSES', 'OPEN', 'FVG', 'PULLBACK', 'BREAKOUT']

  const filtered = trades.filter(t => {
    if (filter === 'ALL')      return true
    if (filter === 'WINS')     return t.outcome?.startsWith('TP')
    if (filter === 'LOSSES')   return t.outcome === 'SL'
    if (filter === 'OPEN')     return t.outcome === 'OPEN'
    if (['FVG', 'PULLBACK', 'BREAKOUT'].includes(filter)) return t.entryType === filter
    return t.coin === filter
  }).sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())

  const fClosed = filtered.filter(t => t.outcome !== 'OPEN')
  const fWins   = fClosed.filter(t => t.outcome?.startsWith('TP'))
  const fPnl    = fClosed.reduce((s, t) => s + (t.pnl || 0), 0)
  const fWR     = fClosed.length ? Math.round(fWins.length / fClosed.length * 100) : 0

  function handleLogOutcome() {
    if (!logForm) return
    const ep  = parseFloat(logForm.exitPrice)
    const pnl = (ep - (trades.find(t => t.id === logForm.id)?.entryPrice || ep)) /
                (trades.find(t => t.id === logForm.id)?.entryPrice || 1) * 100
    onUpdateOutcome(logForm.id, logForm.outcome, ep, pnl)
    setLogForm(null)
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Filter pills */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontSize: 10, fontFamily: 'monospace', padding: '4px 10px', borderRadius: 6,
            cursor: 'pointer', border: `1px solid ${filter === f ? '#00ff88' : '#ffffff08'}`,
            background: filter === f ? '#00ff8822' : 'transparent',
            color: filter === f ? '#00ff88' : '#555', transition: 'all 0.15s'
          }}>{f}</button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <StatBox label="Trades" value={filtered.length} color="#aaa" />
        <StatBox label="Win rate" value={`${fWR}%`} color={fWR >= 50 ? '#00ff88' : '#ff3355'} />
        <StatBox label="P&L" value={(fPnl >= 0 ? '+' : '') + '$' + Math.abs(fPnl).toFixed(0)} color={fPnl >= 0 ? '#00ff88' : '#ff3355'} />
        <StatBox label="Avg/trade" value={(fClosed.length ? (fPnl >= 0 ? '+' : '') + '$' + Math.abs(fPnl / fClosed.length).toFixed(0) : '—')} color="#aaa" />
      </div>

      {/* Outcome logger modal */}
      {logForm && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0d0d20', border: '1px solid #00ff8833', borderRadius: 12, padding: 24, width: 320 }}>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#00ff88', letterSpacing: 2, marginBottom: 16 }}>LOG OUTCOME</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555', marginBottom: 4 }}>Exit Price</div>
              <input
                type="number"
                value={logForm.exitPrice}
                onChange={e => setLogForm(f => f ? { ...f, exitPrice: e.target.value } : null)}
                style={{ width: '100%', padding: '8px 10px', background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, color: '#fff', fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555', marginBottom: 6 }}>Outcome</div>
              <div className="grid grid-cols-4 gap-2">
                {['TP1', 'TP2', 'TP3', 'SL'].map(o => (
                  <button key={o} onClick={() => setLogForm(f => f ? { ...f, outcome: o } : null)} style={{
                    padding: '6px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', borderRadius: 6,
                    background: logForm.outcome === o ? (o === 'SL' ? '#ff335522' : '#00ff8822') : 'transparent',
                    border: `1px solid ${logForm.outcome === o ? (o === 'SL' ? '#ff3355' : '#00ff88') : '#333'}`,
                    color: logForm.outcome === o ? (o === 'SL' ? '#ff3355' : '#00ff88') : '#555'
                  }}>{o}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setLogForm(null)} style={{ flex: 1, padding: '8px', fontFamily: 'monospace', fontSize: 11, cursor: 'pointer', borderRadius: 6, background: 'transparent', border: '1px solid #333', color: '#555' }}>Cancel</button>
              <button onClick={handleLogOutcome} style={{ flex: 2, padding: '8px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 6, background: '#00ff8822', border: '1px solid #00ff88', color: '#00ff88' }}>Save Outcome</button>
            </div>
          </div>
        </div>
      )}

      {/* Trade cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#333', fontFamily: 'monospace', fontSize: 12 }}>No trades found</div>
        )}
        {filtered.map(t => {
          const isOpen   = t.outcome === 'OPEN'
          const isWin    = t.outcome?.startsWith('TP')
          const borderCol = isOpen ? '#00aaff' : isWin ? '#00ff88' : '#ff3355'
          const isExp    = expanded === t.id
          const qualPct  = t.idealEntry ? Math.abs((t.entryPrice - t.idealEntry) / t.idealEntry * 100) : 0
          const goodEntry = qualPct < 1.5

          return (
            <div key={t.id} style={{ borderRadius: 10, border: `1px solid ${borderCol}22`, background: '#0a0a1a', overflow: 'hidden' }}>
              {/* Main row */}
              <div
                className="flex items-center gap-3 flex-wrap cursor-pointer"
                style={{ padding: '10px 14px', background: isExp ? `${borderCol}08` : 'transparent' }}
                onClick={() => setExpanded(isExp ? null : (t.id || ''))}
              >
                <div style={{ width: 3, height: 32, background: borderCol, borderRadius: 2, flexShrink: 0 }} />
                <CoinBadge coin={t.coin} size={18} />
                <Pill outcome={t.outcome} />
                {t.entryType && <FVGBadge type={t.entryType} />}
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>
                  {new Date(t.openedAt).toLocaleDateString('en-AE', { timeZone: 'Asia/Dubai', month: 'short', day: 'numeric' })}
                  {' · '}{t.gstHour}:00 GST
                </span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: t.confidence >= 80 ? '#00ff88' : '#ffcc00' }}>{t.confidence}%</span>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>entry </span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#fff' }}>${t.entryPrice?.toFixed(2)}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>sl </span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ff3355' }}>${t.stopLoss?.toFixed(2)}</span>
                  </div>
                  {t.pnl != null && (
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: t.pnl >= 0 ? '#00ff88' : '#ff3355', minWidth: 60, textAlign: 'right' }}>
                      {t.pnl >= 0 ? '+' : ''}${Math.abs(t.pnl).toFixed(0)}
                    </div>
                  )}
                  {isOpen && (
                    <button
                      onClick={e => { e.stopPropagation(); setLogForm({ id: t.id || '', exitPrice: t.entryPrice.toString(), outcome: 'TP1' }) }}
                      style={{ fontSize: 10, fontFamily: 'monospace', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: '#00ff8811', border: '1px solid #00ff8833', color: '#00ff88' }}
                    >LOG OUTCOME</button>
                  )}
                  <span style={{ color: '#333', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded */}
              {isExp && (
                <div style={{ borderTop: '1px solid #ffffff06' }}>
                  <div className="grid grid-cols-3 gap-4" style={{ padding: '12px 14px' }}>
                    {/* Levels */}
                    <div>
                      <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#444', marginBottom: 8 }}>PRICE LEVELS</div>
                      {[
                        ['Ideal entry', t.idealEntry ? `$${t.idealEntry.toFixed(2)}` : '—', '#00aaff55'],
                        ['Actual entry', `$${t.entryPrice?.toFixed(2)}`, '#00aaff'],
                        ['Entry quality', goodEntry ? `Good (+${qualPct.toFixed(1)}%)` : `Wide (+${qualPct.toFixed(1)}%)`, goodEntry ? '#00ff88' : '#ffcc00'],
                        ['Stop loss', `$${t.stopLoss?.toFixed(2)}`, '#ff3355'],
                        ['TP1', `$${t.tp1?.toFixed(2)}`, '#00cc66'],
                        ['TP2', `$${t.tp2?.toFixed(2)}`, '#00ff88'],
                        ['TP3', `$${t.tp3?.toFixed(2)}`, '#00ffaa'],
                        t.exitPrice != null ? ['Exit price', `$${t.exitPrice.toFixed(2)}`, t.pnl != null && t.pnl >= 0 ? '#00ff88' : '#ff3355'] : null,
                      ].filter(Boolean).map(row => {
                        const [l, v, c] = row as string[]
                        return (
                          <div key={l} className="flex justify-between py-1" style={{ borderBottom: '1px solid #ffffff05', fontSize: 10, fontFamily: 'monospace' }}>
                            <span style={{ color: '#555' }}>{l}</span>
                            <span style={{ color: c }}>{v}</span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Indicators */}
                    <div>
                      <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#444', marginBottom: 8 }}>INDICATORS AT ENTRY</div>
                      {[
                        ['RSI', t.rsiAtEntry?.toFixed(1), t.rsiAtEntry >= 50 && t.rsiAtEntry <= 68 ? '#00ff88' : '#ffcc00'],
                        ['Volume', `${t.volumeRatio?.toFixed(1)}x`, t.volumeRatio >= 1.8 ? '#00ff88' : '#ffcc00'],
                        ['ADX', t.adx?.toFixed(1), t.adx >= 22 ? '#00ff88' : '#ffcc00'],
                        ['Regime', t.regime, t.regime === 'trending_bull' ? '#00ff88' : '#ff9900'],
                        ['Hold', t.holdDays != null ? `${t.holdDays}d` : 'open', '#aaa'],
                      ].map(([l, v, c]) => (
                        <div key={l as string} className="flex justify-between py-1" style={{ borderBottom: '1px solid #ffffff05', fontSize: 10, fontFamily: 'monospace' }}>
                          <span style={{ color: '#555' }}>{l}</span>
                          <span style={{ color: c as string }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Layer scores */}
                    <div>
                      <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#444', marginBottom: 8 }}>LAYER SCORES</div>
                      {t.layerScores && Object.entries(t.layerScores).map(([name, score]) => {
                        const col = LAYER_COLS[name] || '#aaa'
                        return (
                          <div key={name} style={{ marginBottom: 6 }}>
                            <div className="flex justify-between mb-1">
                              <span style={{ fontSize: 10, fontFamily: 'monospace', color: col, textTransform: 'capitalize' }}>{name}</span>
                              <span style={{ fontSize: 10, fontFamily: 'monospace', color: col }}>{score as number}</span>
                            </div>
                            <Bar value={score as number} color={col} height={4} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
