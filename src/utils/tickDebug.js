/**
 * tickDebug.js — Tick pipeline diagnostic utility.
 *
 * Tracks every tick through the full pipeline:
 *   Proxy → Feed._handle → Hook.onTick → App.handleAssetTick → rAF flush → Chart render
 *
 * Usage in browser console:
 *   __TICK_DEBUG.stats()          // Overall tick stats
 *   __TICK_DEBUG.symbol('BTCUSDT') // Per-symbol detail
 *   __TICK_DEBUG.latency()        // Pipeline latency report
 *   __TICK_DEBUG.trace(true)      // Enable real-time console logging
 *   __TICK_DEBUG.trace(false)     // Disable
 *   __TICK_DEBUG.gaps()           // Show tick gaps > 2s
 *   __TICK_DEBUG.subState()       // Show subscription state
 */

const MAX_EVENTS = 2000
const GAP_THRESHOLD_MS = 3000

const state = {
  enabled: true,
  trace: false,           // console.log every event (spammy!)
  traceFilter: null,      // only trace if symbol matches this string

  // Per-symbol tick counters
  ticksBySymbol: new Map(),    // symbol → { count, lastEpoch, lastLocalTime, gaps[] }

  // Pipeline stage counters
  feedRx: 0,       // _handle() received 'tick'
  hookRx: 0,       // useBinanceData/useMarketData onTick fired
  appRx: 0,        // handleAssetTick called
  candleBuilt: 0,  // candle updated in candleStoreRef
  flushes: 0,      // flushTickSyncs called
  stateSyncs: 0,   // setTabs called with candle data

  // Latency tracking (last 200 ticks)
  latencies: [],    // { symbol, proxyEpoch, feedMs, hookMs, appMs, flushMs }

  // Subscription state
  binanceSubs: new Set(),
  derivSubs: new Set(),
  activeTabs: [],

  // Connection state
  binanceConnected: false,
  derivConnected: false,
}

// Save reference for cross-module access
if (typeof window !== 'undefined') {
  window.__TICK_DEBUG = {
    stats: () => stats(),
    symbol: (s) => symbolStats(s),
    latency: () => latencyReport(),
    trace: (on, filter) => { state.trace = on; state.traceFilter = filter || null; return `trace ${on ? 'ON' : 'OFF'}${filter ? ' filter=' + filter : ''}` },
    gaps: () => gapsReport(),
    subState: () => subStateReport(),
    reset: () => reset(),
    raw: () => state,
  }
}

function reset() {
  state.ticksBySymbol.clear()
  state.feedRx = 0; state.hookRx = 0; state.appRx = 0
  state.candleBuilt = 0; state.flushes = 0; state.stateSyncs = 0
  state.latencies = []
  return 'Tick debug reset'
}

function stats() {
  const symbols = [...state.ticksBySymbol.entries()].sort((a, b) => b[1].count - a[1].count)
  return {
    pipeline: {
      feedRx: state.feedRx,
      hookRx: state.hookRx,
      appRx: state.appRx,
      candleBuilt: state.candleBuilt,
      flushes: state.flushes,
      stateSyncs: state.stateSyncs,
    },
    symbols: symbols.slice(0, 20).map(([sym, s]) => ({
      symbol: sym,
      count: s.count,
      lastSeen: s.lastLocalTime ? new Date(s.lastLocalTime).toISOString() : null,
      avgInterval: s.intervals?.length ? Math.round(s.intervals.reduce((a, b) => a + b, 0) / s.intervals.length) : null,
      gaps: s.gaps?.length || 0,
    })),
    totalSymbols: symbols.length,
    subs: { binance: [...state.binanceSubs], deriv: [...state.derivSubs] },
    activeTabs: state.activeTabs,
    connections: { binance: state.binanceConnected, deriv: state.derivConnected },
  }
}

function symbolStats(symbol) {
  const s = state.ticksBySymbol.get(symbol)
  if (!s) return { error: `no ticks for ${symbol}` }
  return {
    symbol,
    count: s.count,
    lastEpoch: s.lastEpoch,
    lastSeen: new Date(s.lastLocalTime).toISOString(),
    gaps: s.gaps || [],
    avgIntervalMs: s.intervals?.length ? Math.round(s.intervals.reduce((a, b) => a + b, 0) / s.intervals.length) : null,
    minIntervalMs: s.intervals?.length ? Math.min(...s.intervals) : null,
    maxIntervalMs: s.intervals?.length ? Math.max(...s.intervals) : null,
  }
}

function latencyReport() {
  if (state.latencies.length === 0) return 'No latency data'
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
  const max = (arr) => Math.max(...arr)
  return {
    samples: state.latencies.length,
    avgTotalMs: Math.round(avg(state.latencies.map(l => l.flushMs - l.proxyEpoch * 1000))),
    avgProxyToFeedMs: Math.round(avg(state.latencies.map(l => l.feedMs - l.proxyEpoch * 1000))),
    avgFeedToHookMs: Math.round(avg(state.latencies.map(l => l.hookMs - l.feedMs))),
    avgHookToAppMs: Math.round(avg(state.latencies.map(l => l.appMs - l.hookMs))),
    avgAppToFlushMs: Math.round(avg(state.latencies.map(l => l.flushMs - l.appMs))),
    maxTotalMs: Math.round(max(state.latencies.map(l => l.flushMs - l.proxyEpoch * 1000))),
  }
}

