import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Filter, ArrowUpDown, Download, BookOpen, ChevronRight } from 'lucide-react'
import { updateHistoryNote } from '../data/mockData'

function exportCSV(trades) {
  const header = 'ID,Asset,Direction,Amount,Duration,Entry Price,Exit Price,Status,PnL,Closed At\n'
  const rows = trades.map(t => [
    t.id || '',
    t.asset || '',
    t.direction || '',
    t.amount || 0,
    t.duration || 0,
    t.entryPrice || '',
    t.exitPrice || '',
    t.status || '',
    (t.pnl || 0).toFixed(2),
    t.closedAt ? new Date(t.closedAt).toISOString() : '',
  ].map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(',')).join('\n')

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `autobot-trades-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function HistoryView({ tradeHistory, storedHistory, onNavigateJournal }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState(() => { try { return localStorage.getItem('autobot_hist_search') || '' } catch { return '' } })
  const [filter, setFilter] = useState(() => { try { return localStorage.getItem('autobot_hist_filter') || 'all' } catch { return 'all' } })
  const [sort, setSort] = useState(() => { try { return localStorage.getItem('autobot_hist_sort') || 'newest' } catch { return 'newest' } })
  const [expandedId, setExpandedId] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')

  useEffect(() => { try { localStorage.setItem('autobot_hist_search', search) } catch {} }, [search])
  useEffect(() => { try { localStorage.setItem('autobot_hist_filter', filter) } catch {} }, [filter])
  useEffect(() => { try { localStorage.setItem('autobot_hist_sort', sort) } catch {} }, [sort])

  // Merge live session + stored history, deduplicate by id
  const allHistory = useMemo(() => {
    const merged = [...tradeHistory]
    const ids = new Set(merged.map(t => t.id))
    for (const item of storedHistory) {
      if (!ids.has(item.id)) {
        merged.push(item)
        ids.add(item.id)
      }
    }
    return merged
  }, [tradeHistory, storedHistory])

  const filtered = useMemo(() => {
    let list = allHistory
    if (filter === 'win') list = list.filter(t => t.status === 'win')
    if (filter === 'loss') list = list.filter(t => t.status === 'loss')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t => t.asset?.toLowerCase().includes(q) || t.direction?.toLowerCase().includes(q))
    }
    if (sort === 'newest') list = [...list].sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
    if (sort === 'oldest') list = [...list].sort((a, b) => (a.closedAt || 0) - (b.closedAt || 0))
    if (sort === 'amount') list = [...list].sort((a, b) => (b.amount || 0) - (a.amount || 0))
    return list
  }, [allHistory, filter, search, sort])

  const stats = useMemo(() => {
    const wins = allHistory.filter(t => t.status === 'win').length
    const losses = allHistory.filter(t => t.status === 'loss').length
    const total = wins + losses
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0'
    const totalPnl = allHistory.reduce((sum, t) => sum + (t.pnl || 0), 0)
    return { wins, losses, total, winRate, totalPnl }
  }, [allHistory])

  const formatDate = (ts) => {
    if (!ts) return '—'
    const now = Date.now()
    const diff = now - ts
    if (diff < 60000) return t('common.justNow')
    if (diff < 3600000) return `${Math.floor(diff / 60000)}${t('common.minutes')}`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}${t('common.hours')}`
    return new Date(ts).toLocaleDateString()
  }

  return (
    <div style={{ gridColumn: '2 / 5', padding: 20, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('history.title')}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {onNavigateJournal && (
            <button
              onClick={onNavigateJournal}
              title={t('history.openJournal')}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'var(--bg-input)', color: 'var(--brand)', border: '1px solid var(--border-default)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            ><BookOpen size={14} /> {t('history.journal')}</button>
          )}
          <button
            onClick={() => exportCSV(allHistory)}
            disabled={allHistory.length === 0}
            title={t('history.exportCsv')}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: allHistory.length > 0 ? 'pointer' : 'default',
              background: 'var(--bg-input)', color: allHistory.length > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
              border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 4, opacity: allHistory.length > 0 ? 1 : 0.5,
            }}
          ><Download size={14} /> {t('history.csv')}</button>
          <button
            onClick={() => setFilter('all')}
            style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: filter === 'all' ? 'var(--brand)' : 'var(--bg-input)', color: filter === 'all' ? '#000' : 'var(--text-secondary)', border: 'none' }}
          >{t('history.filterAll')}</button>
          <button
            onClick={() => setFilter('win')}
            style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: filter === 'win' ? 'var(--success)' : 'var(--bg-input)', color: filter === 'win' ? '#000' : 'var(--text-secondary)', border: 'none' }}
          >{t('history.filterWins')}</button>
          <button
            onClick={() => setFilter('loss')}
            style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: filter === 'loss' ? 'var(--danger)' : 'var(--bg-input)', color: filter === 'loss' ? '#fff' : 'var(--text-secondary)', border: 'none' }}
          >{t('history.filterLosses')}</button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: 12, background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('history.totalLabel')}</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{stats.total}</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('history.winRateLabel')}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>{stats.winRate}%</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('history.wlLabel')}</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}><span style={{ color: 'var(--success)' }}>{stats.wins}</span> / <span style={{ color: 'var(--danger)' }}>{stats.losses}</span></div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('history.pnlLabel')}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: stats.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Search + Sort */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div className="asset-search" style={{ flex: 1, margin: 0 }}>
          <Search size={14} />
          <input
            type="text"
            placeholder={t('history.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => setSort(sort === 'newest' ? 'oldest' : sort === 'oldest' ? 'amount' : 'newest')}
          style={{ padding: '6px 10px', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
        >
          <ArrowUpDown size={14} />
          {sort === 'newest' ? t('history.sortNewest') : sort === 'oldest' ? t('history.sortOldest') : t('history.sortAmount')}
        </button>
        <button
          onClick={() => setFilter('all')}
          style={{ padding: '6px 10px', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
        >
          <Filter size={14} />
          {t('common.clear')}
        </button>
      </div>

      {/* History list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{t('history.noTrades')}</div>
        )}
        {filtered.map((trade, i) => {
          const isExpanded = expandedId === (trade.id || i)
          return (
          <div key={trade.id || i} style={{
            padding: '10px 14px', borderRadius: 8,
            background: i % 2 === 0 ? 'var(--bg-elevated)' : 'transparent',
            border: isExpanded ? '1px solid var(--border-default)' : '1px solid var(--border-subtle)',
          }}>
            <div onClick={() => {
              setExpandedId(isExpanded ? null : (trade.id || i))
              setNoteDraft(trade.note || '')
            }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {trade.note && <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>{t('common.note').charAt(0).toUpperCase()}</span>}
                <span style={{ fontWeight: 600, fontSize: 13 }}>{trade.asset || '—'}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                  background: trade.direction === 'call' ? 'rgba(0,200,83,0.12)' : 'rgba(255,23,68,0.12)',
                  color: trade.direction === 'call' ? 'var(--success)' : 'var(--danger)' }}
                >{trade.direction?.toUpperCase() || '—'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>${trade.amount?.toFixed(2) || '0.00'} · {trade.duration}{t('common.seconds')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: trade.status === 'win' ? 'var(--success)' : 'var(--danger)' }}>
                    {trade.status === 'win' ? '+' : ''}${(trade.pnl || 0).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(trade.closedAt)}</div>
                </div>
                <ChevronRight size={12} style={{
                  opacity: 0.3, transition: 'transform 0.15s',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('history.entryDetail')}: {trade.entryPrice?.toFixed(5) || '—'} → {t('history.exitDetail')}: {trade.exitPrice?.toFixed(5) || '—'}
            </div>

            {isExpanded && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                <input
                  type="text"
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  onBlur={() => {
                    if (noteDraft !== (trade.note || '')) {
                      updateHistoryNote(trade.id, noteDraft)
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      updateHistoryNote(trade.id, noteDraft)
                      e.currentTarget.blur()
                    }
                  }}
                  placeholder={t('history.addNote')}
                  style={{
                    width: '100%', padding: '6px 8px', borderRadius: 4, fontSize: 11,
                    background: 'var(--bg-input)', border: noteDraft ? '1px solid var(--brand)' : '1px solid var(--border-default)',
                    color: noteDraft ? 'var(--text-primary)' : 'var(--text-muted)',
                    outline: 'none', fontStyle: noteDraft ? 'normal' : 'italic',
                  }}
                />
              </div>
            )}
          </div>
        )})}
      </div>
    </div>
  )
}