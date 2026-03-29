import { useState, useCallback, useEffect } from 'react'
import type { CoinSignal, Settings } from '../types'
import { analyzeCoin, sendTelegramAlert, buildSignalMessage } from '../lib/claude'
import { getOpenTrades, getCoinProfiles, saveScanHistory, logSignal, getSignalLog } from '../lib/db'
import { COINS } from '../config'

interface ScanState {
  scanning: boolean
  progress: number
  currentCoin: string
  signals: CoinSignal[]
  lastScanTime: string | null
  error: string | null
}

// Convert DB signal log row to CoinSignal shape for display
function dbRowToSignal(row: Record<string, unknown>): CoinSignal {
  const price = (row.entry_price as number) || 0
  return {
    coin: row.coin as string,
    symbol: `${row.coin}USDT`,
    signal: row.signal_type as 'BUY' | 'SELL' | 'WAIT',
    confidence: (row.confidence as number) || 0,
    overallScore: (row.confidence as number) || 0,
    layerScores: { stage: 0, trend: 0, setup: 0, momentum: 0, risk: 0 },
    layersPassed: 0,
    hardGatesFailed: [],
    entryType: 'BREAKOUT',
    regime: (row.regime as 'trending_bull' | 'ranging') || 'ranging',
    currentPrice: price,
    entryPrice: price,
    idealEntry: (row.ideal_entry as number) || price,
    stopLoss: (row.stop_loss as number) || price * 0.935,
    tp1: (row.tp1 as number) || price * 1.08,
    tp2: (row.tp2 as number) || price * 1.16,
    tp3: (row.tp3 as number) || price * 1.26,
    invalidationPrice: ((row.stop_loss as number) || price * 0.935) * 0.99,
    rrRatio: 3,
    fvgZone: null,
    bosLevel: null,
    entryNotes: 'Loaded from background scan',
    rsi: (row.rsi_at_entry as number) || 50,
    volumeRatio: (row.volume_ratio as number) || 1,
    adx: (row.adx as number) || 0,
    fundingRate: 0,
    fearGreed: 50,
    fearGreedTrend: 'STABLE',
    btcDominance: 50,
    positionSize: 0,
    riskAmount: 0,
    scanTime: (row.signal_time as string) || new Date().toISOString(),
    gstHour: (row.gst_hour as number) || 0,
    setupAge: 0,
    analysis: `Background scan result. Score: ${row.confidence}/100`,
    newsOk: true,
    newsNote: ''
  }
}

export function useScan(settings: Settings) {
  const [state, setState] = useState<ScanState>({
    scanning: false, progress: 0, currentCoin: '',
    signals: [], lastScanTime: null, error: null
  })

  // Load latest scan results from DB on mount
  useEffect(() => {
    async function loadLatestScan() {
      try {
        const rows = await getSignalLog(1) // last 24 hours
        if (rows.length > 0) {
          // Get the most recent scan batch (signals within 30 min of each other)
          const latest = new Date(rows[0].signal_time || rows[0].created_at)
          const cutoff = new Date(latest.getTime() - 30 * 60000)
          const latestBatch = rows.filter(r => {
            const t = new Date(r.signal_time || r.created_at)
            return t >= cutoff
          })
          const signals = latestBatch.map(r => dbRowToSignal(r as Record<string, unknown>))
          signals.sort((a, b) => {
            if (a.signal !== 'WAIT' && b.signal === 'WAIT') return -1
            if (a.signal === 'WAIT' && b.signal !== 'WAIT') return 1
            return b.confidence - a.confidence
          })
          setState(s => ({
            ...s,
            signals,
            lastScanTime: rows[0].signal_time || rows[0].created_at
          }))
        }
      } catch { /* silent */ }
    }
    loadLatestScan()
  }, [])

  const runScan = useCallback(async (phase1Only = false) => {
    setState(s => ({ ...s, scanning: true, progress: 0, error: null }))
    const start = Date.now()

    try {
      const [openTrades, coinProfiles] = await Promise.all([
        getOpenTrades(), getCoinProfiles()
      ])

      const coinsToScan = phase1Only
        ? COINS.filter(c => c.phase === 1)
        : COINS

      const results: CoinSignal[] = []
      let phase1HasSignal = false

      for (let i = 0; i < coinsToScan.length; i++) {
        const coin = coinsToScan[i]

        // Skip phase 2 if phase 1 found a signal
        if (coin.phase === 2 && phase1HasSignal) continue

        setState(s => ({
          ...s,
          progress: Math.round((i / coinsToScan.length) * 100),
          currentCoin: coin.sym
        }))

        const profile = coinProfiles.find(p => p.coin === coin.sym) || null
        const sig = await analyzeCoin(
          coin.sym,
          settings.wallet,
          settings.riskPercent,
          openTrades.length,
          profile
        )

        if (sig) {
          results.push(sig)
          if (coin.phase === 1 && sig.signal !== 'WAIT') phase1HasSignal = true

          // Log every signal to DB for forward test
          await logSignal({
            coin: sig.coin,
            signalType: sig.signal,
            entryPrice: sig.entryPrice,
            idealEntry: sig.idealEntry,
            stopLoss: sig.stopLoss,
            tp1: sig.tp1, tp2: sig.tp2, tp3: sig.tp3,
            confidence: sig.confidence,
            entryType: sig.entryType,
            regime: sig.regime,
            rsiAtEntry: sig.rsi,
            volumeRatio: sig.volumeRatio,
            adx: sig.adx,
            gstHour: sig.gstHour,
            layerScores: sig.layerScores,
            strategyVersion: 1
          })

          // Telegram alert for actionable signals
          if (sig.signal !== 'WAIT' && settings.telegramEnabled) {
            await sendTelegramAlert(buildSignalMessage(sig))
          }
        }
      }

      // Sort: BUY/SELL first by confidence, then WAIT by score
      results.sort((a, b) => {
        if (a.signal !== 'WAIT' && b.signal === 'WAIT') return -1
        if (a.signal === 'WAIT' && b.signal !== 'WAIT') return 1
        return b.confidence - a.confidence
      })

      // Save scan history
      await saveScanHistory({
        coins: coinsToScan.map(c => c.sym),
        signalsFound: results.filter(s => s.signal !== 'WAIT').length,
        regime: results[0]?.regime || 'ranging',
        scanTime: new Date().toISOString(),
        duration: Date.now() - start
      })

      setState(s => ({
        ...s, scanning: false, progress: 100,
        signals: results, currentCoin: '',
        lastScanTime: new Date().toISOString()
      }))
    } catch (err) {
      setState(s => ({
        ...s, scanning: false, error: String(err)
      }))
    }
  }, [settings])

  return { ...state, runScan }
}
