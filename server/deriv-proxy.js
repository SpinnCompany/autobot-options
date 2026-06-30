#!/usr/bin/env node
/**
 * Deriv WebSocket Proxy — autobot-options backend
 *
 * ┌──────────┐     ┌──────────────┐     ┌──────────┐
 * │  Deriv   │ ←→  │ deriv-proxy  │ ←→  │ Frontend │
 * │  wss://  │     │  :8091       │     │  browser │
 * └──────────┘     └──────────────┘     └──────────┘
 *
 * Usage: node server/deriv-proxy.js [port]
 * Default port: 8091
 */

import { WebSocketServer, WebSocket } from 'ws'

const DERIV_WS = 'wss://ws.derivws.com/websockets/v3?app_id=62085'
const PORT = parseInt(process.argv[2] || '8091', 10)

let derivWs = null
let derivConnected = false
const frontendClients = new Set()
const activeSubs = new Set()        // Deriv-level subscriptions
const clientSubs = new Map()        // per-client: client → Set<symbol>
let reconnectTimer = null
let reconnectDelay = 2000

// ── Deriv connection ──────────────────────────────────────

function connectDeriv() {
  if (derivWs && derivWs.readyState === WebSocket.OPEN) return
  log('Connecting to Deriv...')
  derivWs = new WebSocket(DERIV_WS)

  let keepaliveTimer = null

  derivWs.on('open', () => {
    derivConnected = true
    reconnectDelay = 2000
    log('Deriv connected')
    broadcast({ type: 'status', status: 'connected' })

    // Re-subscribe active symbols
    for (const sym of activeSubs) {
      derivWs.send(JSON.stringify({ ticks: sym, subscribe: 1 }))
    }

    // Keepalive ping every 30s — Deriv drops idle connections
    keepaliveTimer = setInterval(() => {
      if (derivWs && derivWs.readyState === WebSocket.OPEN) {
        derivWs.send(JSON.stringify({ time: 1 }))
      }
    }, 30000)
  })

  derivWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      handleDerivMsg(msg)
    } catch {}
  })

  derivWs.on('error', (e) => {
    log('Deriv error:', e.message)
    derivConnected = false
    broadcast({ type: 'status', status: 'error', message: e.message })
  })

  derivWs.on('close', () => {
    derivConnected = false
    clearInterval(keepaliveTimer)
    log('Deriv disconnected')
    broadcast({ type: 'status', status: 'disconnected' })
    scheduleReconnect()
  })
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, 30000)
    connectDeriv()
  }, reconnectDelay)
}

// Track pending candle requests so we can route responses to the right client
const candleRequests = new Map() // req_id → { clientWs, symbol, granularity }

function handleDerivMsg(msg) {
  const type = msg.msg_type || ''

  // Server time ping — ignore, no action needed
  if (type === 'time') return

  // Tick — relay only to subscribed clients (per-client filtering)
  if (type === 'tick' && msg.tick) {
    const t = msg.tick
    if (t.symbol) {
      const px = t.bid && t.ask ? (t.bid + t.ask) / 2 : (t.bid || t.ask || t.quote || 0)
      if (px > 0) {
        sendTick(t.symbol, px, t.epoch)
      }
    }
    return
  }

  // OHLC candles response from Deriv (style: 'candles')
  if (type === 'candles' && msg.req_id) {
    const req = candleRequests.get(msg.req_id)
    if (req) {
      candleRequests.delete(msg.req_id)
      const candles = (msg.candles || []).map(c => ({
        epoch: c.epoch, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0,
      }))
      if (req.clientWs.readyState === WebSocket.OPEN) {
        req.clientWs.send(JSON.stringify({ type: 'candles', symbol: req.symbol, candles }))
      }
    }
    return
  }

  // Tick history response from Deriv (style: 'ticks') — aggregate into candles
  if (type === 'history' && msg.req_id) {
    const req = candleRequests.get(msg.req_id)
    if (req && msg.history?.prices?.length) {
      candleRequests.delete(msg.req_id)
      const prices = msg.history.prices
      const times = msg.history.times || []
      const gran = req.granularity || 60 // seconds
      // Group prices/times into OHLC candles by granularity
      const candleMap = new Map()
      for (let i = 0; i < prices.length; i++) {
        const epoch = times[i] || 0
        const aligned = Math.floor(epoch / gran) * gran
        let c = candleMap.get(aligned)
        if (!c) {
          c = { epoch: aligned, open: prices[i], high: prices[i], low: prices[i], close: prices[i], volume: 0 }
          candleMap.set(aligned, c)
        } else {
          c.high = Math.max(c.high, prices[i])
          c.low = Math.min(c.low, prices[i])
          c.close = prices[i]
        }
      }
      const candles = [...candleMap.values()].sort((a, b) => a.epoch - b.epoch)
      if (req.clientWs.readyState === WebSocket.OPEN) {
        req.clientWs.send(JSON.stringify({ type: 'candles', symbol: req.symbol, candles }))
      }
    }
    return
  }

  // Active symbols — relay to requesting client(s) + broadcast
  if (msg.active_symbols) {
    broadcast({
      type: 'symbols',
      symbols: msg.active_symbols,
    })
    return
  }

  // Echo tick — per-client filtered
  if (msg.echo_req?.ticks && msg.tick) {
    const t = msg.tick
    if (t.symbol) {
      const px = t.bid && t.ask ? (t.bid + t.ask) / 2 : (t.bid || t.ask || t.quote || 0)
      if (px > 0) {
        sendTick(t.symbol, px, t.epoch)
      }
    }
  }
}

