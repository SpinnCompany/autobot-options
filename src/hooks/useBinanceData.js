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

  useEffect(() => {
    let settled = false

    const feed = new BinanceFeed({
      onTick: (symbol, price, _epoch) => {
        if (!price) return
        onAssetTickRef.current?.(symbol, price)

        setAssets(prev => prev.map(a => {
          if (a.brokerSymbol !== symbol) return a
          if (!a.price || a.price <= 0) return { ...a, price: parseFloat(price.toFixed(5)), change: '0.00', source: 'binance' }
          const chg = ((price - a.price) / a.price * 100)
          return { ...a, price: parseFloat(price.toFixed(5)), change: chg.toFixed(2), source: 'binance' }
        }))
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
