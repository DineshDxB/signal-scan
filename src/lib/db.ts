// ── DATABASE ABSTRACTION LAYER ────────────────────────────────
// This is the ONLY file that knows about Supabase.
// To switch databases, rewrite only this file.

import { createClient } from '@supabase/supabase-js'
import type {
  Trade, OpenTrade, CoinProfile, LiveStrategyParams,
  Settings, ScanHistory, GhostTrade, StrategyChange
} from '../types'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
)

// ── SETTINGS ─────────────────────────────────────────────────
export async function getSettings(): Promise<Settings> {
  const { data } = await supabase.from('settings').select('*').limit(1).single()
  return data || { wallet: 5000, riskPercent: 2, maxOpenTrades: 3, telegramEnabled: false, timezone: 'Asia/Dubai' }
}

export async function saveSettings(s: Partial<Settings>) {
  const existing = await supabase.from('settings').select('id').limit(1).single()
  if (existing.data?.id) {
    await supabase.from('settings').update(s).eq('id', existing.data.id)
  } else {
    await supabase.from('settings').insert(s)
  }
}

// ── TRADES ────────────────────────────────────────────────────
export async function saveTrade(trade: Partial<Trade>): Promise<string | null> {
  const { data, error } = await supabase.from('trades').insert({
    ...trade,
    opened_at: new Date().toISOString()
  }).select('id').single()
  if (error) { console.error('saveTrade:', error); return null }
  return data?.id
}

export async function getClosedTrades(limit = 200): Promise<Trade[]> {
  const { data } = await supabase
    .from('trades')
    .select('*')
    .neq('outcome', 'OPEN')
    .order('opened_at', { ascending: false })
    .limit(limit)
  return data || []
}

export async function getAllTrades(limit = 500): Promise<Trade[]> {
  const { data } = await supabase
    .from('trades')
    .select('*')
    .order('opened_at', { ascending: false })
    .limit(limit)
  return data || []
}

export async function updateTradeOutcome(
  id: string,
  outcome: string,
  exitPrice: number,
  pnl: number,
  tp1Hit: boolean,
  tp2Hit: boolean,
  tp3Hit: boolean,
  slHit: boolean,
  holdDays: number
) {
  await supabase.from('trades').update({
    outcome, exit_price: exitPrice, pnl,
    tp1_hit: tp1Hit, tp2_hit: tp2Hit, tp3_hit: tp3Hit, sl_hit: slHit,
    hold_days: holdDays, closed_at: new Date().toISOString()
  }).eq('id', id)
}

// ── OPEN TRADES ───────────────────────────────────────────────
export async function getOpenTrades(): Promise<OpenTrade[]> {
  const { data } = await supabase
    .from('open_trades')
    .select('*')
    .order('opened_at', { ascending: false })
  return (data || []).map(t => ({
    ...t,
    currentPrice: t.current_price || t.entry_price,
    unrealisedPnl: t.unrealised_pnl || 0,
    hoursOpen: t.hours_open || 0,
    slMoved: t.sl_moved || false,
    slCurrentLevel: t.sl_current_level || t.stop_loss,
  }))
}

export async function saveOpenTrade(trade: Partial<OpenTrade>): Promise<string | null> {
  const { data, error } = await supabase.from('open_trades').insert({
    coin: trade.coin,
    signal: trade.signal,
    entry_type: trade.entryType,
    regime: trade.regime,
    entry_price: trade.entryPrice,
    ideal_entry: trade.idealEntry,
    stop_loss: trade.stopLoss,
    sl_current_level: trade.stopLoss,
    tp1: trade.tp1,
    tp2: trade.tp2,
    tp3: trade.tp3,
    confidence: trade.confidence,
    position_size: trade.positionSize,
    risk_amount: trade.riskAmount,
    gst_hour: trade.gstHour,
    tp1_hit: false, tp2_hit: false, tp3_hit: false,
    opened_at: new Date().toISOString()
  }).select('id').single()
  if (error) { console.error('saveOpenTrade:', error); return null }
  return data?.id
}

export async function closeOpenTrade(id: string, outcome: string, exitPrice: number, pnl: number) {
  await supabase.from('open_trades').delete().eq('id', id)
  // Also update the trade log
  await supabase.from('trades').update({
    outcome, exit_price: exitPrice, pnl,
    closed_at: new Date().toISOString()
  }).eq('open_trade_ref', id)
}

