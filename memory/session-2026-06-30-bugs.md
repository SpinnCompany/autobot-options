---
name: session-2026-06-30-bugs
description: Bugs found and fixes applied during June 30 session — ALL 7 RESOLVED
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
