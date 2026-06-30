import { useState, useEffect, useRef, useCallback } from 'react'
import { DerivFeed } from './feeds/DerivFeed'
import { normalizeDerivSymbol } from '../data/derivMapping'

const PROXY_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8091'

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

  useEffect(() => {
    let settled = false

    const feed = new DerivFeed({
      onTick: (symbol, price, _epoch) => {
        if (!price) return
        onAssetTickRef.current?.(symbol, price)

        setAssets(prev => prev.map(a => {
          if (a.derivSymbol !== symbol) return a
          if (!a.price || a.price <= 0) return { ...a, price: parseFloat(price.toFixed(5)), change: '0.00', source: 'deriv' }
          const chg = ((price - a.price) / a.price * 100)
          return { ...a, price: parseFloat(price.toFixed(5)), change: chg.toFixed(2), source: 'deriv' }
        }))

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

  /** Fetch OHLC history via dedicated WebSocket. Response comes via onCandles callback. */
  const fetchCandles = useCallback((symbol, granularity, count = 200) => {
    const ws = new WebSocket(PROXY_URL)
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'market:candles', symbol, granularity, count }))
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'candles' && Array.isArray(msg.candles)) {
          const mapped = msg.candles.map(c => ({
            time: (c.epoch || 0) * 1000,
            open: c.open, high: c.high, low: c.low, close: c.close, v: c.volume || 0,
          }))
          onCandlesRef.current?.(msg.symbol, mapped)
          ws.close()
        }
      } catch {}
    }
    ws.onerror = () => { try { ws.close() } catch {} }
    setTimeout(() => { try { ws.close() } catch {} }, 10000)
  }, [])

  return { assets, connected, subscribe, fetchCandles }
}
