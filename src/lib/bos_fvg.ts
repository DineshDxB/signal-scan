// ── BOS + FVG ENGINE ─────────────────────────────────────────
// Break of Structure + Fair Value Gap detection
// Used to find precise entry prices instead of chasing breakouts

import type { FVGZone, BOSLevel } from '../types'
import { BASE_PARAMS } from '../config'

interface OHLCV {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ── SWING POINT DETECTION ────────────────────────────────────
function findSwingHighs(candles: OHLCV[], lookback: number): Array<{ price: number; index: number }> {
  const swings: Array<{ price: number; index: number }> = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const isHigh = candles.slice(i - lookback, i + lookback + 1).every((c, j) =>
      j === lookback || c.high <= candles[i].high
    )
    if (isHigh) swings.push({ price: candles[i].high, index: i })
  }
  return swings
}

function findSwingLows(candles: OHLCV[], lookback: number): Array<{ price: number; index: number }> {
  const swings: Array<{ price: number; index: number }> = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    const isLow = candles.slice(i - lookback, i + lookback + 1).every((c, j) =>
      j === lookback || c.low >= candles[i].low
    )
    if (isLow) swings.push({ price: candles[i].low, index: i })
  }
  return swings
}

// ── BREAK OF STRUCTURE ────────────────────────────────────────
export function detectBOS(candles: OHLCV[], lookback = BASE_PARAMS.swingLookback): BOSLevel | null {
  if (candles.length < lookback * 2 + 5) return null

  const last = candles[candles.length - 1]
  const prev = candles[candles.length - 2]
  const swingHighs = findSwingHighs(candles.slice(0, -1), lookback)
  const swingLows  = findSwingLows(candles.slice(0, -1), lookback)

  if (swingHighs.length === 0 && swingLows.length === 0) return null

  // Bullish BOS: close breaks above last swing high
  const lastSwingHigh = swingHighs[swingHighs.length - 1]
  if (lastSwingHigh && last.close > lastSwingHigh.price && prev.close <= lastSwingHigh.price) {
    return {
      price: lastSwingHigh.price,
      direction: 'bullish',
      timestamp: last.timestamp
    }
  }

  // Bearish BOS: close breaks below last swing low
  const lastSwingLow = swingLows[swingLows.length - 1]
  if (lastSwingLow && last.close < lastSwingLow.price && prev.close >= lastSwingLow.price) {
    return {
      price: lastSwingLow.price,
      direction: 'bearish',
      timestamp: last.timestamp
    }
  }

  return null
}

// ── FAIR VALUE GAP DETECTION ──────────────────────────────────
// Bullish FVG: candle[i].low > candle[i-2].high (gap between them)
// Bearish FVG: candle[i].high < candle[i-2].low
export function detectFVGs(
  candles: OHLCV[],
  direction: 'bull' | 'bear',
  minPct = BASE_PARAMS.fvgMinPct,
  maxPct = BASE_PARAMS.fvgMaxPct,
  lookbackBars = BASE_PARAMS.fvgBars
): FVGZone[] {
  const fvgs: FVGZone[] = []
  const startIndex = Math.max(2, candles.length - lookbackBars - 2)

  for (let i = startIndex; i < candles.length; i++) {
    if (direction === 'bull') {
      const gapTop    = candles[i].low
      const gapBottom = candles[i - 2].high
      if (gapTop > gapBottom) {
        const sizePct = (gapTop - gapBottom) / gapBottom * 100
        if (sizePct >= minPct && sizePct <= maxPct) {
          fvgs.push({
            top: gapTop,
            bottom: gapBottom,
            midpoint: (gapTop + gapBottom) / 2,
            barIndex: i,
            type: 'bull',
            sizePercent: sizePct
          })
        }
      }
    } else {
      const gapTop    = candles[i - 2].low
      const gapBottom = candles[i].high
      if (gapTop > gapBottom) {
        const sizePct = (gapTop - gapBottom) / gapBottom * 100
        if (sizePct >= minPct && sizePct <= maxPct) {
          fvgs.push({
            top: gapTop,
            bottom: gapBottom,
            midpoint: (gapTop + gapBottom) / 2,
            barIndex: i,
            type: 'bear',
            sizePercent: sizePct
          })
        }
      }
    }
  }

  // Return most recent FVGs first
  return fvgs.reverse()
}

