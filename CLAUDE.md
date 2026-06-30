# AutobotOptions — Professional Demo Trading Platform

You are working on **AutobotOptions**, a standalone professional binary options demo trading terminal. It provides a realistic trading experience with simulated price feeds, multi-asset charting, position management, and trade history — designed as the foundation for a full broker platform.

## ⚡ NEXT SESSION — Start Here

**Session:** June 30, 2026 — All 15 known bugs resolved. 39/46 gap audit items complete (85%). i18n live (3 languages). Code-split (main bundle 445KB, 45% smaller). 7 backend-dependent features remain deferred.

### New This Session (June 30)
- **All 15 known bugs resolved** — zero open bugs:
  - #6-9, #13-15: 6 bugs fixed (persistence, TP/SL, HTTPS guards, dual-source, candle data)
  - #1-5, #10-12: 9 bugs previously fixed (Chrome PNA, syncState, expiry, tick guard, icons, secrets)
- **Code-split** — main bundle 809KB → 445KB (45% smaller). 7 secondary views lazy-loaded. recharts isolated to AnalyticsView chunk.
- **i18n infrastructure** — i18next + react-i18next with 3 languages (EN/ES/AR). Language switcher in SettingsModal. ~300 strings across 25+ components. Canvas fillText via ref-based t().
- **Gap audit** — #29 (Real WebSocket) + #43 (Multi-Language) marked DONE. 39/46 complete (85%).
- **CLAUDE.md updated** — all bug tables marked FIXED, feature status updated.

### Architecture Decisions (ALL 10 RESOLVED ✅)
1. Platform: Own broker, demo-only. Other brokers in ATS-Project desktop bot.
2. Demo account model: Unlimited free demo, one-click reset to $10k, no login.
3. Price feed: Demo engine + live Binance (441 pairs) + live Deriv. Real mode deferred for other brokers.
4. Real account activation: Demo-only for now.
5. Order execution: Instant fill at shown price (market maker model).
6. Chart data source: Demo engine + live Binance/Deriv candles.
7. Regulatory scope: Undecided — build first, compliance later.
8. Token storage: localStorage (full state persistence, no encryption yet).
9. Demo = Paper: Same thing. UI says "Demo Trading."
10. Martingale/Compounding: Dual independent strategies, both with auto/manual modes.

### Feature Status — 39/46 Gap Audit Items Complete (85%)

**Trading Engine (19 features)** — DemoEngine, PriceFeedEngine, TP/SL, Martingale, Compounding, Pending Orders, Rollover, Risk Mgmt (5 controls), Trade Journal, Keyboard Shortcuts, Daily P&L, Trade Confirmation, Quick Multipliers, Win Rate Per Asset, CSV Export, Sound Toggle, Position Timer Rings, Asset Quick Stats, Toast Duration, Account Reset

**Chart & Analysis (18 features)** — Drawing Tools, 5 Indicators (EMA/BB/SMA/RSI/MACD), VWAP, Volume Profile, Order Book (DOM), Multi-chart Layouts, MTF Overlay, Market Replay, Custom Indicators, Economic Calendar, Market Sentiment, OTC Badge, Candle Countdown, Spread Display, Heatmap, Correlation Matrix, Strategy Backtester, Mobile Responsive

### Remaining Work (9 items — all need backend)
| # | Feature | Blocker |
|---|---------|---------|
| 25-26 | Account Types, Deposit/Withdrawal | Real account backend |
| 29 | Real WebSocket | Backend engine |
| 30-31 | Social Trading, Tournaments | Multi-user backend |
| 43 | Multi-Language | i18n infrastructure |
| 44-46 | Auth, Security, Real Execution | Production backend |

**How to resume:** Say "continue" or name any feature above.

## Autonomous Dev — Session Start Checklist

When starting a new session, run through these steps BEFORE making any changes.

### Step 1: Read Key Files (NON-NEGOTIABLE)
Read these files to understand current state before touching ANY code:
- `src/App.jsx` — Full file (tick pipeline, tab management, asset merge, state persistence)
- `src/engine/DemoEngine.js` — Full file (trading logic, TP/SL, expiry, persistence, state restore)
- `src/hooks/feeds/BinanceFeed.js` or `DerivFeed.js` — If working on WS data path
- `src/hooks/useBinanceData.js` or `useMarketData.js` — Price batching, settle guard
- `server/binance-proxy.js` or `deriv-proxy.js` — If working on proxy layer

### Step 2: Verify Environment
```bash
# Dev server running?
curl -s http://localhost:5173 > /dev/null && echo "Dev: UP" || echo "Dev: DOWN"
# Build check
npm run build                    # zero errors required — do this FIRST
# Node modules installed?
ls node_modules/.package-lock.json > /dev/null && echo "Deps: OK" || npm install
```

### Step 3: Test WebSocket Proxies (if changing data path)
```bash
# Check proxies are running locally
lsof -i :8091 2>/dev/null | grep -q LISTEN && echo "deriv: UP" || echo "deriv: DOWN"
lsof -i :8092 2>/dev/null | grep -q LISTEN && echo "binance: UP" || echo "binance: DOWN"

# Quick WS connectivity test (each proxy)
node -e "const ws=new (require('ws'))('ws://localhost:8092'); ws.on('open',()=>{ws.send(JSON.stringify({type:'get_symbols'}));}); ws.on('message',d=>{const m=JSON.parse(d.toString());if(m.type==='symbols'){console.log('Binance:',m.symbols.length,'symbols');ws.close();}}); setTimeout(()=>process.exit(1),5000);"

# OR for Deriv:
node -e "const ws=new (require('ws'))('ws://localhost:8091'); ws.on('open',()=>{ws.send(JSON.stringify({type:'get_symbols'}));}); ws.on('message',d=>{const m=JSON.parse(d.toString());if(m.type==='symbols'){console.log('Deriv:',m.symbols.length,'symbols');ws.close();}}); setTimeout(()=>process.exit(1),5000);"
```

### Step 4: Verify localStorage State (in browser console)
```js
// Check engine state
JSON.parse(localStorage.getItem('autobot_engine_state'))
// Expected: { balance, positions[], pendingOrders[], ... }

// Check tabs state
JSON.parse(localStorage.getItem('autobot_tabs'))
// Expected: [{ id, asset, timeframe, candleHistory[], priceHistory[] }]

// List all autobot keys
Object.keys(localStorage).filter(k => k.startsWith('autobot_'))
// Expected: 20+ keys
```

### Step 5: Verify Trade Engine Integrity
```js
// In browser console after placing a trade:
const state = JSON.parse(localStorage.getItem('autobot_engine_state'))
console.log('Balance:', state.balance)
console.log('Open positions:', state.positions.filter(p => p.status === 'open').length)
console.log('Expiry check:', state.positions.every(p => p.expiresAt > 0 || p.status !== 'open'))
```

### Step 6: Read Before Modify (NON-NEGOTIABLE)
- Read the ENTIRE file before any edit
- Check imports, exports, closing braces
- Understand the data flow before touching code

### Step 7: Test After Every Change
- `npm run build` — zero errors required
- If Vite HMR caches stale exports: `touch src/App.jsx` to force re-evaluation
- Write WHOLE files in ONE operation for Vite-served JSX
- Check browser console for errors after page reload

