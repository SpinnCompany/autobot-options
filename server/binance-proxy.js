#!/usr/bin/env node
/**
 * binance-proxy.js — WebSocket proxy for Binance spot market data.
 *
 * Architecture:
 *   Binance WS (wss://stream.binance.com:9443) ←→ binance-proxy (:8092) ←→ Browser
 *
 * Translates Binance combined-stream ticker messages to the standard
 * proxy protocol: {type, symbol, price, epoch, ...}
 *
 * Also handles candle history via Binance REST API (/api/v3/klines).
 *
 * Usage: node binance-proxy.js [port]
 */

import { WebSocket, WebSocketServer } from 'ws';

const PORT = parseInt(process.argv[2]) || 8092;
const BINANCE_WS = 'wss://stream.binance.com:9443/ws';
const BINANCE_REST = 'https://api.binance.com/api/v3';

// ── Dynamic symbol registry — fetched from Binance exchangeInfo ──
let tradingPairs = [];        // [{symbol, display_name, baseAsset, color}]
let tradingSymbols = [];      // ['BTCUSDT', 'ETHUSDT', ...]

// Color palette for dynamically discovered coins
const COIN_COLORS = [
  '#f7931a', '#627eea', '#9945ff', '#23292f', '#0033ad', '#c2a633',
  '#e6007a', '#e84142', '#8247e5', '#2a5ada', '#ff007a', '#2e3148',
  '#328332', '#0090ff', '#ff0013', '#28a0f0', '#ff0420', '#4da2ff',
  '#00843d', '#f0b90b', '#26a17b', '#e84142', '#1a1a1a',
];

async function fetchExchangeInfo() {
  try {
    const res = await fetch(`${BINANCE_REST}/exchangeInfo`);
    const data = await res.json();
    const symbols = data.symbols || [];

    // Filter: only TRADING spot pairs quoted in USDT
    const usdtPairs = symbols.filter(s =>
      s.status === 'TRADING' &&
      s.quoteAsset === 'USDT' &&
      s.isSpotTradingAllowed !== false
    );

    tradingPairs = usdtPairs.map((s, i) => ({
      symbol: s.symbol,
      display_name: `${s.baseAsset}/USDT`,
      baseAsset: s.baseAsset,
      market: 'cryptocurrency',
      subtype: 'crypto',
      color: COIN_COLORS[i % COIN_COLORS.length],
      // Pass through for the browser-side mapper
      tickSize: (s.filters || []).find(f => f.filterType === 'PRICE_FILTER')?.tickSize || '0.0001',
    }));

    tradingSymbols = tradingPairs.map(p => p.symbol);
    console.log(`[binance-proxy] Fetched ${tradingSymbols.length} USDT pairs from exchangeInfo`);

    // Update cached response and resubscribe
    cachedSymbols = buildSymbolsResponse();
    broadcast({ type: 'symbols', symbols: cachedSymbols });

    // Subscribe to tickers for all pairs
    if (binanceWs && binanceWs.readyState === WebSocket.OPEN) {
      const streams = tradingSymbols.map(s => `${s.toLowerCase()}@ticker`);
      binanceWs.send(JSON.stringify({ method: 'SUBSCRIBE', params: streams, id: Date.now() }));
    }
  } catch (err) {
    console.error('[binance-proxy] Failed to fetch exchangeInfo:', err.message);
    // Set empty cache so clients don't hang forever waiting for symbols
    if (!cachedSymbols) cachedSymbols = [];
    // Retry after 30s
    setTimeout(fetchExchangeInfo, 30000);
  }
}

// ── State ────────────────────────────────────────────────────
let binanceWs = null;
let intentionalClose = false;
let reconnectDelay = 2000;
const MAX_RECONNECT_DELAY = 30000;
let reconnectTimer = null;
let activeSubs = new Set();       // currently subscribed symbols (Binance WS level)
let cachedSymbols = null;         // symbols response cache
const frontendClients = new Set();
const clientSubs = new Map();     // per-client subscriptions: client → Set<symbol>
const candleRequests = new Map();  // reqId → { resolve, timeout }

