// ── SIGNAL SCAN — FREE LOCAL ANALYSIS ENGINE ─────────────────
// All 5-layer analysis runs locally — ZERO API cost.
// Data sources: Binance (free), Fear&Greed (free), CoinGecko (free)
// Optional: Claude deep-dive on one coin — manual only, ~$0.01

import type { CoinSignal, RegimeType } from '../types'
import { BASE_PARAMS, COIN_OVERRIDES } from '../config'
import { getEntryRecommendation } from './bos_fvg'

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY || ''

// ── FREE DATA FETCHERS ────────────────────────────────────────

async function fetchOHLCV(symbol: string, interval = '1d', limit = 250) {
  try {
    const r = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`
    )
    const d = await r.json()
    if (!Array.isArray(d)) return []
    return d.map((c: number[]) => ({
      timestamp: new Date(c[0]).toISOString(),
      open:   parseFloat(c[1] as unknown as string),
      high:   parseFloat(c[2] as unknown as string),
      low:    parseFloat(c[3] as unknown as string),
      close:  parseFloat(c[4] as unknown as string),
      volume: parseFloat(c[5] as unknown as string),
    }))
  } catch { return [] }
}

async function fetchCurrentPrice(symbol: string): Promise<number> {
  try {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`)
    const d = await r.json()
    return parseFloat(d.price) || 0
  } catch { return 0 }
}