### Step 8: Deploy Checklist
```bash
# 1. Build check
npm run build
# 2. Commit
git add -A && git commit -m "fix: description"
# 3. Push
git push origin main
# 4. Deploy SPA
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options && git pull origin main && docker build --no-cache --build-arg VITE_WS_URL=wss://options.autobotsignal.io/ws/deriv --build-arg VITE_BINANCE_WS_URL=wss://options.autobotsignal.io/ws/binance -t autobot-options:latest . && docker stop autobot-options 2>/dev/null; docker rm autobot-options 2>/dev/null; docker run -d --name autobot-options --restart unless-stopped --network autobot-network -p 8095:80 autobot-options:latest'
# 5. Verify
ssh gcp-vps@34.81.61.52 'curl -sk -o /dev/null -w "%{http_code}\n" -H "Host: options.autobotsignal.io" https://127.0.0.1/'
```

## Critical Data Flows (with exact file:line references)

Each flow below includes: (a) the data path, (b) failure modes, (c) verification steps.

### Flow 1: Tick → Chart Candle (the most fragile pipeline)

```
Binance WS message (24hrTicker)
  → handleBinanceMsg() [server/binance-proxy.js:191-221]
    → broadcast({type:'tick', symbol, price, epoch}) [line 205]
  → BinanceFeed._handle() [feeds/BinanceFeed.js:158]
    → onTick(symbol, price, epoch) [line 162]
  → useBinanceData onTick callback [hooks/useBinanceData.js:46-55]
    → onAssetTickRef.current(symbol, price) [line 48]
    → Price batched to priceBufRef, flushed every 250ms [lines 51-55]
  → handleAssetTick(symbol, price, 'binance') [App.jsx:83]
    → Source-aware lookup: a.brokerSymbol === symbol [line 88]
    → For each tab matching assetData.name [line 94-95]:
      → Align time to timeframe boundary: alignedT [line 97]
      → Build/update OHLC in candleStoreRef.get(tabId).get(timeframe) [lines 99-118]
      → Flag in tickSyncPendingRef [line 119], schedule rAF [line 120-122]
  → rAF fires flushTickSyncs() [App.jsx:46]
    → Read keys from tickSyncPendingRef [line 51], CLEAR it [line 52]
    → Read FRESH candles from candleStoreRef [line 59-60]
    → setTabs() with candleHistory = [...candles] (new array) [lines 62-66]
  → CanvasChart re-renders on reference identity change
```

**Failure modes:**
- **Empty symbol list** (binance-proxy.js:321): Client connects before exchangeInfo fetch completes → gets `[]`, `settled=true` in useBinanceData line 58 → permanent empty state. Fix: proxy should not respond until exchangeInfo loaded, or useBinanceData should not set `settled=true` for empty lists.
- **Race condition on merge**: handleCandles writes to candleStoreRef concurrently with handleAssetTick. flushTickSyncs reads the latest from candleStoreRef (not stale pending map) to avoid erasing history — this was a fixed bug.
- **Dual-source corruption** (App.jsx:87-89, 94-95, 127-134): If both Binance and Deriv provide assets with the same display name (e.g. "Bitcoin"), both route into the same candleStoreRef[tabId][timeframe] entry. Candles alternate between two price feeds. Chart data corrupted silently.

**Verification steps:**
```bash
# In browser console — check candles are flowing
const tab = JSON.parse(localStorage.getItem('autobot_tabs'))[0]
console.log('Candles:', tab.candleHistory.length, 'Price points:', tab.priceHistory.length)
console.log('Last candle:', tab.candleHistory[tab.candleHistory.length - 1])
```

### Flow 2: History Fetch → Chart (background merge)

```
Tab opened → handleAssetSelect(name) [App.jsx:566]
  → Mark tab ready in historyReadyRef [lines 592-594]
  → fetchCandles(brokerSymbol, 60, 1440) [App.jsx:598]
  → Binance proxy receives 'market:candles' [server/binance-proxy.js:252]
    → granularityToInterval(60) → '1m' [line 104-107]
    → fetchKlines() via REST /api/v3/klines [line 255-256]
    → Sends back {type:'candles',symbol,candles} [lines 257-262]
  → BinanceFeed._handle() [feeds/BinanceFeed.js:171]
    → Maps epoch→time*1000, open/high/low/close/v [lines 173-178]
    → onCandles(symbol, mapped) [line 178]
  → handleCandles(symbol, candles, 'binance') [App.jsx:127]
    → Lookup asset by a.brokerSymbol === symbol [line 130]
    → For each tab matching assetData.name [line 133-134]:
      → Read existing tick-built candles from candleStoreRef [line 141]
      → Merge: fetched + existing, dedup by time [lines 142-146]
      → Cap at MAX_CANDLES (1440) [line 148]
      → Store merged in candleStoreRef [line 150]
      → syncCandlesToTab() → setTabs() [line 151]
  → CanvasChart renders full candle history
```

**Failure modes:**
- **History never arrives**: If fetchCandles is called but handleCandles never fires, the chart shows only live tick-built candles (1+ per second). Check proxy logs for klines errors.
- **Merge duplicates**: If time alignment is inconsistent (tick-built uses Math.floor, history uses Binance epoch), dedup by time may produce adjacent candles with the same timestamp.
- **handleAssetTick guard blocks history**: Fixed bug — historyReadyRef guard was preventing ticks from rendering until history arrived. Now ticks build candles immediately and history merges into existing data.

**Verification steps:**
```bash
# Direct candle fetch test
node -e "
const ws=require('ws');
const w=new ws('ws://localhost:8092');
w.on('open',()=>{w.send(JSON.stringify({type:'market:candles',symbol:'BTCUSDT',granularity:60,count:3}));});
w.on('message',d=>{const m=JSON.parse(d.toString());if(m.type==='candles'){console.log('Candles:',m.candles?.length);w.close();}});
setTimeout(()=>process.exit(1),10000);
"
# Expected: "Candles: 3"
```

### Flow 3: Trade Lifecycle (place → resolve → persist)

```
User clicks CALL/PUT → TradePanel.handleTrade()
  → Delegate to App.handlePlaceTrade() [App.jsx:536]
    → Resolve entryPrice from activeTab.priceHistory or assets [lines 538-541]
    → engine.placeTrade() [DemoEngine.js:98]
  → Validation [DemoEngine.js:99-193]:
    → amount > 0 [line 103], amount ≤ balance [line 106]
    → openCount < MAX_OPEN(5) [line 110]
    → Daily trade limit [line 124], daily loss limit [line 130]
    → Max position % of balance [line 136], min payout % [line 145]
    → News event blocker [line 154], TP/SL direction check [line 172-191]
  → Position created with absolute expiresAt [line 205]
  → Balance deducted, position prepended [lines 216-217]
  → _persist() writes engine state [line 223]
  → Every tick: App.jsx useEffect [App.jsx:485-506]:
    → Map assets to assetPrices [line 486]
    → checkTP_SL() [DemoEngine.js:370] — stamps last prices, checks crosses
      → TP hit → credit balance, mark win [lines 390-396]
      → SL hit → mark loss [lines 398-403]
      → WARNING: TP/SL does NOT update lastTradeResult/lastTradeProfit [BUG 1]
    → checkExpiry() [DemoEngine.js:439] — compares Date.now() vs expiresAt
      → Expired → _resolvePosition() with price-driven outcome [line 453]
      → Price-driven: CALL wins if exitPrice > entryPrice [lines 648-650]
      → 55% win rate NOT used here — outcome is market-driven! [outdated doc]
    → checkPendingOrders() [DemoEngine.js:545] — price cross triggers execution
    → checkAlerts() [DemoEngine.js:469] — price cross triggers notification
  → _persist() writes history to autobot_options_history [lines 737]
```

