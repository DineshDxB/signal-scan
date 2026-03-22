import { useState, useEffect, useCallback } from 'react'
import type { Trade, CoinProfile, LiveStrategyParams, GhostTrade } from '../types'
import { getAllTrades, getCoinProfiles, getForwardTestStartDate, initForwardTest, getGhostTrades } from '../lib/db'
import { computeLiveParams, computeCoinProfile } from '../lib/strategy'
import { FORWARD_TEST_DAYS } from '../config'

interface ForwardTestState {
  loading: boolean
  dayNumber: number
  totalDays: number
  startDate: string | null
  trades: Trade[]
  coinProfiles: Record<string, CoinProfile>
  liveParams: LiveStrategyParams | null
  ghostTrades: GhostTrade[]
  equityCurve: number[]
  isComplete: boolean
}

const BASE_PARAMS_FALLBACK = {
  rsiCeil: 68, rsiFloor: 50, slPct: 5.0, volMin: 1.8, adxMin: 22,
  minConf: 70, version: 1, changes: [], source: 'base' as const
}

export function useForwardTest(initialCapital: number) {
  const [state, setState] = useState<ForwardTestState>({
    loading: true, dayNumber: 0, totalDays: FORWARD_TEST_DAYS,
    startDate: null, trades: [], coinProfiles: {}, liveParams: null,
    ghostTrades: [], equityCurve: [initialCapital], isComplete: false
  })

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, loading: true }))
    try {
      const [trades, coinProfilesArr, startDate, ghostTrades] = await Promise.all([
        getAllTrades(),
        getCoinProfiles(),
        getForwardTestStartDate(),
        getGhostTrades()
      ])

      // Init forward test if not started
      if (!startDate) await initForwardTest()

      const start   = startDate ? new Date(startDate) : new Date()
      const dayNum  = Math.floor((Date.now() - start.getTime()) / 86400000)
      const isComplete = dayNum >= FORWARD_TEST_DAYS

      // Compute live strategy params from all trade data
      const liveParams = computeLiveParams(trades)

      // Compute per-coin profiles
      const profiles: Record<string, CoinProfile> = {}
      for (const ap of coinProfilesArr) {
        profiles[ap.coin] = ap
      }
      // Also compute from raw trade data for coins without saved profile
      const coins = [...new Set(trades.map(t => t.coin))]
      for (const coin of coins) {
        if (!profiles[coin]) {
          const p = computeCoinProfile(trades, coin)
          if (p) profiles[coin] = p
        }
      }

      // Build equity curve
      const closed  = trades.filter(t => t.outcome !== 'OPEN' && t.pnl != null)
        .sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime())
      let eq = initialCapital
      const curve = [initialCapital]
      for (const t of closed) {
        eq += t.pnl || 0
        curve.push(eq)
      }

      setState({
        loading: false, dayNumber: dayNum, totalDays: FORWARD_TEST_DAYS,
        startDate: start.toISOString(), trades, coinProfiles: profiles,
        liveParams, ghostTrades, equityCurve: curve, isComplete
      })
    } catch (err) {
      console.error('useForwardTest:', err)
      setState(s => ({ ...s, loading: false, liveParams: BASE_PARAMS_FALLBACK }))
    }
  }, [initialCapital])

  useEffect(() => { refresh() }, [refresh])

  // Computed stats
  const trades   = state.trades
  const closed   = trades.filter(t => t.outcome !== 'OPEN')
  const wins     = closed.filter(t => t.outcome?.startsWith('TP'))
  const losses   = closed.filter(t => t.outcome === 'SL')
  const open     = trades.filter(t => t.outcome === 'OPEN')
  const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0)
  const winRate  = closed.length ? Math.round(wins.length / closed.length * 100) : 0
  const avgWin   = wins.length   ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length   : 0
  const avgLoss  = losses.length ? losses.reduce((s, t) => s + (t.pnl || 0), 0) / losses.length : 0
  const pf       = losses.length && Math.abs(avgLoss) > 0
    ? parseFloat((Math.abs(wins.reduce((s,t)=>s+(t.pnl||0),0)) / Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0))).toFixed(2))
    : wins.length > 0 ? 99 : 0

  return {
    ...state, refresh,
    closed, wins, losses, open,
    totalPnl, winRate, avgWin, avgLoss, pf
  }
}
