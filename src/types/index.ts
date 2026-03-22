export type SignalType = 'BUY' | 'SELL' | 'WAIT'
export type OutcomeType = 'TP1' | 'TP2' | 'TP3' | 'SL' | 'TIME' | 'OPEN' | 'MANUAL'
export type EntryType = 'FVG' | 'PULLBACK' | 'BREAKOUT'
export type RegimeType = 'trending_bull' | 'trending_bear' | 'ranging' | 'high_volatility'

export interface LayerScores {
  stage: number      // Layer 1 — Weinstein Stage Analysis 30%
  trend: number      // Layer 2 — Multi-TF Trend 25%
  setup: number      // Layer 3 — Minervini VCP 20%
  momentum: number   // Layer 4 — Momentum 15%
  risk: number       // Layer 5 — Risk Gate 10%
}

export interface FVGZone {
  top: number
  bottom: number
  midpoint: number
  barIndex: number
  type: 'bull' | 'bear'
  sizePercent: number
}

export interface BOSLevel {
  price: number
  direction: 'bullish' | 'bearish'
  timestamp: string
}

export interface CoinSignal {
  coin: string
  symbol: string           // e.g. SOLUSDT
  signal: SignalType
  confidence: number       // 0-100
  overallScore: number     // 0-100
  layerScores: LayerScores
  layersPassed: number
  hardGatesFailed: string[]
  entryType: EntryType
  regime: RegimeType

  // Price levels
  currentPrice: number
  entryPrice: number       // recommended entry
  idealEntry: number       // FVG midpoint if available
  stopLoss: number
  tp1: number
  tp2: number
  tp3: number
  invalidationPrice: number
  rrRatio: number

  // FVG / BOS
  fvgZone: FVGZone | null
  bosLevel: BOSLevel | null
  entryNotes: string       // explains why this specific entry price

  // Context
  rsi: number
  volumeRatio: number
  adx: number
  fundingRate: number
  fearGreed: number
  fearGreedTrend: 'IMPROVING' | 'DETERIORATING' | 'STABLE'
  btcDominance: number

  // Sizing
  positionSize: number     // capital to deploy
  riskAmount: number       // max loss in $

  // Timing
  scanTime: string
  gstHour: number
  setupAge: number         // days this setup has been coiling

  // Raw analysis from Claude
  analysis: string
  newsOk: boolean
  newsNote: string
}

export interface Trade {
  id?: string
  coin: string
  signal: SignalType
  entryType: EntryType
  regime: RegimeType
  entryPrice: number
  idealEntry: number
  stopLoss: number
  tp1: number
  tp2: number
  tp3: number
  confidence: number
  overallScore: number
  layerScores: LayerScores
  rsiAtEntry: number
  volumeRatio: number
  adx: number
  positionSize: number
  riskAmount: number
  gstHour: number
  outcome: OutcomeType
  exitPrice?: number
  pnl?: number
  holdDays?: number
  tp1Hit: boolean
  tp2Hit: boolean
  tp3Hit: boolean
  slHit: boolean
  notes?: string
  openedAt: string
  closedAt?: string
}

export interface OpenTrade extends Trade {
  id: string
  currentPrice: number
  unrealisedPnl: number
  hoursOpen: number
  slMoved: boolean
  slCurrentLevel: number
}

export interface CoinProfile {
  coin: string
  trades: number
  wins: number
  winRate: number
  avgWinPct: number
  avgLossPct: number
  learnedRsiCeil: number
  learnedRsiFloor: number
  learnedSlPct: number
  learnedVolMin: number
  bestEntry: EntryType
  bestHour: number | null
  fvgWinRate: number | null
  pullbackWinRate: number | null
  breakoutWinRate: number | null
  notes: string
  updatedAt: string
}

export interface LiveStrategyParams {
  rsiCeil: number
  rsiFloor: number
  slPct: number
  volMin: number
  adxMin: number
  minConf: number
  version: number
  changes: StrategyChange[]
  source: 'base' | 'learned'
}

export interface StrategyChange {
  param: string
  from: number | string
  to: number | string
  reason: string
  impact: string
  appliedAt: string
}

export interface GhostTrade {
  id: string
  coin: string
  date: string
  theoreticalEntry: number
  move48h: number
  wouldHaveWon: boolean
  blockingRule: string
}

export interface ForwardTestStats {
  dayNumber: number
  totalSignals: number
  closedTrades: number
  wins: number
  losses: number
  winRate: number
  profitFactor: number
  totalPnl: number
  avgWin: number
  avgLoss: number
  equityCurve: number[]
  strategyVersion: number
}

export interface Settings {
  wallet: number
  riskPercent: number
  maxOpenTrades: number
  telegramEnabled: boolean
  timezone: string
}

export interface ScanHistory {
  id: string
  coins: string[]
  signalsFound: number
  regime: RegimeType
  scanTime: string
  duration: number
}