**Failure modes:**
- **TP/SL lastTradeResult/BUG**: TP/SL handler (DemoEngine.js:390-420) returns mapped objects but NEVER calls _resolvePosition. lastTradeResult, lastTradeProfit, and baseAmount are NOT updated. Martingale/compounding see stale data after a TP/SL close. Fix: either call _resolvePosition from checkTP_SL or duplicate the updates.
- **_persist slice(-100) BUG** (DemoEngine.js:737): `merged.slice(-100)` keeps the LAST 100. Since new entries are PREPENDED, for `merged.length > 100`, OLD entries survive and the NEW entry at index 0 is dropped. Fix: use `.slice(0, 100)` or reverse the merge order.
- **Completed candle close overwrite BUG** (App.jsx:108): `if (last) last.close = tickPrice` — when a new candle starts, the previous candle's close is overwritten with the first tick of the new period instead of the actual closing price. Fix: only close the candle when the next tick arrives for a different period.

**Verification steps:**
```js
// In browser console — place trade, wait for expiry, verify
const state = JSON.parse(localStorage.getItem('autobot_engine_state'))
console.log('Balance:', state.balance)
console.log('Positions:', state.positions.length)
const history = JSON.parse(localStorage.getItem('autobot_options_history'))
console.log('History entries:', history?.length)
```

### Flow 4: Page Refresh — State Restore

```
Page loads → App.jsx mounts
  → useState for tabs reads autobot_tabs localStorage [App.jsx:224-228]
  → useState for activeTabId reads autobot_active_tab [App.jsx:230-232]
  → useDemoEngine() called [DemoEngine.js:814]
    → new DemoEngine() constructor [DemoEngine.js:53]
      → _loadState() reads autobot_engine_state [line 772]
        → Restores: balance, positions, pendingOrders, risk settings
      → For expired positions (now >= expiresAt) [line 66]:
        → _resolvePosition with _lastPrice (stamped before page left) [line 68]
        → _persist() saves resolved state [line 74]
    → React state still = defaults ($10k balance, []) [lines 822-827]
    → syncState() called via useEffect [line 844 = DemoEngine.js:843]
      → setBalance(engine.balance), setPositions([...engine.positions])
      → React state now matches localStorage
  → useMarketData / useBinanceData connect WebSockets
    → If reconnect finds saved subscription symbols, resubscribes
  → Ticks start flowing → candles build from scratch
  → handleAssetTick [App.jsx:83] — no historyReadyRef guard (fixed bug #4)
    → Ticks build candles immediately without waiting for history fetch
  → After reconnect, history fetch may re-trigger for existing tabs
    → handleCandles merges into candleStoreRef [App.jsx:142-146]
```

**Critical path** (the most common failure point):
```
useEffect(() => { syncState() }, [])  ← DemoEngine.js:844
```
If this useEffect doesn't fire (e.g., strict-mode double-mount or conditional rendering), React state stays at defaults ($10k, []), even though the DemoEngine instance correctly loaded from localStorage. The fix (bug #2) was adding this effect.

**Verification steps:**
```js
// After page refresh — in browser console:
const state = JSON.parse(localStorage.getItem('autobot_engine_state'))
console.log('Stored balance:', state.balance)
// Compare with UI balance display — should match
// If UI shows $10k but stored balance is different → syncState() issue
```

### Flow 5: Asset Loading and Merge (Dual Source)

```
Page loads → useMarketData / useBinanceData mount
  → Each creates its feed and connects [useBinanceData.js:74-80]
  → onSymbols callback fires when symbols arrive [useBinanceData.js:57-63]
    → setted=true guard prevents duplicate processing [line 58]
    → normalizeBinanceSymbol() converts {symbol, display_name, baseAsset, ...}
    → setAssets(normalized) with source='binance' [lines 60-61]
    → Subscribe to all symbols for tick data [line 62]
  → App.jsx useEffect [App.jsx:168] merges sources:
    → Sources array = marketData.assets + binanceData.assets [lines 170-177]
    → Dedup key = `${name}::${source}` [line 181]
    → New assets added, existing assets updated if price changed [lines 183-191]
    → Auto-opens first tab if none exist [lines 196-220]
  → Asset prices updated by throttled (250ms) priceBuf flush [useBinanceData.js:19-39]
    → Compares prev vs current price, only sets if changed [lines 29-37]
```

**Failure modes:**
- **Empty symbols race** (binance-proxy.js:321 + useBinanceData.js:58): Browser connects before fetchExchangeInfo resolves. Proxy sends `{symbols: []}`. useBinanceData sets `settled=true`. When exchangeInfo resolves and real symbols arrive, `settled=true` blocks them. Fix: skip `settled=true` for empty arrays, or defer get_symbols response until exchangeInfo loads.
- **Empty fallback** (BinanceFeed.js:19-24): If VITE_BINANCE_WS_URL is not set and page is HTTPS, getProxyUrl() returns null → feed silently skips connection. This prevents Chrome PNA prompts but means no Binance data in dev on HTTPS.

**Verification steps:**
```bash
# Check proxy has loaded symbols
ssh gcp-vps@34.81.61.52 'docker logs binance-proxy --tail 3'
# Expected: "Fetched 441 USDT pairs from exchangeInfo"
```

## Known Gotchas — Every Bug We've Fixed (don't reintroduce)

### Critical Bugs (will cause data loss or blank UI)

| # | Bug | Root Cause | Symptom | Fix Location | Fixed |
|---|-----|------------|---------|-------------|-------|
| 1 | **Chrome PNA permission prompt** | HTTPS page connecting to ws://localhost triggers CORS + private network access | "access other apps and services" dialog spams user | BinanceFeed.getProxyUrl() [BinanceFeed.js:19-24] — returns null on HTTPS, silently skips | Jul 1 |
| 2 | **syncState not called on mount** | React state initialized with defaults, engine loaded from localStorage, but no bridge between them | Positions disappear on refresh, reappear after next trade | useEffect(() => syncState(), []) in useDemoEngine [DemoEngine.js:844] | Jul 1 |
| 3 | **Position duration extended on refresh** | Constructor recalculated expiresAt from `openTime + duration`, adding elapsed page-closed time to position | Positions stay open way longer than intended after page is revisited | Store absolute expiresAt, resolve expired in constructor [DemoEngine.js:53-68] | Jul 1 |
| 4 | **Tick guard blocked restored tabs** | historyReadyRef guard prevented handleAssetTick from writing candles until history fetch completed | No chart ticks after refresh — chart stays "Waiting for market data" | Removed guard from handleAssetTick [App.jsx:112-119] | Jul 1 |
| 5 | **flushTickSyncs race condition** | flushTickSyncs read from a stale snapshot stored in tickSyncPendingRef, while handleCandles had already merged new data into candleStoreRef | History erased after merge — chart shows only latest tick | Read from candleStoreRef, not from tickSyncPendingRef [App.jsx:46-66] | Jul 1 |

### Persistence & State Bugs

| # | Bug | Root Cause | Symptom | Fix | Fixed |
|---|-----|------------|---------|-----|-------|
| 6 | **autobot_tabs persists entire candle history** | useEffect [App.jsx:235] serializes full tabs array including candleHistory[] (up to 1440 OHLC objects) | localStorage quota could be hit, slow serialization on every tick | Strip candleHistory/priceHistory before persist; rebuild from live ticks + history fetch on restore [App.jsx:241-253] | FIXED |
| 7 | **_persist slice(-100) drops new entries at capacity** | `merged.slice(-100)` keeps last 100. New entries prepended, so at capacity old entries survive and new ones are lost | Recently closed trades disappear from history | Use `.slice(0, 100)` [DemoEngine.js:737] | FIXED |
| 8 | **TP/SL close doesn't update lastTradeResult** | checkTP_SL returns mapped objects directly — never calls _resolvePosition | Martingale/compounding see stale lastTradeResult after TP/SL close | Set lastTradeResult/lastTradeProfit/baseAmount in each TP/SL branch [DemoEngine.js:389-422] | FIXED |
| 9 | **Completed candle close overwritten** | `if (last) last.close = tickPrice` on new period — closes previous candle with first tick of NEXT period | Final close of completed candle is wrong | Don't touch old candle close on new period [App.jsx:108] | FIXED |

