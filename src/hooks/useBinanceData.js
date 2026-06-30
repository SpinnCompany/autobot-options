import { useState, useEffect, useRef, useCallback } from 'react'
import { BinanceFeed } from './feeds/BinanceFeed'
import { normalizeBinanceSymbol } from '../data/binanceMapping'
import { recordHookTick, recordSubscribe, recordConnection } from '../utils/tickDebug'
import { SubscriptionManager } from '../utils/subscriptionManager'

export function useBinanceData({ onAssetTick, onCandles } = {}) {
  const [assets, setAssets] = useState([])
  const [connected, setConnected] = useState(false)
  const [subCount, setSubCount] = useState(0)          // unique symbols subscribed
  const [subSymbols, setSubSymbols] = useState([])      // active symbol list
  const feedRef = useRef(null)
  const subManagerRef = useRef(new SubscriptionManager())
  const onAssetTickRef = useRef(onAssetTick)
  onAssetTickRef.current = onAssetTick
  const onCandlesRef = useRef(onCandles)
  onCandlesRef.current = onCandles

  // Propagate subscription changes to UI state
  const syncSubState = useCallback(() => {
    const mgr = subManagerRef.current
    setSubCount(mgr.activeCount)
    setSubSymbols(mgr.activeSymbols)
  }, [])

  // Wire up SubscriptionManager → feed immediately (not in useEffect).
  // Must be set before any subscribe() calls which may happen during the
  // first render via auto-open tab or tab restoration.
  // feedRef is set synchronously below in the main useEffect.
  subManagerRef.current.onChange = (added, removed) => {
    if (added && added.length > 0) {
      recordSubscribe('binance', added)
      feedRef.current?.subscribe(added)
    }
    if (removed && removed.length > 0) {
      feedRef.current?.unsubscribe(removed)
    }
    syncSubState()
  }

  // Batched asset price updates — throttled to ~4 Hz (every 250ms) to prevent
  // render floods from 441 Binance pairs ticking at 1 tick/sec each.
  const priceBufRef = useRef(new Map()) // symbol → price
  const priceTimerRef = useRef(null)

  const flushPriceUpdates = useCallback(() => {
    priceTimerRef.current = null
    const updates = [...priceBufRef.current.entries()]
    priceBufRef.current.clear()
    if (updates.length === 0) return
    setAssets(prev => {
      // Only update if price actually differs (skip same-value ticks)
      let next = prev
      let changed = false
      for (const [symbol, price] of updates) {
        next = next.map(a => {
          if (a.brokerSymbol !== symbol) return a
          const prevPrice = a.price || 0
          if (Math.abs(price - prevPrice) < 0.00001) return a // unchanged
          changed = true
          const chg = prevPrice > 0 ? ((price - prevPrice) / prevPrice * 100) : 0
          return { ...a, price, change: chg.toFixed(2), source: 'binance' }
        })
      }
      return changed ? next : prev
    })
  }, [])

  useEffect(() => {
    let settled = false

    const feed = new BinanceFeed({
      onTick: (symbol, price, _epoch) => {
        if (!price) return
        recordHookTick(symbol, 'binance')
        onAssetTickRef.current?.(symbol, price)

        const tickPrice = parseFloat(price.toFixed(5))
        // Batch price updates — flush at most every 250ms
        priceBufRef.current.set(symbol, tickPrice)
        if (!priceTimerRef.current) {
          priceTimerRef.current = setTimeout(flushPriceUpdates, 250)
        }
      },
      onSymbols: (raw) => {
        if (settled) return
        settled = true
        const normalized = raw.map(normalizeBinanceSymbol).filter(Boolean)
        setAssets(normalized.map(s => ({ ...s, source: 'binance' })))
        // Do NOT subscribe to all symbols here — per-client tick filtering
        // relies on subscriptions happening only when tabs actually open.
        // Each tab open calls binanceData.subscribe([symbol], tabId) in handleAssetSelect.
      },
      onCandles: (symbol, candles) => {
        onCandlesRef.current?.(symbol, candles)
      },
      onStatus: (status) => {
        setConnected(status === 'connected')
        recordConnection('binance', status === 'connected')
        // Reset settled on disconnect so a reconnection triggers fresh
        // symbol sync — otherwise the settled guard permanently blocks
        // onSymbols after the first connection.
        if (status === 'disconnected') settled = false
      },
      onError: (msg) => console.warn('[Binance]', msg),
    })

    feedRef.current = feed
    feed.connect()

    return () => {
      feed.disconnect()
      feedRef.current = null
    }
  }, [])

  /** Subscribe to symbols for a specific tab. Uses reference counting —
   *  only sends subscribe to proxy when the first tab needs a symbol. */
  const subscribe = useCallback((symbols, tabId = 'default') => {
    subManagerRef.current.subscribe(tabId, symbols)
  }, [])

  /** Unsubscribe symbols for a specific tab. Only sends unsubscribe to proxy
   *  when NO remaining tabs need the symbol. */
  const unsubscribe = useCallback((symbols, tabId = 'default') => {
    subManagerRef.current.unsubscribe(tabId, symbols)
  }, [])

  /** Unsubscribe ALL symbols for a tab — call on tab close. */
  const unsubscribeAll = useCallback((tabId) => {
    subManagerRef.current.unsubscribeAll(tabId)
  }, [])

  /** Re-subscribe all active symbols — call after reconnection if needed. */
  const resubscribeAll = useCallback(() => {
    const active = subManagerRef.current.activeSymbols
    if (active.length > 0) {
      feedRef.current?.subscribe(active)
    }
  }, [])

  const fetchCandles = useCallback((symbol, granularity, count = 200) => {
    feedRef.current?.fetchCandles(symbol, granularity, count)
  }, [])

  return {
    assets,
    connected,
    subCount,
    subSymbols,
    subscribe,
    unsubscribe,
    unsubscribeAll,
    resubscribeAll,
    fetchCandles,
  }
}
