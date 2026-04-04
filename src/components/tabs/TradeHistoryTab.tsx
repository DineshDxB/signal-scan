import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/db'
import { CoinBadge } from '../ui'

interface SignalEntry {
  id: string
  coin: string
  signal_type: string
  entry_price: number
  stop_loss: number
  tp1: number; tp2: number; tp3: number
  confidence: number
  regime: string
  rsi_at_entry: number
  volume_ratio: number
  adx: number
  gst_hour: number
  outcome: string | null
  exit_price: number | null
  pnl: number | null
  hold_days: number | null
  signal_time: string
  closed_at: string | null
}

export default function TradeHistoryTab() {
  const [signals, setSignals] = useState<SignalEntry[]>([])
  const [filter,  setFilter]  = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [logForm, setLogForm] = useState<{ id: string; exit: string; outcome: string } | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('signal_log')
      .select('*')
      .order('signal_time', { ascending: false })
      .limit(200)
    setSignals((data || []) as SignalEntry[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const FILTERS = ['ALL','BUY','SELL','WAIT','SOL','BTC','ETH','LINK','BNB','XRP','AVAX','DOT','WINS','LOSSES','OPEN']
  const filtered = signals.filter(s => {
    if (filter === 'ALL')    return true
    if (filter === 'WINS')   return s.outcome === 'TP1' || s.outcome === 'TP2' || s.outcome === 'TP3'
    if (filter === 'LOSSES') return s.outcome === 'SL'
    if (filter === 'OPEN')   return s.signal_type !== 'WAIT' && !s.outcome
    if (filter === 'BUY')    return s.signal_type === 'BUY'
    if (filter === 'SELL')   return s.signal_type === 'SELL'
    if (filter === 'WAIT')   return s.signal_type === 'WAIT'
    return s.coin === filter
  })

  // Stats
  const actionable = filtered.filter(s => s.signal_type !== 'WAIT')
  const closed = actionable.filter(s => s.outcome)
  const wins = closed.filter(s => s.outcome?.startsWith('TP'))
  const totalPnl = closed.reduce((sum, s) => sum + (s.pnl || 0), 0)
  const wr = closed.length ? Math.round(wins.length / closed.length * 100) : 0

  async function saveOutcome() {
    if (!logForm) return
    const ep   = parseFloat(logForm.exit)
    const sig  = signals.find(s => s.id === logForm.id)
    if (!sig) return
    const pnl  = sig.signal_type === 'SELL'
      ? (sig.entry_price - ep) / sig.entry_price * 100
      : (ep - sig.entry_price) / sig.entry_price * 100
    const holdDays = Math.floor((Date.now() - new Date(sig.signal_time).getTime()) / 86400000)

    await supabase.from('signal_log').update({
      outcome: logForm.outcome,
      exit_price: ep,
      pnl: parseFloat(pnl.toFixed(2)),
      hold_days: holdDays,
      closed_at: new Date().toISOString()
    }).eq('id', logForm.id)

    setLogForm(null)
    load()
  }

  function signalCol(s: string) {
    return s === 'BUY' ? '#00ff88' : s === 'SELL' ? '#ff3355' : '#555'
  }

  function outcomeCol(o: string | null) {
    if (!o) return '#00aaff'
    if (o.startsWith('TP')) return '#00ff88'
    if (o === 'SL') return '#ff3355'
    return '#555'
  }

  function outcomeTxt(o: string | null, sig: string) {
    if (!o && sig !== 'WAIT') return 'OPEN'
    if (!o) return 'WAIT'
    return o
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontSize: 10, fontFamily: 'monospace', padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${filter === f ? '#00ff88' : '#ffffff08'}`,
            background: filter === f ? '#00ff8822' : 'transparent',
            color: filter === f ? '#00ff88' : '#555'
          }}>{f}</button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
        {[
          ['Total',    filtered.length,                           '#aaa'],
          ['Win rate', closed.length ? `${wr}%` : '—',           wr >= 50 ? '#00ff88' : '#ff3355'],
          ['P&L',      `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}`, totalPnl >= 0 ? '#00ff88' : '#ff3355'],
          ['Closed',   closed.length,                             '#ffcc00'],
        ].map(([l, v, c]) => (
          <div key={l as string} style={{ padding: 10, borderRadius: 8, background: '#0a0a1a', border: '1px solid #ffffff08', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: c as string }}>{v}</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#444', marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Log outcome modal */}
      {logForm && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0d0d20', border: '1px solid #00ff8833', borderRadius: 12, padding: 24, width: 320 }}>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#00ff88', letterSpacing: 2, marginBottom: 16 }}>LOG OUTCOME</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555', marginBottom: 4 }}>Exit Price</div>
              <input type="number" value={logForm.exit}
                onChange={e => setLogForm(f => f ? { ...f, exit: e.target.value } : null)}
                style={{ width: '100%', padding: '8px 10px', background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, color: '#fff', fontFamily: 'monospace', fontSize: 13 }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555', marginBottom: 6 }}>Outcome</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {['TP1','TP2','TP3','SL'].map(o => (
                  <button key={o} onClick={() => setLogForm(f => f ? { ...f, outcome: o } : null)} style={{
                    padding: 6, fontFamily: 'monospace', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 6,
                    background: logForm.outcome === o ? (o === 'SL' ? '#ff335522' : '#00ff8822') : 'transparent',
                    border: `1px solid ${logForm.outcome === o ? (o === 'SL' ? '#ff3355' : '#00ff88') : '#333'}`,
                    color: logForm.outcome === o ? (o === 'SL' ? '#ff3355' : '#00ff88') : '#555'
                  }}>{o}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setLogForm(null)} style={{ flex: 1, padding: 8, fontFamily: 'monospace', fontSize: 11, cursor: 'pointer', borderRadius: 6, background: 'transparent', border: '1px solid #333', color: '#555' }}>Cancel</button>
              <button onClick={saveOutcome} style={{ flex: 2, padding: 8, fontFamily: 'monospace', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 6, background: '#00ff8822', border: '1px solid #00ff88', color: '#00ff88' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 40, fontSize: 11, fontFamily: 'monospace', color: '#333' }}>Loading...</div>}

      {/* Signal list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 40, fontSize: 12, fontFamily: 'monospace', color: '#333' }}>No signals found</div>
        )}
        {filtered.map(s => {
          const isOpen     = s.signal_type !== 'WAIT' && !s.outcome
          const isWait     = s.signal_type === 'WAIT'
          const borderCol  = s.signal_type === 'BUY' ? '#00ff88' : s.signal_type === 'SELL' ? '#ff3355' : '#333'

          return (
            <div key={s.id} style={{ borderRadius: 8, border: `1px solid ${borderCol}22`, background: '#0a0a1a', padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <CoinBadge coin={s.coin} size={14} />

                {/* Signal type */}
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: signalCol(s.signal_type), background: `${signalCol(s.signal_type)}22`, padding: '2px 8px', borderRadius: 4 }}>
                  {s.signal_type}
                </span>

                {/* Date + time */}
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555' }}>
                  {new Date(s.signal_time).toLocaleDateString('en-AE', { timeZone: 'Asia/Dubai', month: 'short', day: 'numeric' })}
                  {' · '}{String(s.gst_hour || 0).padStart(2,'0')}:00 GST
                </span>

                {/* Confidence */}
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: s.confidence >= 70 ? '#00ff88' : '#ffcc00' }}>
                  {s.confidence}/100
                </span>

                {/* Key levels */}
                {!isWait && (
                  <div style={{ display: 'flex', gap: 10, fontSize: 10, fontFamily: 'monospace' }}>
                    <span style={{ color: '#555' }}>@ <span style={{ color: '#fff' }}>${Number(s.entry_price).toFixed(2)}</span></span>
                    <span style={{ color: '#555' }}>SL <span style={{ color: '#ff3355' }}>${Number(s.stop_loss).toFixed(2)}</span></span>
                    <span style={{ color: '#555' }}>TP1 <span style={{ color: '#00cc66' }}>${Number(s.tp1).toFixed(2)}</span></span>
                    <span style={{ color: '#555' }}>TP3 <span style={{ color: '#00ffaa' }}>${Number(s.tp3).toFixed(2)}</span></span>
                  </div>
                )}

                {/* Indicators */}
                <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#444' }}>
                  RSI {Number(s.rsi_at_entry).toFixed(1)} · Vol {Number(s.volume_ratio).toFixed(1)}x · ADX {Number(s.adx).toFixed(1)}
                </span>

                {/* Outcome + P&L */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${outcomeCol(s.outcome)}22`, color: outcomeCol(s.outcome) }}>
                    {outcomeTxt(s.outcome, s.signal_type)}
                  </span>
                  {s.pnl != null && (
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: s.pnl >= 0 ? '#00ff88' : '#ff3355' }}>
                      {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(1)}%
                    </span>
                  )}
                  {isOpen && (
                    <button
                      onClick={() => setLogForm({ id: s.id, exit: String(s.entry_price), outcome: 'TP1' })}
                      style={{ fontSize: 9, fontFamily: 'monospace', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', background: '#00ff8811', border: '1px solid #00ff8833', color: '#00ff88' }}
                    >LOG RESULT</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