### Data & Rendering Bugs

| # | Bug | Root Cause | Symptom | Fix | Fixed |
|---|-----|------------|---------|-----|-------|
| 10 | **Binance icons rendered as text** | Asset data stored raw CDN URL as string, no <img> tag | "https://cryptoicon-api.vercel.app/api/icon/..." shown in panels | AssetIcon component handles all 3 icon types with proper <img> rendering [AssetIcon.jsx] | Jul 1 |
| 11 | **Secrets committed to git history** | docs/broker-html-snapshots/ contained scraped broker HTML with embedded Google API keys | Google API keys exposed in public repo | .gitignore excludes docs/broker-html-snapshots/ + cleanup of history | Jul 1 |
| 12 | **git add -A committed artifacts** | Screenshots, Playwright MCP data, editor settings all in working tree | 229 files accidentally committed | .gitignore: .playwright-mcp/, screenshots/, .claude/settings.json | Jul 1 |
| 13 | **Dual-source candle store corruption** | handleAssetTick matches tabs by `assetData.name`, both Deriv and Binance supply "Bitcoin" etc. | Same candleStoreRef[tabId][tf] receives interleaved ticks from BOTH sources | Tab stores source; handleAssetTick/handleCandles match name+source [App.jsx:94-98, 137-139] | FIXED |

### Proxy & Network Bugs

| # | Bug | Root Cause | Symptom | Fix | Fixed |
|---|-----|------------|---------|-----|-------|
| 14 | **Binance empty symbols race** | binance-proxy.js starts WSS before fetchExchangeInfo completes. Client sends get_symbols, gets [] | Asset panel permanently empty — settled=true blocks retry | get_symbols defers until cachedSymbols ready; failure sets [] to unblock [binance-proxy.js:228-232] | FIXED |
| 15 | **DerivFeed missing HTTPS guard** | Falls back to `ws://localhost:8091` on HTTPS, triggering mixed-content block + PNA | Connection never established, no errors shown | Added getProxyUrl() pattern matching BinanceFeed [DerivFeed.js:14-24] | FIXED |

## Test Commands (copy-paste to verify each subsystem)

### Build & Dev Server
```bash
# 1. Build check
npm run build                                # zero errors required — do this ALWAYS

# 2. Dev server health
curl -s http://localhost:5173 | head -5      # Should return HTML

# 3. Vite HMR cache fix (when "does not provide export" appears)
touch src/App.jsx                            # Force re-evaluation
```

### WebSocket Proxies — Local
```bash
# 4. Derive proxy running?
lsof -i :8091 2>/dev/null | grep -q LISTEN && echo "deriv: local:UP" || echo "deriv: local:DOWN"

# 5. Binance proxy running?
lsof -i :8092 2>/dev/null | grep -q LISTEN && echo "binance: local:UP" || echo "binance: local:DOWN"

# 6. Derive proxy symbol fetch
node -e "
const ws=require('ws');
const w=new ws('ws://localhost:8091');
w.on('open',()=>{ws.send(JSON.stringify({type:'get_symbols'}));});
w.on('message',d=>{const m=JSON.parse(d.toString());if(m.type==='symbols'){console.log('Symbols:',m.symbols.length);w.close();}});
setTimeout(()=>process.exit(1),5000);
"
# Expected: "Symbols: >0"

# 7. Binance proxy symbol fetch
node -e "
const ws=require('ws');
const w=new ws('ws://localhost:8092');
w.on('open',()=>{w.send(JSON.stringify({type:'get_symbols'}));});
w.on('message',d=>{const m=JSON.parse(d.toString());if(m.type==='symbols'){console.log('Symbols:',m.symbols.length);w.close();}});
setTimeout(()=>process.exit(1),5000);
"
# Expected: "Symbols: 441"

# 8. Candle fetch — Binance
node -e "
const ws=require('ws');
const w=new ws('ws://localhost:8092');
w.on('open',()=>{w.send(JSON.stringify({type:'market:candles',symbol:'BTCUSDT',granularity:60,count:3}));});
w.on('message',d=>{const m=JSON.parse(d.toString());if(m.type==='candles'){console.log('Candles:',m.candles?.length);w.close();}});
setTimeout(()=>process.exit(1),10000);
"
# Expected: "Candles: 3"
```

### Production Verification
```bash
# 9. Production health
curl -sk -o /dev/null -w "%{http_code}\n" https://options.autobotsignal.io/health
# Expected: 200

# 10. Production WS — symbols
ssh gcp-vps@34.81.61.52 'cd /tmp && node -e "
const ws=require(\"/tmp/node_modules/ws\");
const w=new ws(\"wss://options.autobotsignal.io/ws/binance\");
w.on(\"open\",()=>{w.send(JSON.stringify({type:\"get_symbols\"}));});
w.on(\"message\",d=>{const m=JSON.parse(d.toString());if(m.type===\"symbols\"){console.log(m.symbols.length+\" symbols\");w.close();}});
setTimeout(()=>process.exit(1),5000);
"'
# Expected: "441 symbols"

# 11. Production WS — candles
ssh gcp-vps@34.81.61.52 'cd /tmp && node -e "
const ws=require(\"/tmp/node_modules/ws\");
const w=new ws(\"wss://options.autobotsignal.io/ws/binance\");
w.on(\"open\",()=>{w.send(JSON.stringify({type:\"market:candles\",symbol:\"BTCUSDT\",granularity:60,count:3}));});
w.on(\"message\",d=>{const m=JSON.parse(d.toString());if(m.type===\"candles\"){console.log(\"Candles:\",m.candles?.length);w.close();}});
setTimeout(()=>process.exit(1),10000);
"'
# Expected: "Candles: 3"

# 12. Production Docker status
ssh gcp-vps@34.81.61.52 'docker ps --format "{{.Names}} {{.Status}}" | grep -E "binance|deriv|autobot"'
# Expected: 3 containers running

# 13. Production — verify WS URL baked into bundle
ssh gcp-vps@34.81.61.52 'docker exec autobot-options grep -c options.autobotsignal.io /usr/share/nginx/html/assets/index-*.js'
# Expected: >0
```

### Trade Engine Tests
```bash
# 14. In browser console — place trade, verify persistence
# Execute these one at a time:
#   document.querySelector('[data-testid="call-btn"]')?.click()
#   JSON.parse(localStorage.getItem('autobot_engine_state')).balance
#   JSON.parse(localStorage.getItem('autobot_engine_state')).positions.length

# 15. localStorage key count
# In browser console:
#   Object.keys(localStorage).filter(k=>k.startsWith('autobot_')).length
# Expected: 20+

# 16. Refresh resilience
# Place a trade → refresh page → check open positions still appear
```

### Candle Pipeline Test
```bash
# In browser console — check candles are flowing:
setInterval(() => {
  const tabs = JSON.parse(localStorage.getItem('autobot_tabs'))
  const tab = tabs[0]
  console.log('Candles:', tab?.candleHistory?.length || 0, ' Last price:', tab?.priceHistory?.[tab.priceHistory.length-1]?.price)
}, 2000)
# Expected: candle count increases every ~1 second
```

## Production Architecture — Full Data Flow

