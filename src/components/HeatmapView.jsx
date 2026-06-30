import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

function heatColor(value, min, max) {
  // Map value in [min, max] to green (positive) → dark (neutral) → red (negative)
  if (max === min) return 'var(--bg-elevated)'
  const t = (value - min) / (max - min) // 0 = worst, 1 = best
  if (t >= 0.5) {
    // Green side
    const s = (t - 0.5) * 2 // 0→1
    return `rgba(0,200,83,${(0.08 + s * 0.20).toFixed(2)})`
  } else {
    // Red side
    const s = (0.5 - t) * 2 // 1→0
    return `rgba(255,23,68,${(0.08 + s * 0.20).toFixed(2)})`
  }
}

export default function HeatmapView({ assets, positions, storedHistory }) {
  // Merge all trade history per asset
  const assetMetrics = useMemo(() => {
    const all = [...positions.filter(p => p.status !== 'open'), ...storedHistory]
    const ids = new Set()
    const unique = all.filter(t => { if (ids.has(t.id)) return false; ids.add(t.id); return true })

    const map = {}
    assets.forEach(a => {
      const trades = unique.filter(t => t.asset === a.name)
      const wins = trades.filter(t => t.status === 'win').length
      const pnl = trades.reduce((s, t) => s + (t.pnl || 0), 0)
      map[a.name] = {
        ...a,
        trades: trades.length,
        wins,
        winRate: trades.length > 0 ? (wins / trades.length * 100) : null,
        pnl,
      }
    })
    return map
  }, [assets, positions, storedHistory])

  // Compute color range from P&L values
  const { pnlMin, pnlMax, changeMin, changeMax } = useMemo(() => {
    const vals = Object.values(assetMetrics)
    const pnls = vals.map(m => m.pnl).filter(p => p !== 0)
    const changes = vals.map(m => parseFloat(m.change) || 0)
    return {
      pnlMin: pnls.length > 0 ? Math.min(...pnls, 0) : -100,
      pnlMax: pnls.length > 0 ? Math.max(...pnls, 0) : 100,
      changeMin: Math.min(...changes, 0),
      changeMax: Math.max(...changes, 0),
    }
  }, [assetMetrics])

  const entries = Object.values(assetMetrics)

  return (
    <div style={{ gridColumn: '2 / 5', padding: 20, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Heatmap</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {entries.length} assets · colored by P&amp;L
        </span>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 11,
        color: 'var(--text-muted)',
      }}>
        <span>Losing</span>
        <div style={{
          width: 120, height: 8, borderRadius: 4,
          background: 'linear-gradient(90deg, rgba(255,23,68,0.30), rgba(10,11,15,1), rgba(0,200,83,0.30))',
        }} />
        <span>Winning</span>
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 8,
      }}>
        {entries.map(m => {
          const pnlColor = m.pnl > 0 ? 'var(--success)' : m.pnl < 0 ? 'var(--danger)' : 'var(--text-muted)'
          const change = parseFloat(m.change) || 0
          const changeColor = change > 0 ? 'var(--success)' : change < 0 ? 'var(--danger)' : 'var(--text-muted)'

          return (
            <div key={m.name} style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: heatColor(m.pnl, pnlMin, pnlMax),
              border: m.pnl !== 0
                ? `1px solid ${m.pnl > 0 ? 'rgba(0,200,83,0.25)' : 'rgba(255,23,68,0.25)'}`
                : '1px solid var(--border-subtle)',
              display: 'flex', flexDirection: 'column', gap: 6,
              transition: 'all 0.3s',
            }}>
              {/* Header: icon + name + direction */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 5, fontSize: 11, fontWeight: 700,
                  background: (m.color || '#666') + '22', color: m.color || '#888',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>{m.icon || '◆'}</span>
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.name}
                </span>
                {change > 0 ? <TrendingUp size={12} color="var(--success)" /> :
                 change < 0 ? <TrendingDown size={12} color="var(--danger)" /> :
                 <Minus size={12} color="var(--text-muted)" />}
              </div>

              {/* Price + change */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                  {m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: changeColor, fontVariantNumeric: 'tabular-nums' }}>
                  {change >= 0 ? '+' : ''}{m.change}%
                </span>
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                <span>Payout {m.payout}%</span>
                {m.trades > 0 && (
                  <span>{m.trades}t</span>
                )}
                {m.winRate !== null && (
                  <span style={{ color: m.winRate >= 55 ? 'var(--success)' : m.winRate >= 45 ? 'var(--text-muted)' : 'var(--danger)' }}>
                    {m.winRate.toFixed(0)}%
                  </span>
                )}
              </div>

              {/* P&L bar */}
              {m.pnl !== 0 && (
                <div style={{ marginTop: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)' }}>P&amp;L</span>
                    <span style={{ fontWeight: 700, color: pnlColor, fontVariantNumeric: 'tabular-nums' }}>
                      {m.pnl >= 0 ? '+' : ''}${m.pnl.toFixed(2)}
                    </span>
                  </div>
                  <div style={{
                    height: 3, borderRadius: 2, marginTop: 3,
                    background: 'var(--bg-input)', overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${Math.min(100, Math.abs(m.pnl) / (pnlMax || 1) * 100)}%`,
                      height: '100%', borderRadius: 2,
                      background: m.pnl > 0 ? 'var(--success)' : 'var(--danger)',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* No trades yet hint */}
      {entries.every(m => m.trades === 0) && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 40 }}>
          Place some trades to see asset performance heatmap
        </div>
      )}
    </div>
  )
}