// ── FIND BEST ENTRY FROM FVG ──────────────────────────────────
export interface EntryRecommendation {
  type: 'FVG' | 'PULLBACK' | 'BREAKOUT'
  entryPrice: number
  idealEntry: number
  stopLoss: number
  notes: string
  rrEstimate: number
  fvgZone: FVGZone | null
  bos: BOSLevel | null
}

export function getEntryRecommendation(
  candles: OHLCV[],
  signal: 'BUY' | 'SELL',
  tp3Price: number,
  slBasePct: number
): EntryRecommendation {
  const current = candles[candles.length - 1].close
  const direction = signal === 'BUY' ? 'bull' : 'bear'

  // 1. Detect BOS
  const bos = detectBOS(candles)

  // 2. Find FVGs
  const fvgs = detectFVGs(candles, direction)

  // 3. Check if current price is in a bullish FVG (ideal pullback entry)
  const activeFVG = fvgs.find(fvg => {
    if (direction === 'bull') {
      // Price has pulled back into FVG zone
      return current <= fvg.top && current >= fvg.bottom * 0.99
    } else {
      return current >= fvg.bottom && current <= fvg.top * 1.01
    }
  })

  // 4. Find nearest upcoming FVG (price hasn't reached yet)
  const upcomingFVG = fvgs.find(fvg => {
    if (direction === 'bull') return current > fvg.top   // price above gap — wait for pullback
    else return current < fvg.bottom
  })

  if (activeFVG) {
    // Price is in the FVG — enter at midpoint
    const entry = activeFVG.midpoint
    const sl    = direction === 'bull'
      ? activeFVG.bottom * 0.995
      : activeFVG.top   * 1.005
    const risk  = Math.abs(entry - sl)
    const reward= Math.abs(tp3Price - entry)
    return {
      type: 'FVG',
      entryPrice: entry,
      idealEntry: activeFVG.midpoint,
      stopLoss: sl,
      notes: `FVG fill entry at midpoint $${entry.toFixed(2)}. Gap ${activeFVG.sizePercent.toFixed(1)}% (${activeFVG.bottom.toFixed(2)}–${activeFVG.top.toFixed(2)}). Stop just below FVG bottom — much tighter than breakout stop.`,
      rrEstimate: risk > 0 ? reward / risk : 3,
      fvgZone: activeFVG,
      bos
    }
  }

  if (upcomingFVG) {
    // Price above FVG — use FVG midpoint as limit order target
    const entry = upcomingFVG.midpoint
    const sl    = direction === 'bull'
      ? upcomingFVG.bottom * 0.995
      : upcomingFVG.top   * 1.005
    const risk  = Math.abs(entry - sl)
    const reward= Math.abs(tp3Price - entry)
    return {
      type: 'PULLBACK',
      entryPrice: current,  // current price for immediate entry
      idealEntry: upcomingFVG.midpoint,  // ideal = wait for FVG fill
      stopLoss: current * (1 - slBasePct / 100),
      notes: `FVG zone at $${upcomingFVG.bottom.toFixed(2)}–$${upcomingFVG.top.toFixed(2)} below current price. PATIENT: place limit at $${upcomingFVG.midpoint.toFixed(2)} for better entry. AGGRESSIVE: enter now at $${current.toFixed(2)} with wider stop.`,
      rrEstimate: risk > 0 ? reward / risk : 3,
      fvgZone: upcomingFVG,
      bos
    }
  }

  // Fallback: breakout entry
  const sl   = current * (1 - slBasePct / 100)
  const risk = Math.abs(current - sl)
  const reward = Math.abs(tp3Price - current)
  return {
    type: 'BREAKOUT',
    entryPrice: current,
    idealEntry: current,
    stopLoss: sl,
    notes: `No FVG available. Breakout entry at current price $${current.toFixed(2)}. Stop ${slBasePct}% below entry. Consider waiting for a pullback for better R/R.`,
    rrEstimate: risk > 0 ? reward / risk : 3,
    fvgZone: null,
    bos
  }
}