async function fetchFundingRate(symbol: string): Promise<number> {
  try {
    const r = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}USDT&limit=1`)
    const d = await r.json()
    return Array.isArray(d) ? parseFloat(d[0]?.fundingRate || '0') : 0
  } catch { return 0 }
}

async function fetchFearGreed(): Promise<{ value: number; trend: 'IMPROVING' | 'DETERIORATING' | 'STABLE' }> {
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=7')
    const d = await r.json()
    const vals: number[] = d.data.map((x: { value: string }) => parseInt(x.value))
    const slope = vals[0] - vals[vals.length - 1]
    return {
      value: vals[0],
      trend: slope > 5 ? 'IMPROVING' : slope < -5 ? 'DETERIORATING' : 'STABLE'
    }
  } catch { return { value: 50, trend: 'STABLE' } }
}

async function fetchBTCDominance(): Promise<number> {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/global')
    const d = await r.json()
    return parseFloat(d.data?.market_cap_percentage?.btc?.toFixed(1) || '50')
  } catch { return 50 }
}

// ── TECHNICAL INDICATORS (all free, calculated locally) ───────

function calcEMA(closes: number[], period: number): number[] {
  if (closes.length === 0) return []
  const k = 2 / (period + 1)
  const ema = [closes[0]]
  for (let i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k))
  }
  return ema
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gains += d; else losses -= d
  }
  const rs = gains / (losses || 0.001)
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1))
}

function calcSMA(vals: number[], period: number): number {
  if (vals.length < period) return vals[vals.length - 1] || 0
  return vals.slice(-period).reduce((a, b) => a + b, 0) / period
}

function calcADX(candles: Array<{ high: number; low: number; close: number }>, period = 14) {
  if (candles.length < period + 2) return { adx: 0, diPlus: 0, diMinus: 0 }
  let trSum = 0, dpSum = 0, dmSum = 0
  for (let i = candles.length - period; i < candles.length; i++) {
    const p = candles[i - 1], c = candles[i]
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close))
    const dp = Math.max(c.high - p.high, 0)
    const dm = Math.max(p.low  - c.low,  0)
    trSum += tr
    dpSum += (dp > dm ? dp : 0)
    dmSum += (dm > dp ? dm : 0)
  }
  const diPlus  = trSum > 0 ? (dpSum / trSum) * 100 : 0
  const diMinus = trSum > 0 ? (dmSum / trSum) * 100 : 0
  const dx      = Math.abs(diPlus - diMinus) / ((diPlus + diMinus) || 1) * 100
  return { adx: dx, diPlus, diMinus }
}

function calcVolumeRatio(volumes: number[], period = 20): number {
  if (volumes.length < period + 1) return 1
  const avg = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period
  return avg > 0 ? volumes[volumes.length - 1] / avg : 1
}

function calcBBPct(closes: number[], period = 20): number {
  if (closes.length < period) return 0.5
  const slice = closes.slice(-period)
  const sma   = slice.reduce((a, b) => a + b, 0) / period
  const std   = Math.sqrt(slice.map(v => (v - sma) ** 2).reduce((a, b) => a + b, 0) / period)
  const upper = sma + 2 * std
  const lower = sma - 2 * std
  const close = closes[closes.length - 1]
  return (close - lower) / ((upper - lower) || 1)
}

function calcMACD(closes: number[]): { hist: number; bullish: boolean } {
  if (closes.length < 27) return { hist: 0, bullish: false }
  const ema12 = calcEMA(closes, 12)
  const ema26 = calcEMA(closes, 26)
  const macdLine   = ema12.map((v, i) => v - ema26[i])
  const signalLine = calcEMA(macdLine.slice(-20), 9)
  const hist       = macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1]
  return { hist, bullish: hist > 0 || macdLine[macdLine.length - 1] > signalLine[signalLine.length - 1] }
}

function detectRegime(closes: number[], adx: number, diPlus: number, diMinus: number): RegimeType {
  const atrPct = Math.abs(closes[closes.length - 1] - closes[closes.length - 6]) /
                 (closes[closes.length - 6] || 1)
  if (atrPct > 0.06) return 'high_volatility'
  if (adx < 20)      return 'ranging'
  const sma50 = calcSMA(closes, 50)
  if (diPlus > diMinus && closes[closes.length - 1] > sma50) return 'trending_bull'
  if (diMinus > diPlus && closes[closes.length - 1] < sma50) return 'trending_bear'
  return 'ranging'
}

// ── 5-LAYER SCORING ENGINE (100% LOCAL, $0 COST) ─────────────

function scoreLayer1Stage(
  close: number, sma30w: number, sma30wPrev: number,
  ema200: number, volOk: boolean
): { score: number; pass: boolean; hardFail: string | null } {
  const above30w   = close > sma30w
  const maRising   = sma30w > sma30wPrev
  const above200   = close > ema200
  const notExtended = !(close > sma30w * 1.35)

  if (!above30w) return { score: 0, pass: false, hardFail: 'Below 30W MA — Stage 4' }

  const checks = [above30w, maRising, above200, volOk, notExtended]
  const n = checks.filter(Boolean).length
  return { score: Math.round(n / 5 * 100), pass: n >= 4, hardFail: null }
}

function scoreLayer2Trend(
  close: number, ema20: number, ema50: number, ema200: number,
  prevClose: number, prevLow: number, adx: number, diPlus: number, diMinus: number
): { score: number; pass: boolean } {
  const emaStack   = ema20 > ema50 && ema50 > ema200
  const aboveSMA35 = close > calcSMA([close], 1) // simplified
  const risingStructure = close > prevClose
  const holdingHL  = true // simplified
  const adxTrend   = adx >= 18 && diPlus > diMinus

  const checks = [emaStack, risingStructure, adxTrend, close > ema50, ema20 > ema200]
  const n = checks.filter(Boolean).length
  return { score: Math.round(n / 5 * 100), pass: n >= 4 }
}

function scoreLayer3Setup(
  rsi: number, bbPct: number, macdBull: boolean, noDiv: boolean, vcp: boolean, aboveSupport: boolean,
  rsiHardBlock: number
): { score: number; pass: boolean; hardFail: string | null } {
  if (rsi > rsiHardBlock) return { score: 0, pass: false, hardFail: `RSI ${rsi.toFixed(0)} above ${rsiHardBlock} hard block` }

  const rsiOk = rsi >= BASE_PARAMS.rsiFloor && rsi <= BASE_PARAMS.rsiCeil
  const checks = [rsiOk, macdBull, bbPct < 0.82, noDiv, vcp, aboveSupport]
  const n = checks.filter(Boolean).length
  return { score: Math.round(n / 6 * 100), pass: n >= 4, hardFail: null }
}

function scoreLayer4Momentum(
  volRatio: number, rs7d: boolean, nearResist: boolean, bullCandle: boolean, aboveSMA30: boolean
): { score: number; pass: boolean } {
  const checks = [volRatio >= BASE_PARAMS.volMin, rs7d, nearResist, bullCandle, aboveSMA30]
  const n = checks.filter(Boolean).length
  return { score: Math.round(n / 5 * 100), pass: n >= 3 }
}

function scoreLayer5Risk(
  rr: number, fundingOk: boolean, fearGreedOk: boolean, noRecentCrash: boolean
): { score: number; pass: boolean; hardFail: string | null } {
  if (rr < BASE_PARAMS.minRR) return { score: 0, pass: false, hardFail: `R/R 1:${rr.toFixed(1)} below 1:${BASE_PARAMS.minRR}` }
  const checks = [rr >= BASE_PARAMS.minRR, fundingOk, fearGreedOk, noRecentCrash]
  const n = checks.filter(Boolean).length
  return { score: Math.round(n / 4 * 100), pass: n >= 3, hardFail: null }
}

// ── MAIN FREE ANALYSIS FUNCTION ───────────────────────────────

export async function analyzeCoin(
  symbol: string,
  wallet: number,
  riskPercent: number,
  openTradeCount: number,
  coinProfile: { learnedSlPct?: number; learnedRsiCeil?: number } | null
): Promise<CoinSignal | null> {
  try {
    // 1. Fetch free data in parallel
    const [daily, currentPrice, fundingRate, fearGreedData, btcDom] = await Promise.all([
      fetchOHLCV(symbol, '1d', 250),
      fetchCurrentPrice(symbol),
      fetchFundingRate(symbol),
      fetchFearGreed(),
      fetchBTCDominance(),
    ])

    if (!daily.length || !currentPrice) return null

    const closes  = daily.map((c: { close: number }) => c.close)
    const highs   = daily.map((c: { high: number }) => c.high)
    const lows    = daily.map((c: { low: number }) => c.low)
    const volumes = daily.map((c: { volume: number }) => c.volume)
    const opens   = daily.map((c: { open: number }) => c.open)

    // 2. Indicators (all local, all free)
    const rsi        = calcRSI(closes)
    const ema20Arr   = calcEMA(closes, 20)
    const ema50Arr   = calcEMA(closes, 50)
    const ema200Arr  = calcEMA(closes, 200)
    const ema20      = ema20Arr[ema20Arr.length - 1]
    const ema50      = ema50Arr[ema50Arr.length - 1]
    const ema200     = ema200Arr[ema200Arr.length - 1]
    const sma30w     = calcSMA(closes, 210)
    const sma30wPrev = calcSMA(closes.slice(0, -5), 210)
    const volRatio   = calcVolumeRatio(volumes)
    const bbPct      = calcBBPct(closes)
    const { hist: macdHist, bullish: macdBull } = calcMACD(closes)
    const { adx, diPlus, diMinus } = calcADX(daily)
    const regime     = detectRegime(closes, adx, diPlus, diMinus)
    const change7d   = ((currentPrice - closes[closes.length - 8]) / closes[closes.length - 8]) * 100
    const sma30      = calcSMA(closes, 30)
    const resistance = Math.max(...highs.slice(-50))
    const nearResist = (resistance - currentPrice) / currentPrice * 100 <= 8

    // Bearish divergence: price higher high but RSI lower high
    const priceHH = currentPrice > Math.max(...closes.slice(-15, -1))
    const rsiArr  = closes.map((_, i) => i >= 14 ? calcRSI(closes.slice(0, i + 1)) : 50)
    const rsiHH   = rsi > Math.max(...rsiArr.slice(-15, -1))
    const noDiv   = !(priceHH && !rsiHH)

    // VCP: price range contracting
    const rangeNow  = Math.max(...highs.slice(-5))  - Math.min(...lows.slice(-5))
    const rangeOld  = Math.max(...highs.slice(-19, -14)) - Math.min(...lows.slice(-19, -14))
    const vcp       = rangeNow < rangeOld * 0.75

    // Bullish candle
    const lastClose = closes[closes.length - 1]
    const lastOpen  = opens[opens.length - 1]
    const lastHigh  = highs[highs.length - 1]
    const lastLow   = lows[lows.length - 1]
    const body      = Math.abs(lastClose - lastOpen)
    const range     = lastHigh - lastLow
    const bullCandle = lastClose > lastOpen && range > 0 && body / range > 0.55

    // Relative strength vs 7d ago
    const rs7d = (currentPrice / closes[closes.length - 1]) > (closes[closes.length - 8] / closes[closes.length - 8])

    // Coin-specific params
    const slPct     = coinProfile?.learnedSlPct || COIN_OVERRIDES[symbol]?.slPct || BASE_PARAMS.slPct
    const rsiHard   = coinProfile?.learnedRsiCeil || BASE_PARAMS.rsiHard
    const tp1Pct    = BASE_PARAMS.tp1Pct
    const tp2Pct    = BASE_PARAMS.tp2Pct
    const tp3Pct    = BASE_PARAMS.tp3Pct

    // Price levels
    const sl  = currentPrice * (1 - slPct  / 100)
    const tp1 = currentPrice * (1 + tp1Pct / 100)
    const tp2 = currentPrice * (1 + tp2Pct / 100)
    const tp3 = currentPrice * (1 + tp3Pct / 100)
    const rr  = (tp3 - currentPrice) / (currentPrice - sl)

    // 3. Score all 5 layers
    const l1 = scoreLayer1Stage(currentPrice, sma30w, sma30wPrev, ema200, volRatio > 1)
    const l2 = scoreLayer2Trend(currentPrice, ema20, ema50, ema200, closes[closes.length - 6], lows[lows.length - 11], adx, diPlus, diMinus)
    const l3 = scoreLayer3Setup(rsi, bbPct, macdBull, noDiv, vcp, currentPrice > Math.min(...lows.slice(-10)) * 1.005, rsiHard)
    const l4 = scoreLayer4Momentum(volRatio, rs7d, nearResist, bullCandle, currentPrice > sma30)
    const l5 = scoreLayer5Risk(rr, Math.abs(fundingRate) < 0.001, fearGreedData.value >= 35 && fearGreedData.value <= 75, change7d > -5)

    // 4. Overall score (weighted)
    const overallScore = Math.round(
      l1.score * 0.30 + l2.score * 0.25 + l3.score * 0.20 + l4.score * 0.15 + l5.score * 0.10
    )

    // 5. Hard gates
    const hardFails = [l1.hardFail, l3.hardFail, l5.hardFail].filter(Boolean) as string[]
    const layersPassed = [l1.pass, l2.pass, l3.pass, l4.pass, l5.pass].filter(Boolean).length

    // 6. Signal decision
    let signal: 'BUY' | 'SELL' | 'WAIT' = 'WAIT'
    const confidence = Math.min(95, Math.max(0, overallScore))

    if (hardFails.length === 0 && layersPassed >= BASE_PARAMS.minLayers && confidence >= BASE_PARAMS.minConf) {
      signal = 'BUY'
    }

    // 7. Entry precision (BOS + FVG — free)
    const entryRec = getEntryRecommendation(daily, 'BUY', tp3, slPct)

    // 8. Position sizing
    const confMult   = confidence >= 85 ? 1.0 : confidence >= 75 ? 0.75 : 0.5
    const heatMult   = openTradeCount >= 3 ? 0.5 : openTradeCount >= 2 ? 0.75 : 1.0
    const riskAmount = wallet * (riskPercent / 100) * confMult * heatMult
    const positionSize = Math.round(riskAmount / (slPct / 100))

    // 9. Analysis summary (generated locally, no API)
    const analysis = signal === 'BUY'
      ? `${symbol} in Stage 2 uptrend. ${layersPassed}/5 layers pass. RSI ${rsi} in zone, volume ${volRatio.toFixed(1)}x average. ${entryRec.type} entry recommended at $${entryRec.idealEntry.toFixed(2)}.`
      : hardFails.length > 0
      ? `${symbol} blocked: ${hardFails.join(', ')}. Not tradeable right now.`
      : `${symbol} scored ${overallScore}/100 — ${layersPassed}/5 layers pass. Needs ${BASE_PARAMS.minLayers} layers and ${BASE_PARAMS.minConf}% confidence. Watching.`

    return {
      coin: symbol, symbol: `${symbol}USDT`, signal, confidence, overallScore,
      layerScores: { stage: l1.score, trend: l2.score, setup: l3.score, momentum: l4.score, risk: l5.score },
      layersPassed, hardGatesFailed: hardFails, entryType: entryRec.type, regime,
      currentPrice, entryPrice: entryRec.entryPrice, idealEntry: entryRec.idealEntry,
      stopLoss: entryRec.stopLoss, tp1, tp2, tp3,
      invalidationPrice: sl * 0.99, rrRatio: parseFloat(rr.toFixed(1)),
      fvgZone: entryRec.fvgZone, bosLevel: entryRec.bos, entryNotes: entryRec.notes,
      rsi: parseFloat(rsi.toFixed(1)), volumeRatio: parseFloat(volRatio.toFixed(2)),
      adx: parseFloat(adx.toFixed(1)), fundingRate, fearGreed: fearGreedData.value,
      fearGreedTrend: fearGreedData.trend, btcDominance: btcDom,
      positionSize, riskAmount: Math.round(riskAmount),
      scanTime: new Date().toISOString(), gstHour: (new Date().getUTCHours() + 4) % 24,
      setupAge: 0, analysis, newsOk: true, newsNote: 'Local analysis — no news check'
    }
  } catch (err) {
    console.error(`analyzeCoin(${symbol}):`, err)
    return null
  }
}

// ── OPTIONAL: CLAUDE DEEP ANALYSIS (manual, ~$0.01) ──────────
// Only called when user clicks "Deep Analysis" on a specific coin.
// NOT called during auto-scans.

export async function deepAnalyzeCoin(signal: CoinSignal): Promise<string> {
  if (!ANTHROPIC_KEY) return 'Add VITE_ANTHROPIC_KEY to enable deep analysis.'
  try {
    const prompt = `You are a swing trading analyst. Give a concise 4-5 sentence deep analysis of this ${signal.coin} setup.

Current data:
- Price: $${signal.currentPrice}
- Signal: ${signal.signal} (${signal.confidence}% confidence)
- RSI: ${signal.rsi} | Volume: ${signal.volumeRatio}x | ADX: ${signal.adx}
- Regime: ${signal.regime}
- Layer scores: Stage ${signal.layerScores.stage}, Trend ${signal.layerScores.trend}, Setup ${signal.layerScores.setup}, Momentum ${signal.layerScores.momentum}, Risk ${signal.layerScores.risk}
- Entry: $${signal.entryPrice.toFixed(2)} | SL: $${signal.stopLoss.toFixed(2)} | TP3: $${signal.tp3.toFixed(2)}
- R/R: 1:${signal.rrRatio}

Focus on: what is the key reason to take or skip this trade right now.`

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',  // cheapest model ~$0.001 per call
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const d = await r.json()
    return d.content?.[0]?.text || 'Analysis unavailable.'
  } catch { return 'Deep analysis failed. Check your API key.' }
}

// ── 60-DAY REPORT (one-time, ~$0.03) ─────────────────────────
export async function generate60DayReport(tradesJSON: string, statsJSON: string): Promise<string> {
  if (!ANTHROPIC_KEY) return '{}'
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Analyze this 60-day trading forward test and output JSON only.
TRADES: ${tradesJSON}
STATS: ${statsJSON}

JSON format:
{
  "headline": "one sentence",
  "edgeConfirmed": true/false,
  "keyFindings": ["finding 1", "finding 2", "finding 3"],
  "bestCoin": {"coin":"SOL","winRate":67,"reason":"why"},
  "worstCoin": {"coin":"ETH","winRate":20,"reason":"why"},
  "bestEntryType": {"type":"FVG","winRate":80,"reason":"why"},
  "bestHour": {"hour":23,"gst":"23:00 GST","winRate":75},
  "ruleChanges": [{"rule":"what","from":"current","to":"recommended","evidence":"why"}],
  "coinsToRemove": [],
  "coinsToFocus": [],
  "overallVerdict": "2-3 sentences"
}`
        }]
      })
    })
    const d = await r.json()
    const text = d.content?.[0]?.text || '{}'
    const match = text.match(/\{[\s\S]*\}/)
    return match ? match[0] : '{}'
  } catch { return '{}' }
}

// ── TELEGRAM ALERT (free) ─────────────────────────────────────
export async function sendTelegramAlert(message: string): Promise<void> {
  const token  = import.meta.env.VITE_TELEGRAM_BOT_TOKEN
  const chatId = import.meta.env.VITE_TELEGRAM_CHAT_ID
  if (!token || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    })
  } catch { /* silent */ }
}

export function buildSignalMessage(sig: CoinSignal): string {
  const e = sig.signal === 'BUY' ? '🟢' : '🔴'
  return `${e} <b>${sig.signal} ${sig.coin}</b>
💰 Entry: $${sig.entryPrice.toFixed(2)} (${sig.entryType})
🎯 Ideal FVG: $${sig.idealEntry.toFixed(2)}
🛑 Stop: $${sig.stopLoss.toFixed(2)}
✅ TP1: $${sig.tp1.toFixed(2)} | TP3: $${sig.tp3.toFixed(2)}
📊 Score: ${sig.overallScore}/100 | Conf: ${sig.confidence}%
📐 R/R: 1:${sig.rrRatio} | RSI: ${sig.rsi}
⏰ ${new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai' })} GST`
}
