import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar'
import AssetPanel from './components/AssetPanel'
import ChartArea from './components/ChartArea'
import TradePanel from './components/TradePanel'
import ToastContainer from './components/ToastContainer'

// ── Lazy-loaded secondary views — code-split from main bundle ──
const HistoryView = lazy(() => import('./components/HistoryView'))
const AnalyticsView = lazy(() => import('./components/AnalyticsView'))
const EconomicCalendar = lazy(() => import('./components/EconomicCalendar'))
const JournalView = lazy(() => import('./components/JournalView'))
const HeatmapView = lazy(() => import('./components/HeatmapView'))
const CorrelationMatrix = lazy(() => import('./components/CorrelationMatrix'))
const BacktesterView = lazy(() => import('./components/BacktesterView'))
import { useSound } from './hooks/useSound'
import { usePushNotifications } from './hooks/usePushNotifications'
import { useMarketData } from './hooks/useMarketData'
import { useBinanceData } from './hooks/useBinanceData'
import { loadTradeHistory, TF_MAP } from './data/mockData'
import { getActiveEvents } from './data/economicCalendar'
import { useDemoEngine, MAX_OPEN } from './engine/DemoEngine'
import { X, Plus, CandlestickChart, LayoutDashboard, History, Calendar, List, BookOpen, Grid3X3, Table2 } from 'lucide-react'
import { recordAppTick, recordFlush, recordTabs } from './utils/tickDebug'

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
    // Collect unique tab+tf keys that need syncing, then read the latest
    // candles from candleStoreRef (which may have been updated by handleCandles
    // with merged history since the tick was queued).
    const keys = [...new Set(tickSyncPendingRef.current.keys())]
    tickSyncPendingRef.current.clear()
    if (keys.length === 0) return
    recordFlush(keys.length)
    // Batch all pending tabs into a single setTabs call.
    // Limit priceHistory to last 200 entries — the chart uses candles for OHLC
    // rendering; priceHistory is only for the sparkline/mini-chart overlay.
    // Building 1440 objects per frame per tab causes GC pressure.
    const MAX_PRICE_POINTS = 200
    setTabs(prev => {
      let next = prev
      for (const key of keys) {
        const [tabId, tf] = key.split(':')
        const store = candleStoreRef.current.get(tabId)
        const candles = store?.get(tf)
        if (!candles || candles.length === 0) continue
        next = next.map(t => {
          if (t.id !== tabId) return t
          const slice = candles.length > MAX_PRICE_POINTS
            ? candles.slice(candles.length - MAX_PRICE_POINTS)
            : candles
          const priceHistory = slice.map(c => ({ time: c.time, price: c.close }))
          return { ...t, candleHistory: [...candles], priceHistory }
        })
      }
      return next
    })
  }, [])

  const syncCandlesToTab = useCallback((tabId, tf, candles) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const MAX_PRICE_POINTS = 200
      const slice = candles.length > MAX_PRICE_POINTS
        ? candles.slice(candles.length - MAX_PRICE_POINTS)
        : candles
      const priceHistory = slice.map(c => ({ time: c.time, price: c.close }))
      // Spread to create a new array reference — React's useMemo in ChartArea
      // depends on reference identity, so in-place mutations won't trigger redraws.
      return { ...t, candleHistory: [...candles], priceHistory }
    }))
  }, [])

  // ── Generic tick handler — routes by source (deriv | binance) ──
  const handleAssetTick = useCallback((symbol, price, source = 'deriv') => {
    if (isReplayingRef.current) return
    const currentAssets = assetsRef.current
    // Source-aware lookup: deriv uses derivSymbol, binance uses brokerSymbol
    const assetData = source === 'binance'
      ? currentAssets.find(a => a.brokerSymbol === symbol)
      : currentAssets.find(a => a.derivSymbol === symbol)
    if (!assetData) return
    const tickPrice = parseFloat(price.toFixed(5))
    const now = Date.now()

    let matchedTabCount = 0
    tabsRef.current.forEach(tab => {
      if (tab.asset !== assetData.name) return
      // Source-aware guard: prevent cross-source tick contamination.
      // If tab has no source (legacy tabs from before source-tracking),
      // auto-assign the source of the first tick that matches its asset.
      if (!tab.source) {
        tab.source = source
      } else if (tab.source !== source) return
      matchedTabCount++
      const tfMs = TF_MAP[tab.timeframe] || 60000
      const alignedT = Math.floor(now / tfMs) * tfMs

      let store = candleStoreRef.current.get(tab.id)
      if (!store) { store = new Map(); candleStoreRef.current.set(tab.id, store) }
      let candles = store.get(tab.timeframe)
      if (!candles || candles.length === 0) {
        candles = [{ time: alignedT, open: tickPrice, high: tickPrice, low: tickPrice, close: tickPrice, v: 1 }]
      }

      const last = candles[candles.length - 1]
      if (!last || last.time !== alignedT) {
        // New candle period — don't touch the old candle's close.
        // It was already set correctly by the last tick of that period.
        candles.push({ time: alignedT, open: tickPrice, high: tickPrice, low: tickPrice, close: tickPrice, v: 1 })
        if (candles.length > MAX_CANDLES) candles.shift()
      } else {
        last.high = Math.max(last.high, tickPrice)
        last.low = Math.min(last.low, tickPrice)
        last.close = tickPrice
        last.v = (last.v || 0) + 1
      }

      store.set(tab.timeframe, candles)
      tickSyncPendingRef.current.set(`${tab.id}:${tab.timeframe}`, candles)
      if (!tickSyncRafRef.current) {
        tickSyncRafRef.current = requestAnimationFrame(flushTickSyncs)
      }
    })
    recordAppTick(symbol, source, matchedTabCount)
  }, [flushTickSyncs])

  // ── Generic candle handler — routes by source ──
  const handleCandles = useCallback((symbol, candles, source = 'deriv') => {
    if (!candles || candles.length === 0) return
    const assetData = source === 'binance'
      ? assetsRef.current.find(a => a.brokerSymbol === symbol)
      : assetsRef.current.find(a => a.derivSymbol === symbol)
    if (!assetData) return
    tabsRef.current.forEach(tab => {
      if (tab.asset !== assetData.name) return
      // Auto-assign source for legacy tabs (same as handleAssetTick)
      if (!tab.source) {
        tab.source = source
      } else if (tab.source !== source) return
      let store = candleStoreRef.current.get(tab.id)
      if (!store) { store = new Map(); candleStoreRef.current.set(tab.id, store) }

      // Merge fetched history with live tick-built candles.
      // Tick-built candles (from handleAssetTick) are the most recent;
      // fetched history fills in the past. Dedup by timestamp.
      const existing = store.get(tab.timeframe) || []
      const existingMap = new Map(existing.map(c => [c.time, c]))
      for (const c of candles) {
        if (!existingMap.has(c.time)) existingMap.set(c.time, c)
      }
      const merged = [...existingMap.values()].sort((a, b) => a.time - b.time)
      // Cap at MAX_CANDLES
      const trimmed = merged.length > MAX_CANDLES ? merged.slice(merged.length - MAX_CANDLES) : merged

      store.set(tab.timeframe, trimmed)
      // Mark timeframe as having real history — enables handleTimeframeChange
      // to use cached candles instead of re-fetching on every switch.
      let ready = historyReadyRef.current.get(tab.id)
      if (!ready) { ready = new Set(); historyReadyRef.current.set(tab.id, ready) }
      ready.add(tab.timeframe)
      syncCandlesToTab(tab.id, tab.timeframe, trimmed)
    })
  }, [syncCandlesToTab])

  const marketData = useMarketData({
    onAssetTick: (sym, price) => handleAssetTick(sym, price, 'deriv'),
    onCandles: (sym, candles) => handleCandles(sym, candles, 'deriv'),
  })
  const binanceData = useBinanceData({
    onAssetTick: (sym, price) => handleAssetTick(sym, price, 'binance'),
    onCandles: (sym, candles) => handleCandles(sym, candles, 'binance'),
  })

  // Merge assets from all sources — deduplicate by name+source composite key
  const prevDerivLen = useRef(0)
  const prevBinanceLen = useRef(0)
  const autoTabOpened = useRef(false)
  const restoredSubsDone = useRef(false)   // guards tab subscription restoration
  useEffect(() => {
    const sources = []
    if (marketData.assets.length > 0) {
      prevDerivLen.current = marketData.assets.length
      sources.push(...marketData.assets)
    }
    if (binanceData.assets.length > 0) {
      prevBinanceLen.current = binanceData.assets.length
      sources.push(...binanceData.assets)
    }
    if (sources.length === 0) return

    setAssets(prev => {
      const existing = new Map(prev.map(a => [`${a.name}::${a.source}`, a]))
      let changed = false
      for (const sa of sources) {
        const key = `${sa.name}::${sa.source}`
        const cur = existing.get(key)
        if (!cur) { existing.set(key, sa); changed = true }
        else if (cur.price !== sa.price && sa.price > 0) {
          existing.set(key, { ...cur, price: sa.price, change: sa.change })
          changed = true
        }
      }
      return changed ? [...existing.values()] : prev
    })

    // Auto-open first tab from whichever source loads first
    if (!autoTabOpened.current && sources.length > 0 && tabsRef.current.length === 0) {
      autoTabOpened.current = true
      const fa = sources[0]
      const newTab = {
        id: 'tab-1',
        asset: fa.name,
        source: fa.source || 'deriv',
        priceHistory: [],
        candleHistory: [],
        timeframe: '1m',
      }
      setTabs([newTab])
      setActiveTabId('tab-1')

      // Mark tab ready immediately — ticks build candles live while history loads
      const readySet = new Set(['1m'])
      historyReadyRef.current.set('tab-1', readySet)

      if (fa.source === 'binance' && fa.brokerSymbol) {
        binanceData.subscribe([fa.brokerSymbol], 'tab-1')
        binanceData.fetchCandles(fa.brokerSymbol, 60, 1440)
      } else if (fa.derivSymbol) {
        marketData.subscribe([fa.derivSymbol], 'tab-1')
        marketData.fetchCandles(fa.derivSymbol, 60, 1440)
      }
    }

    // Restore subscriptions for tabs that survived a page refresh via localStorage.
    // Without this, restored tabs have no active subscriptions and receive zero ticks
    // until the user manually re-opens each tab.
    if (!restoredSubsDone.current && sources.length > 0 && tabsRef.current.length > 0) {
      restoredSubsDone.current = true
      for (const tab of tabsRef.current) {
        // Legacy tabs may not have a source field — match by name only and
        // auto-assign the source from the found asset.
        const asset = tab.source
          ? sources.find(a => a.name === tab.asset && a.source === tab.source)
          : sources.find(a => a.name === tab.asset)
        if (!asset) continue
        // Assign source to legacy tabs so handleAssetTick filtering works
        if (!tab.source) tab.source = asset.source
        if (asset.source === 'binance' && asset.brokerSymbol) {
          binanceData.subscribe([asset.brokerSymbol], tab.id)
          binanceData.fetchCandles(asset.brokerSymbol, 60, 1440)
        } else if (asset.derivSymbol) {
          marketData.subscribe([asset.derivSymbol], tab.id)
          marketData.fetchCandles(asset.derivSymbol, 60, 1440)
        }
      }
    }
  }, [marketData.assets, binanceData.assets])

  // ── Multi‑tab state — persist tabs to localStorage so they survive refresh ──
  const [tabs, setTabs] = useState(() => {
    try {
      const saved = localStorage.getItem('autobot_tabs')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [activeTabId, setActiveTabId] = useState(() => {
    try { return localStorage.getItem('autobot_active_tab') || null } catch { return null }
  })

  // Persist tabs on every change — BUT strip candleHistory/priceHistory
  // (these are rebuilt from live ticks + history fetch on restore).
  // Full candle data per tab would bloat localStorage and slow serialization.
  useEffect(() => {
    recordTabs(tabs)
    try {
      const stripped = tabs.map(t => ({
        id: t.id,
        asset: t.asset,
        timeframe: t.timeframe,
        source: t.source,
      }))
      localStorage.setItem('autobot_tabs', JSON.stringify(stripped))
    } catch {}
  }, [tabs])
  useEffect(() => {
    try { activeTabId ? localStorage.setItem('autobot_active_tab', activeTabId) : localStorage.removeItem('autobot_active_tab') } catch {}
  }, [activeTabId])

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
    const newTab = {
      id: `tab-${Date.now()}`,
      asset: name,
      source: asset?.source || 'deriv',
      priceHistory: [],
      candleHistory: [],
      timeframe: '1m',
    }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
    setChartResetKey(k => k + 1)

    // Mark tab ready immediately — ticks start building candles right away
    // instead of waiting for the full history fetch to complete.
    // When history arrives, it gets merged with the live tick-built candles.
    const readySet = historyReadyRef.current.get(newTab.id) || new Set()
    readySet.add('1m')
    historyReadyRef.current.set(newTab.id, readySet)

    if (asset?.source === 'binance' && asset?.brokerSymbol) {
      binanceData.subscribe([asset.brokerSymbol], newTab.id)
      binanceData.fetchCandles(asset.brokerSymbol, 60, 1440)
    } else if (asset?.derivSymbol) {
      marketData.subscribe([asset.derivSymbol], newTab.id)
      marketData.fetchCandles(asset.derivSymbol, 60, 1440)
    }
  }, [tabs, assets, addToast, marketData, binanceData])

  const handleCloseTab = useCallback((tabId) => {
    // Unsubscribe all symbols for this tab. Reference counting ensures
    // we only tell the proxy to unsubscribe when NO remaining tabs need
    // the symbol (e.g., two tabs viewing BTCUSDT → closing one keeps sub).
    const tab = tabs.find(t => t.id === tabId)
    if (tab?.source === 'binance') {
      binanceData.unsubscribeAll(tabId)
    } else if (tab?.source === 'deriv') {
      marketData.unsubscribeAll(tabId)
    }

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
  }, [tabs, activeTabId, binanceData, marketData])

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
    const granularity = Math.floor((TF_MAP[tf] || 60000) / 1000)
    if (asset?.source === 'binance' && asset?.brokerSymbol) {
      binanceData.fetchCandles(asset.brokerSymbol, granularity, 1440)
    } else if (asset?.derivSymbol) {
      marketData.fetchCandles(asset.derivSymbol, granularity, 1440)
    }
  }, [activeTabId, marketData, binanceData, syncCandlesToTab])

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
            {/* ── Connection status bar ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '2px 14px',
              fontSize: 10, color: 'var(--text-muted)',
              borderBottom: '1px solid var(--bg-elevated)',
              minHeight: 20,
            }}>
              {/* Binance status */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: binanceData.connected ? 'var(--success)' : 'var(--text-muted)',
                  boxShadow: binanceData.connected ? '0 0 4px var(--success)' : 'none',
                  transition: 'all 0.3s',
                }} />
                <span style={{ color: binanceData.connected ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                  Binance{binanceData.connected && binanceData.subCount > 0 ? ` (${binanceData.subCount})` : ''}
                </span>
              </span>
              {/* Deriv status */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: marketData.connected ? 'var(--success)' : 'var(--text-muted)',
                  boxShadow: marketData.connected ? '0 0 4px var(--success)' : 'none',
                  transition: 'all 0.3s',
                }} />
                <span style={{ color: marketData.connected ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                  Deriv{marketData.connected && marketData.subCount > 0 ? ` (${marketData.subCount})` : ''}
                </span>
              </span>
              {/* Total connected feeds */}
              <span style={{ marginLeft: 'auto', opacity: 0.6 }}>
                {(binanceData.connected || marketData.connected) ? 'Live' : 'Connecting...'}
              </span>
            </div>
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
              connected={marketData.connected || binanceData.connected}
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
        <Suspense fallback={<div className="section-loading" />}>
          <HistoryView tradeHistory={closedPositions} storedHistory={loadTradeHistory()} onNavigateJournal={() => setActiveSection('journal')} />
        </Suspense>
      )}

      {activeSection === 'analytics' && (
        <Suspense fallback={<div className="section-loading" />}>
          <AnalyticsView positions={engine.positions} storedHistory={loadTradeHistory()} />
        </Suspense>
      )}

      {activeSection === 'calendar' && (
        <Suspense fallback={<div className="section-loading" />}>
          <EconomicCalendar />
        </Suspense>
      )}

      {activeSection === 'journal' && (
        <Suspense fallback={<div className="section-loading" />}>
          <JournalView positions={engine.positions} storedHistory={loadTradeHistory()} />
        </Suspense>
      )}

      {activeSection === 'heatmap' && (
        <Suspense fallback={<div className="section-loading" />}>
          <HeatmapView assets={assets} positions={engine.positions} storedHistory={loadTradeHistory()} />
        </Suspense>
      )}

      {activeSection === 'correlation' && (
        <Suspense fallback={<div className="section-loading" />}>
          <CorrelationMatrix assets={assets} />
        </Suspense>
      )}

      {activeSection === 'backtest' && (
        <Suspense fallback={<div className="section-loading" />}>
          <BacktesterView assets={assets} />
        </Suspense>
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