function gapsReport() {
  const allGaps = []
  for (const [symbol, s] of state.ticksBySymbol) {
    if (s.gaps && s.gaps.length > 0) {
      for (const g of s.gaps) {
        allGaps.push({ symbol, gapMs: g.gapMs, from: new Date(g.from).toISOString(), to: new Date(g.to).toISOString() })
      }
    }
  }
  allGaps.sort((a, b) => b.gapMs - a.gapMs)
  return { totalGaps: allGaps.length, gaps: allGaps.slice(0, 20) }
}

function subStateReport() {
  return {
    binanceSubs: [...state.binanceSubs],
    derivSubs: [...state.derivSubs],
    activeTabs: state.activeTabs,
    binanceConnected: state.binanceConnected,
    derivConnected: state.derivConnected,
  }
}

// ── Recording functions — called from pipeline stages ──

export function recordFeedTick(symbol, price, epoch, source) {
  if (!state.enabled) return
  state.feedRx++
  recordSymbolTick(symbol, epoch, 'feed')
  if (state.trace && (!state.traceFilter || symbol.includes(state.traceFilter))) {
    console.debug(`[tick:feed:${source}] ${symbol} @ ${price} epoch=${epoch}`)
  }
}

export function recordHookTick(symbol, source) {
  if (!state.enabled) return
  state.hookRx++
  if (state.trace && (!state.traceFilter || symbol.includes(state.traceFilter))) {
    console.debug(`[tick:hook:${source}] ${symbol}`)
  }
}

export function recordAppTick(symbol, source, matchedTabs) {
  if (!state.enabled) return
  state.appRx++
  if (state.trace && (!state.traceFilter || symbol.includes(state.traceFilter))) {
    console.debug(`[tick:app:${source}] ${symbol} → ${matchedTabs} tab(s)`)
  }
}

export function recordCandleBuilt(symbol, tabId, timeframe) {
  if (!state.enabled) return
  state.candleBuilt++
}

export function recordFlush(tabCount) {
  if (!state.enabled) return
  state.flushes++
  if (state.trace) console.debug(`[tick:flush] ${tabCount} tabs synced`)
}

export function recordStateSync(tabCount) {
  if (!state.enabled) return
  state.stateSyncs++
}

// ── Symbol tracking ──

function recordSymbolTick(symbol, epoch, stage) {
  let s = state.ticksBySymbol.get(symbol)
  if (!s) {
    s = { count: 0, lastEpoch: null, lastLocalTime: null, intervals: [], gaps: [], firstSeen: Date.now() }
    state.ticksBySymbol.set(symbol, s)
  }
  const now = Date.now()

  // Detect gaps
  if (s.lastLocalTime && (now - s.lastLocalTime) > GAP_THRESHOLD_MS) {
    s.gaps.push({ from: s.lastLocalTime, to: now, gapMs: now - s.lastLocalTime, gapSec: Math.round((now - s.lastLocalTime) / 1000) })
    if (s.gaps.length > 50) s.gaps.shift()
    if (state.trace) console.warn(`[tick:gap] ${symbol}: ${Math.round((now - s.lastLocalTime) / 1000)}s gap`)
  }

  // Track intervals
  if (s.lastLocalTime) {
    s.intervals.push(now - s.lastLocalTime)
    if (s.intervals.length > 100) s.intervals.shift()
  }

  s.count++
  s.lastEpoch = epoch
  s.lastLocalTime = now

  // Cap total events
  if (state.ticksBySymbol.size > 500) {
    const first = state.ticksBySymbol.keys().next().value
    state.ticksBySymbol.delete(first)
  }
}

// ── Latency tracking ──

export function recordLatency(symbol, proxyEpoch) {
  const entry = {
    symbol,
    proxyEpoch,
    feedMs: Date.now(),
    hookMs: 0,
    appMs: 0,
    flushMs: 0,
  }
  state.latencies.push(entry)
  if (state.latencies.length > 200) state.latencies.shift()
  return state.latencies.length - 1 // return index for later update
}

export function stampLatency(idx, stage) {
  if (idx < 0 || idx >= state.latencies.length) return
  state.latencies[idx][stage] = Date.now()
}

// ── Subscription tracking ──

export function recordSubscribe(source, symbols) {
  const target = source === 'binance' ? state.binanceSubs : state.derivSubs
  for (const s of symbols) target.add(s)
  if (state.trace) console.debug(`[sub:${source}] +${symbols.join(',')} (total: ${target.size})`)
}

export function recordUnsubscribe(source, symbols) {
  const target = source === 'binance' ? state.binanceSubs : state.derivSubs
  for (const s of symbols) target.delete(s)
}

export function recordConnection(source, connected) {
  if (source === 'binance') state.binanceConnected = connected
  else state.derivConnected = connected
  if (state.trace) console.debug(`[conn:${source}] ${connected ? 'connected' : 'disconnected'}`)
}

export function recordTabs(tabs) {
  state.activeTabs = tabs.map(t => `${t.asset}(${t.source || '?'})[${t.timeframe}]`)
}

// ── Symbol tracking: candle count ──

export function recordCandleCount(tabId, timeframe, count) {
  // lightweight — just for debugging candle buildup
}

// ── Export for window access ──
export { state as tickDebugState }
