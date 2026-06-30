import { useState, useEffect, useRef, useCallback } from 'react'
import { BinanceFeed } from './feeds/BinanceFeed'
import { normalizeBinanceSymbol } from '../data/binanceMapping'
import { recordHookTick, recordSubscribe, recordConnection } from '../utils/tickDebug'

export function useBinanceData({ onAssetTick, onCandles } = {}) {
  const [assets, setAssets] = useState([])
  const [connected, setConnected] = useState(false)
  const feedRef = useRef(null)
  const onAssetTickRef = useRef(onAssetTick)
  onAssetTickRef.current = onAssetTick
  const onCandlesRef = useRef(onCandles)
  onCandlesRef.current = onCandles

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
        // Each tab open calls binanceData.subscribe([symbol]) in handleAssetSelect.
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

  const subscribe = useCallback((symbols) => {
    recordSubscribe('binance', symbols)
    feedRef.current?.subscribe(symbols)
  }, [])

  const fetchCandles = useCallback((symbol, granularity, count = 200) => {
    feedRef.current?.fetchCandles(symbol, granularity, count)
  }, [])

  return { assets, connected, subscribe, fetchCandles }
}
