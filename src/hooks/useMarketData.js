import { useState, useEffect, useRef, useCallback } from 'react'
import { DerivFeed } from './feeds/DerivFeed'
import { normalizeDerivSymbol } from '../data/derivMapping'

export function useMarketData({ onAssetTick, onCandles } = {}) {
  const [assets, setAssets] = useState([])
  const [connected, setConnected] = useState(false)
  const feedRef = useRef(null)
  const tickCountRef = useRef(0)
  const symbolTicksRef = useRef(new Map())
  const onAssetTickRef = useRef(onAssetTick)
  onAssetTickRef.current = onAssetTick
  const onCandlesRef = useRef(onCandles)
  onCandlesRef.current = onCandles

  // rAF-batched asset price updates — prevents render floods from high-frequency ticks
  const priceBufRef = useRef(new Map())  // symbol → price
  const priceRafRef = useRef(null)
  const assetsRef = useRef(assets)
  assetsRef.current = assets

  const flushPriceUpdates = useCallback(() => {
    priceRafRef.current = null
    const updates = [...priceBufRef.current.entries()]
    priceBufRef.current.clear()
    if (updates.length === 0) return
    setAssets(prev => {
      let next = prev
      for (const [symbol, price] of updates) {
        next = next.map(a => {
          if (a.derivSymbol !== symbol) return a
          if (!a.price || a.price <= 0) return { ...a, price, change: '0.00', source: 'deriv' }
          const chg = ((price - a.price) / a.price * 100)
          return { ...a, price, change: chg.toFixed(2), source: 'deriv' }
        })
      }
      return next
    })
  }, [])

  useEffect(() => {
    let settled = false

    const feed = new DerivFeed({
      onTick: (symbol, price, _epoch) => {
        if (!price) return
        onAssetTickRef.current?.(symbol, price)

        const tickPrice = parseFloat(price.toFixed(5))
        priceBufRef.current.set(symbol, tickPrice)
        if (!priceRafRef.current) {
          priceRafRef.current = requestAnimationFrame(flushPriceUpdates)
        }

        symbolTicksRef.current.set(symbol, (symbolTicksRef.current.get(symbol) || 0) + 1)
        tickCountRef.current++
      },
      onSymbols: (raw) => {
        if (settled) return
        settled = true
        const normalized = raw.map(normalizeDerivSymbol).filter(Boolean)
        setAssets(normalized.map(s => ({ ...s, source: 'deriv' })))
        feed.subscribe(normalized.map(s => s.derivSymbol))
      },
      onCandles: (symbol, candles) => {
        onCandlesRef.current?.(symbol, candles)
      },
      onStatus: (status) => {
        setConnected(status === 'connected')
      },
      onError: (msg) => console.warn('[Deriv]', msg),
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

  /** Fetch OHLC history via the shared DerivFeed connection. Response comes via onCandles callback. */
  const fetchCandles = useCallback((symbol, granularity, count = 200) => {
    feedRef.current?.fetchCandles(symbol, granularity, count)
  }, [])

  return { assets, connected, subscribe, fetchCandles }
}
