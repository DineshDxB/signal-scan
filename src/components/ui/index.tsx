import React from 'react'

// ── BAR ──────────────────────────────────────────────────────
export function Bar({ value, max = 100, color, height = 6, label, rightLabel }: {
  value: number; max?: number; color: string; height?: number
  label?: string; rightLabel?: string
}) {
  return (
    <div>
      {(label || rightLabel) && (
        <div className="flex justify-between mb-1">
          {label    && <span style={{ color: '#555', fontSize: 11, fontFamily: 'monospace' }}>{label}</span>}
          {rightLabel && <span style={{ color, fontSize: 11, fontFamily: 'monospace' }}>{rightLabel}</span>}
        </div>
      )}
      <div style={{ height, background: '#1a1a2e', borderRadius: 999 }}>
        <div style={{
          height, borderRadius: 999,
          width: `${Math.min(100, Math.max(0, (value / max) * 100))}%`,
          background: color, transition: 'width 0.6s ease'
        }} />
      </div>
    </div>
  )
}

// ── PILL ─────────────────────────────────────────────────────
export function Pill({ outcome }: { outcome: string }) {
  const c = outcome?.startsWith('TP') ? '#00ff88'
    : outcome === 'SL' ? '#ff3355'
    : outcome === 'OPEN' ? '#00aaff'
    : '#555'
  return (
    <span style={{
      fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
      padding: '2px 8px', borderRadius: 4,
      background: `${c}22`, color: c, border: `1px solid ${c}44`
    }}>{outcome}</span>
  )
}

// ── STAT BOX ─────────────────────────────────────────────────
export function StatBox({ label, value, sub, color = '#fff' }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div style={{ background: '#0a0a1a', border: '1px solid #ffffff08', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color }}>{value}</div>
      <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#444', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 9, fontFamily: 'monospace', color: `${color}55` }}>{sub}</div>}
    </div>
  )
}

// ── LAYER SCORE ROW ───────────────────────────────────────────
const LAYER_COLS: Record<string, string> = {
  stage: '#378ADD', trend: '#1D9E75', setup: '#BA7517', momentum: '#7F77DD', risk: '#D4537E'
}

export function LayerRow({ name, score, passed }: { name: string; score: number; passed: boolean }) {
  const col = LAYER_COLS[name] || '#aaa'
  return (
    <div style={{ marginBottom: 6 }}>
      <div className="flex justify-between mb-1">
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: col, textTransform: 'capitalize' }}>{name}</span>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: col }}>{score}</span>
          <span style={{ fontSize: 9, color: passed ? '#00ff88' : '#ff3355' }}>{passed ? '✓' : '✗'}</span>
        </div>
      </div>
      <Bar value={score} color={col} height={4} />
    </div>
  )
}

// ── SECTION HEADER ────────────────────────────────────────────
export function SectionHeader({ title, color = '#444' }: { title: string; color?: string }) {
  return (
    <div style={{ fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, color, marginBottom: 8 }}>
      {title}
    </div>
  )
}

// ── CARD ─────────────────────────────────────────────────────
export function Card({ children, border = '#ffffff08', pad = 12 }: {
  children: React.ReactNode; border?: string; pad?: number
}) {
  return (
    <div style={{ background: '#0a0a1a', border: `1px solid ${border}`, borderRadius: 10, padding: pad }}>
      {children}
    </div>
  )
}

// ── COIN BADGE ────────────────────────────────────────────────
const COIN_COLORS: Record<string, string> = {
  SOL: '#00ff88', BTC: '#ffcc00', ETH: '#7F77DD',
  LINK: '#378ADD', BNB: '#ff9900', XRP: '#00aaff',
  AVAX: '#ff3355', DOT: '#cc44ff'
}

export function CoinBadge({ coin, size = 16 }: { coin: string; size?: number }) {
  return (
    <span style={{
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: size, letterSpacing: 3,
      color: COIN_COLORS[coin] || '#aaa'
    }}>{coin}</span>
  )
}

export { COIN_COLORS }

// ── EQUITY MINI CHART ─────────────────────────────────────────
export function EquityChart({ curve, height = 80 }: { curve: number[]; height?: number }) {
  if (curve.length < 2) return null
  const lo   = Math.min(...curve) * 0.997
  const hi   = Math.max(...curve) * 1.003
  const W    = 500, H = height
  const tx   = (i: number) => 20 + (i / (curve.length - 1)) * (W - 20)
  const ty   = (v: number) => H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 18)
  const pts  = curve.map((v, i) => `${tx(i)},${ty(v)}`).join(' ')
  const last = curve[curve.length - 1]
  const col  = last >= curve[0] ? '#00ff88' : '#ff3355'

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.3" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1={ty(curve[0])} x2={W} y2={ty(curve[0])} stroke="#ffffff08" strokeWidth="1" strokeDasharray="4 4" />
      <polyline points={pts} fill="none" stroke={col} strokeWidth="2" />
      <polygon points={`${pts} ${tx(curve.length - 1)},${H} 20,${H}`} fill="url(#eqg)" />
      {curve.slice(1).map((v, i) => (
        <circle key={i} cx={tx(i + 1)} cy={ty(v)} r="3"
          fill={v > curve[i] ? '#00ff88' : '#ff3355'} />
      ))}
    </svg>
  )
}

// ── FVG BOX INDICATOR ─────────────────────────────────────────
export function FVGBadge({ type }: { type: 'FVG' | 'PULLBACK' | 'BREAKOUT' }) {
  const cfg = {
    FVG:      { bg: '#00aaff22', col: '#00aaff', border: '#00aaff33' },
    PULLBACK: { bg: '#00ff8822', col: '#00ff88', border: '#00ff8833' },
    BREAKOUT: { bg: '#ffcc0022', col: '#ffcc00', border: '#ffcc0033' },
  }[type]
  return (
    <span style={{
      fontSize: 9, fontFamily: 'monospace', padding: '2px 6px',
      borderRadius: 3, background: cfg.bg, color: cfg.col, border: `1px solid ${cfg.border}`
    }}>{type}</span>
  )
}

// ── LOADING SPINNER ───────────────────────────────────────────
export function Spinner({ color = '#00ff88' }: { color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{
        width: 24, height: 24, border: `2px solid ${color}33`,
        borderTopColor: color, borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