export async function updateOpenTradePrice(id: string, currentPrice: number, unrealisedPnl: number, hoursOpen: number) {
  await supabase.from('open_trades').update({
    current_price: currentPrice,
    unrealised_pnl: unrealisedPnl,
    hours_open: hoursOpen
  }).eq('id', id)
}

export async function moveSL(id: string, newSL: number) {
  await supabase.from('open_trades').update({
    sl_current_level: newSL,
    sl_moved: true
  }).eq('id', id)
}

// ── COIN PROFILES ─────────────────────────────────────────────
export async function getCoinProfiles(): Promise<CoinProfile[]> {
  const { data } = await supabase.from('coin_profiles').select('*')
  return data || []
}

export async function saveCoinProfile(profile: CoinProfile) {
  const existing = await supabase.from('coin_profiles').select('id').eq('coin', profile.coin).single()
  if (existing.data?.id) {
    await supabase.from('coin_profiles').update({
      ...profile, updated_at: new Date().toISOString()
    }).eq('id', existing.data.id)
  } else {
    await supabase.from('coin_profiles').insert({
      ...profile, updated_at: new Date().toISOString()
    })
  }
}

// ── STRATEGY PARAMS ───────────────────────────────────────────
export async function getLiveStrategyParams(): Promise<LiveStrategyParams | null> {
  const { data } = await supabase.from('strategy_params').select('*').order('created_at', { ascending: false }).limit(1).single()
  return data
}

export async function saveStrategyParams(params: LiveStrategyParams) {
  await supabase.from('strategy_params').insert({
    ...params,
    changes: JSON.stringify(params.changes),
    created_at: new Date().toISOString()
  })
}

// ── SIGNAL LOG (for 60-day forward test) ─────────────────────
export async function logSignal(signal: {
  coin: string
  signalType: string
  entryPrice: number
  idealEntry: number
  stopLoss: number
  tp1: number; tp2: number; tp3: number
  confidence: number
  entryType: string
  regime: string
  rsiAtEntry: number
  volumeRatio: number
  adx: number
  gstHour: number
  layerScores: object
  strategyVersion: number
}) {
  await supabase.from('signal_log').insert({
    ...signal,
    layer_scores: JSON.stringify(signal.layerScores),
    signal_time: new Date().toISOString()
  })
}

export async function getSignalLog(days = 60) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  const { data } = await supabase
    .from('signal_log')
    .select('*')
    .gte('signal_time', cutoff)
    .order('signal_time', { ascending: false })
  return data || []
}

export async function updateSignalOutcome(
  id: string,
  outcome: string,
  exitPrice: number,
  pnl: number,
  holdDays: number
) {
  await supabase.from('signal_log').update({
    outcome, exit_price: exitPrice, pnl, hold_days: holdDays,
    closed_at: new Date().toISOString()
  }).eq('id', id)
}

// ── GHOST TRADES (what-if engine) ─────────────────────────────
export async function getGhostTrades(): Promise<GhostTrade[]> {
  const { data } = await supabase
    .from('ghost_trades')
    .select('*')
    .order('date', { ascending: false })
    .limit(50)
  return data || []
}

export async function saveGhostTrade(ghost: Partial<GhostTrade>) {
  await supabase.from('ghost_trades').insert({
    ...ghost, created_at: new Date().toISOString()
  })
}

// ── SCAN HISTORY ─────────────────────────────────────────────
export async function saveScanHistory(scan: Partial<ScanHistory>) {
  await supabase.from('scan_history').insert({
    ...scan, created_at: new Date().toISOString()
  })
}

export async function getRecentScans(limit = 20): Promise<ScanHistory[]> {
  const { data } = await supabase
    .from('scan_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

// ── PRICE LOGS ────────────────────────────────────────────────
export async function logPrice(coin: string, price: number, signalId?: string) {
  await supabase.from('price_logs').insert({
    coin, price, signal_id: signalId,
    logged_at: new Date().toISOString()
  })
}

// ── FORWARD TEST STATS ────────────────────────────────────────
export async function getForwardTestStartDate(): Promise<string | null> {
  const { data } = await supabase.from('forward_test_config').select('start_date').single()
  return data?.start_date || null
}

export async function initForwardTest() {
  const existing = await supabase.from('forward_test_config').select('id').single()
  if (!existing.data?.id) {
    await supabase.from('forward_test_config').insert({
      start_date: new Date().toISOString(),
      target_days: 60
    })
  }
}

export { supabase }
