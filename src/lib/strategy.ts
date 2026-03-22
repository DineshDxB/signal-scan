// ── SELF-IMPROVING STRATEGY ENGINE ───────────────────────────
// Computes live parameters from trade history.
// Base params → adjusted by data → per-coin profiles.
// Updates every 10 closed trades automatically.

import type { Trade, CoinProfile, LiveStrategyParams, StrategyChange } from '../types'
import { BASE_PARAMS, LAYER_WEIGHTS, CONFIDENCE_MULT, COIN_OVERRIDES } from '../config'

// ── COMPUTE LIVE GLOBAL PARAMS ────────────────────────────────
export function computeLiveParams(trades: Trade[]): LiveStrategyParams {
  const closed = trades.filter(t => t.outcome !== 'OPEN')
  if (closed.length < 5) {
    return { ...BASE_PARAMS, version: 1, changes: [], source: 'base' }
  }

  const wins   = closed.filter(t => t.outcome?.startsWith('TP'))
  const losses = closed.filter(t => t.outcome === 'SL')
  const changes: StrategyChange[] = []
  const params = { ...BASE_PARAMS }

  // ── RSI ceiling: learn from actual RSI at wins vs losses ──
  if (wins.length >= 3) {
    const winRSIs  = wins.map(t => t.rsiAtEntry).filter(Boolean)
    const lossRSIs = losses.map(t => t.rsiAtEntry).filter(Boolean)
    const avgWinRSI  = avg(winRSIs)
    const avgLossRSI = avg(lossRSIs)
    if (avgWinRSI < avgLossRSI - 3 && winRSIs.length >= 3) {
      const newCeil = Math.round(Math.min(avgWinRSI + 6, BASE_PARAMS.rsiCeil))
      if (newCeil < params.rsiCeil) {
        changes.push({
          param: 'RSI ceiling',
          from: params.rsiCeil, to: newCeil,
          reason: `Win avg RSI ${avgWinRSI.toFixed(0)} vs loss avg ${avgLossRSI.toFixed(0)}`,
          impact: 'Blocks overbought entries that consistently lose',
          appliedAt: new Date().toISOString()
        })
        params.rsiCeil = newCeil
      }
    }
  }

  // ── Stop loss: calibrate to actual volatility ──
  const slPcts = closed.map(t => Math.abs((t.stopLoss - t.entryPrice) / t.entryPrice * 100))
  if (slPcts.length >= 5) {
    const avgSL = avg(slPcts)
    if (Math.abs(avgSL - BASE_PARAMS.slPct) > 0.8) {
      const newSL = parseFloat(avgSL.toFixed(1))
      changes.push({
        param: 'Stop loss %',
        from: BASE_PARAMS.slPct, to: newSL,
        reason: `Data avg stop ${newSL}% vs base ${BASE_PARAMS.slPct}%`,
        impact: 'Calibrated to actual coin volatility',
        appliedAt: new Date().toISOString()
      })
      params.slPct = newSL
    }
  }

  // ── Volume filter: tighten if high-vol trades win more ──
  if (closed.length >= 8) {
    const highVolWins  = wins.filter(t => t.volumeRatio >= 2.0).length
    const highVolTotal = closed.filter(t => t.volumeRatio >= 2.0).length
    const lowVolWins   = wins.filter(t => t.volumeRatio < 2.0).length
    const lowVolTotal  = closed.filter(t => t.volumeRatio < 2.0).length
    const highVolWR = highVolTotal ? highVolWins / highVolTotal : 0
    const lowVolWR  = lowVolTotal  ? lowVolWins  / lowVolTotal  : 0
    if (highVolWR - lowVolWR > 0.2 && lowVolTotal >= 3 && params.volMin < 2.0) {
      changes.push({
        param: 'Volume minimum',
        from: BASE_PARAMS.volMin, to: 2.0,
        reason: `High vol (≥2x) wins ${pct(highVolWR)} vs low vol ${pct(lowVolWR)}`,
        impact: 'Filters weak momentum — only institutional moves',
        appliedAt: new Date().toISOString()
      })
      params.volMin = 2.0
    }
  }

  // ── ADX: raise if ranging market trades lose ──
  if (closed.length >= 8) {
    const trendTrades   = closed.filter(t => t.adx >= 25)
    const rangingTrades = closed.filter(t => t.adx < 25)
    const trendWR   = trendTrades.length   ? trendTrades.filter(t => t.outcome?.startsWith('TP')).length / trendTrades.length   : 0
    const rangingWR = rangingTrades.length ? rangingTrades.filter(t => t.outcome?.startsWith('TP')).length / rangingTrades.length : 0
    if (trendWR - rangingWR > 0.25 && rangingTrades.length >= 3 && params.adxMin < 25) {
      changes.push({
        param: 'ADX minimum',
        from: BASE_PARAMS.adxMin, to: 25,
        reason: `ADX≥25 wins ${pct(trendWR)} vs ADX<25 ${pct(rangingWR)}`,
        impact: 'Eliminates ranging market signals',
        appliedAt: new Date().toISOString()
      })
      params.adxMin = 25
    }
  }

  return {
    ...params,
    version: 1 + changes.length,
    changes,
    source: changes.length > 0 ? 'learned' : 'base'
  }
}