// ── Binance REST: fetch klines ──────────────────────────────
function fetchKlines(symbol, interval, limit = 200) {
  const url = `${BINANCE_REST}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  return fetch(url)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(data => data.map(k => ({
      epoch: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    })));
}

// Granularity (seconds) → Binance kline interval string
function granularityToInterval(granularity) {
  const map = { 15: '1s', 30: '1s', 60: '1m', 180: '3m', 300: '5m', 900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 86400: '1d' };
  return map[granularity] || '1m';
}

// ── Build symbol list response ───────────────────────────────
function buildSymbolsResponse() {
  return tradingPairs.map(p => ({
    symbol: p.symbol,
    display_name: p.display_name,
    market: p.market,
    subtype: p.subtype,
    color: p.color,
    baseAsset: p.baseAsset,
    tickSize: p.tickSize,
  }));
}

// ── Broadcast to all frontend clients (control messages) ──────
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of frontendClients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

// ── Send a tick only to clients subscribed to that symbol ─────
// Without per-client filtering, 441 pairs × 1 tick/sec = 441 msgs/sec
// PER client — most for symbols the client doesn't care about.
// With filtering, a client viewing 1-8 tabs gets only 1-8 ticks/sec.
function sendTick(symbol, price, epoch) {
  const msg = JSON.stringify({ type: 'tick', symbol, price, epoch });
  for (const client of frontendClients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    const subs = clientSubs.get(client);
    // Strict per-client filtering — client MUST explicitly subscribe to receive ticks.
    // An empty subscription set is initialized on connect (line 296), so clients
    // receive zero ticks until they send a 'subscribe' message.
    // This is consistent with deriv-proxy.js sendTick logic.
    if (subs && subs.has(symbol)) {
      client.send(msg);
    }
  }
}

// ── Binance WebSocket connection ─────────────────────────────
function connectBinance() {
  if (binanceWs) {
    try { binanceWs.close(); } catch {}
    binanceWs = null;
  }

  broadcast({ type: 'status', status: 'connecting' });

  try {
    binanceWs = new WebSocket(BINANCE_WS);
  } catch (e) {
    scheduleReconnect();
    return;
  }

  binanceWs.onopen = () => {
    console.log('[binance-proxy] Connected to Binance WS');
    broadcast({ type: 'status', status: 'connected' });
    reconnectDelay = 2000;

    // Always subscribe to ALL trading pairs from Binance — the proxy needs
    // every tick so it can forward them to whichever clients are interested.
    // Per-client filtering happens in sendTick(), not at the Binance level.
    if (tradingSymbols.length > 0) {
      const streams = tradingSymbols.map(s => `${s.toLowerCase()}@ticker`);
      binanceWs.send(JSON.stringify({ method: 'SUBSCRIBE', params: streams, id: 1 }));
    }
  };

  binanceWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleBinanceMsg(msg);
    } catch {}
  };

  binanceWs.onerror = () => {
    if (intentionalClose) return;
    console.error('[binance-proxy] Binance WS error');
  };

  binanceWs.onclose = () => {
    if (!intentionalClose) {
      broadcast({ type: 'status', status: 'disconnected' });
      scheduleReconnect();
    }
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  console.log(`[binance-proxy] Reconnecting in ${reconnectDelay}ms...`);
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    connectBinance();
  }, reconnectDelay);
}

// ── Handle incoming Binance messages ─────────────────────────
function handleBinanceMsg(msg) {
  // Combined stream messages have {stream, data}
  // Single stream (after SUBSCRIBE response) has {result, id}
  // Ticker messages come as single-stream after subscription

  if (msg.stream && msg.data) {
    // Combined stream wrapper
    const streamName = msg.stream; // e.g. "btcusdt@ticker"
    const symbol = streamName.split('@')[0].toUpperCase();
    const data = msg.data;

    if (streamName.endsWith('@ticker') && data.c != null) {
      const price = parseFloat(data.c);
      const epoch = Math.floor((data.E || Date.now()) / 1000);
      sendTick(symbol, price, epoch);
    }
    return;
  }

  // Direct ticker (without combined stream wrapper)
  if (msg.e === '24hrTicker' && msg.s) {
    const symbol = msg.s.toUpperCase();
    const price = parseFloat(msg.c);
    const epoch = Math.floor((msg.E || Date.now()) / 1000);
    sendTick(symbol, price, epoch);
  }
}

// ── Frontend client handler ──────────────────────────────────
function handleClientMsg(client, data) {
  const type = data.type || '';

  if (type === 'get_symbols') {
    // Don't build from empty data if exchangeInfo hasn't loaded yet.
    // Clients will receive symbols via broadcast when exchangeInfo completes.
    if (!cachedSymbols) return
    client.send(JSON.stringify({ type: 'symbols', symbols: cachedSymbols }));
    return;
  }

  if (type === 'subscribe' && Array.isArray(data.symbols)) {
    // Track per-client subscriptions so ticks only go to interested clients.
    // Binance-level subscription is always all 441 pairs (set at connectBinance).
    if (!clientSubs.has(client)) clientSubs.set(client, new Set());
    const csubs = clientSubs.get(client);
    for (const sym of data.symbols) csubs.add(sym);
    return;
  }

  if (type === 'unsubscribe' && Array.isArray(data.symbols)) {
    // Remove from per-client subscriptions only
    const csubs = clientSubs.get(client);
    if (csubs) for (const sym of data.symbols) csubs.delete(sym);
    return;
  }

  if (type === 'market:candles' && data.symbol && data.granularity) {
    const interval = granularityToInterval(data.granularity);
    const count = data.count || 200;
    fetchKlines(data.symbol, interval, count)
      .then(candles => {
        client.send(JSON.stringify({
          type: 'candles',
          symbol: data.symbol,
          candles,
        }));
      })
      .catch(err => {
        client.send(JSON.stringify({
          type: 'error',
          message: `Candle fetch failed: ${err.message}`,
        }));
      });
    return;
  }
}

// ── Start proxy server ───────────────────────────────────────
const wss = new WebSocketServer({ port: PORT });
console.log(`[binance-proxy] Listening on port ${PORT}`);

wss.on('connection', (client) => {
  frontendClients.add(client);
  // Init empty subscription set — client receives NO ticks until it
  // explicitly subscribes. Closes race window where new clients got
  // flooded with all 441 ticks before their first subscribe message.
  clientSubs.set(client, new Set());
  console.log(`[binance-proxy] Client connected (${frontendClients.size} total)`);

  // Send cached symbols immediately
  if (cachedSymbols) {
    client.send(JSON.stringify({ type: 'symbols', symbols: cachedSymbols }));
  }
  // Send current status
  const isConnected = binanceWs && binanceWs.readyState === WebSocket.OPEN;
  client.send(JSON.stringify({ type: 'status', status: isConnected ? 'connected' : 'connecting' }));

  client.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      handleClientMsg(client, data);
    } catch {}
  });

  client.on('close', () => {
    frontendClients.delete(client);
    clientSubs.delete(client);
    console.log(`[binance-proxy] Client disconnected (${frontendClients.size} remaining)`);
  });

  client.on('error', () => {
    frontendClients.delete(client);
    clientSubs.delete(client);
  });
});

wss.on('error', (err) => {
  console.error('[binance-proxy] Server error:', err.message);
});

// ── Graceful shutdown ────────────────────────────────────────
process.on('SIGINT', () => {
  intentionalClose = true;
  clearTimeout(reconnectTimer);
  if (binanceWs) { try { binanceWs.close(); } catch {} }
  wss.close();
  process.exit(0);
});

// ── Start ────────────────────────────────────────────────────
// Fetch exchange info first, then connect WS (connectBinance called after fetch)
fetchExchangeInfo().then(() => connectBinance());
