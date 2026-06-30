import { useState, useEffect, useRef, useCallback } from 'react'
import { BinanceFeed } from './feeds/BinanceFeed'
import { normalizeBinanceSymbol } from '../data/binanceMapping'

export function useBinanceData({ onAssetTick, onCandles } = {}) {
  const [assets, setAssets] = useState([])
  const [connected, setConnected] = useState(false)
  const feedRef = useRef(null)
  const onAssetTickRef = useRef(onAssetTick)
  onAssetTickRef.current = onAssetTick
  const onCandlesRef = useRef(onCandles)
  onCandlesRef.current = onCandles

  // rAF-batched asset price updates — prevents render floods when many
  // pairs tick simultaneously (e.g. 441 Binance pairs at 1 tick/sec each).
  const priceBufRef = useRef(new Map()) // symbol → price
  const priceRafRef = useRef(null)

  const flushPriceUpdates = useCallback(() => {
    priceRafRef.current = null
    const updates = [...priceBufRef.current.entries()]
    priceBufRef.current.clear()
    if (updates.length === 0) return
    setAssets(prev => {
      let next = prev
      for (const [symbol, price] of updates) {
        next = next.map(a => {
          if (a.brokerSymbol !== symbol) return a
          if (!a.price || a.price <= 0) return { ...a, price, change: '0.00', source: 'binance' }
          const chg = ((price - a.price) / a.price * 100)
          return { ...a, price, change: chg.toFixed(2), source: 'binance' }
        })
      }
      return next
    })
  }, [])

  useEffect(() => {
    let settled = false

    const feed = new BinanceFeed({
      onTick: (symbol, price, _epoch) => {
        if (!price) return
        onAssetTickRef.current?.(symbol, price)

        const tickPrice = parseFloat(price.toFixed(5))
        // Batch price updates via rAF
        priceBufRef.current.set(symbol, tickPrice)
        if (!priceRafRef.current) {
          priceRafRef.current = requestAnimationFrame(flushPriceUpdates)
        }
      },
      onSymbols: (raw) => {
        if (settled) return
        settled = true
        const normalized = raw.map(normalizeBinanceSymbol).filter(Boolean)
        setAssets(normalized.map(s => ({ ...s, source: 'binance' })))
        feed.subscribe(normalized.map(s => s.brokerSymbol))
      },
      onCandles: (symbol, candles) => {
        onCandlesRef.current?.(symbol, candles)
      },
      onStatus: (status) => {
        setConnected(status === 'connected')
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
    feedRef.current?.subscribe(symbols)
  }, [])

  const fetchCandles = useCallback((symbol, granularity, count = 200) => {
    feedRef.current?.fetchCandles(symbol, granularity, count)
  }, [])

  return { assets, connected, subscribe, fetchCandles }
}
