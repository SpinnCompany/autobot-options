import { useState, useMemo } from 'react'
import { BookOpen, Search, ChevronRight } from 'lucide-react'
import { loadTradeHistory } from '../data/mockData'

export default function JournalView({ positions = [], storedHistory = [] }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)

  // Merge all sources: session positions + stored history, only those with notes
  const journalEntries = useMemo(() => {
    const entries = []
    const ids = new Set()

    // Session positions with notes
    positions.forEach(p => {
      if (p.note && !ids.has(p.id)) {
        ids.add(p.id)
        entries.push({ ...p, source: 'session' })
      }
    })

    // Stored history with notes
    storedHistory.forEach(t => {
      if (t.note && !ids.has(t.id)) {
        ids.add(t.id)
        entries.push({
          id: t.id, asset: t.asset, direction: t.direction,
          amount: t.amount, duration: t.duration,
          entryPrice: t.entryPrice, exitPrice: t.exitPrice,
          status: t.status, pnl: t.pnl, note: t.note,
          closedAt: t.closedAt, source: 'history',
        })
      }
    })

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase()
      return entries.filter(e =>
        (e.asset || '').toLowerCase().includes(q) ||
        (e.note || '').toLowerCase().includes(q) ||
        (e.direction || '').toLowerCase().includes(q)
      )
    }

    // Most recent first
    entries.sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
    return entries
  }, [positions, storedHistory, search])

  return (
    <div style={{ gridColumn: '2 / 5', padding: 20, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BookOpen size={20} color="var(--brand)" />
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Trade Journal</h2>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {journalEntries.length} entries
        </span>
      </div>

      <div className="asset-search" style={{ marginBottom: 12 }}>
        <Search size={14} />
        <input
          type="text"
          placeholder="Search notes, assets, directions..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {journalEntries.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 40 }}>
          {search.trim() ? 'No matching entries' : 'No journal entries yet'}
          {!search.trim() && (
            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
              Add notes to your trades by clicking a position card and typing in the note field
            </div>
          )}
        </div>
      )}

      {journalEntries.map(entry => {
        const isExpanded = expanded === entry.id
        const isWin = entry.status === 'win'
        const date = entry.closedAt ? new Date(entry.closedAt).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        }) : 'Open'

        return (
          <div key={entry.id} style={{ marginBottom: 4 }}>
            <div onClick={() => setExpanded(isExpanded ? null : entry.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 8, cursor: 'pointer',
              background: isExpanded ? 'var(--bg-elevated)' : 'transparent',
              border: isExpanded ? '1px solid var(--border-subtle)' : '1px solid transparent',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 90, fontVariantNumeric: 'tabular-nums' }}>
                {date}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '1px 5px', borderRadius: 3, minWidth: 36, textAlign: 'center',
                background: entry.direction === 'call' ? 'rgba(0,200,83,0.12)' : 'rgba(255,23,68,0.12)',
                color: entry.direction === 'call' ? 'var(--success)' : 'var(--danger)',
              }}>{entry.direction?.toUpperCase()}</span>
              <span style={{ fontWeight: 600, fontSize: 12, minWidth: 70 }}>{entry.asset}</span>
              <span style={{
                fontWeight: 700, fontSize: 11, minWidth: 60, textAlign: 'right',
                color: isWin ? 'var(--success)' : 'var(--danger)',
              }}>
                {isWin ? '+' : ''}${(entry.pnl || 0).toFixed(2)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.note?.slice(0, 60)}{(entry.note?.length > 60) ? '…' : ''}
              </span>
              <ChevronRight size={12} style={{
                opacity: 0.3, transition: 'transform 0.15s',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }} />
            </div>

            {isExpanded && (
              <div style={{
                padding: '8px 14px', marginLeft: 98, marginBottom: 4,
                borderLeft: '2px solid var(--border-subtle)',
                fontSize: 11, display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Amount: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${entry.amount?.toFixed(2)}</span></span>
                  <span style={{ color: 'var(--text-muted)' }}>Duration: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{entry.duration}s</span></span>
                  {entry.entryPrice && (
                    <span style={{ color: 'var(--text-muted)' }}>Entry: <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{entry.entryPrice.toFixed(5)}</span></span>
                  )}
                  {entry.exitPrice && (
                    <span style={{ color: 'var(--text-muted)' }}>Exit: <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{entry.exitPrice.toFixed(5)}</span></span>
                  )}
                </div>
                <div style={{
                  padding: '6px 8px', borderRadius: 4, background: 'var(--bg-input)',
                  color: 'var(--text-primary)', fontSize: 11, lineHeight: 1.4, fontStyle: 'italic',
                }}>
                  {entry.note}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
