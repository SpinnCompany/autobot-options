---
name: ws-stability
description: Run comprehensive WebSocket stability tests for both Binance and Deriv proxies — connection, tick arrival, per-client filtering, reconnect recovery, candle history, latency
---

# WebSocket Stability Test

Run the automated stability test suite against the WebSocket proxies. Tests connection health, tick delivery, per-client filtering, reconnection recovery, and candle history for both Binance and Deriv.

## Quick Run

```bash
node scripts/ws-stability-test.js
```

Tests against production by default. Override URLs for local dev:

```bash
BINANCE_URL=ws://localhost:8092 DERIV_URL=ws://localhost:8091 node scripts/ws-stability-test.js
```

## What It Tests (13 cases)

| # | Test | What It Verifies |
|---|------|-----------------|
| 1 | Binance connection | Connect + symbol list (441 expected) |
| 2 | Binance tick arrival | Subscribe → 3 ticks arrive within 8s |
| 3 | Binance candle history | REST klines → 5 OHLC candles |
| 4 | Binance unsubscribe | Per-client filtering — zero leaked ticks |
| 5 | Binance multi-subscribe | 5 symbols → all 5 receive ticks |
| 6 | Binance reconnect | Close → reconnect → symbols/ticks still work |
| 7 | Binance post-reconnect | Ticks continue after reconnect |
| 8 | Deriv connection | Connect + symbol list (92 expected) |
| 9 | Deriv tick arrival | Subscribe → 3 ticks arrive within 8s |
| 10 | Deriv candle history | Tick history → OHLC aggregation |
| 11 | Deriv unsubscribe | Per-client filtering — zero leaked ticks |
| 12 | Deriv reconnect | Close → reconnect → symbols/ticks still work |
| 13 | Deriv post-reconnect | Ticks continue after reconnect |

## Interpreting Results

- **Latency**: Binance ~130ms, Deriv ~400ms (normal — Deriv servers are farther)
- **Tick interval**: ~1000ms for 1s tickers (normal)
- **Leaked ticks after unsubscribe**: MUST be 0 (per-client filtering)
- **Multi-subscribe**: All subscribed symbols must receive ticks

## After Running

- All 13 tests must pass
- If any test fails, check proxy logs:
  ```bash
  ssh gcp-vps@34.81.61.52 'docker logs binance-proxy --tail 10'
  ssh gcp-vps@34.81.61.52 'docker logs deriv-proxy --tail 10'
  ```

## In-Browser Verification

Open the app and run in browser console:
```js
__TICK_DEBUG.stats()    // Pipeline stats
__TICK_DEBUG.gaps()     // Check for tick gaps >3s
__TICK_DEBUG.latency()  // Pipeline latency breakdown
__TICK_DEBUG.subState() // Active subscriptions
```
