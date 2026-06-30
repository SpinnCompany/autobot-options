import { useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { CATEGORIES } from '../data/mockData'

export default function AssetPanel({ assets, selectedAsset, onSelectAsset, tradeHistory = [], mobileOpen, onCloseMobile }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')

  const filteredAssets = useMemo(() => {
    let list = assets
    if (category !== 'All') {
      list = list.filter(a => a.category === category)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a => a.name.toLowerCase().includes(q))
    }
    return list
  }, [assets, category, search])

  // Compute per-asset win rate + sentiment from trade history
  const assetStats = useMemo(() => {
    const stats = {}
    tradeHistory.forEach(t => {
      if (!t.asset) return
      if (!stats[t.asset]) stats[t.asset] = { wins: 0, total: 0, pnl: 0, calls: 0 }
      stats[t.asset].total++
      stats[t.asset].pnl += (t.pnl || 0)
      if (t.status === 'win') stats[t.asset].wins++
      if (t.direction === 'call') stats[t.asset].calls++
    })
    return stats
  }, [tradeHistory])

  return (
    <aside className={`asset-panel ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="asset-panel-header">
        <h2>Assets</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {filteredAssets.length} items
          </span>
          {onCloseMobile && (
            <button onClick={onCloseMobile} className="mobile-close-btn" title="Close">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="asset-search">
        <Search size={14} />
        <input
          type="text"
          placeholder="Search assets..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="asset-categories">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`asset-cat-btn ${category === cat ? 'active' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="asset-list">
        {filteredAssets.map(asset => {
          const changeStr = String(asset.change)
          const isUp = !changeStr.startsWith('-')
          const stats = assetStats[asset.name]
          const winRate = stats && stats.total > 0 ? (stats.wins / stats.total * 100) : null
          const totalTrades = stats?.total || 0
          const callPct = stats && stats.total > 0 ? (stats.calls / stats.total * 100) : null

          return (
            <div
              key={asset.name}
              className={`asset-item ${selectedAsset === asset.name ? 'selected' : ''}`}
              onClick={() => onSelectAsset(asset.name)}
            >
              {/* Dual-flag icon like real brokers */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                {asset.derivMarket === 'forex' && asset.icon2 ? (
                  /* Forex pairs — country flag emojis */
                  <span style={{
                    fontSize: 15, lineHeight: '28px',
                    letterSpacing: -1,
                  }}>{asset.icon}{asset.icon2}</span>
                ) : asset.source === 'binance' ? (
                  /* Real SVG icon from CDN, fallback to generated SVG on 404 */
                  <img src={asset.icon} alt={asset.name}
                    onError={e => { if (asset.iconFallback) e.target.src = asset.iconFallback }}
                    style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }} />
                ) : (
                  /* All other assets — text badge icon */
                  <span style={{
                    width: 20, height: 28, borderRadius: 4,
                    background: `${asset.color}22`, color: asset.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                  }}>{asset.icon}</span>
                )}
              </div>
              <div className="asset-item-info">
                <div className="asset-item-name">{asset.displayName || asset.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="asset-item-tag">{asset.category}</span>
                  {asset.source === 'binance' && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: 'var(--brand)',
                      background: 'rgba(245,123,0,0.12)', padding: '0 4px', borderRadius: 3,
                    }}>BIN</span>
                  )}
                  {totalTrades > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                      background: 'var(--bg-input)', padding: '0 4px', borderRadius: 3,
                    }}>{totalTrades}t</span>
                  )}
                </div>
              </div>
              <div className="asset-item-price" style={{ textAlign: 'right' }}>
                <div className="asset-item-value">
                  {asset.price.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 5,
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                  {winRate !== null && (
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: winRate >= 55 ? 'var(--success)' : winRate >= 45 ? 'var(--text-muted)' : 'var(--danger)',
                      background: winRate >= 55 ? 'rgba(0,200,83,0.1)' : winRate >= 45 ? 'rgba(139,143,168,0.1)' : 'rgba(255,23,68,0.1)',
                      padding: '0 4px', borderRadius: 3,
                    }}>{winRate.toFixed(0)}%</span>
                  )}
                  <span className={`asset-item-change ${isUp ? 'up' : 'down'}`}>
                    {isUp ? '+' : ''}{asset.change}%
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--success)',
                    background: 'rgba(0,200,83,0.1)', padding: '0 4px', borderRadius: 3,
                  }}>{asset.payout}%</span>
                </div>
                {/* Spread + Daily Range bar */}
                {asset.spread != null && asset.dayHigh != null && (
                  <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                      Spread {asset.spread.toFixed(asset.spread < 1 ? 5 : 2)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.5 }}>·</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                      {asset.dayLow.toFixed(asset.dayLow > 100 ? 0 : asset.dayLow > 1 ? 2 : 5)}–{asset.dayHigh.toFixed(asset.dayHigh > 100 ? 0 : asset.dayHigh > 1 ? 2 : 5)}
                    </span>
                  </div>
                )}
                {/* Market Sentiment bar */}
                {callPct !== null && (
                  <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Sentiment</span>
                    <div style={{
                      width: 40, height: 3, borderRadius: 2,
                      background: 'var(--bg-input)', overflow: 'hidden',
                      display: 'flex',
                    }}>
                      <div style={{
                        width: `${callPct}%`, height: '100%',
                        background: 'var(--success)', borderRadius: '2px 0 0 2px',
                        transition: 'width 0.3s',
                      }} />
                      <div style={{
                        width: `${100 - callPct}%`, height: '100%',
                        background: 'var(--danger)', borderRadius: '0 2px 2px 0',
                      }} />
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: callPct >= 55 ? 'var(--success)' : callPct <= 45 ? 'var(--danger)' : 'var(--text-muted)',
                    }}>{callPct.toFixed(0)}% CALL</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {filteredAssets.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            No assets found
          </div>
        )}
      </div>
    </aside>
  )
}
