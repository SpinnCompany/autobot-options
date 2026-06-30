---
name: tick-verify
description: Verify the tick pipeline end-to-end — proxy → feed → hook → App → candle store → rAF flush → chart render. Check subscription state, per-client filtering, source isolation.
---

# Tick Pipeline Verification

End-to-end verification of the tick data pipeline. Traces every stage from WebSocket proxy through to chart rendering.

## Pipeline Architecture

```
Binance/Deriv WS → proxy (sendTick with per-client filter)
  → Feed._handle()     [recordFeedTick]
    → Hook.onTick()    [recordHookTick]
      → App.handleAssetTick() [recordAppTick]
        → candleStoreRef update (source-aware)
        → rAF batching
          → flushTickSyncs()  [recordFlush]
            → setTabs() → Chart re-render
```

## Quick Verification (Browser Console)

Open the app, then run these checks in order:

### 1. Connection & Subscription Check
```js
__TICK_DEBUG.subState()
// Expected: { binanceSubs: [...], derivSubs: [...], activeTabs: [...], binanceConnected: true, derivConnected: true }
```

### 2. Tick Flow Check
```js
__TICK_DEBUG.stats()
// Check: feedRx > 0, hookRx > 0, appRx > 0, flushes > 0, stateSyncs > 0
// All pipeline stages should have counts > 0
```

### 3. Per-Symbol Detail
```js
__TICK_DEBUG.symbol('BTCUSDT')
// Check: count > 0, gaps.length === 0 (or very few), avgIntervalMs ~1000
```

### 4. Gap Detection
```js
__TICK_DEBUG.gaps()
// Should return { totalGaps: 0 } or very few (reconnection gaps are normal)
```

### 5. Latency Analysis
```js
__TICK_DEBUG.latency()
// avgTotalMs should be < 500ms (proxy → flush)
// avgFeedToHookMs should be < 5ms (synchronous)
```

### 6. Source Isolation
```js
// Open one Binance tab (BTC/USDT) and one Deriv tab (EUR/USD)
// Check that BTC/USDT candles only come from Binance:
const tabs = JSON.parse(localStorage.getItem('autobot_tabs'))
tabs.forEach(t => console.log(t.asset, '→', t.source))
// Each tab should have its source set correctly
```

## Common Issues & Fixes

| Symptom | Check | Likely Cause |
|---------|-------|-------------|
| feedRx=0 | `__TICK_DEBUG.subState().binanceConnected` | Proxy not running or WS URL wrong |
| feedRx>0 but hookRx=0 | Feed connected but onTick callback broken | Check feed constructor callbacks |
| hookRx>0 but appRx=0 | Ticks arriving but not finding assets | Asset lookup mismatch (symbol vs brokerSymbol/derivSymbol) |
| appRx>0 but flushes=0 | Ticks build candles but rAF doesn't fire | Tab hidden/backgrounded (rAF pauses) |
| Gaps > 10s | `__TICK_DEBUG.gaps()` | Proxy reconnect, network issue, or tab backgrounded |
| Dual-source corruption | Check `tab.source` field | Legacy tab without source field |

## Subscription Tracing

Enable real-time trace to watch subscriptions:
```js
__TICK_DEBUG.trace(true, 'BTC')  // Trace all events with 'BTC' in symbol name
__TICK_DEBUG.trace(false)        // Disable trace
```

## Full Pipeline Test (Node.js)

```bash
node scripts/ws-stability-test.js
```

This runs 13 automated tests against production (or local dev with env vars).
