import React from 'react'
import { Bar, StatBox, EquityChart, Card, SectionHeader, COIN_COLORS } from '../ui'
import { FORWARD_TEST_DAYS } from '../../config'

interface HomeTabProps {
  dayNumber: number
  totalPnl: number
  winRate: number
  wins: number
  closedCount: number
  pf: number
  avgWin: number
  avgLoss: number
  equityCurve: number[]
  strategyVersion: number
  strategyChanges: Array<{ param: string; from: number | string; to: number | string; reason: string }>
  openCount: number
  capital: number
  trades: Array<{ coin: string; outcome: string; entryType: string; pnl?: number }>
}

export default function HomeTab({
  dayNumber, totalPnl, winRate, wins, closedCount, pf,
  avgWin, avgLoss, equityCurve, strategyVersion, strategyChanges,
  openCount, capital, trades
}: HomeTabProps) {
  const pnlCol = totalPnl >= 0 ? '#00ff88' : '#ff3355'
  const closed = trades.filter(t => t.outcome !== 'OPEN')

  // Win rate by coin
  const coins = ['SOL', 'BTC', 'ETH', 'LINK', 'BNB', 'XRP', 'AVAX', 'DOT']
  const coinStats = coins.map(coin => {
    const ct = closed.filter(t => t.coin === coin)
    const cw = ct.filter(t => t.outcome?.startsWith('TP')).length
    const wr = ct.length ? Math.round(cw / ct.length * 100) : null
    return { coin, wr, trades: ct.length, wins: cw }
  }).filter(s => s.trades > 0)

  // Win rate by entry type
  const entryTypes = ['FVG', 'PULLBACK', 'BREAKOUT']
  const entryStats = entryTypes.map(et => {
    const et_t = closed.filter(t => t.entryType === et)
    const et_w = et_t.filter(t => t.outcome?.startsWith('TP')).length
    return { type: et, wr: et_t.length ? Math.round(et_w / et_t.length * 100) : 0, n: et_t.length, w: et_w }
  })

  const cagr = dayNumber > 0 ? ((totalPnl / capital) * (365 / dayNumber) * 100).toFixed(0) : '—'

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Day banner + equity */}
      <div style={{ padding: 16, borderRadius: 12, background: 'linear-gradient(135deg,#0d0d20,#070718)', border: '1px solid #00ff8822' }}>
        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#00ff88', letterSpacing: 4, lineHeight: 1 }}>
              DAY {dayNumber} <span style={{ color: '#fff' }}>OF {FORWARD_TEST_DAYS}</span>
            </div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', marginTop: 4, color: '#555' }}>
              Forward test · {FORWARD_TEST_DAYS - dayNumber} days remaining · Strategy v{strategyVersion}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: pnlCol }}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl >= 1000 ? `$${(totalPnl / 1000).toFixed(1)}k` : `$${totalPnl.toFixed(0)}`}
            </div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: pnlCol }}>
              {((totalPnl / capital) * 100).toFixed(1)}% · CAGR {cagr}%
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, background: '#1a1a2e', borderRadius: 999, marginBottom: 8 }}>
          <div style={{
            height: 6, borderRadius: 999,
            width: `${Math.min(100, (dayNumber / FORWARD_TEST_DAYS) * 100)}%`,
            background: 'linear-gradient(90deg,#00ff88,#00aaff)'
          }} />
        </div>

        {/* Equity curve */}
        <EquityChart curve={equityCurve} height={70} />
      </div>

      {/* 6 stats */}
      <div className="grid grid-cols-6 gap-2">
        <StatBox label="Signals" value={trades.length} sub="logged" color="#00aaff" />
        <StatBox label="Closed" value={closedCount} sub="trades" color="#ffcc00" />
        <StatBox label="Win rate" value={`${winRate}%`} sub={`${wins}/${closedCount}`} color={winRate >= 50 ? '#00ff88' : '#ff3355'} />
        <StatBox label="Profit factor" value={pf} sub={pf >= 1.5 ? 'good' : 'building'} color={pf >= 1.5 ? '#00ff88' : '#ffcc00'} />
        <StatBox label="Avg win" value={`+$${Math.round(avgWin)}`} sub="per trade" color="#00ff88" />
        <StatBox label="Avg loss" value={`-$${Math.round(Math.abs(avgLoss))}`} sub="per trade" color="#ff3355" />
      </div>

      {/* Strategy auto-improve alert */}
      {strategyChanges.length > 0 && (
        <Card border="#00aaff22">
          <SectionHeader title={`⚡ STRATEGY AUTO-IMPROVED · VERSION ${strategyVersion}`} color="#00aaff" />
          {strategyChanges.map((c, i) => (
            <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', padding: '2px 0', color: '#00aaff77' }}>
              <span style={{ color: '#00aaff55' }}>◆ </span>
              {c.param}: <span style={{ textDecoration: 'line-through', color: '#333' }}>{c.from}</span>
              {' → '}<span style={{ color: '#00aaff' }}>{c.to}</span> — {c.reason}
            </div>
          ))}
        </Card>
      )}

      {/* Breakdown grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <SectionHeader title="WIN RATE BY COIN" />
          {coinStats.length === 0 && <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#333' }}>No closed trades yet</div>}
          {coinStats.map(({ coin, wr, trades: n, wins: w }) => {
            const col = wr === null ? '#333' : wr >= 60 ? '#00ff88' : wr >= 40 ? '#ffcc00' : '#ff3355'
            return (
              <div key={coin} style={{ marginBottom: 8 }}>
                <div className="flex justify-between mb-1">
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, color: COIN_COLORS[coin] || '#aaa', letterSpacing: 2 }}>{coin}</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: col }}>{wr}% ({w}/{n})</span>
                </div>
                <Bar value={wr || 0} color={col} height={4} />
              </div>
            )
          })}
        </Card>

        <Card>
          <SectionHeader title="WIN RATE BY ENTRY TYPE" />
          {entryStats.map(({ type, wr, n, w }) => {
            const col = wr >= 60 ? '#00ff88' : wr >= 40 ? '#ffcc00' : '#ff3355'
            return (
              <div key={type} style={{ marginBottom: 8 }}>
                <Bar value={wr} color={col} height={6} label={type} rightLabel={`${wr}% (${w}/${n})`} />
              </div>
            )
          })}
          {entryStats.filter(e => e.n >= 2).length >= 2 && (() => {
            const fvg = entryStats.find(e => e.type === 'FVG')
            const bo  = entryStats.find(e => e.type === 'BREAKOUT')
            const diff = fvg && bo ? fvg.wr - bo.wr : 0
            if (diff > 10) return (
              <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 6, background: '#00ff8808', border: '1px solid #00ff8818', fontSize: 10, fontFamily: 'monospace', color: '#00ff8877' }}>
                FVG outperforming breakout by {diff}pp
              </div>
            )
            return null
          })()}
        </Card>
      </div>

      {/* Open trades */}
      {openCount > 0 && (
        <Card border="#00aaff22">
          <SectionHeader title="OPEN TRADES NOW" color="#00aaff" />
          <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#00aaff77' }}>
            {openCount} trade{openCount > 1 ? 's' : ''} active — go to Trade History to manage
          </div>
        </Card>
      )}
    </div>
  )
}