```
                               ┌─────────────────────────────────────────────┐
                               │              GCP Server (34.81.61.52)       │
                               │                                             │
  Binance API                  │   ┌──────────────┐  ┌──────────────┐       │
  (wss://stream.binance.com:9443) │ │ binance-proxy │  │  deriv-proxy │       │
       ↕  REST /klines        │   │  (:8092)       │  │  (:8091)     │       │
       ↕  WS tickers          │   │  Node.js WS    │  │  Node.js WS  │       │
                               │   └──────┬───────┘  └──────┬───────┘       │
                               │          │                  │              │
  Derive API                   │          │  Internal        │              │
  (wss://ws.derivws.com)       │          │  Docker network  │              │
       ↕                       │          │                  │              │
                               │   ┌──────┴──────────────────┴───────┐      │
                               │   │        nginx (host, :443)        │      │
                               │   │  TLS via Let's Encrypt           │      │
                               │   │                                  │      │
                               │   │  /              → :8095 (SPA)    │      │
                               │   │  /ws/binance    → binance-proxy  │      │
                               │   │  /ws/deriv      → deriv-proxy    │      │
                               │   └──────────────┬───────────────────┘      │
                               └──────────────────┼──────────────────────────┘
                                                  │
                               wss://options.autobotsignal.io
                                                  │
                               ┌──────────────────┴───────────────────┐
                               │           Browser (SPA)              │
                               │                                      │
                               │  BinanceFeed ← wss://.../ws/binance  │
                               │    → useBinanceData hook             │
                               │      → handleAssetTick('binance')    │
                               │                                      │
                               │  DerivFeed ← wss://.../ws/deriv      │
                               │    → useMarketData hook              │
                               │      → handleAssetTick('deriv')      │
                               │                                      │
                               │  App.jsx — candleStoreRef            │
                               │    → flushTickSyncs (rAF batched)    │
                               │    → setTabs → ChartArea             │
                               │      → CanvasChart renders           │
                               │                                      │
                               │  DemoEngine — trading core           │
                               │    → positions, TP/SL, expiry        │
                               │    → localStorage (persistence)      │
                               └──────────────────────────────────────┘

Port map (AVOID CONFLICTS):
  8091 = phpMyAdmin (DO NOT USE — reserved!)
  8092 = autobot-admin (DO NOT USE — reserved!)
  8095 = autobot-options SPA (nginx:alpine container)
  8096 = deriv-proxy (internal:8091, host:8096)
  8097 = binance-proxy (internal:8092, host:8097)
```

## localStorage Key Reference — Complete

| Key | Source | Content | Size Warning |
|-----|--------|---------|-------------|
| `autobot_engine_state` | DemoEngine | balance, positions[], pendingOrders[], all risk settings | ~1-5 KB |
| `autobot_options_history` | DemoEngine | Closed trades (max 100, slice(-100) BUG), used by HistoryView | ~10-100 KB |
| `autobot_tabs` | App.jsx | Chart tabs array with candleHistory[] (1440 OHLC each) | **LARGE** (~500 KB+) — persisted on every change! |
| `autobot_active_tab` | App.jsx | Active tab ID string | ~10 B |
| `autobot_chart_prefs` | ChartArea | chartType, indicators, overlays, periods | ~1 KB |
| `autobot_custom_inds` | ChartArea | Custom indicators array | ~1 KB |
| `autobot_alerts` | App.jsx | Price alerts array | ~1 KB |
| `autobot_trade_*` | TradePanel | amount, duration, tp, sl | ~100 B |
| `autobot_mg_*` | TradePanel | Martingale: enabled, auto, multiplier, steps | ~200 B |
| `autobot_da_*` | TradePanel | D'Alembert: enabled, auto, unit, stake | ~200 B |
| `autobot_cp_*` | TradePanel | Compounding: enabled, auto, pct, steps | ~200 B |
| `autobot_backtest` | BacktesterView | All strategy params (JSON) | ~1 KB |
| `autobot_asset_*` | AssetPanel | search, category filter | ~100 B |
| `autobot_hist_*` | HistoryView | search, filter, sort | ~100 B |
| `autobot_ecal_filter` | EconomicCalendar | Impact filter | ~50 B |
| `autobot_sound_muted` | App.jsx | Boolean string | ~10 B |
| `autobot_push_enabled` | usePushNotifications | Boolean string | ~10 B |
| `pit_zoom_v2` | CanvasChart | Per-chart zoom level | ~100 B |
| `blg_drawing_lines` | CanvasChart | Drawing lines array | ~10 KB |

**Key insight**: `autobot_tabs` (persisted on every tab change via useEffect) contains the entire `candleHistory` and `priceHistory` arrays for every tab. At 1440 OHLC records * 8 tabs = 11,520 records, this can exceed localStorage's 5-10 MB limit. Consider stripping candle data before persisting.

## Quick Fixes Reference — Diagnosis and Solution

| Symptom | Most Likely Cause | Fix | File:Line |
|---------|------------------|-----|-----------|
| Positions gone after refresh | syncState() useEffect not firing | Check `useEffect(() => { syncState() }, [])` exists in useDemoEngine | DemoEngine.js:844 |
| Chart blank, no ticks | Binance proxy not running or empty symbols race | `docker logs binance-proxy` — check for "Fetched 441 USDT pairs". If 0, proxy started before exchangeInfo loaded. | binance-proxy.js:321 |
| Chart shows 1 candle then stops | History fetch worked but ticks not building | Check handleAssetTick is called (add console.log). Verify asset lookup: `a.brokerSymbol === symbol` may fail if field names differ. | App.jsx:87-89 |
| History not loading | handleCandles never called | Check fetchCandles sends correct granularity (60 for 1m). Check binance-proxy klines response for errors. | App.jsx:127 |
| Icons showing as raw URLs | AssetIcon not rendering <img> tag | Verify `asset.source === 'binance'` branch. Check normalizeBinanceSymbol sets `icon` field. | AssetIcon.jsx |
| Balance resets to $10k on refresh | _loadState() failing or syncState() not called | Check `autobot_engine_state` localStorage is valid JSON. Try `JSON.parse(localStorage.getItem('autobot_engine_state'))`. | DemoEngine.js:772 |
| "Does not provide an export" from Vite | Vite HMR cached stale module exports | `touch src/App.jsx` to force re-evaluation. Do NOT keep editing — it's Vite's cache, not the source. Reset dev server if persists. | — |
| Container won't start on GCP | Port conflict with existing container | `docker ps` to check port usage. 8091=phpMyAdmin, 8092=autobot-admin — never use these. | — |
| TP/SL not triggering | checkTP_SL not receiving price updates | Check assetPrices Map has the position's asset: `assetPrices.get(p.asset)`. Verify asset name matches exactly. | DemoEngine.js:383 |
| Martingale bet wrong amount | lastTradeResult not updated after TP/SL close | TP/SL handler doesn't call _resolvePosition. lastTradeResult is stale. Fix: update lastTradeResult/lastTradeProfit in TP/SL branches. | DemoEngine.js:390-420 |
| Price updates flood (too many re-renders) | 250ms price batching not working | Check priceBufRef flush in useBinanceData. Each tick from 441 pairs triggers setAssets if flush is bypassed. | useBinanceData.js:19-39 |
| Trade history shows wrong entries | _persist slice(-100) drops new entries at capacity | `merged.slice(-100)` keeps last 100 but new entries are prepended. Fix: use `.slice(0, 100)`. | DemoEngine.js:737 |
| Completed candle has wrong close | Candles stick to next period's first tick | `if (last) last.close = tickPrice` closes previous candle with first tick of new period. Fix: write close only on next tick with different time. | App.jsx:108 |
| Tab shows "Waiting for market data" | No ticks reaching candleStoreRef, or history never loaded | Check WS connection. Check handleAssetTick fires. Check candleStoreRef contents. | App.jsx:112-119 |

