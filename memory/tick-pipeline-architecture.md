---
name: tick-pipeline-architecture
description: Complete tick data flow architecture — dual-proxy per-client filtering, frontend candle pipeline, zero polling enforcement
metadata:
  type: project
  updated: 2026-06-30
---

# Tick Pipeline Architecture

## Design Principle

**Push-only. Zero polling. Per-client filtered. No fake data.**

Every tick originates from a real WebSocket (Binance or Deriv). The pipeline forwards, filters, and renders — never polls, never simulates, never generates.

## Proxy Layer — Per-Client Tick Filtering

Both proxies (`binance-proxy.js`, `deriv-proxy.js`) have identical architecture:

### State
```
clientSubs: Map<WebSocket, Set<symbol>>  // per-client subscriptions
frontendClients: Set<WebSocket>           // all connected clients
activeSubs: Set<symbol>                   // upstream subscriptions (all 441 for Binance)
```

### Flow
```
1. Proxy starts → connect to upstream (Binance/Deriv)
2. Subscribe to ALL symbols from upstream (always, unconditionally)
3. Client connects → clientSubs.set(client, new Set())  // EMPTY — zero ticks
4. Client sends subscribe → clientSubs[client].add(symbols)
5. Upstream tick arrives → sendTick(symbol, price, epoch)
   → for each client: if clientSubs[client].has(symbol) → send
   → else: skip
6. Client disconnects → clientSubs.delete(client)
```

### Key Rules
- **Upstream subscription is ALL symbols, ALWAYS.** Never reduced based on client interest.
- **New clients get empty subscription set.** No tick leak during connect→subscribe window.
- **Broadcast only for control messages** (status, symbols). Ticks use sendTick.
- **Binance-specific:** Always subscribe to all 441 trading pairs at connectBinance. Never use activeSubs for upstream decisions.

## Frontend Layer — Subscription Management

### On initial load
1. `onSymbols` fires → setAssets() only. NO mass subscription.
2. If no tabs exist → auto-open first asset → subscribe to 1 symbol.
3. If tabs exist (refresh) → restoredSubsDone effect → subscribe each tab's symbol.

### On tab open
1. `handleAssetSelect(assetName)` → `binanceData.subscribe([symbol])` or `marketData.subscribe([symbol])`.
2. Subscription message sent to proxy → proxy adds to clientSubs.
3. Ticks start arriving for that symbol only.

### On WebSocket reconnect
1. Status → 'disconnected' → settled = false (unblock onSymbols).
2. Status → 'connected' → get_symbols auto-sent → onSymbols fires → assets refreshed.
3. No re-subscription needed for existing tabs — proxy-level clientSubs persists across WebSocket reconnects (it's per-client-connection).

## Candle Pipeline (App.jsx)

```
handleAssetTick(symbol, price, source)
  → source-aware asset lookup (a.brokerSymbol || a.derivSymbol)
  → source-aware tab matching (tab.asset === name && tab.source === source)
  → candleStoreRef[tabId][timeframe] OHLC build
  → tickSyncPendingRef.set(key, candles)
  → requestAnimationFrame(flushTickSyncs)

flushTickSyncs()
  → read fresh candles from candleStoreRef (NOT stale pending map)
  → setTabs(prev => { ...t, candleHistory: [...candles], priceHistory })
  → React re-render → ChartArea → CanvasChart
  → CanvasChart rAF loop → detectDataChanges → drawFrame
```

## Zero Polling Enforcement

### setInterval sites (all verified non-price):
| Site | Purpose | Data? |
|------|---------|-------|
| ChartArea countdown | `setNow(Date.now())` 1s | No — UI clock |
| TradePanel timer | Position card update 250ms | No — UI clock |
| EconomicCalendar | Event countdown 1s | No — UI clock |
| App.jsx calendar | `getActiveEvents()` 30s | No — calendar metadata |
| App.jsx replay | Market replay cursor | No — historical playback |
| deriv-proxy keepalive | Deriv ping 30s | No — connection keepalive |

### setTimeout sites (all verified non-polling):
| Site | Purpose |
|------|---------|
| BinanceFeed | Reconnect backoff (one-shot) |
| DerivFeed | Reconnect backoff (one-shot) |
| useBinanceData | 250ms price batch flush (one-shot, re-armed by ticks) |
| useMarketData | 250ms price batch flush (one-shot, re-armed by ticks) |

## Why This Matters

Without per-client filtering: 441 Binance pairs × 1 tick/sec = 441 WebSocket messages/sec per client. Each message triggers JSON.parse → callback → Map operations → rAF scheduling. With 10 clients = 4410 messages/sec through the proxy.

With per-client filtering: 1-8 viewed symbols × 1 tick/sec = 1-8 messages/sec per client. 20× reduction in message volume. Chart renders smoother, proxy CPU stays low, browser main thread isn't saturated.

## Verification Commands

```bash
# Binance — subscribe BTCUSDT only, verify no other ticks
ssh gcp-vps@34.81.61.52 'cd /tmp && node -e "
const ws=require(\"/tmp/node_modules/ws\");
const w=new ws(\"wss://options.autobotsignal.io/ws/binance\");
let btc=0, other=0;
w.on(\"open\",()=>{w.send(JSON.stringify({type:\"subscribe\",symbols:[\"BTCUSDT\"]}));});
w.on(\"message\",d=>{const m=JSON.parse(d.toString());if(m.type===\"tick\"){if(m.symbol===\"BTCUSDT\")btc++;else other++;}});
setTimeout(()=>{console.log(\"BTCUSDT=\"+btc+\" other=\"+other);w.close();},5000);
"'

# Deriv — subscribe R_50 only, verify no other ticks
ssh gcp-vps@34.81.61.52 'cd /tmp && node -e "
const ws=require(\"/tmp/node_modules/ws\");
const w=new ws(\"wss://options.autobotsignal.io/ws/deriv\");
let r50=0, other=0;
w.on(\"open\",()=>{w.send(JSON.stringify({type:\"subscribe\",symbols:[\"R_50\"]}));});
w.on(\"message\",d=>{const m=JSON.parse(d.toString());if(m.type===\"tick\"){if(m.symbol===\"R_50\")r50++;else other++;}});
setTimeout(()=>{console.log(\"R_50=\"+r50+\" other=\"+other);w.close();},5000);
"'
```

Both should show: subscribed symbol = 4-5, other = 0.
