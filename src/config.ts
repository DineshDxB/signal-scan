// ── SIGNAL SCAN CONFIG ────────────────────────────────────────
// Change coin universe, strategy thresholds, timing here only.
// No other file needs to change for these adjustments.

export const COINS = [
  { sym: 'SOL',  name: 'Solana',    phase: 1 },
  { sym: 'BTC',  name: 'Bitcoin',   phase: 1 },
  { sym: 'ETH',  name: 'Ethereum',  phase: 1 },
  { sym: 'BNB',  name: 'BNB',       phase: 1 },
  { sym: 'XRP',  name: 'Ripple',    phase: 1 },
  { sym: 'AVAX', name: 'Avalanche', phase: 2 },
  { sym: 'LINK', name: 'Chainlink', phase: 2 },
  { sym: 'DOT',  name: 'Polkadot',  phase: 2 },
]

// Base strategy parameters (overridden per coin by ML after 10 trades)
export const BASE_PARAMS = {
  rsiCeil:    68,
  rsiFloor:   50,
  rsiHard:    75,   // hard block above this
  slPct:      5.0,
  tp1Pct:     8.0,
  tp2Pct:     16.0,
  tp3Pct:     26.0,
  volMin:     1.8,  // x average volume
  adxMin:     22,
  minConf:    70,   // minimum confidence to signal
  minLayers:  4,    // of 5 layers must pass
  minRR:      3.0,  // minimum risk/reward ratio
  maxHoldDays:20,
  cooldownDays:21,  // min days between signals per coin
  fvgMinPct:  0.3,  // minimum FVG size
  fvgMaxPct:  4.0,  // maximum FVG size
  fvgBars:    20,   // FVG valid for N bars
  swingLookback: 10,// swing high/low detection
}

// SOL needs wider stops due to high volatility
export const COIN_OVERRIDES: Record<string, Partial<typeof BASE_PARAMS>> = {
  SOL:  { slPct: 6.5, tp3Pct: 28.0, volMin: 2.0 },
  LINK: { cooldownDays: 14 }, // LINK coils longer
}

// Layer weights must sum to 1.0
export const LAYER_WEIGHTS = {
  stage:    0.30,
  trend:    0.25,
  setup:    0.20,
  momentum: 0.15,
  risk:     0.10,
}

// Position sizing by confidence
export const CONFIDENCE_MULT: Record<string, number> = {
  HIGH:   1.00,  // 85%+
  MEDIUM: 0.75,  // 75-84%
  LOW:    0.50,  // 70-74%
}

// Regime-specific confidence thresholds
export const REGIME_THRESHOLDS: Record<string, number> = {
  trending_bull:  65,
  ranging:        78,
  trending_bear:  85,
  high_volatility:80,
}

// ML unlock thresholds
export const ML_UNLOCKS = {
  basicStats:       10,
  decisionTree:     20,
  regimeClassifier: 20,
  adaptiveCoin:     20,  // per coin
  patternDetector:  40,
  walkForward:      60,
  autoWeightTuning: 50,
}

// Dubai timezone offset
export const GST_OFFSET = 4  // UTC+4

// Scan schedule (hours UTC)
export const SCAN_HOURS = [0, 4, 8, 12, 16, 20]

// 60-day forward test
export const FORWARD_TEST_DAYS = 60