```
autobot-options/
├── index.html                 # Inter font preload, Vite entry
├── vite.config.js             # Vite 8 + React 19 + Tailwind CSS 4
├── public/favicon.svg         # Orange zap logo
├── Dockerfile                 # Multi-stage: node build → nginx:alpine serve
├── nginx.conf                 # Container-level nginx (static SPA + gzip)
├── server/
│   ├── binance-proxy.js       # WS proxy → Binance (441 USDT pairs, tickers + klines)
│   ├── Dockerfile.binance     # binance-proxy Docker image (:8092)
│   ├── deriv-proxy.js         # WS proxy → Deriv API
│   └── Dockerfile             # deriv-proxy Docker image (:8091)
├── scripts/
│   ├── nginx-site.conf        # Host-level nginx (TLS + /ws/deriv + /ws/binance routes)
│   └── deploy.sh              # One-shot deploy script
└── src/
    ├── main.jsx               # React 19 root mount
    ├── App.jsx                # Main terminal — 4-panel grid, multi-tab, persistence
    ├── index.css              # PIT-TERMINAL dark theme, 3 breakpoints
    ├── engine/
    │   ├── DemoEngine.js      # Trading core: positions, TP/SL, alerts, martingale
    │   │                      # compounding, pending orders, risk mgmt, rollover/extend
    │   │                      # full localStorage state persistence + absolute expiry
    │   ├── PriceFeedEngine.js # 4 market modes (random/trending/volatile/sideways)
    │   └── BacktestEngine.js  # Strategy backtester (RSI, SMA cross, MACD cross)
    ├── data/
    │   ├── mockData.js        # 20 assets, generators, 7 indicators, VWAP, Volume Profile
    │   │                      # Order Book, TF_MAP, history persistence, constants
    │   ├── binanceMapping.js  # Binance symbol → asset format, CDN coin icons, fallback SVGs
    │   └── economicCalendar.js # 21 events, rolling dates, active event detection
    ├── hooks/
    │   ├── useWebSocket.js    # Simulated 500ms tick feed (real WS via VITE_WS_URL)
    │   ├── useMarketData.js   # Deriv feed hook (VITE_WS_URL → deriv-proxy)
    │   ├── useBinanceData.js  # Binance feed hook (VITE_BINANCE_WS_URL → binance-proxy)
    │   ├── feeds/
    │   │   ├── DerivFeed.js   # Deriv WebSocket adapter
    │   │   └── BinanceFeed.js # Binance WebSocket adapter (HTTPS guard)
    │   ├── useSound.js        # Audio feedback for trade events
    │   ├── useKeyboardShortcuts.js # Hotkeys (Space=Call, Enter=Put, numbers=presets)
    │   └── usePushNotifications.js # Browser Notification API wrapper
    └── components/
        ├── Sidebar.jsx        # Left nav: 8 sections + footer
        ├── AssetPanel.jsx     # Search, category filter, sentiment bars, win rates
        ├── AssetIcon.jsx      # Shared icon: Binance CDN img / forex flags / text badge
        ├── ChartArea.jsx      # Toolbar, settings, multi-chart, indicators, drawing, replay
        ├── CanvasChart.jsx    # Physics canvas: candles, 5 indicators, VWAP, MTF, VP, DOM
        │                      # custom indicators, trade markers, zoom/pan, crosshair
        ├── TradePanel.jsx     # CALL/PUT, TP/SL, martingale, compounding, entry orders
        │                      # risk mgmt, position cards, extend, journal notes
        ├── SettingsModal.jsx   # Tabbed settings: Chart / Overlays / Alerts
        ├── HistoryView.jsx    # Trade history + CSV export, notes (persisted filters)
        ├── AnalyticsView.jsx  # P&L analytics, win rate, pie chart
        ├── JournalView.jsx    # Annotated positions, searchable
        ├── EconomicCalendar.jsx # Upcoming events, impact filters, live countdowns
        ├── HeatmapView.jsx    # Color-coded asset performance grid
        ├── CorrelationMatrix.jsx # Forex pair Pearson correlation table
        ├── BacktesterView.jsx # Strategy config + results + equity curve (persisted params)
        ├── ConfirmModal.jsx   # Styled confirmation dialog
        └── ToastContainer.jsx # Toast notifications
```

## Project Identity

| Attribute | Value |
|-----------|-------|
| Product | AutobotOptions — Demo Trading Terminal |
| Stack | Vite 8 + React 19 + Tailwind CSS 4 + Custom Canvas chart |
| Dev Port | 5173 |
| Design System | PIT-TERMINAL dark theme (orange brand `#f57b00`) |
| Font | Plus Jakarta Sans (400–800) from Google Fonts |
| Parent Workspace | AutoBotWeb (`/home/p/SpinnTask/Kosalley/git/AutoBotWeb/`) |

## Architecture Laws

1. **Local-First Development** — Everything runs and is tested locally. `.env` and build args are the gates between dev and production. Dev defaults to localhost or simulated data.
2. **Env-Driven URLs** — ALL `ws://` URLs come from env vars (`VITE_WS_URL`, `VITE_BINANCE_WS_URL`). Never hardcode production URLs.
3. **Single Source of Truth for Candles** — `candleStoreRef` (App.jsx) is the ONLY place candle data lives. `handleCandles` merges into it. `flushTickSyncs` reads from it. No other code path writes candle data to tabs.
4. **localStorage is the Database** — No backend API. All persistence is localStorage. DemoEngine._saveState() writes engine state. App.jsx writes tabs. Every component writes its own prefs. Use the keys documented above.
5. **Engine-State Separation** — DemoEngine owns all trading state (balance, positions, orders, risk). React state is a mirror, synced via syncState(). NEVER mutate engine state from React components directly.
6. **Fault Tolerance Over Cleverness** — Explicit error containment, strict interfaces, no silent failures. Every try/catch should either recover gracefully or surface the error.
7. **Demo with Real Data** — This IS a demo trading platform with simulated execution, but prices come from real Binance (441 pairs) and Deriv feeds. No mock price generators in production. DemoEngine simulates trade outcomes (55% win rate).

## Design System — PIT-TERMINAL

### Color Tokens (use `var(--token)` — NEVER raw hex/rgba)

| Token | Value | Usage |
|-------|-------|-------|
| `--brand` | `#f57b00` | Active states, borders, chart line, accent |
| `--brand-light` | `#ff9f3d` | Gradients, hover |
| `--brand-dark` | `#e06c00` | Pressed states |
| `--bg-base` | `#0a0b0f` | Page background |
| `--bg-surface` | `#111318` | Panels, sidebar |
| `--bg-elevated` | `#171a21` | Cards, hover states |
| `--bg-input` | `#1a1d26` | Form inputs |
| `--text-primary` | `#e8eaf0` | Headings, main text |
| `--text-secondary` | `#8b8fa8` | Body text |
| `--text-muted` | `#5a5e72` | Captions, placeholders |
| `--success` | `#00c853` | CALL button, wins, profit, bull candles |
| `--danger` | `#ff1744` | PUT button, losses, bear candles |
| `--chart-bg` | `#0d0f14` | Chart background |

### Layout Rules
- `html, body, #root` MUST have `height: 100%; overflow: hidden`
- 4-column grid: sidebar(56px) asset-panel(300px) chart(1fr) trade-panel(300px)
- NEVER use `100vh` or `100dvh` — use `height: 100%` or `100vh` only on root
- Scrollbar: 4px width, `--border-strong` thumb, transparent track

### Type Scale
- Minimum font size: 11px (NEVER 9px or 10px)
- Scale: 10, 11, 12, 13, 14, 16, 18, 20, 24
- Uppercase labels: 11px, `letter-spacing: 0.3-0.5px`
- ALL font-variant-numeric: tabular-nums for prices, balances, P&L

