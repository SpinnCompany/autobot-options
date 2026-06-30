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

const { WebSocket, WebSocketServer } = require('ws');

const PORT = parseInt(process.argv[2]) || 8092;
const BINANCE_WS = 'wss://stream.binance.com:9443/ws';
const BINANCE_REST = 'https://api.binance.com/api/v3';

// ── Supported trading pairs ──────────────────────────────────
const TRADING_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT',
  'DOGEUSDT', 'DOTUSDT', 'AVAXUSDT', 'MATICUSDT', 'LINKUSDT',
  'UNIUSDT', 'ATOMUSDT', 'ETCUSDT', 'FILUSDT', 'TRXUSDT',
  'APTUSDT', 'ARBUSDT', 'OPUSDT', 'SUIUSDT', 'PEPEUSDT',
];

// Display metadata per symbol
const SYMBOL_META = {
  BTCUSDT:  { display_name: 'BTC/USDT',  icon: 'BT', color: '#f7931a' },
  ETHUSDT:  { display_name: 'ETH/USDT',  icon: 'ET', color: '#627eea' },
  SOLUSDT:  { display_name: 'SOL/USDT',  icon: 'SO', color: '#9945ff' },
  XRPUSDT:  { display_name: 'XRP/USDT',  icon: 'XR', color: '#23292f' },
  ADAUSDT:  { display_name: 'ADA/USDT',  icon: 'AD', color: '#0033ad' },
  DOGEUSDT: { display_name: 'DOGE/USDT', icon: 'DO', color: '#c2a633' },
  DOTUSDT:  { display_name: 'DOT/USDT',  icon: 'DT', color: '#e6007a' },
  AVAXUSDT: { display_name: 'AVAX/USDT', icon: 'AV', color: '#e84142' },
  MATICUSDT:{ display_name: 'MATIC/USDT',icon: 'MA', color: '#8247e5' },
  LINKUSDT: { display_name: 'LINK/USDT', icon: 'LK', color: '#2a5ada' },
  UNIUSDT:  { display_name: 'UNI/USDT',  icon: 'UN', color: '#ff007a' },
  ATOMUSDT: { display_name: 'ATOM/USDT', icon: 'AT', color: '#2e3148' },
  ETCUSDT:  { display_name: 'ETC/USDT',  icon: 'EC', color: '#328332' },
  FILUSDT:  { display_name: 'FIL/USDT',  icon: 'FI', color: '#0090ff' },
  TRXUSDT:  { display_name: 'TRX/USDT',  icon: 'TR', color: '#ff0013' },
  APTUSDT:  { display_name: 'APT/USDT',  icon: 'AP', color: '#000000' },
  ARBUSDT:  { display_name: 'ARB/USDT',  icon: 'AR', color: '#28a0f0' },
  OPUSDT:   { display_name: 'OP/USDT',   icon: 'OP', color: '#ff0420' },
  SUIUSDT:  { display_name: 'SUI/USDT',  icon: 'SU', color: '#4da2ff' },
  PEPEUSDT: { display_name: 'PEPE/USDT', icon: 'PE', color: '#00843d' },
};

// Build the stream URL: subscribe to @ticker for all pairs
const TICKER_STREAMS = TRADING_PAIRS.map(p => `${p.toLowerCase()}@ticker`);

// ── State ────────────────────────────────────────────────────
let binanceWs = null;
let intentionalClose = false;
let reconnectDelay = 2000;
const MAX_RECONNECT_DELAY = 30000;
let reconnectTimer = null;
let activeSubs = new Set();       // currently subscribed symbols
let cachedSymbols = null;         // symbols response cache
const frontendClients = new Set();
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
  return TRADING_PAIRS.map(sym => {
    const meta = SYMBOL_META[sym] || {};
    return {
      symbol: sym,
      display_name: meta.display_name || sym,
      market: 'cryptocurrency',
      subtype: 'crypto',
      icon: meta.icon || 'CR',
      color: meta.color || '#f7931a',
    };
  });
}

// ── Broadcast to all frontend clients ────────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of frontendClients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
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

    // Subscribe to ticker streams
    const streams = activeSubs.size > 0
      ? [...activeSubs].map(s => `${s.toLowerCase()}@ticker`)
      : TICKER_STREAMS;
    const subMsg = JSON.stringify({
      method: 'SUBSCRIBE',
      params: streams,
      id: 1,
    });
    binanceWs.send(subMsg);
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
      broadcast({ type: 'tick', symbol, price, epoch });

      // Update cached symbol prices for get_symbols
      for (const client of frontendClients) {
        // Send individual ticks — the feed adapter handles batching
      }
    }
    return;
  }

  // Direct ticker (without combined stream wrapper)
  if (msg.e === '24hrTicker' && msg.s) {
    const symbol = msg.s.toUpperCase();
    const price = parseFloat(msg.c);
    const epoch = Math.floor((msg.E || Date.now()) / 1000);
    broadcast({ type: 'tick', symbol, price, epoch });
  }
}

// ── Frontend client handler ──────────────────────────────────
function handleClientMsg(client, data) {
  const type = data.type || '';

  if (type === 'get_symbols') {
    if (!cachedSymbols) cachedSymbols = buildSymbolsResponse();
    client.send(JSON.stringify({ type: 'symbols', symbols: cachedSymbols }));
    return;
  }

  if (type === 'subscribe' && Array.isArray(data.symbols)) {
    for (const sym of data.symbols) activeSubs.add(sym);
    if (binanceWs && binanceWs.readyState === WebSocket.OPEN) {
      const streams = data.symbols.map(s => `${s.toLowerCase()}@ticker`);
      binanceWs.send(JSON.stringify({ method: 'SUBSCRIBE', params: streams, id: Date.now() }));
    }
    return;
  }

  if (type === 'unsubscribe' && Array.isArray(data.symbols)) {
    for (const sym of data.symbols) activeSubs.delete(sym);
    if (binanceWs && binanceWs.readyState === WebSocket.OPEN) {
      const streams = data.symbols.map(s => `${s.toLowerCase()}@ticker`);
      binanceWs.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: streams, id: Date.now() }));
    }
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
    console.log(`[binance-proxy] Client disconnected (${frontendClients.size} remaining)`);
  });

  client.on('error', () => {
    frontendClients.delete(client);
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
connectBinance();
