/**
 * BinanceFeed — WebSocket adapter for binance-proxy backend.
 *
 * Architecture:
 *   Binance WS ←→ binance-proxy.js (:8092) ←→ BinanceFeed (browser)
 *
 * Mirrors DerivFeed.js interface exactly so App.jsx can consume
 * both feeds through the same callback patterns.
 *
 * Dev:  ws://localhost:8092
 * Prod: wss://options.autobotsignal.io/ws/binance
 */

import { recordFeedTick, recordConnection } from '../../utils/tickDebug'

const PROXY_URL = import.meta.env.VITE_BINANCE_WS_URL

// Guards against Chrome Private Network Access permission prompts:
// Don't try localhost fallback from an HTTPS page — mixed-content WS is blocked,
// and the connection attempt triggers "access other apps and services" dialogs.
function getProxyUrl() {
  if (PROXY_URL) return PROXY_URL
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  if (isHttps) return null // No fallback on production HTTPS — needs deployed proxy
  return 'ws://localhost:8092'
}

export class BinanceFeed {
  ws = null
  connected = false
  reconnectDelay = 2000
  maxReconnectDelay = 30000
  reconnectTimer = null
  intentionalClose = false
  pendingSubs = new Set()
  _pendingMessages = []

  // Callbacks set by consumer
  onTick = null       // (symbol, price, epoch) => void
  onSymbols = null    // (symbols[]) => void
  onCandles = null    // (symbol, candles[]) => void
  onStatus = null     // (status: 'connecting'|'connected'|'disconnected'|'error') => void
  onError = null      // (message: string) => void

  constructor({ onTick, onSymbols, onCandles, onStatus, onError } = {}) {
    this.onTick = onTick
    this.onSymbols = onSymbols
    this.onCandles = onCandles
    this.onStatus = onStatus
    this.onError = onError
  }

  connect() {
    this.intentionalClose = false
    this._connect()
  }

  disconnect() {
    this.intentionalClose = true
    this.pendingSubs.clear()
    this._pendingMessages.length = 0
    clearTimeout(this.reconnectTimer)
    if (this.ws) {
      this.ws.onerror = null
      this.ws.onclose = null
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close()
      }
      this.ws = null
    }
    this.connected = false
  }

  subscribe(symbols) {
    for (const s of symbols) this.pendingSubs.add(s)
    this._send({ type: 'subscribe', symbols })
  }

  unsubscribe(symbols) {
    for (const s of symbols) this.pendingSubs.delete(s)
    this._send({ type: 'unsubscribe', symbols })
  }

  getActiveSymbols() {
    this._send({ type: 'get_symbols' })
  }

  /** Request OHLC history — reuses existing WS connection. */
  fetchCandles(symbol, granularity, count = 200) {
    this._send({ type: 'market:candles', symbol, granularity, count })
  }

  // ── Internal ────────────────────────────────────────────

  _connect() {
    const url = getProxyUrl()
    if (!url) {
      // No proxy configured for this environment — silently skip.
      // This prevents Chrome's Private Network Access permission prompt
      // when the HTTPS production site has no binance-proxy deployed.
      this.connected = false
      return
    }
    this.onStatus?.('connecting')
    try { this.ws = new WebSocket(url) } catch (e) {
      this._scheduleReconnect(); return
    }

    this.ws.onopen = () => {
      this.connected = true
      this.reconnectDelay = 2000
      recordConnection('binance', true)
      this._send({ type: 'get_symbols' })
      if (this.pendingSubs.size > 0) {
        this._send({ type: 'subscribe', symbols: [...this.pendingSubs] })
      }
      // Flush queued messages
      const queued = this._pendingMessages.splice(0)
      for (const data of queued) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(data))
        }
      }
    }

    this.ws.onmessage = (event) => {
      try { this._handle(JSON.parse(event.data)) } catch {}
    }

    this.ws.onerror = () => {
      if (this.intentionalClose) return
      this.connected = false
      this.onError?.('Binance proxy connection error')
    }

    this.ws.onclose = () => {
      this.connected = false
      recordConnection('binance', false)
      if (!this.intentionalClose) {
        this.onStatus?.('disconnected')
        this._scheduleReconnect()
      }
    }
  }

  _scheduleReconnect() {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      this._connect()
    }, this.reconnectDelay)
  }

  _send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    } else {
      this._pendingMessages.push(data)
    }
  }

  _handle(msg) {
    const type = msg.type || ''

    if (type === 'tick' && msg.symbol && msg.price != null) {
      recordFeedTick(msg.symbol, msg.price, msg.epoch, 'binance')
      this.onTick?.(msg.symbol, msg.price, msg.epoch)
      return
    }

    if (type === 'symbols') {
      this.onSymbols?.(msg.symbols)
      return
    }

    if (type === 'candles' && msg.symbol) {
      const raw = msg.candles
      if (Array.isArray(raw)) {
        const mapped = raw.map(c => ({
          time: (c.epoch || 0) * 1000,
          open: c.open, high: c.high, low: c.low, close: c.close, v: c.volume || 0,
        }))
        this.onCandles?.(msg.symbol, mapped)
      }
      return
    }

    if (type === 'status') {
      if (msg.status === 'connected' && !this.connected) {
        this.connected = true
        this.reconnectDelay = 2000
        this._send({ type: 'get_symbols' })
        if (this.pendingSubs.size > 0) {
          this._send({ type: 'subscribe', symbols: [...this.pendingSubs] })
        }
        // Flush queued messages
        const queued = this._pendingMessages.splice(0)
        for (const data of queued) {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data))
          }
        }
      }
      this.onStatus?.(msg.status)
      recordConnection('binance', msg.status === 'connected')
      if (msg.status === 'error') this.onError?.(msg.message || 'Binance proxy error')
      return
    }

    if (type === 'error') {
      this.onError?.(msg.message || 'Error')
    }
  }
}
