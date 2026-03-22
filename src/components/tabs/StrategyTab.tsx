import React from 'react'
import type { Trade, LiveStrategyParams, CoinProfile } from '../../types'
import { Bar, Card, SectionHeader, CoinBadge, COIN_COLORS } from '../ui'
import { BASE_PARAMS } from '../../config'

interface StrategyTabProps {
  liveParams: LiveStrategyParams | null
  trades: Trade[]
  coinProfiles: Record<string, CoinProfile>
}

export default function StrategyTab({ liveParams, trades, coinProfiles }: StrategyTabProps) {
  const params = liveParams || { ...BASE_PARAMS, version: 1, changes: [], source: 'base' as const }
  const closed  = trades.filter(t => t.outcome !== 'OPEN')

  // Layer correlation analysis
  const wins   = closed.filter(t => t.outcome?.startsWith('TP'))
  const losses = closed.filter(t => t.outcome === 'SL')

  const layers = ['stage', 'trend', 'setup', 'momentum', 'risk'] as const
  const LAYER_COLS: Record<string, string> = {
    stage: '#378ADD', trend: '#1D9E75', setup: '#BA7517', momentum: '#7F77DD', risk: '#D4537E'
  }

  const layerStats = layers.map(l => {
    const wScores  = wins.map(t => (t.layerScores as Record<string, number>)?.[l] || 0)
    const lScores  = losses.map(t => (t.layerScores as Record<string, number>)?.[l] || 0)
    const avgW     = wScores.length  ? wScores.reduce((a, b) => a + b, 0)  / wScores.length  : 0
    const avgL     = lScores.length  ? lScores.reduce((a, b) => a + b, 0)  / lScores.length  : 0
    return { layer: l, avgWin: Math.round(avgW), avgLoss: Math.round(avgL), diff: Math.round(avgW - avgL), predictive: avgW - avgL > 8 }
  })

  const versionHistory = [
    { v: 1, label: 'Base strategy — all defaults', active: params.version === 1 },
    ...params.changes.map((c, i) => ({
      v: i + 2,
      label: `${c.param}: ${c.from} → ${c.to}`,
      active: i + 2 === params.version
    }))
  ]

  const coins = ['SOL', 'BTC', 'ETH', 'LINK', 'BNB', 'XRP', 'AVAX']

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color: '#444' }}>
        LIVE STRATEGY — AUTO-IMPROVES EVERY 10 TRADES
      </div>

      {/* Current vs base params */}
      <div style={{ padding: 16, borderRadius: 12, background: 'linear-gradient(135deg,#0d0d20,#070718)', border: '1px solid #00aaff22' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color: '#00aaff' }}>
              CURRENT STRATEGY — VERSION {params.version}
            </div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555', marginTop: 2 }}>
              {params.source === 'learned'
                ? `Auto-learned from ${closed.length} closed trades`
                : `Using base defaults — need ${Math.max(0, 5 - closed.length)} more closed trades`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: '#00aaff' }}>v{params.version}</div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#00aaff55' }}>{params.changes.length} improvements</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Parameter comparison */}
          <Card>
            <SectionHeader title="BASE → CURRENT PARAMETERS" />
            {[
              { p: 'RSI ceiling',     base: BASE_PARAMS.rsiCeil,   cur: params.rsiCeil,   unit: '' },
              { p: 'RSI floor',       base: BASE_PARAMS.rsiFloor,  cur: params.rsiFloor,  unit: '' },
              { p: 'Stop loss',       base: BASE_PARAMS.slPct,     cur: params.slPct,     unit: '%' },
              { p: 'Volume minimum',  base: BASE_PARAMS.volMin,    cur: params.volMin,    unit: 'x' },
              { p: 'ADX minimum',     base: BASE_PARAMS.adxMin,    cur: params.adxMin,    unit: '' },
              { p: 'Min confidence',  base: BASE_PARAMS.minConf,   cur: params.minConf,   unit: '%' },
            ].map(({ p, base, cur, unit }) => {
              const changed = base !== cur
              return (
                <div key={p} className="flex justify-between items-center py-1.5" style={{ borderBottom: '1px solid #ffffff06', fontSize: 10, fontFamily: 'monospace' }}>
                  <span style={{ color: '#555' }}>{p}</span>
                  <div className="flex items-center gap-2">
                    <span style={{ color: '#333', textDecoration: changed ? 'line-through' : 'none', fontSize: 9 }}>{base}{unit}</span>
                    {changed && <span style={{ color: '#555' }}>→</span>}
                    <span style={{ color: changed ? '#00aaff' : '#555', fontWeight: changed ? 700 : 400 }}>{cur}{unit}</span>
                    {changed && <span style={{ fontSize: 8, color: '#00aaff55', background: '#00aaff11', padding: '1px 4px', borderRadius: 3 }}>ML</span>}
                  </div>
                </div>
              )
            })}
          </Card>

          {/* Change details */}
          <Card>
            <SectionHeader title={`IMPROVEMENTS (${params.changes.length})`} />
            {params.changes.length === 0 && (
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#333' }}>
                Need {Math.max(0, 5 - closed.length)} more closed trades to trigger first improvement
              </div>
            )}
            {params.changes.map((c, i) => (
              <div key={i} style={{ padding: '6px 8px', borderRadius: 6, marginBottom: 6, background: '#00aaff08', border: '1px solid #00aaff18' }}>
                <div className="flex justify-between" style={{ fontSize: 10, fontFamily: 'monospace', marginBottom: 2 }}>
                  <span style={{ color: '#00aaff' }}>{c.param}</span>
                  <span style={{ color: '#555' }}>{c.from} → <span style={{ color: '#00aaff' }}>{c.to}</span></span>
                </div>
                <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>{c.reason}</div>
                <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#00aaff66', marginTop: 2 }}>→ {c.impact}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* Layer correlation (which layers actually predict wins) */}
      {closed.length >= 5 && (
        <Card>
          <SectionHeader title="WHICH LAYERS ACTUALLY PREDICT YOUR WINS" />
          <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#333', marginBottom: 8 }}>
            Higher diff = this layer separates your winners from losers more reliably
          </div>
          {layerStats.sort((a, b) => b.diff - a.diff).map(ls => (
            <div key={ls.layer} style={{ marginBottom: 10 }}>
              <div className="flex justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: LAYER_COLS[ls.layer], textTransform: 'capitalize' }}>{ls.layer}</span>
                  {ls.predictive && <span style={{ fontSize: 8, color: '#00ff88', background: '#00ff8811', padding: '1px 6px', borderRadius: 3 }}>HIGH VALUE</span>}
                </div>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: ls.diff > 8 ? '#00ff88' : ls.diff > 3 ? '#ffcc00' : '#ff3355' }}>
                  win {ls.avgWin} vs loss {ls.avgLoss} (+{ls.diff})
                </span>
              </div>
              <div className="flex gap-1">
                <div style={{ flex: 1 }}><Bar value={ls.avgWin} color={LAYER_COLS[ls.layer]} height={5} /></div>
                <div style={{ flex: 1 }}><Bar value={ls.avgLoss} color={`${LAYER_COLS[ls.layer]}44`} height={5} /></div>
              </div>
              <div className="flex justify-between" style={{ fontSize: 8, fontFamily: 'monospace', color: '#333', marginTop: 2 }}>
                <span>wins</span><span>losses</span>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Per-coin parameters */}
      <Card>
        <SectionHeader title="PER-COIN LEARNED PARAMETERS" />
        <div className="grid grid-cols-4 gap-2">
          {coins.map(coin => {
            const p = coinProfiles[coin]
            const col = COIN_COLORS[coin] || '#aaa'
            if (!p) return (
              <div key={coin} style={{ padding: 8, borderRadius: 8, background: '#0d0d20', border: '1px solid #ffffff06', textAlign: 'center' }}>
                <CoinBadge coin={coin} size={14} />
                <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#333', marginTop: 4 }}>no data</div>
              </div>
            )
            return (
              <div key={coin} style={{ padding: 8, borderRadius: 8, background: '#0d0d20', border: `1px solid ${col}22` }}>
                <div style={{ textAlign: 'center', marginBottom: 6 }}>
                  <CoinBadge coin={coin} size={14} />
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: p.winRate >= 60 ? '#00ff88' : p.winRate > 0 ? '#ffcc00' : '#ff3355' }}>
                    {p.winRate}%
                  </div>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#444' }}>{p.trades} trades</div>
                </div>
                {[
                  ['SL', `${p.learnedSlPct}%`],
                  ['RSI max', `≤${p.learnedRsiCeil}`],
                  ['Vol', `≥${p.learnedVolMin}x`],
                  ['Entry', p.bestEntry],
                  ['Hour', p.bestHour != null ? `${p.bestHour}:00` : '—'],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between" style={{ fontSize: 9, fontFamily: 'monospace', color: '#444' }}>
                    <span>{l}</span><span style={{ color: `${col}99` }}>{v}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Version history */}
      <Card>
        <SectionHeader title="STRATEGY VERSION HISTORY" />
        <div style={{ position: 'relative', paddingLeft: 20 }}>
          <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 1, background: '#ffffff08' }} />
          {versionHistory.map((v, i) => (
            <div key={i} className="flex items-start gap-3 mb-3">
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0, zIndex: 1, position: 'relative',
                background: v.active ? '#00aaff' : '#1a1a2e',
                border: `1px solid ${v.active ? '#00aaff' : '#333'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontFamily: 'monospace', color: v.active ? '#001020' : '#555', fontWeight: 700
              }}>{v.v}</div>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: v.active ? '#00aaff' : '#aaa' }}>{v.label}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
