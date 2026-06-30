import { useState, useCallback, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import AssetPanel from './components/AssetPanel'
import ChartArea from './components/ChartArea'
import TradePanel from './components/TradePanel'
import ToastContainer from './components/ToastContainer'
import HistoryView from './components/HistoryView'
import AnalyticsView from './components/AnalyticsView'
import EconomicCalendar from './components/EconomicCalendar'
import JournalView from './components/JournalView'
import HeatmapView from './components/HeatmapView'
import CorrelationMatrix from './components/CorrelationMatrix'
import BacktesterView from './components/BacktesterView'
import { useSound } from './hooks/useSound'
import { usePushNotifications } from './hooks/usePushNotifications'
import { useMarketData } from './hooks/useMarketData'
import { loadTradeHistory, TF_MAP } from './data/mockData'
import { getActiveEvents } from './data/economicCalendar'
import { useDemoEngine, MAX_OPEN } from './engine/DemoEngine'
import { X, Plus, CandlestickChart, LayoutDashboard, History, Calendar, List, BookOpen, Grid3X3, Table2 } from 'lucide-react'

const MAX_TABS = 8

export default function App() {
  const [activeSection, setActiveSection] = useState(() => {
    try { return localStorage.getItem('autobot_active_section') || 'trade' } catch { return 'trade' }
  })
  const [toasts, setToasts] = useState([])

  // Assets: populated by Deriv on connect, or seeded from demo engine
  const [assets, setAssets] = useState([])

  // ── Candle store — builds OHLC from every tick ──
  const candleStoreRef = useRef(new Map()) // tabId → Map<tf, candles[]>
  const MAX_CANDLES = 1440

  // ── Track which tabs have received real candle history from fetchCandles ──
  // Ticks build in the background but don't render until history arrives.
  const historyReadyRef = useRef(new Map()) // tabId → Set<tf>

  // ── rAF batching for tick → state syncs ──
  const tickSyncPendingRef = useRef(new Map()) // `${tabId}:${tf}` → candles[]
  const tickSyncRafRef = useRef(null)

  const flushTickSyncs = useCallback(() => {
    tickSyncRafRef.current = null
    const pending = [...tickSyncPendingRef.current.entries()]
    tickSyncPendingRef.current.clear()
    if (pending.length === 0) return
    // Batch all pending tabs into a single setTabs call
    setTabs(prev => {
      let next = prev
      for (const [key, candles] of pending) {
        const [tabId, tf] = key.split(':')
        next = next.map(t => {
          if (t.id !== tabId) return t
          const priceHistory = candles.map(c => ({ time: c.time, price: c.close }))
          return { ...t, candleHistory: [...candles], priceHistory }
        })
      }
      return next
    })
  }, [])

  const syncCandlesToTab = useCallback((tabId, tf, candles) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const priceHistory = candles.map(c => ({ time: c.time, price: c.close }))
      // Spread to create a new array reference — React's useMemo in ChartArea
      // depends on reference identity, so in-place mutations won't trigger redraws.
      return { ...t, candleHistory: [...candles], priceHistory }
    }))
  }, [])

  // ── Deriv-driven tick — builds candles from every tick ──
  const onDerivAssetTick = useCallback((derivSymbol, price) => {
    if (isReplayingRef.current) return
    const currentAssets = assetsRef.current
    const assetData = currentAssets.find(a => a.derivSymbol === derivSymbol)
    if (!assetData) return
    const tickPrice = parseFloat(price.toFixed(5))
    const now = Date.now()

    tabsRef.current.forEach(tab => {
      if (tab.asset !== assetData.name) return
      const tfMs = TF_MAP[tab.timeframe] || 60000
      const alignedT = Math.floor(now / tfMs) * tfMs

      let store = candleStoreRef.current.get(tab.id)
      if (!store) { store = new Map(); candleStoreRef.current.set(tab.id, store) }
      let candles = store.get(tab.timeframe)
      if (!candles || candles.length === 0) {
        // Start with a single candle from the first tick instead of seeding
        // a full day of flat candles. The chart builds naturally tick-by-tick
        // and fetchCandles fills in real history within seconds.
        candles = [{ time: alignedT, open: tickPrice, high: tickPrice, low: tickPrice, close: tickPrice, v: 0 }]
      }

      const last = candles[candles.length - 1]
      if (!last || last.time !== alignedT) {
        if (last) last.close = tickPrice
        candles.push({ time: alignedT, open: tickPrice, high: tickPrice, low: tickPrice, close: tickPrice, v: 0 })
        if (candles.length > MAX_CANDLES) candles.shift()
      } else {
        last.high = Math.max(last.high, tickPrice)
        last.low = Math.min(last.low, tickPrice)
        last.close = tickPrice
        last.v = (last.v || 0) + 1
      }

      store.set(tab.timeframe, candles)
      // Only render tick-built candles after real history has arrived.
      // Before that, ticks accumulate silently — no visible 1-by-1 buildup.
      const ready = historyReadyRef.current.get(tab.id)?.has(tab.timeframe)
      if (!ready) return
      // Batch state syncs via rAF — multiple ticks in the same frame
      // result in a single React render instead of N separate renders.
      tickSyncPendingRef.current.set(`${tab.id}:${tab.timeframe}`, candles)
      if (!tickSyncRafRef.current) {
        tickSyncRafRef.current = requestAnimationFrame(flushTickSyncs)
      }
    })
  }, [flushTickSyncs])

  // ── Deriv candle history — replaces tick-built candles with real OHLC from Deriv ──
  const onDerivCandles = useCallback((derivSymbol, candles) => {
    if (!candles || candles.length === 0) return
    const assetData = assetsRef.current.find(a => a.derivSymbol === derivSymbol)
    if (!assetData) return
    tabsRef.current.forEach(tab => {
      if (tab.asset !== assetData.name) return
      let store = candleStoreRef.current.get(tab.id)
      if (!store) { store = new Map(); candleStoreRef.current.set(tab.id, store) }
      store.set(tab.timeframe, candles)
      // Mark this tab+timeframe as ready — chart rendering is now enabled
      let ready = historyReadyRef.current.get(tab.id)
      if (!ready) { ready = new Set(); historyReadyRef.current.set(tab.id, ready) }
      ready.add(tab.timeframe)
      syncCandlesToTab(tab.id, tab.timeframe, candles)
    })
  }, [syncCandlesToTab])

  const marketData = useMarketData({ onAssetTick: onDerivAssetTick, onCandles: onDerivCandles })

  // Merge Deriv assets — add new ones, preserve existing prices
  const prevDerivLen = useRef(0)
  useEffect(() => {
    if (marketData.assets.length === 0) return
    const isFirstBatch = prevDerivLen.current === 0
    prevDerivLen.current = marketData.assets.length

    setAssets(prev => {
      const existing = new Map(prev.map(a => [a.name, a]))
      let changed = false
      for (const da of marketData.assets) {
        const cur = existing.get(da.name)
        if (!cur) { existing.set(da.name, da); changed = true }
        else if (cur.price !== da.price && da.price > 0) {
          existing.set(da.name, { ...cur, price: da.price, change: da.change })
          changed = true
        }
      }
      return changed ? [...existing.values()] : prev
    })

    if (isFirstBatch && marketData.assets.length > 0) {
      // Open the first available asset as the initial tab (clean slate — no default)
      if (tabsRef.current.length === 0) {
        const fa = marketData.assets[0]
        const newTab = {
          id: 'tab-1',
          asset: fa.name,
          priceHistory: [],
          candleHistory: [],
          timeframe: '1m',
        }
        setTabs([newTab])
        setActiveTabId('tab-1')
        if (fa.derivSymbol) {
          marketData.subscribe([fa.derivSymbol])
          marketData.fetchCandles(fa.derivSymbol, 60, 1440)
        }
      }
    }
  }, [marketData.assets])

  // ── Multi‑tab state ── clean slate on every refresh, no default tab
  const [tabs, setTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0] || null

  // ── Persist active section only (tabs reset on refresh — clean slate) ──
  useEffect(() => { try { localStorage.setItem('autobot_active_section', activeSection) } catch {} }, [activeSection])

  // ── Sound toggle ──
  const [soundMuted, setSoundMuted] = useState(() => {
    try { return localStorage.getItem('autobot_sound_muted') === 'true' } catch { return false }
  })
  const toggleSound = useCallback(() => {
    setSoundMuted(prev => {
      const next = !prev
      try { localStorage.setItem('autobot_sound_muted', String(next)) } catch { /* noop */ }
      return next
    })
  }, [])

  // ── Trade confirmation toggle ──
  const [confirmTrades, setConfirmTrades] = useState(() => {
    try { return localStorage.getItem('autobot_confirm_trades') === 'true' } catch { return false }
  })
  const toggleConfirmTrades = useCallback(() => {
    setConfirmTrades(prev => {
      const next = !prev
      try { localStorage.setItem('autobot_confirm_trades', String(next)) } catch { /* noop */ }
      return next
    })
  }, [])

  // ── Toast duration setting ──
  const [toastDuration, setToastDuration] = useState(() => {
    try { return parseInt(localStorage.getItem('autobot_toast_duration'), 10) || 3500 } catch { return 3500 }
  })
  const toastDurationRef = useRef(toastDuration)
  toastDurationRef.current = toastDuration

  const handleToastDurationChange = useCallback((ms) => {
    setToastDuration(ms)
    try { localStorage.setItem('autobot_toast_duration', String(ms)) } catch { /* noop */ }
  }, [])

  // ── Price feed mode ──
  const [priceMode, setPriceMode] = useState(() => {
    try { return localStorage.getItem('autobot_price_mode') || 'random' } catch { return 'random' }
  })
  const [trendDir, setTrendDir] = useState(() => {
    try { return localStorage.getItem('autobot_trend_dir') || 'up' } catch { return 'up' }
  })
  const handleSetPriceMode = useCallback((mode) => {
    setPriceMode(mode)
    try { localStorage.setItem('autobot_price_mode', mode) } catch { /* noop */ }
  }, [])
  const handleSetTrendDir = useCallback((dir) => {
    setTrendDir(dir)
    try { localStorage.setItem('autobot_trend_dir', dir) } catch { /* noop */ }
  }, [])

  // ── Chart layout ──
  const [chartLayout, setChartLayout] = useState(() => {
    try { return localStorage.getItem('autobot_chart_layout') || 'single' } catch { return 'single' }
  })
  const handleSetChartLayout = useCallback((layout) => {
    setChartLayout(layout)
    try { localStorage.setItem('autobot_chart_layout', layout) } catch { /* noop */ }
  }, [])

  // ── Market Replay ──
  const [isReplaying, setIsReplaying] = useState(false)
  const [replaySpeed, setReplaySpeed] = useState(5)
  const [replayProgress, setReplayProgress] = useState(0)
  const replayRef = useRef({ cursor: 0, snapshot: null, interval: null })

  const startReplay = useCallback(() => {
    // Snapshot current tabs' price + candle histories
    const snap = tabs.map(tab => ({
      ...tab,
      priceHistory: [...tab.priceHistory],
      candleHistory: [...tab.candleHistory],
    }))
    replayRef.current.snapshot = snap
    replayRef.current.cursor = 0
    replayRef.current.interval = setInterval(() => {
      replayRef.current.cursor += replaySpeed
      const cursor = replayRef.current.cursor
      const snapshot = replayRef.current.snapshot
      if (!snapshot || snapshot.length === 0) return

      // Update tabs: trim price + candle history to cursor
      setTabs(prev => prev.map((tab, i) => {
        const snapTab = snapshot[i]
        if (!snapTab) return tab
        const maxLen = snapTab.priceHistory.length
        const idx = Math.min(cursor, maxLen - 1)
        return {
          ...tab,
          priceHistory: snapTab.priceHistory.slice(0, idx + 1),
          candleHistory: snapTab.candleHistory.slice(0, Math.min(idx + 1, snapTab.candleHistory.length)),
        }
      }))

      // Update asset prices from the snapshot's latest price
      setAssets(prev => prev.map(a => {
        const snapTab = snapshot.find(s => s.asset === a.name)
        if (!snapTab) return a
        const hist = snapTab.priceHistory
        const idx = Math.min(cursor, hist.length - 1)
        const newPrice = hist[idx]?.price || a.price
        return { ...a, price: newPrice, change: ((newPrice - a.price) / a.price * 100).toFixed(2) }
      }))

      // Progress
      const maxLen = Math.max(...snapshot.map(s => s.priceHistory.length))
      setReplayProgress(maxLen > 0 ? Math.min(100, (cursor / maxLen) * 100) : 0)

      // Auto-stop at end
      if (cursor >= maxLen) {
        clearInterval(replayRef.current.interval)
        replayRef.current.interval = null
        setIsReplaying(false)
        setReplayProgress(100)
      }
    }, 200) // ~5 ticks/sec
    setIsReplaying(true)
    setReplayProgress(0)
  }, [tabs, replaySpeed])

  const stopReplay = useCallback(() => {
    if (replayRef.current.interval) {
      clearInterval(replayRef.current.interval)
      replayRef.current.interval = null
    }
    setIsReplaying(false)
    setReplayProgress(0)
    // Regenerate fresh data for all tabs
    setTabs(prev => prev.map(tab => {
      return {
        ...tab,
        priceHistory: Array.from({length: 200}, () => ({ time: 0, price: 0 })),
        candleHistory: [],
      }
    }))
  }, [assets])

  const toggleReplayPause = useCallback(() => {
    if (replayRef.current.interval) {
      clearInterval(replayRef.current.interval)
      replayRef.current.interval = null
    } else if (isReplaying) {
      replayRef.current.interval = setInterval(() => {
        replayRef.current.cursor += replaySpeed
        const cursor = replayRef.current.cursor
        const snapshot = replayRef.current.snapshot
        if (!snapshot) return
        setTabs(prev => prev.map((tab, i) => {
          const snapTab = snapshot[i]
          if (!snapTab) return tab
          const idx = Math.min(cursor, snapTab.priceHistory.length - 1)
          return {
            ...tab,
            priceHistory: snapTab.priceHistory.slice(0, idx + 1),
            candleHistory: snapTab.candleHistory.slice(0, Math.min(idx + 1, snapTab.candleHistory.length)),
          }
        }))
        setAssets(prev => prev.map(a => {
          const snapTab = snapshot.find(s => s.asset === a.name)
          if (!snapTab) return a
          const idx = Math.min(cursor, snapTab.priceHistory.length - 1)
          const newPrice = snapTab.priceHistory[idx]?.price || a.price
          return { ...a, price: newPrice, change: ((newPrice - a.price) / a.price * 100).toFixed(2) }
        }))
        const maxLen = Math.max(...snapshot.map(s => s.priceHistory.length))
        setReplayProgress(maxLen > 0 ? Math.min(100, (cursor / maxLen) * 100) : 0)
      }, 200)
    }
  }, [isReplaying, replaySpeed])

  // Cleanup replay on unmount
  useEffect(() => {
    return () => {
      if (replayRef.current.interval) clearInterval(replayRef.current.interval)
    }
  }, [])

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    const dur = toastDurationRef.current
    if (dur <= 0) return // never auto-dismiss
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, dur)
  }, [])

  // ── Sound ──
  const { play } = useSound()
  const playSound = useCallback((type) => {
    if (!soundMuted) play(type)
  }, [soundMuted, play])

  // ── Push Notifications ──
  const pushNotify = usePushNotifications()

  // ── Demo Engine — all trading logic lives here ──
  const engine = useDemoEngine({
    onToast: addToast,
    onSound: playSound,
  })

  // ── Price alerts (UI concern — engine only checks, UI manages list) ──
  const [alerts, setAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('autobot_alerts') || '[]') } catch { return [] }
  })
  const alertsRef = useRef(alerts)
  alertsRef.current = alerts

  const addAlert = useCallback((asset, price, direction) => {
    const newAlert = { id: Date.now(), asset, price, direction, triggered: false }
    setAlerts(prev => {
      const next = [...prev, newAlert]
      try { localStorage.setItem('autobot_alerts', JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
    addToast(`Alert set: ${asset} ${direction === 'above' ? '>' : '<'} ${price}`, 'success')
  }, [addToast])

  const removeAlert = useCallback((alertId) => {
    setAlerts(prev => {
      const next = prev.filter(a => a.id !== alertId)
      try { localStorage.setItem('autobot_alerts', JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
  }, [])

  // ── Keep refs for Deriv tick callback ──
  const assetsRef = useRef(assets)
  assetsRef.current = assets
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const candleEpochRef = useRef({})
  const isReplayingRef = useRef(isReplaying)
  isReplayingRef.current = isReplaying

  // ── TP/SL & Alert checks on every price update ──
  useEffect(() => {
    const assetPrices = new Map(assets.map(a => [a.name, a.price]))

    // Check TP/SL for open positions (takes priority over expiry)
    engine.checkTP_SL(assetPrices)

    // Check natural expiry (openTime + duration) — tick-driven, no setTimeout
    engine.checkExpiry(assetPrices)

    // Check pending entry orders
    engine.checkPendingOrders(assetPrices)

    // Check price alerts
    const triggered = engine.checkAlerts(alertsRef.current, assetPrices)
    if (triggered.length > 0) {
      setAlerts(prev => {
        const next = prev.map(a => triggered.includes(a.id) ? { ...a, triggered: true } : a)
        try { localStorage.setItem('autobot_alerts', JSON.stringify(next)) } catch { /* noop */ }
        return next
      })
    }
  }, [assets, engine])

  // ── Push notify on trade results ──
  const lastTradeRef = useRef(null)
  useEffect(() => {
    if (engine.lastTradeResult && engine.lastTradeResult !== lastTradeRef.current) {
      lastTradeRef.current = engine.lastTradeResult
      const profit = engine.lastTradeProfit
      if (engine.lastTradeResult === 'win') {
        pushNotify.notify('Trade Won!', `+$${profit.toFixed(2)} — Balance: $${engine.balance.toFixed(0)}`)
      } else {
        pushNotify.notify('Trade Lost', `-$${Math.abs(profit || engine.baseAmount).toFixed(2)} — Balance: $${engine.balance.toFixed(0)}`)
      }
    }
  }, [engine.lastTradeResult, engine.lastTradeProfit, engine.balance])

  // ── Sync active economic events into the engine (for news blocker) ──
  useEffect(() => {
    const update = () => {
      const active = getActiveEvents()
      engine.newsBlockEnabled = engine.newsBlockEnabled // preserve setting
      engine.activeNewsEvents = active
    }
    update()
    const t = setInterval(update, 30000) // refresh every 30s
    return () => clearInterval(t)
  }, [engine])

  // ── Trade actions — resolve entry price from UI state, delegate to engine ──

  const handlePlaceTrade = useCallback((direction, amount, duration, tp = 0, sl = 0) => {
    if (!activeTab) return false
    const currentHistory = activeTab.priceHistory
    const entryPrice = currentHistory?.[currentHistory.length - 1]?.price
      || assets.find(a => a.name === activeTab.asset)?.price
      || 1
    const asset = assets.find(a => a.name === activeTab.asset)
    const payoutPercent = asset?.payout || 82

    return engine.placeTrade(
      direction, amount, duration, tp, sl,
      activeTab.asset, payoutPercent, entryPrice
    )
  }, [activeTab, assets, engine.placeTrade])

  const handleClosePosition = useCallback((posId) => {
    const pos = engine.positions.find(p => p.id === posId)
    const asset = assets.find(a => a.name === pos?.asset)
    return engine.closePosition(posId, asset?.price || 0)
  }, [assets, engine.positions, engine.closePosition])

  const handleDoubleUp = useCallback((pos) => {
    const asset = assets.find(a => a.name === pos.asset)
    return engine.doubleUp(pos, asset?.price || pos.entryPrice)
  }, [assets, engine.doubleUp])

  // ── Chart reset key — incremented on tab open/close to reset zoom/pan ──
  const [chartResetKey, setChartResetKey] = useState(0)

  // ── Tab management ──
  const handleAssetSelect = useCallback((name) => {
    setActiveSection('trade')
    const existing = tabs.find(t => t.asset === name)
    if (existing) {
      setActiveTabId(existing.id)
      return
    }
    if (tabs.length >= MAX_TABS) {
      addToast(`Max ${MAX_TABS} tabs`, 'error')
      return
    }
    const asset = assets.find(a => a.name === name)
    const derivSymbol = asset?.derivSymbol
    const newTab = {
      id: `tab-${Date.now()}`,
      asset: name,
      priceHistory: [],
      candleHistory: [],
      timeframe: '1m',
    }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
    setChartResetKey(k => k + 1)
    if (derivSymbol) {
      marketData.subscribe([derivSymbol])
      marketData.fetchCandles(derivSymbol, 60, 1440)
    }
  }, [tabs, assets, addToast, marketData])

  const handleCloseTab = useCallback((tabId) => {
    candleStoreRef.current.delete(tabId)
    historyReadyRef.current.delete(tabId)
    setChartResetKey(k => k + 1)
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId)
      if (activeTabId === tabId) {
        const idx = prev.findIndex(t => t.id === tabId)
        const newActive = filtered[Math.min(idx, filtered.length - 1)]
        setActiveTabId(newActive?.id || null)
      }
      return filtered
    })
  }, [tabs, activeTabId])

  const handleTabClick = useCallback((tabId) => {
    setActiveTabId(tabId)
    setActiveSection('trade')
  }, [])

  const handleTimeframeChange = useCallback((tf) => {
    delete candleEpochRef.current[activeTabId]

    // Check if we already have real history for this timeframe in the store
    const store = candleStoreRef.current.get(activeTabId)
    const ready = historyReadyRef.current.get(activeTabId)?.has(tf)
    if (ready) {
      const cached = store?.get(tf)
      if (cached && cached.length > 0) {
        // Use cached candles immediately — no blank flash
        syncCandlesToTab(activeTabId, tf, cached)
      }
    }

    setTabs(prev => prev.map(t => {
      if (t.id !== activeTabId) return t
      return { ...t, timeframe: tf }
    }))
    const activeTab = tabsRef.current.find(t => t.id === activeTabId)
    const asset = assetsRef.current.find(a => a.name === activeTab?.asset)
    if (asset?.derivSymbol) {
      const granularity = Math.floor((TF_MAP[tf] || 60000) / 1000)
      marketData.fetchCandles(asset.derivSymbol, granularity, 1440)
    }
  }, [activeTabId, marketData, syncCandlesToTab])

  // ── Mobile panel toggles ──
  const [mobilePanel, setMobilePanel] = useState(null) // 'assets' | 'trade' | null

  // ── Derived ──
  const openPositions = engine.positions.filter(p => p.status === 'open')
  const closedPositions = engine.positions.filter(p => p.status !== 'open')

  return (
    <div className="trading-terminal">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        positionsCount={openPositions.length}
      />

      {activeSection === 'trade' && (
        <>
          <AssetPanel
            assets={assets}
            selectedAsset={activeTab?.asset || ''}
            onSelectAsset={(name) => { handleAssetSelect(name); setMobilePanel(null) }}
            mobileOpen={mobilePanel === 'assets'}
            onCloseMobile={() => setMobilePanel(null)}
            tradeHistory={(() => {
              const stored = loadTradeHistory()
              const closed = engine.positions.filter(p => p.status !== 'open')
              const ids = new Set()
              return [...closed.map(p => ({
                id: p.id, asset: p.asset, direction: p.direction,
                amount: p.amount, status: p.status, pnl: p.pnl,
              })), ...stored].filter(t => {
                if (ids.has(t.id)) return false
                ids.add(t.id)
                return true
              })
            })()}
          />

          {activeTab ? (<>
          <div className="chart-area-wrapper">
            <div className="tab-bar">
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`chart-tab ${activeTabId === tab.id ? 'active' : ''}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600,
                    color: activeTabId === tab.id ? '#fff' : 'var(--text-muted, #666)',
                    background: activeTabId === tab.id ? 'var(--bg-elevated, #171a21)' : 'transparent',
                    borderBottom: activeTabId === tab.id ? '2px solid var(--brand, #f57b00)' : '2px solid transparent',
                    whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}
                >
                  <span>{tab.asset}</span>
                  {tabs.length > 1 && (
                    <X size={12} onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id) }}
                      style={{ opacity: 0.5, cursor: 'pointer', flexShrink: 0 }} />
                  )}
                </div>
              ))}
              {tabs.length < MAX_TABS && (
                <div
                  className="chart-tab-add"
                  onClick={() => { /* focus asset panel search */ }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '8px 12px', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: 16,
                  }}
                  title="Add new pair from the asset list"
                >
                  <Plus size={14} />
                </div>
              )}
            </div>

            <ChartArea
              selectedAsset={activeTab.asset}
              assets={assets}
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={handleTabClick}
              chartLayout={chartLayout}
              onSetChartLayout={handleSetChartLayout}
              timeframe={activeTab.timeframe}
              onTimeframeChange={handleTimeframeChange}
              priceHistory={activeTab.priceHistory}
              candleHistory={activeTab.candleHistory}
              connected={marketData.connected}
              isLive={marketData.connected}
              chartResetKey={chartResetKey}
              toastDuration={toastDuration}
              onToastDurationChange={handleToastDurationChange}
              confirmTrades={confirmTrades}
              onToggleConfirmTrades={toggleConfirmTrades}
              positions={engine.positions}
              alerts={alerts}
              onAddAlert={addAlert}
              onRemoveAlert={removeAlert}
              priceMode={priceMode}
              trendDir={trendDir}
              onSetPriceMode={handleSetPriceMode}
              onSetTrendDir={handleSetTrendDir}
              isReplaying={isReplaying}
              replaySpeed={replaySpeed}
              replayProgress={replayProgress}
              onStartReplay={startReplay}
              onStopReplay={stopReplay}
              onToggleReplayPause={toggleReplayPause}
              onSetReplaySpeed={setReplaySpeed}
              pushEnabled={pushNotify.enabled}
              pushPermission={pushNotify.permission}
              onTogglePush={pushNotify.toggle}
            />
          </div>

          <TradePanel
            selectedAsset={activeTab.asset}
            assets={assets}
            positions={engine.positions}
            balance={engine.balance}
            onPlaceTrade={handlePlaceTrade}
            onClosePosition={handleClosePosition}
            maxOpen={MAX_OPEN}
            soundMuted={soundMuted}
            onToggleSound={toggleSound}
            dailyPnl={engine.dailyPnl}
            confirmTrades={confirmTrades}
            lastTradeResult={engine.lastTradeResult}
            lastTradeProfit={engine.lastTradeProfit}
            baseAmount={engine.baseAmount}
            onDoubleUp={handleDoubleUp}
            onExtendPosition={engine.extendPosition}
            onSetPositionNote={engine.setPositionNote}
            onResetAccount={engine.resetAccount}
            mobileOpen={mobilePanel === 'trade'}
            onCloseMobile={() => setMobilePanel(null)}
            pendingOrders={engine.pendingOrders}
            dailyTradeCount={engine.dailyTradeCount}
            dailyLossLimit={engine.dailyLossLimit}
            maxPositionPct={engine.maxPositionPct}
            maxDailyTrades={engine.maxDailyTrades}
            onSetDailyLossLimit={engine.setDailyLossLimit}
            onSetMaxPositionPct={engine.setMaxPositionPct}
            onSetMaxDailyTrades={engine.setMaxDailyTrades}
            minPayoutPct={engine.minPayoutPct}
            onSetMinPayoutPct={engine.setMinPayoutPct}
            newsBlockEnabled={engine.newsBlockEnabled}
            newsBlockLevels={engine.newsBlockLevels}
            onSetNewsBlockEnabled={engine.setNewsBlockEnabled}
            onSetNewsBlockLevels={engine.setNewsBlockLevels}
            onPlacePendingOrder={engine.placePendingOrder}
            onCancelPendingOrder={engine.cancelPendingOrder}
          />
          </>) : (
            <div style={{ gridColumn: '2 / 5', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Select an asset from the left panel to start trading
            </div>
          )}
        </>
      )}

      {activeSection === 'positions' && (
        <div style={{ gridColumn: '2 / 5', padding: 20, overflow: 'auto' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Open Positions</h2>
          {openPositions.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No open positions</div>
          )}
          {openPositions.map(pos => {
            const elapsed = ((Date.now() - pos.openTime) / 1000)
            const progress = Math.min(100, (elapsed / pos.duration) * 100)
            return (
              <div key={pos.id} className="position-item">
                <div className="position-item-header">
                  <span className="position-item-asset">{pos.asset}</span>
                  <span className={`position-item-type ${pos.direction}`}>{pos.direction.toUpperCase()}</span>
                </div>
                <div className="position-item-details">
                  <span>${pos.amount} · {pos.duration}s</span>
                  <span className="position-item-pnl open">{elapsed.toFixed(0)}s</span>
                </div>
                <div className="position-progress">
                  <div className={`position-progress-bar ${pos.direction}`} style={{ width: `${progress}%` }} />
                </div>
                <button onClick={() => handleClosePosition(pos.id)}
                  style={{ marginTop: 6, padding: '4px 10px', fontSize: 11, background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>
                  Close Early (65% refund)
                </button>
              </div>
            )
          })}
        </div>
      )}

      {activeSection === 'history' && (
        <HistoryView tradeHistory={closedPositions} storedHistory={loadTradeHistory()} onNavigateJournal={() => setActiveSection('journal')} />
      )}

      {activeSection === 'analytics' && (
        <AnalyticsView positions={engine.positions} storedHistory={loadTradeHistory()} />
      )}

      {activeSection === 'calendar' && (
        <EconomicCalendar />
      )}

      {activeSection === 'journal' && (
        <JournalView positions={engine.positions} storedHistory={loadTradeHistory()} />
      )}

      {activeSection === 'heatmap' && (
        <HeatmapView assets={assets} positions={engine.positions} storedHistory={loadTradeHistory()} />
      )}

      {activeSection === 'correlation' && (
        <CorrelationMatrix assets={assets} />
      )}

      {activeSection === 'backtest' && (
        <BacktesterView assets={assets} />
      )}

      <ToastContainer toasts={toasts} />

      {/* Mobile bottom bar — visible only on small screens */}
      <nav className="mobile-bottom-bar">
        <button className={`mobile-bar-btn ${activeSection === 'trade' && mobilePanel !== 'assets' && mobilePanel !== 'trade' ? 'active' : ''}`}
          onClick={() => { setActiveSection('trade'); setMobilePanel(null) }}>
          <CandlestickChart size={18} />
          <span>Trade</span>
        </button>
        <button className={`mobile-bar-btn ${mobilePanel === 'assets' ? 'active' : ''}`}
          onClick={() => setMobilePanel(mobilePanel === 'assets' ? null : 'assets')}>
          <List size={18} />
          <span>Assets</span>
        </button>
        <button className={`mobile-bar-btn ${activeSection === 'positions' ? 'active' : ''}`}
          onClick={() => { setActiveSection('positions'); setMobilePanel(null) }}>
          {openPositions.length > 0 && <span className="badge">{openPositions.length}</span>}
          <LayoutDashboard size={18} />
          <span>Pos</span>
        </button>
        <button className={`mobile-bar-btn ${activeSection === 'history' ? 'active' : ''}`}
          onClick={() => { setActiveSection('history'); setMobilePanel(null) }}>
          <History size={18} />
          <span>History</span>
        </button>
        <button className={`mobile-bar-btn ${activeSection === 'calendar' ? 'active' : ''}`}
          onClick={() => { setActiveSection('calendar'); setMobilePanel(null) }}>
          <Calendar size={18} />
          <span>Cal</span>
        </button>
        <button className={`mobile-bar-btn ${activeSection === 'heatmap' ? 'active' : ''}`}
          onClick={() => { setActiveSection('heatmap'); setMobilePanel(null) }}>
          <Grid3X3 size={18} />
          <span>Heat</span>
        </button>
        <button className={`mobile-bar-btn ${activeSection === 'correlation' ? 'active' : ''}`}
          onClick={() => { setActiveSection('correlation'); setMobilePanel(null) }}>
          <Table2 size={18} />
          <span>Corr</span>
        </button>
        <button className={`mobile-bar-btn ${activeSection === 'journal' ? 'active' : ''}`}
          onClick={() => { setActiveSection('journal'); setMobilePanel(null) }}>
          <BookOpen size={18} />
          <span>Journal</span>
        </button>
      </nav>
    </div>
  )
}
