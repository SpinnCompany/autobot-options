---
name: session-2026-06-30-bugs
description: All bugs found and fixed during June 30 session — 15 known gotchas + tick pipeline hardening
metadata:
  type: project
  status: complete
---

# Session June 30 — Bug Discoveries & Fixes

## Fixed

### 1. Settings Warning on Startup
- **Symptom:** `Invalid permission rule "Bash(:(){ :|:& };:)" was skipped` — fork bomb had empty `()` breaking parser
- **Fix:** Removed malformed deny rule from `.claude/settings.json`. Fork bomb can't be accidentally run via Claude Code.
- **File:** `.claude/settings.json`

### 2. Double Negative Currency Display
- **Symptom:** Losses showed `-$-100.00` instead of `-$100.00`
- **Root cause:** `TradePanel.jsx:1114` — `pos.pnl` is already negative, but template prepends `-$`
- **Fix:** `Math.abs(pos.pnl || pos.amount).toFixed(2)` — sign handled by `+$`/`-$` prefix
- **File:** `src/components/TradePanel.jsx:1114`

### 3. Timeframe Change Blanks Chart
- **Symptom:** Switching candle duration clears all candles → blank flash while fetchCandles runs
- **Root cause:** `App.jsx:542` — `handleTimeframeChange` set `candleHistory: []` immediately before async fetch
- **Fix:** Check `candleStoreRef` for cached candles at new timeframe first. If found, use instantly. Otherwise keep old candles visible while new data loads.
- **File:** `src/App.jsx:538-550`

## Fixed (continued — June 30 session part 2)

### 4. Win/Loss is Pure RNG — Ignores Price Movement ✅
- **Symptom:** CALL trade with exitPrice > entryPrice (price went up → correct prediction) can randomly lose.
- **Root cause:** `DemoEngine.js:605` — `Math.random() > (1 - this.winRate) ? 'win' : 'loss'`.
- **Fix:** Outcome is now price-driven: CALL wins when `exitPrice > entryPrice`, PUT wins when `exitPrice < entryPrice`. TP/SL already used this logic; expiry now matches.
- **File:** `src/engine/DemoEngine.js:604-614`

### 5. Chart Laggy on First Load ✅
- **Root causes & fixes:**
  a. `seedDayHistory` created 1440 flat candles → **Removed.** Chart now starts with single candle from first tick, builds naturally.
  b. `fetchCandles` opened separate WebSocket → **Fixed in #6.**
  c. Per-tick React flood → **Fixed in #7.**
  d. Chart shows "Waiting for market data…" naturally when candle array is empty — no more 1440-candle flat line.
- **Files:** `src/App.jsx` (seedDayHistory removed), `src/hooks/useMarketData.js`, `src/hooks/feeds/DerivFeed.js`

### 6. fetchCandles Uses Separate WebSocket ✅
- **Root cause:** `useMarketData.js:67` — `new WebSocket(PROXY_URL)` per request.
- **Fix:** `DerivFeed.fetchCandles()` now sends request through the existing shared WebSocket via `_send()`. `useMarketData.fetchCandles` delegates to `feedRef.current.fetchCandles()`. No more duplicate connections.
- **Files:** `src/hooks/feeds/DerivFeed.js:79-81`, `src/hooks/useMarketData.js:66-68`

### 7. Per-Tick State Updates Flood React ✅
- **Root cause:** Every 500ms tick called `syncCandlesToTab` → new array spread → full React reconciliation.
- **Fix:** rAF-based batching. `onDerivAssetTick` writes to `tickSyncPendingRef` and schedules a single `requestAnimationFrame`. `flushTickSyncs` batches all pending tabs into one `setTabs` call. Multiple ticks in the same frame = one React render.
- **File:** `src/App.jsx:36-59` (rAF batching), `src/App.jsx:124-130` (tick loop)

---

## CLAUDE.md Known Gotchas — All 15 Resolved (June 30 part 3)

### 6 Bugs Fixed This Session
| # | Bug | Fix |
|---|-----|-----|
| 6 | autobot_tabs persisted full candle history | Strip candleHistory/priceHistory before localStorage |
| 7 | _persist slice(-100) dropped newest entries | slice(0, 100) — correct direction for prepend |
| 8 | TP/SL didn't update lastTradeResult | Set lastTradeResult/lastTradeProfit/baseAmount in all 4 TP/SL branches |
| 9 | Completed candle close overwritten | Don't touch old candle close on new period (fixed in 1bca891) |
| 13 | Dual-source candle store corruption | Tab stores source; handleAssetTick matches name+source |
| 14 | Binance empty symbols race | get_symbols defers until cachedSymbols ready; failure sets [] |
| 15 | DerivFeed missing HTTPS guard | getProxyUrl() pattern matching BinanceFeed |

### 9 Previously Fixed
| # | Bug |
|---|-----|
| 1 | Chrome PNA permission prompt |
| 2 | syncState not called on mount |
| 3 | Position duration extended on refresh |
| 4 | Tick guard blocked restored tabs |
| 5 | flushTickSyncs race condition |
| 10 | Binance icons rendered as text |
| 11 | Secrets committed to git history |
| 12 | git add -A committed artifacts |

---

## Tick Pipeline Hardening (June 30 part 4)

### Root Cause: Per-Client Filtering Defeated

The initial per-client tick filtering implementation was completely bypassed by three layered bugs:

**Bug A: Mass subscription in onSymbols**
- `useBinanceData.onSymbols` called `feed.subscribe(ALL_441_SYMBOLS)`
- `useMarketData.onSymbols` called `feed.subscribe(ALL_DERIV_SYMBOLS)`
- Every client immediately subscribed to everything → per-client filter useless
- **Fix:** Removed mass subscription. Only `handleAssetSelect` subscribes (1 symbol per tab).

**Bug B: Dynamic upstream subscription in Binance proxy**
- `connectBinance` used `activeSubs` to decide which symbols to subscribe from Binance
- If only 1 symbol was in `activeSubs`, proxy only got ticks for 1 symbol
- After reconnect, unviewed symbols had no Binance data
- **Fix:** Always subscribe to all 441 pairs from Binance. clientSubs only controls forwarding.

**Bug C: Race window on client connect**
- New clients had NO `clientSubs` entry → `!subs` was true → ALL ticks forwarded
- Ticks leaked during the connect → subscribe window
- **Fix:** Initialize `clientSubs.set(client, new Set())` on connect. Empty set = zero ticks.

**Bug D: Tabs silent after refresh**
- Tabs restored from localStorage had no subscriptions
- Auto-open only fired when `tabsRef.current.length === 0`
- **Fix:** `restoredSubsDone` effect re-subscribes all restored tabs when assets load.

### Deriv Proxy — Same Fixes Applied
- Added `clientSubs` Map, `sendTick()`, empty init on connect
- Subscribe/unsubscribe handlers update clientSubs
- Cleanup on client disconnect/error
- Verified: R_50 sub → only R_50 ticks arrive (other=0)

### Verified In Production
- Binance: subscribe BTCUSDT only → BTCUSDT=4, other=0 ✅
- Deriv: subscribe R_50 only → R_50=2, other=0 ✅
- Both candle fetches return 3 candles ✅
- Zero console errors in browser ✅