// ── COMPUTE PER-COIN PROFILE ──────────────────────────────────
export function computeCoinProfile(trades: Trade[], coin: string): CoinProfile | null {
  const ct = trades.filter(t => t.coin === coin && t.outcome !== 'OPEN')
  if (ct.length === 0) return null

  const cw  = ct.filter(t => t.outcome?.startsWith('TP'))
  const winRate = Math.round(cw.length / ct.length * 100)

  // Best entry type
  const fvgT  = ct.filter(t => t.entryType === 'FVG')
  const pbT   = ct.filter(t => t.entryType === 'PULLBACK')
  const boT   = ct.filter(t => t.entryType === 'BREAKOUT')
  const fvgWR = fvgT.length ? Math.round(fvgT.filter(t => t.outcome?.startsWith('TP')).length / fvgT.length * 100) : null
  const pbWR  = pbT.length  ? Math.round(pbT.filter(t => t.outcome?.startsWith('TP')).length / pbT.length * 100)   : null
  const boWR  = boT.length  ? Math.round(boT.filter(t => t.outcome?.startsWith('TP')).length / boT.length * 100)   : null

  const rates = [
    { type: 'FVG' as const, wr: fvgWR, n: fvgT.length },
    { type: 'PULLBACK' as const, wr: pbWR, n: pbT.length },
    { type: 'BREAKOUT' as const, wr: boWR, n: boT.length }
  ].filter(r => r.wr !== null && r.n >= 2)
  const bestEntry = rates.sort((a, b) => (b.wr || 0) - (a.wr || 0))[0]?.type || 'FVG'

  // Best GST hour
  const hourMap: Record<number, { w: number; n: number }> = {}
  ct.forEach(t => {
    const h = t.gstHour || 23
    if (!hourMap[h]) hourMap[h] = { w: 0, n: 0 }
    hourMap[h].n++
    if (t.outcome?.startsWith('TP')) hourMap[h].w++
  })
  const bestHour = Object.entries(hourMap)
    .filter(([, v]) => v.n >= 2)
    .sort((a, b) => (b[1].w / b[1].n) - (a[1].w / a[1].n))[0]

  // Learned RSI
  const winRSIs = cw.map(t => t.rsiAtEntry).filter(Boolean)
  const learnedRsiCeil = winRSIs.length >= 3
    ? Math.round(Math.min(Math.max(...winRSIs) + 3, 75))
    : BASE_PARAMS.rsiCeil

  // Learned stop
  const slPcts = ct.map(t => Math.abs((t.stopLoss - t.entryPrice) / t.entryPrice * 100))
  const learnedSl = slPcts.length >= 3
    ? parseFloat(avg(slPcts).toFixed(1))
    : (COIN_OVERRIDES[coin]?.slPct || BASE_PARAMS.slPct)

  // Learned volume
  const winVols = cw.map(t => t.volumeRatio).filter(Boolean)
  const learnedVol = winVols.length >= 3
    ? parseFloat((avg(winVols) * 0.85).toFixed(1))
    : BASE_PARAMS.volMin

  // Avg win/loss
  const winPcts  = cw.map(t => ((t.exitPrice || t.tp1) - t.entryPrice) / t.entryPrice * 100)
  const lossPcts = ct.filter(t => t.outcome === 'SL').map(t => (t.entryPrice - (t.exitPrice || t.stopLoss)) / t.entryPrice * 100)

  // Build notes
  const notes: string[] = []
  if (fvgWR !== null && boWR !== null && fvgWR > boWR + 20) notes.push(`FVG entries win ${fvgWR}% vs breakout ${boWR}% — use FVG only`)
  if (winRate < 35 && ct.length >= 5) notes.push(`Low win rate — review if coin belongs in scan universe`)
  if (winRate >= 65 && ct.length >= 5) notes.push(`Strong performer — consider increased position size`)
  if (ct.length < 10) notes.push(`${10 - ct.length} more trades needed for reliable profile`)

  return {
    coin, trades: ct.length, wins: cw.length, winRate,
    avgWinPct: winPcts.length ? parseFloat(avg(winPcts).toFixed(1)) : 0,
    avgLossPct: lossPcts.length ? parseFloat(avg(lossPcts).toFixed(1)) : 0,
    learnedRsiCeil, learnedRsiFloor: BASE_PARAMS.rsiFloor,
    learnedSlPct: learnedSl, learnedVolMin: learnedVol,
    bestEntry, bestHour: bestHour ? parseInt(bestHour[0]) : null,
    fvgWinRate: fvgWR, pullbackWinRate: pbWR, breakoutWinRate: boWR,
    notes: notes.join('. '),
    updatedAt: new Date().toISOString()
  }
}