### Animation
- Only for state changes (hover, active, transitions)
- Never decorative
- Duration: 150ms standard, never over 300ms
- Hover lift: `translateY(-1px)` max

## Development Rules (NON-NEGOTIABLE)

### Read Before Modify
- Read the ENTIRE file before any edit
- Understand imports, dependencies, existing patterns, business logic
- Never edit blindly from partial context

### Write Whole Files for Vite-Served TSX/JSX
- When editing files served by Vite HMR, write the ENTIRE file in ONE operation
- Multiple rapid edits cause Vite to cache stale module exports → "does not provide an export named X"
- If that error appears: `touch` the file to force Vite re-evaluation, or restart dev server
- Do NOT keep editing — the issue is Vite's cache, not the source code

### Verify After Every Edit
- Check imports intact (first 10 lines)
- Check closing braces intact (last 5 lines)
- Check exports at expected locations
- Run `npm run build` for any non-trivial change — zero errors required

### No Emojis — Use Icons
- **NEVER** use emoji characters in UI text, toast messages, labels, buttons, or anywhere user-facing
- All icons MUST be from `lucide-react` — import specific icons as needed
- **Exception:** Country flag emojis are allowed ONLY in forex pair/country displays (e.g., 🇺🇸 for USD, 🇪🇺 for EUR) and in the economic calendar — they serve as visual currency identifiers
- Replace all other emojis (✅❌🔔🎯📝 etc.) with text or lucide-react icons
- This applies to: toast messages, chart labels, trade notifications, position cards, push notifications, alert badges, all components

### No Native Browser Dialogs
- **NEVER** use `alert()`, `confirm()`, `prompt()`, or any native browser dialog
- Use the custom `ConfirmModal` component (`src/components/ConfirmModal.jsx`) for confirmations
- Use Toast notifications (`addToast`) for alerts
- All user feedback must be styled to match the PIT-TERMINAL design system

### No Assumptions
- Never assume API responses, component behavior, or user intentions
- Inspect actual code first
- Check BOTH `message` and `data` fields in API responses

### Real Data Only — No Simulation Fallbacks
- This is a REAL trading platform — never generate fake prices, candles, or asset data
- Chart shows "Waiting for market data…" when both proxies are unavailable — do NOT seed mock data
- All price updates come from the WebSocket proxies: `deriv-proxy.js` (Deriv) and `binance-proxy.js` (Binance)
- DemoEngine generates trade outcomes (win/loss) based on real price movement — NOT random
- `generateCandleHistory()` and `generateInitialAssets()` exist for backtesting ONLY — never wire them into the live data path
- When adding features, route through source-aware callbacks: `handleAssetTick(symbol, price, source)` and `handleCandles(symbol, candles, source)` where source is `'deriv'` or `'binance'`
- Asset lookup is source-aware: use `a.brokerSymbol` for Binance, `a.derivSymbol` for Deriv

### Code Standards
- 2-space indentation, single quotes, trailing commas
- Named exports: `export function ComponentName()`
- PascalCase for component filenames
- Destructure props in function parameters
- All prices/numbers use `font-variant-numeric: tabular-nums`
- Wrap API calls in try/catch with proper error states
- Include loading, error, and empty states for every data-fetching component

### WebSocket Testing — Real Data Only, No Assumptions
- **NEVER assume a WebSocket connection works** — test every connection with real data before committing
- Test procedure for any WS change:
  1. Verify proxy is running: `lsof -i :8092` (Binance) or `lsof -i :8091` (Deriv)
  2. Send a real request and inspect the response:
     ```bash
     # Binance
     node -e "const ws=new (require('ws'))('ws://localhost:8092'); ws.on('open',()=>ws.send(JSON.stringify({type:'market:candles',symbol:'BTCUSDT',granularity:60,count:5}))); ws.on('message',d=>console.log(JSON.parse(d.toString())));"
     # Derive
     node -e "const ws=new (require('ws'))('ws://localhost:8091'); ws.on('open',()=>ws.send(JSON.stringify({type:'market:candles',symbol:'R_50',granularity:60,count:5}))); ws.on('message',d=>console.log(JSON.parse(d.toString())));"
     ```
  3. Confirm response structure matches what downstream code expects (type, symbol, candles[].epoch/open/high/low/close)
  4. Run `npm run build` — zero errors required
- When a proxy returns new message types, study the response structure BEFORE writing code to consume it
- All data paths must be traceable end-to-end (two sources):
  - Binance: WS → binance-proxy → BinanceFeed → useBinanceData → App → ChartArea → CanvasChart
  - Derive: WS → deriv-proxy → DerivFeed → useMarketData → App → ChartArea → CanvasChart
- If data isn't rendering, trace each layer with the browser console before touching code

## Deployment Rules (NON-NEGOTIABLE)

### Production Architecture (current)

```
GCP Server (34.81.61.52)
  ├─ nginx (host, :80/:443, TLS via Let's Encrypt)
  │   ├─ /           → autobot-options Docker :8095 (SPA)
  │   ├─ /ws/deriv   → deriv-proxy Docker :8096 (Internal port 8091)
  │   └─ /ws/binance → binance-proxy Docker :8097 (Internal port 8092)
  ├─ autobot-options  — nginx:alpine + Vite SPA (port 8095)
  ├─ deriv-proxy      — Node.js WS proxy → Deriv (wss://ws.derivws.com)  (port 8096)
  └─ binance-proxy    — Node.js WS proxy → Binance (wss://stream.binance.com:9443)  (port 8097)
                        441 USDT pairs, exchangeInfo-driven, klines via REST
```

