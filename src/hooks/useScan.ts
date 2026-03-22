import { useState, useCallback } from 'react'
import type { CoinSignal, Settings } from '../types'
import { analyzeCoin, sendTelegramAlert, buildSignalMessage } from '../lib/claude'
import { getOpenTrades, getCoinProfiles, saveScanHistory, logSignal } from '../lib/db'
import { COINS } from '../config'

interface ScanState {
  scanning: boolean
  progress: number
  currentCoin: string
  signals: CoinSignal[]
  lastScanTime: string | null
  error: string | null
}

export function useScan(settings: Settings) {
  const [state, setState] = useState<ScanState>({
    scanning: false, progress: 0, currentCoin: '',
    signals: [], lastScanTime: null, error: null
  })

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
