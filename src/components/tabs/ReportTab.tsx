import React, { useState } from 'react'
import type { Trade, GhostTrade, LiveStrategyParams } from '../../types'
import { Bar, Card, SectionHeader, StatBox, COIN_COLORS, CoinBadge } from '../ui'
import { generate60DayReport } from '../../lib/claude'
import { FORWARD_TEST_DAYS } from '../../config'

interface ReportTabProps {
  dayNumber: number
  trades: Trade[]
  ghostTrades: GhostTrade[]
  liveParams: LiveStrategyParams | null
  totalPnl: number
  winRate: number
  pf: number
  capital: number
}

export default function ReportTab({ dayNumber, trades, ghostTrades, liveParams, totalPnl, winRate, pf, capital }: ReportTabProps) {
  const [report, setReport]     = useState<Record<string, unknown> | null>(null)
  const [generating, setGen]    = useState(false)
  const isComplete = dayNumber >= FORWARD_TEST_DAYS

  const closed  = trades.filter(t => t.outcome !== 'OPEN')
  const wins    = closed.filter(t => t.outcome?.startsWith('TP'))
  const missed  = ghostTrades.filter(g => g.wouldHaveWon)
  const correct = ghostTrades.filter(g => !g.wouldHaveWon)

  async function generateReport() {
    setGen(true)
    try {
      const stats = { dayNumber, totalPnl, winRate, pf, trades: closed.length, capital }
      const json  = await generate60DayReport(JSON.stringify(trades.slice(0, 50)), JSON.stringify(stats))
      setReport(JSON.parse(json))
    } catch { /* silent */ }
    setGen(false)
  }

  // Early insights (available from day 10)
  const earlyInsights: Array<{ icon: string; col: string; title: string; body: string }> = []

  if (wins.length >= 3) {
    const fvgW = closed.filter(t => t.entryType === 'FVG' && t.outcome?.startsWith('TP')).length
    const fvgT = closed.filter(t => t.entryType === 'FVG').length
    const boW  = closed.filter(t => t.entryType === 'BREAKOUT' && t.outcome?.startsWith('TP')).length
    const boT  = closed.filter(t => t.entryType === 'BREAKOUT').length
    const fvgWR = fvgT ? Math.round(fvgW / fvgT * 100) : 0
    const boWR  = boT  ? Math.round(boW  / boT  * 100) : 0
    if (fvgT >= 2 && boT >= 2 && fvgWR > boWR + 15) {
      earlyInsights.push({ icon: '🎯', col: '#00ff88', title: `FVG entry significantly better (${fvgWR}% vs ${boWR}%)`, body: 'Waiting for the FVG fill instead of chasing breakouts is producing measurably better results. Prioritise FVG entries across all coins.' })
    }
  }

  if (closed.length >= 5) {
    const bullTrades   = closed.filter(t => t.regime === 'trending_bull')
    const rangingTrades = closed.filter(t => t.regime === 'ranging')
    const bullWR   = bullTrades.length   ? Math.round(bullTrades.filter(t => t.outcome?.startsWith('TP')).length / bullTrades.length * 100) : 0
    const rangingWR = rangingTrades.length ? Math.round(rangingTrades.filter(t => t.outcome?.startsWith('TP')).length / rangingTrades.length * 100) : 0
    if (bullTrades.length >= 3 && rangingTrades.length >= 2 && bullWR > rangingWR + 20) {
      earlyInsights.push({ icon: '📊', col: '#ffcc00', title: `Trending bull: ${bullWR}% WR. Ranging: ${rangingWR}% WR`, body: `Performance gap of ${bullWR - rangingWR}pp between market regimes. The ADX filter is working — consider raising it further to eliminate more ranging signals.` })
    }
  }

  // Best/worst coin
  const coinStats = ['SOL', 'BTC', 'ETH', 'LINK', 'BNB'].map(coin => {
    const ct = closed.filter(t => t.coin === coin)
    const cw = ct.filter(t => t.outcome?.startsWith('TP')).length
    return { coin, wr: ct.length ? Math.round(cw / ct.length * 100) : -1, n: ct.length }
  }).filter(s => s.n >= 2)

  if (coinStats.length >= 2) {
    const best  = coinStats.sort((a, b) => b.wr - a.wr)[0]
    const worst = coinStats.sort((a, b) => a.wr - b.wr)[0]
    if (best.wr >= 60) earlyInsights.push({ icon: '⭐', col: '#00ff88', title: `${best.coin} is your best coin (${best.wr}%)`, body: `${best.coin} is outperforming all other coins in your portfolio. Per-coin profile has been learned. Consider increasing position size on ${best.coin} signals.` })
    if (worst.wr <= 30 && worst.n >= 3) earlyInsights.push({ icon: '⚠️', col: '#ff3355', title: `${worst.coin} underperforming (${worst.wr}% WR)`, body: `${worst.coin} is losing more than it wins after ${worst.n} trades. Consider pausing ${worst.coin} scans until strategy is recalibrated for this coin.` })
  }

  if (missed.length > correct.length) {
    earlyInsights.push({ icon: '👻', col: '#7F77DD', title: `${missed.length} WAIT signals were winning moves`, body: `The what-if engine shows ${missed.length} signals blocked by rules that subsequently moved ${'>'}8%. Some rules may be too strict. Review the blocked rules in the what-if analysis.` })
  }

  const proj60PnL  = dayNumber > 0 ? Math.round(totalPnl * (FORWARD_TEST_DAYS / dayNumber)) : 0
  const proj60Pct  = dayNumber > 0 ? ((totalPnl / capital) * (FORWARD_TEST_DAYS / dayNumber) * 100).toFixed(1) : '0'
  const cagr       = dayNumber > 0 ? ((totalPnl / capital) * (365 / dayNumber) * 100).toFixed(0) : '—'

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Progress bar to Day 60 */}
      <Card border={isComplete ? '#00ff8822' : '#7F77DD22'}>
        <div className="flex justify-between items-center mb-2">
          <SectionHeader title={isComplete ? '60-DAY REPORT — COMPLETE' : `60-DAY REPORT — ${FORWARD_TEST_DAYS - dayNumber} DAYS REMAINING`} color={isComplete ? '#00ff88' : '#7F77DD'} />
          {isComplete && (
            <button onClick={generateReport} disabled={generating} style={{
              fontSize: 10, fontFamily: 'monospace', padding: '6px 14px', borderRadius: 6, cursor: generating ? 'not-allowed' : 'pointer',
              background: '#00ff8822', border: '1px solid #00ff8833', color: '#00ff88'
            }}>
              {generating ? 'GENERATING...' : '▶ GENERATE REPORT'}
            </button>
          )}
        </div>
        <div style={{ height: 6, background: '#1a1a2e', borderRadius: 999, marginBottom: 6 }}>
          <div style={{ height: 6, width: `${Math.min(100, (dayNumber / FORWARD_TEST_DAYS) * 100)}%`, background: isComplete ? '#00ff88' : '#7F77DD', borderRadius: 999 }} />
        </div>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>
          Day {dayNumber} of {FORWARD_TEST_DAYS} · {closed.length} signals logged · {wins.length} wins · {Math.round(wins.length / Math.max(1, closed.length) * 100)}% win rate so far
        </div>
      </Card>

      {/* What-if summary */}
      <Card>
        <SectionHeader title="WHAT-IF ENGINE — WAIT SIGNALS TRACKED" />
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatBox label="WAIT signals" value={ghostTrades.length} sub="tracked" color="#7F77DD" />
          <StatBox label="Missed wins" value={missed.length} sub="rules too strict?" color="#ff3355" />
          <StatBox label="Correct waits" value={correct.length} sub="rules saved you" color="#00ff88" />
        </div>
        {ghostTrades.slice(0, 5).map(g => (
          <div key={g.id} style={{ padding: '6px 8px', borderRadius: 6, marginBottom: 4, border: `1px solid ${g.wouldHaveWon ? '#ff335522' : '#00ff8818'}`, background: g.wouldHaveWon ? '#ff335508' : '#00ff8806' }}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <CoinBadge coin={g.coin} size={13} />
                <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>{g.date}</span>
                <span style={{ fontSize: 9, fontFamily: 'monospace', padding: '1px 6px', borderRadius: 3, background: g.wouldHaveWon ? '#ff335522' : '#00ff8818', color: g.wouldHaveWon ? '#ff3355' : '#00ff88' }}>
                  {g.wouldHaveWon ? 'MISSED WIN' : 'CORRECT WAIT'}
                </span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: g.wouldHaveWon ? '#ff3355' : '#00ff88' }}>
                {g.wouldHaveWon ? `missed +${g.move48h}%` : `saved -${Math.abs(g.move48h)}%`}
              </span>
            </div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: g.wouldHaveWon ? '#ff335566' : '#00ff8855', marginTop: 2 }}>
              {g.wouldHaveWon ? '⚠ Blocked by:' : '✓ Saved by:'} {g.blockingRule}
            </div>
          </div>
        ))}
      </Card>

      {/* Early insights */}
      <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color: '#333' }}>
        EARLY FINDINGS — DAY {dayNumber}
      </div>
      {earlyInsights.length === 0 && (
        <Card>
          <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#333' }}>
            Need {Math.max(0, 5 - closed.length)} more closed trades to surface insights
          </div>
        </Card>
      )}
      {earlyInsights.map(({ icon, col, title, body }) => (
        <div key={title} className="flex gap-3 p-3 rounded-lg" style={{ background: '#0a0a1a', border: `1px solid ${col}18` }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: col, marginBottom: 2 }}>{title}</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#666', lineHeight: 1.6 }}>{body}</div>
          </div>
        </div>
      ))}

      {/* Projection */}
      <Card border="#00ff8818">
        <SectionHeader title={`DAY ${FORWARD_TEST_DAYS} PROJECTION`} color="#00ff88" />
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="Projected P&L" value={(proj60PnL >= 0 ? '+' : '') + '$' + Math.abs(proj60PnL)} color={proj60PnL >= 0 ? '#00ff88' : '#ff3355'} sub={`${proj60Pct}% on capital`} />
          <StatBox label="CAGR" value={`${cagr}%`} color="#00aaff" sub="annualised" />
          <StatBox label="Signals expected" value={Math.round(closed.length * (FORWARD_TEST_DAYS / Math.max(1, dayNumber)))} color="#aaa" sub="total" />
        </div>
        <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'monospace', color: '#555' }}>
          Based on current {winRate}% win rate and ${Math.round(totalPnl / Math.max(1, closed.length))} avg/trade
        </div>
      </Card>

      {/* Full AI report (Day 60 only) */}
      {report && (
        <Card border="#00ff8822">
          <SectionHeader title="AI-GENERATED 60-DAY REPORT" color="#00ff88" />
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#fff', marginBottom: 12 }}>
            {report.headline as string}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#444', marginBottom: 6 }}>KEY FINDINGS</div>
            {(report.keyFindings as string[] || []).map((f, i) => (
              <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: '#aaa', padding: '3px 0', borderBottom: '1px solid #ffffff05' }}>
                ◆ {f}
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#444', marginBottom: 6 }}>RULE CHANGES RECOMMENDED</div>
            {(report.ruleChanges as Array<{ rule: string; from: string; to: string; evidence: string }> || []).map((rc, i) => (
              <div key={i} style={{ padding: '6px 8px', borderRadius: 6, marginBottom: 4, background: '#ffcc0008', border: '1px solid #ffcc0022' }}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#ffcc00', marginBottom: 2 }}>{rc.rule}: {rc.from} → {rc.to}</div>
                <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#555' }}>{rc.evidence}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: 10, borderRadius: 8, background: '#0d0d20', fontSize: 10, fontFamily: 'monospace', color: '#aaa', lineHeight: 1.7 }}>
            <strong style={{ color: '#00ff88' }}>Verdict: </strong>{report.overallVerdict as string}
          </div>
        </Card>
      )}
    </div>
  )
}
