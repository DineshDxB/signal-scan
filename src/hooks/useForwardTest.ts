import { useState, useEffect, useCallback } from 'react'
import type { Trade, CoinProfile, LiveStrategyParams, GhostTrade } from '../types'
import { getAllTrades, getCoinProfiles, getGhostTrades, getSignalLog } from '../lib/db'
import { supabase } from '../lib/db'
import { computeLiveParams, computeCoinProfile } from '../lib/strategy'
import { FORWARD_TEST_DAYS } from '../config'

interface ForwardTestState {
  loading: boolean
  dayNumber: number
  totalDays: number
  startDate: string | null
  trades: Trade[]
  signalCount: number
  coinProfiles: Record<string, CoinProfile>
  liveParams: LiveStrategyParams | null
  ghostTrades: GhostTrade[]
  equityCurve: number[]
  isComplete: boolean
}

const BASE = { rsiCeil:68,rsiFloor:50,slPct:5.0,volMin:1.8,adxMin:22,minConf:70,version:1,changes:[],source:'base' as const }

export function useForwardTest(initialCapital: number) {
  const [state, setState] = useState<ForwardTestState>({
    loading:true, dayNumber:0, totalDays:FORWARD_TEST_DAYS,
    startDate:null, trades:[], signalCount:0, coinProfiles:{},
    liveParams:null, ghostTrades:[], equityCurve:[initialCapital], isComplete:false
  })

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, loading:true }))
    try {
      const [trades, coinProfilesArr, ghostTrades, signalLog] = await Promise.all([
        getAllTrades(), getCoinProfiles(), getGhostTrades(), getSignalLog(90)
      ])

      // Get or create forward test start date
      let startDate: string | null = null
      const { data: ftRows } = await supabase
        .from('forward_test_config').select('start_date').limit(1)
      
      if (ftRows && ftRows.length > 0) {
        startDate = ftRows[0].start_date
      } else {
        // Use oldest signal_log entry as start date
        const { data: oldest } = await supabase
          .from('signal_log').select('signal_time')
          .order('signal_time', { ascending: true }).limit(1)
        
        const sd = oldest && oldest.length > 0 
          ? oldest[0].signal_time 
          : new Date().toISOString()
        
        await supabase.from('forward_test_config').insert({ start_date: sd, target_days: 60 })
        startDate = sd
      }

      const start  = new Date(startDate!)
      const dayNum = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000))

      const liveParams = computeLiveParams(trades)
      const profiles: Record<string, CoinProfile> = {}
      for (const ap of coinProfilesArr) profiles[ap.coin] = ap
      const coins = [...new Set(trades.map(t => t.coin))]
      for (const coin of coins) {
        if (!profiles[coin]) { const p = computeCoinProfile(trades, coin); if (p) profiles[coin] = p }
      }

      const closed = trades.filter(t => t.outcome !== 'OPEN' && t.pnl != null)
        .sort((a,b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime())
      let eq = initialCapital
      const curve = [initialCapital]
      for (const t of closed) { eq += t.pnl || 0; curve.push(eq) }

      setState({
        loading:false, dayNumber:dayNum, totalDays:FORWARD_TEST_DAYS,
        startDate:start.toISOString(), trades, signalCount:signalLog.length,
        coinProfiles:profiles, liveParams, ghostTrades, equityCurve:curve,
        isComplete: dayNum >= FORWARD_TEST_DAYS
      })
    } catch(err) {
      console.error('useForwardTest:', err)
      setState(s => ({ ...s, loading:false, liveParams:BASE }))
    }
  }, [initialCapital])

  useEffect(() => { refresh() }, [refresh])

  const trades   = state.trades
  const closed   = trades.filter(t => t.outcome !== 'OPEN')
  const wins     = closed.filter(t => t.outcome?.startsWith('TP'))
  const losses   = closed.filter(t => t.outcome === 'SL')
  const open     = trades.filter(t => t.outcome === 'OPEN')
  const totalPnl = closed.reduce((s,t) => s+(t.pnl||0), 0)
  const winRate  = closed.length ? Math.round(wins.length/closed.length*100) : 0
  const avgWin   = wins.length   ? wins.reduce((s,t)=>s+(t.pnl||0),0)/wins.length   : 0
  const avgLoss  = losses.length ? losses.reduce((s,t)=>s+(t.pnl||0),0)/losses.length : 0
  const pf       = losses.length && Math.abs(avgLoss) > 0
    ? parseFloat((Math.abs(wins.reduce((s,t)=>s+(t.pnl||0),0)) / Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0))).toFixed(2))
    : wins.length > 0 ? 99 : 0

  return { ...state, refresh, closed, wins, losses, open, totalPnl, winRate, avgWin, avgLoss, pf }
}
