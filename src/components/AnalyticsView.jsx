import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts'

export default function AnalyticsView({ positions, storedHistory }) {
  const allHistory = useMemo(() => {
    const merged = [...positions.filter(p => p.status !== 'open'), ...storedHistory]
    const ids = new Set()
    return merged.filter(t => {
      if (ids.has(t.id)) return false
      ids.add(t.id)
      return true
    })
  }, [positions, storedHistory])

  const stats = useMemo(() => {
    const wins = allHistory.filter(t => t.status === 'win')
    const losses = allHistory.filter(t => t.status === 'loss')
    const totalTrades = wins.length + losses.length
    const winRate = totalTrades > 0 ? ((wins.length / totalTrades) * 100) : 0
    const totalPnl = allHistory.reduce((sum, t) => sum + (t.pnl || 0), 0)
    const totalStaked = allHistory.reduce((sum, t) => sum + (t.amount || 0), 0)
    const avgPnl = totalTrades > 0 ? (totalPnl / totalTrades) : 0
    const bestTrade = allHistory.length > 0 ? Math.max(...allHistory.map(t => t.pnl || 0)) : 0
    const worstTrade = allHistory.length > 0 ? Math.min(...allHistory.map(t => t.pnl || 0)) : 0

    // Per-asset breakdown
    const assetMap = {}
    allHistory.forEach(t => {
      if (!t.asset) return
      if (!assetMap[t.asset]) assetMap[t.asset] = { asset: t.asset, wins: 0, losses: 0, pnl: 0, count: 0 }
      assetMap[t.asset].pnl += (t.pnl || 0)
      assetMap[t.asset].count++
      if (t.status === 'win') assetMap[t.asset].wins++
      else if (t.status === 'loss') assetMap[t.asset].losses++
    })
    const assetBreakdown = Object.values(assetMap).map(a => ({
      ...a,
      winRate: a.count > 0 ? ((a.wins / a.count) * 100).toFixed(1) : '0',
    })).sort((a, b) => b.pnl - a.pnl)

    // Per-direction breakdown
    const callTrades = allHistory.filter(t => t.direction === 'call')
    const putTrades = allHistory.filter(t => t.direction === 'put')
    const callWins = callTrades.filter(t => t.status === 'win').length
    const putWins = putTrades.filter(t => t.status === 'win').length

    const pieData = [
      { name: 'Wins', value: wins.length, color: 'var(--success)' },
      { name: 'Losses', value: losses.length, color: 'var(--danger)' },
    ]

    // PnL timeline (last 20 trades)
    const recent = [...allHistory].sort((a, b) => (a.closedAt || 0) - (b.closedAt || 0)).slice(-30)
    let runningPnL = 0
    const pnlTimeline = recent.map((t, i) => {
      runningPnL += (t.pnl || 0)
      return { index: i + 1, pnl: parseFloat(runningPnL.toFixed(2)) }
    })

    return {
      wins: wins.length, losses: losses.length, totalTrades, winRate, totalPnl,
      totalStaked, avgPnl, bestTrade, worstTrade, assetBreakdown,
      callWins, putWins, callTrades: callTrades.length, putTrades: putTrades.length,
      pieData, pnlTimeline,
    }
  }, [allHistory])

  const StatCard = ({ label, value, color }) => (
    <div style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
        <div style={{ fontWeight: 700 }}>Trade #{payload[0].payload.index}</div>
        <div style={{ color: payload[0].value >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          PnL: ${payload[0].value.toFixed(2)}
        </div>
      </div>
    )
  }

  const PieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
        <div style={{ fontWeight: 600 }}>{payload[0].name}: {payload[0].value}</div>
      </div>
    )
  }

  return (
    <div style={{ gridColumn: '2 / 5', padding: 20, overflow: 'auto' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Analytics</h2>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="Total Trades" value={stats.totalTrades} />
        <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} color="var(--success)" />
        <StatCard label="Total P&L" value={`${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`} color={stats.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)'} />
        <StatCard label="Best Trade" value={`$${stats.bestTrade.toFixed(2)}`} color="var(--success)" />
        <StatCard label="Worst Trade" value={`$${stats.worstTrade.toFixed(2)}`} color="var(--danger)" />
        <StatCard label="Avg P&L" value={`${stats.avgPnl >= 0 ? '+' : ''}$${stats.avgPnl.toFixed(2)}`} color={stats.avgPnl >= 0 ? 'var(--success)' : 'var(--danger)'} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Win/Loss pie */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)', padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Win / Loss Distribution</div>
          {stats.totalTrades > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={stats.pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value">
                  {stats.pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No data yet</div>
          )}
        </div>

        {/* CALL vs PUT */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)', padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Direction Performance</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, textAlign: 'center', padding: 16, background: 'rgba(0,200,83,0.08)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--success)', marginBottom: 4 }}>CALL</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--success)' }}>{stats.callWins}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>wins / {stats.callTrades} trades</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: 16, background: 'rgba(255,23,68,0.08)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 4 }}>PUT</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--danger)' }}>{stats.putWins}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>wins / {stats.putTrades} trades</div>
            </div>
          </div>
        </div>
      </div>

      {/* PnL Timeline */}
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)', padding: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Cumulative P&L (Last 30 Trades)</div>
        {stats.pnlTimeline.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.pnlTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="index" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `$${v}`} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                {stats.pnlTimeline.map((entry, i) => (
                  <Cell key={i} fill={entry.pnl >= 0 ? 'var(--success)' : 'var(--danger)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No trade data yet</div>
        )}
      </div>

      {/* Asset breakdown */}
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)', padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Asset Breakdown</div>
        {stats.assetBreakdown.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stats.assetBreakdown.slice(0, 10).map(a => (
              <div key={a.asset} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', background: 'var(--bg-input)', borderRadius: 6, gap: 10 }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{a.asset}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.count} trades</span>
                <span style={{ fontSize: 11, color: 'var(--success)' }}>{a.winRate}%</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: a.pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {a.pnl >= 0 ? '+' : ''}${a.pnl.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No data yet</div>
        )}
      </div>
    </div>
  )
}