// ── POSITION SIZING ───────────────────────────────────────────
export function computePositionSize(
  wallet: number,
  riskPercent: number,
  confidence: number,
  openTradeCount: number,
  isCorrelated: boolean
): { positionSize: number; riskAmount: number; confMultiplier: string } {
  const baseRisk = wallet * (riskPercent / 100)

  // Confidence multiplier
  let mult = 0.5
  let confMultiplier = 'LOW'
  if (confidence >= 85) { mult = 1.0; confMultiplier = 'HIGH' }
  else if (confidence >= 75) { mult = 0.75; confMultiplier = 'MEDIUM' }
  else if (confidence >= 70) { mult = 0.5; confMultiplier = 'LOW' }

  // Correlation penalty
  if (isCorrelated) mult *= 0.5

  // Portfolio heat
  if (openTradeCount >= 3) mult *= 0.5
  else if (openTradeCount >= 2) mult *= 0.75

  const riskAmount = baseRisk * mult
  // Assuming 5% stop loss for position size calc
  const positionSize = riskAmount / 0.05

  return { positionSize: Math.round(positionSize), riskAmount: Math.round(riskAmount), confMultiplier }
}

// ── GHOST TRADE ANALYSIS ──────────────────────────────────────
export function analyzeGhostTrades(ghosts: Array<{
  wouldHaveWon: boolean; move48h: number
}>) {
  const missed = ghosts.filter(g => g.wouldHaveWon)
  const correct = ghosts.filter(g => !g.wouldHaveWon)
  const missedPnl = missed.reduce((s, g) => s + Math.abs(g.move48h) * 100, 0)
  const savedPnl  = correct.reduce((s, g) => s + Math.abs(g.move48h) * 65, 0)
  return {
    missed: missed.length, correct: correct.length,
    netShadowPnl: Math.round(savedPnl - missedPnl),
    missedPnl: Math.round(missedPnl),
    savedPnl: Math.round(savedPnl)
  }
}

// ── HELPERS ───────────────────────────────────────────────────
function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

export function computeOverallScore(layerScores: Record<string, number>): number {
  return Math.round(
    (layerScores.stage    || 0) * LAYER_WEIGHTS.stage +
    (layerScores.trend    || 0) * LAYER_WEIGHTS.trend +
    (layerScores.setup    || 0) * LAYER_WEIGHTS.setup +
    (layerScores.momentum || 0) * LAYER_WEIGHTS.momentum +
    (layerScores.risk     || 0) * LAYER_WEIGHTS.risk
  )
}

export function formatGST(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date)
}

export function getGSTHour(date: Date = new Date()): number {
  const gst = new Date(date.getTime() + 4 * 3600000)
  return gst.getUTCHours()
}