// ── Frontend server ───────────────────────────────────────

const wss = new WebSocketServer({ port: PORT })
wss.on('listening', () => log(`Deriv proxy listening on ws://localhost:${PORT}`))
wss.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    log(`Port ${PORT} in use — proxy already running?`)
    process.exit(0)
  }
  throw e
})

wss.on('connection', (clientWs) => {
  frontendClients.add(clientWs)
  // Init empty subscription set — client receives NO ticks until it
  // explicitly subscribes. Closes the race window where new clients
  // get flooded with all Deriv ticks before their first subscribe.
  clientSubs.set(clientWs, new Set())
  log(`Client connected (${frontendClients.size} total)`)

  // Send current status
  clientWs.send(JSON.stringify({
    type: 'status',
    status: derivConnected ? 'connected' : 'disconnected',
  }))

  // Resend symbols if we have them cached
  if (cachedSymbols) {
    clientWs.send(JSON.stringify({ type: 'symbols', symbols: cachedSymbols }))
  }

  clientWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      handleClientMsg(msg, clientWs)
    } catch {}
  })

  clientWs.on('close', () => {
    frontendClients.delete(clientWs)
    clientSubs.delete(clientWs)
    log(`Client disconnected (${frontendClients.size} total)`)
  })

  clientWs.on('error', () => {
    frontendClients.delete(clientWs)
    clientSubs.delete(clientWs)
  })
})

let cachedSymbols = null

function handleClientMsg(msg, clientWs) {
  switch (msg.type) {
    case 'subscribe':
      if (Array.isArray(msg.symbols)) {
        // Track per-client subscriptions for tick filtering
        if (!clientSubs.has(clientWs)) clientSubs.set(clientWs, new Set())
        const csubs = clientSubs.get(clientWs)
        for (const sym of msg.symbols) {
          csubs.add(sym)
          if (activeSubs.has(sym)) continue
          activeSubs.add(sym)
          if (derivConnected && derivWs) {
            derivWs.send(JSON.stringify({ ticks: sym, subscribe: 1 }))
          }
        }
      }
      break

    case 'unsubscribe':
      if (Array.isArray(msg.symbols)) {
        const csubs = clientSubs.get(clientWs)
        if (csubs) for (const sym of msg.symbols) csubs.delete(sym)
        for (const sym of msg.symbols) {
          activeSubs.delete(sym)
          if (derivConnected && derivWs) {
            derivWs.send(JSON.stringify({ ticks: sym, subscribe: 0 }))
          }
        }
      }
      break

    case 'get_symbols':
      if (derivConnected && derivWs) {
        derivWs.send(JSON.stringify({ active_symbols: 'brief' }))
      } else if (cachedSymbols) {
        clientWs.send(JSON.stringify({ type: 'symbols', symbols: cachedSymbols }))
      }
      break

    case 'market:candles': {
      if (!derivConnected || !derivWs) {
        clientWs.send(JSON.stringify({ type: 'candles', symbol: msg.symbol, candles: [] }))
        break
      }
      const reqId = Date.now()
      candleRequests.set(reqId, { clientWs, symbol: msg.symbol, granularity: msg.granularity || 60 })
      derivWs.send(JSON.stringify({
        ticks_history: msg.symbol,
        adjust_start_time: 1,
        granularity: msg.granularity || 60,
        count: msg.count || 200,
        end: 'latest',
        style: 'candles',
        req_id: reqId,
      }))
      break
    }
  }
}

function broadcast(data) {
  // Cache symbols for new clients
  if (data.type === 'symbols') cachedSymbols = data.symbols

  const json = JSON.stringify(data)
  for (const client of frontendClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json)
    }
  }
}

// Send a tick only to clients subscribed to that symbol.
// Without per-client filtering, every client gets every Deriv tick.
function sendTick(symbol, price, epoch) {
  const msg = JSON.stringify({ type: 'tick', symbol, price, epoch })
  for (const client of frontendClients) {
    if (client.readyState !== WebSocket.OPEN) continue
    const subs = clientSubs.get(client)
    // Empty set = no subscription yet (initialized on connect).
    // Client must explicitly subscribe to receive ticks.
    if (subs && subs.has(symbol)) {
      client.send(msg)
    }
  }
}

function log(...args) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}]`, ...args)
}

// ── Start ─────────────────────────────────────────────────

connectDeriv()

// Graceful shutdown
process.on('SIGINT', () => {
  log('Shutting down...')
  clearTimeout(reconnectTimer)
  if (derivWs) derivWs.close()
  wss.close(() => process.exit(0))
})