- **Domain:** options.autobotsignal.io (Let's Encrypt SSL, auto-renew)
- **Repo:** github.com/SpinnCompany/autobot-options
- **Deploy:** `git push` → SSH to GCP → `git pull` → `docker build` → `docker run`
- **SPA build args (BOTH required for production):**
  - `VITE_WS_URL=wss://options.autobotsignal.io/ws/deriv` (Deriv proxy)
  - `VITE_BINANCE_WS_URL=wss://options.autobotsignal.io/ws/binance` (Binance proxy)
- **Docker --no-cache:** Required when changing build args (Vite bakes them at build time)
- **Port conflicts to avoid:**
  - 8091 = phpMyAdmin (DO NOT USE)
  - 8092 = autobot-admin (DO NOT USE)

### NEVER — Deployment Anti-Patterns

1. **NEVER add simulation/demo fallback code.** If a proxy isn't reachable, DEPLOY THE PROXY. Do not seed fake assets, simulated prices, or mock candles. The app shows "Waiting for market data..." until real data arrives.
2. **NEVER deploy without BOTH proxies running.** The SPA depends on both deriv-proxy AND binance-proxy. Without them the terminal is blank.
3. **NEVER use cached Docker builds when changing VITE_WS_URL or VITE_BINANCE_WS_URL.** Force `--no-cache` or the old URL stays in the bundle.
4. **NEVER hardcode WebSocket URLs.** Use `VITE_WS_URL` and `VITE_BINANCE_WS_URL` env vars.
5. **Port 8091 is phpMyAdmin, 8092 is autobot-admin** — never use them.

### Deploy Checklist (full)

```bash
# 1. Push code
cd autobot-options && git push origin main

# 2. Pull on GCP
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options && git pull origin main'

# 3. Rebuild deriv-proxy (if server/ changed)
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options/server && docker build -t deriv-proxy:latest . && docker stop deriv-proxy && docker rm deriv-proxy && docker run -d --name deriv-proxy --restart unless-stopped --network autobot-network -p 127.0.0.1:8096:8091 deriv-proxy:latest'

# 4. Rebuild binance-proxy (if server/ changed)
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options/server && docker build -f Dockerfile.binance -t binance-proxy:latest . && docker stop binance-proxy && docker rm binance-proxy && docker run -d --name binance-proxy --restart unless-stopped --network autobot-network -p 127.0.0.1:8097:8092 binance-proxy:latest'

# 5. Rebuild SPA with BOTH production WS URLs
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options && docker build --no-cache --build-arg VITE_WS_URL=wss://options.autobotsignal.io/ws/deriv --build-arg VITE_BINANCE_WS_URL=wss://options.autobotsignal.io/ws/binance -t autobot-options:latest . && docker stop autobot-options && docker rm autobot-options && docker run -d --name autobot-options --restart unless-stopped --network autobot-network -p 8095:80 autobot-options:latest'

# 6. Verify
curl -sk -o /dev/null -w '%{http_code}' https://options.autobotsignal.io/health  # → 200
ssh gcp-vps@34.81.61.52 'docker logs deriv-proxy --tail 3'  # → "Deriv connected"
ssh gcp-vps@34.81.61.52 'docker logs binance-proxy --tail 3'  # → "Fetched 441" + "Connected to Binance WS"
ssh gcp-vps@34.81.61.52 'docker exec autobot-options sh -c "grep -l options.autobotsignal.io /usr/share/nginx/html/assets/index-*.js"'  # → prints matched filenames

# 7. Smoke test — production WS
ssh gcp-vps@34.81.61.52 'cd /tmp && node -e "
const ws=require(\"/tmp/node_modules/ws\");
const w=new ws(\"wss://options.autobotsignal.io/ws/binance\");
w.on(\"open\",()=>{w.send(JSON.stringify({type:\"get_symbols\"}));});
w.on(\"message\",d=>{const m=JSON.parse(d.toString());if(m.type===\"symbols\"){console.log(m.symbols.length+\" symbols\");w.close();}});
setTimeout(()=>process.exit(1),5000);
"'
# Expected: "441 symbols"
```

## Trade Execution Rules (Trading System Safety)

Changes affecting signal generation, trade execution, position sizing, risk management, or balance calculations REQUIRE:
- Current Behavior documented
- Proposed Behavior explained
- Impact Analysis
- Failure Modes identified
- Verification Method specified

### Current Trade Flow (via DemoEngine)
```
User clicks CALL/PUT → TradePanel.handleTrade()
  → Validates: amount > 0, amount ≤ balance, openCount < MAX_OPEN(5)
  → Risk checks: daily loss limit, max position %, max daily trades,
                 min payout %, news event blocker
  → Validation: TP/SL direction relative to CALL/PUT
  → DemoEngine.placeTrade() deducts balance, creates position with
    absolute expiresAt (openTime + duration * 1000)
  → Every tick (via App.jsx useEffect [App.jsx:485-506]):
    → (1) checkTP_SL() — stamps last prices, checks crosses
    → (2) checkExpiry() — compares Date.now() vs expiresAt
    → (3) checkPendingOrders() — price cross triggers execution
    → (4) checkAlerts() — price cross triggers notification
  → checkExpiry → _resolvePosition() with PRICE-DRIVEN outcome:
    CALL wins if exitPrice > entryPrice (NOT random 55%)
  → TP/SL: maps return mapped objects directly — does NOT call
    _resolvePosition (BUG: lastTradeResult not updated)
  → Saves to localStorage trade history (last 100 via slice(-100))
    (BUG: slice(-100) drops new entries at capacity)
```

### Key: No setTimeout is used — all expiry is tick-driven via checkExpiry().
All positions use absolute `expiresAt` timestamps that survive page refresh.

## Brokers Reference

The `docs/brokers-websocket-architecture.md` file documents the WebSocket APIs of 6 broker platforms (from the ATS-Project Python desktop bot). This is reference material for future real-broker integration:

| Broker | Protocol | Auth Method | Library |
|--------|----------|------------|---------|
| Deriv | JSON-RPC | API token | websocket-client |
| ExpertOption | Custom JSON | Selenium cookie | websocket-client |
| IQ Option | Socket.IO-like | SSID cookie | websocket-client |
| OlympTrade | Custom JSON | Selenium CDP token | websockets (async) |
| Pocket Option | Socket.IO | Session token | python-socketio |
| Quotex | Socket.IO v4 | Selenium SSID | websocket-client |

Common patterns: SSL verification disabled on all, auto-reconnect with backoff, subscription-based price streaming, all run in background threads.

### Broker Memory Bank (loaded in context)
- **[Broker Protocol Study](memory/broker-protocol-study.md)** — Complete synthesis of all 6 broker protocols, data streaming, and trade execution
- **[Broker Integration Architecture](memory/broker-integration-architecture.md)** — Target architecture, current file listing, Phase 2 status (complete)
- **[Broker Guidance Protocol](memory/broker-guidance-protocol.md)** — 10 decision points (ALL RESOLVED), feature list, trigger phrases
- **[Broker Gap Audit](memory/broker-gap-audit.md)** — 46 features vs real brokers — 27 done (59%), 19 remaining

### Broker Guidance Skill
Before implementing ANY broker integration code, invoke the `broker-guidance` skill. It enforces a protocol: check unresolved decisions → ask user with AskUserQuestion → wait for answer → record decision → then implement. Never assume broker design choices.

## Safety Policies

### NEVER Without Explicit User Approval
- Revert files, restore backups, checkout old commits
- Execute `git reset`, `git restore`, `git checkout`
- Delete files or user work
- Drop tables, delete data, modify schemas
- Introduce new frameworks or dependencies
- Rewrite working systems unnecessarily

### Destructive Action Protocol
If rollback/restore seems necessary, present:
1. Problem + Root Cause
2. Files affected
3. Risks of proceeding
4. Why rollback is being considered
5. Exact files that would change

Then ASK. No approval = no action.

### Root Cause First
Reproduce → Investigate → Gather evidence → Find root cause → Propose fix → Implement → Verify. Never patch blindly. Never revert as a shortcut.

## Task Completion Checklist

Before marking ANY task complete:
- [ ] Code implemented correctly
- [ ] `npm run build` passes (zero errors)
- [ ] UI verified (desktop + tablet + mobile)
- [ ] No existing features broken
- [ ] No production URLs hardcoded
- [ ] All colors use CSS tokens, no raw hex/rgba
- [ ] Font sizes ≥ 11px
- [ ] Trade execution still works end-to-end
- [ ] Balance updates correctly

## Key Constraints

- **MAX_OPEN positions:** 5 (enforced in DemoEngine)
- **MAX_TABS:** 8 chart tabs
- **Payout:** 82% default (configurable per asset in mockData, 80-93%)
- **Win rate:** 55% (simulated, adjustable via DemoEngine.winRate)
- **Early close:** 65% refund
- **Trade history:** localStorage `autobot_options_history`, last 100 records
- **Dev server:** `npm run dev` → localhost:5173
- **No routing:** single-page terminal, sections switch via state

## Related Documentation

- `../CLINE.md` — Parent workspace agent governance (19 skills, multi-agent workflow)
- `../AGENT_RULES_REFERENCE.md` — Complete compilation of all 17 rule parts
- `../ARCHITECTURE.md` — Full AutoBotWeb system architecture
- `../.editor-rules.md` — Vite HMR editing rules
- `./autobot-options/MEMORY.md` — Project memory bank
- `./autobot-options/README.md` — Vite React template docs
- `./docs/brokers-websocket-architecture.md` — 6 broker WS API reference
- `./memory/broker-protocol-study.md` — Complete broker protocol synthesis
- `./memory/broker-integration-architecture.md` — Target broker integration architecture
- `./memory/broker-guidance-protocol.md` — 10 mandatory decision points
- `./memory/broker-gap-audit.md` — 46 features to implement (27 done, 19 remaining)
