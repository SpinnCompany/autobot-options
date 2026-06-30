import { useState, useEffect, useMemo } from 'react'
import { Calendar, Clock, AlertTriangle, Info } from 'lucide-react'
import { getUpcomingEvents, getCurrencyFlag, IMPACT_COLORS } from '../data/economicCalendar'

function fmtCountdown(ms) {
  if (ms <= 0) return 'LIVE'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function EconomicCalendar() {
  const [filter, setFilter] = useState('all') // 'all' | 'high' | 'medium' | 'low'
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const events = useMemo(() => {
    const all = getUpcomingEvents(7)
    if (filter === 'all') return all
    return all.filter(e => e.impact === filter)
  }, [filter])

  // Group by date
  const grouped = useMemo(() => {
    const groups = {}
    events.forEach(ev => {
      const d = new Date(ev.time)
      const key = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      if (!groups[key]) groups[key] = []
      groups[key].push(ev)
    })
    return groups
  }, [events])

  const activeCount = events.filter(ev => now >= ev.time && now <= ev.endTime).length

  return (
    <div style={{ gridColumn: '2 / 5', padding: 20, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={20} color="var(--brand)" />
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Economic Calendar</h2>
          {activeCount > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(255,23,68,0.15)', color: 'var(--danger)',
              animation: 'pulse-brand 1.5s ease-in-out infinite',
            }}>
              {activeCount} LIVE NOW
            </span>
          )}
        </div>

        {/* Impact filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'high', label: 'High', color: 'var(--danger)' },
            { key: 'medium', label: 'Med', color: '#ffc107' },
            { key: 'low', label: 'Low', color: 'var(--text-muted)' },
          ].map(({ key, label, color }) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
              background: filter === key ? (color || 'var(--bg-elevated)') : 'transparent',
              border: filter === key ? `1px solid ${color || 'var(--border-default)'}` : '1px solid transparent',
              color: filter === key ? (key === 'all' ? 'var(--text-primary)' : '#000') : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {Object.keys(grouped).length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 40 }}>
          No upcoming events
        </div>
      )}

      {Object.entries(grouped).map(([date, dayEvents]) => (
        <div key={date} style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            marginBottom: 8, paddingBottom: 6,
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            {date}
          </div>

          {dayEvents.map(ev => {
            const isActive = now >= ev.time && now <= ev.endTime
            const isPast = now > ev.endTime
            const countdown = ev.time - now

            return (
              <div key={ev.id + ev.time} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 8, marginBottom: 3,
                background: isActive ? 'rgba(255,23,68,0.06)' : isPast ? 'transparent' : 'var(--bg-elevated)',
                border: isActive ? '1px solid rgba(255,23,68,0.15)' : '1px solid transparent',
                opacity: isPast ? 0.4 : 1,
              }}>
                {/* Time column */}
                <div style={{ minWidth: 55, textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                    {new Date(ev.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </div>
                  {!isPast && (
                    <div style={{
                      fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: isActive ? 'var(--danger)' : 'var(--text-muted)',
                    }}>
                      {isActive ? 'LIVE' : fmtCountdown(countdown)}
                    </div>
                  )}
                </div>

                {/* Impact dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: IMPACT_COLORS[ev.impact],
                  boxShadow: isActive ? `0 0 8px ${IMPACT_COLORS[ev.impact]}` : 'none',
                  flexShrink: 0,
                }} />

                {/* Currency flag + name */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13 }}>{getCurrencyFlag(ev.currency)}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{ev.title}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: IMPACT_COLORS[ev.impact] }}>
                      {ev.impact.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {ev.currency} · {ev.country}
                  </div>
                </div>

                {/* Previous / Forecast */}
                <div style={{ textAlign: 'right', minWidth: 100 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                    Prev: <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{ev.previous}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                    Fcast: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{ev.forecast}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Info size={12} />
        Demo data — real events via API in production
      </div>
    </div>
  )
}
