# AutobotOptions — Professional Demo Trading Platform

You are working on **AutobotOptions**, a standalone professional binary options demo trading terminal. It provides a realistic trading experience with simulated price feeds, multi-asset charting, position management, and trade history — designed as the foundation for a full broker platform.

## ⚡ NEXT SESSION — Start Here

**Session:** July 1, 2026 — Binance live data, full localStorage persistence, position expiry fix, icon rendering fix, secret cleanup. 37/46 gap audit items complete (80%).

### New Since Last Session (June 30 → July 1)
- **Binance live market data** — 441 USDT pairs streaming via binance-proxy (Docker, port 8097)
- **Full localStorage persistence** — balance, open positions, tabs, all UI state survive refresh
- **Position expiry fix** — absolute expiresAt timestamps, no duration extension on refresh
- **AssetIcon component** — Binance CDN coin icons render as images in all panels
- **Chrome PNA fix** — no more "access other apps and services" permission prompt
- **Secret cleanup** — broker HTML snapshots removed from git history, .gitignore hardened

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

### Feature Status — 37/46 Gap Audit Items Complete (80%)

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

When starting a new session, run through these steps before making changes:

### 1. Verify Environment (30 seconds)
```bash
# Check dev server
curl -s http://localhost:5173 > /dev/null && echo "Dev: UP" || echo "Dev: DOWN"
# Check production
curl -sk -o /dev/null -w "%{http_code}\n" https://options.autobotsignal.io/health
# Check WebSocket proxies
ssh gcp-vps@34.81.61.52 'docker ps --format "{{.Names}} {{.Status}}" | grep -E "binance|deriv|autobot"'
```

### 2. Read Before Modify (NON-NEGOTIABLE)
- Read the ENTIRE file before any edit
- Check imports, exports, closing braces
- Understand the data flow before touching code

### 3. Test After Every Change
- `npm run build` — zero errors required
- If Vite HMR caches stale exports: `touch src/App.jsx` to force re-evaluation
- Write WHOLE files in ONE operation for Vite-served JSX

### 4. Deploy Checklist
```bash
# Build check
npm run build
# Commit
git add -A && git commit -m "fix: description"
# Push
git push origin main
# Deploy SPA
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options && git pull origin main && docker build --no-cache --build-arg VITE_WS_URL=wss://options.autobotsignal.io/ws/deriv --build-arg VITE_BINANCE_WS_URL=wss://options.autobotsignal.io/ws/binance -t autobot-options:latest . && docker stop autobot-options 2>/dev/null; docker rm autobot-options 2>/dev/null; docker run -d --name autobot-options --restart unless-stopped --network autobot-network -p 8095:80 autobot-options:latest'
# Verify
ssh gcp-vps@34.81.61.52 'curl -sk -o /dev/null -w "%{http_code}\n" -H "Host: options.autobotsignal.io" https://127.0.0.1/'
```

## Critical Data Flows (with exact file:line references)

### Flow 1: Tick → Chart Candle (the most fragile pipeline)
```
WebSocket message arrives
  → BinanceFeed._handle() [feeds/BinanceFeed.js:140]
  → onTick(symbol, price, epoch)
  → handleAssetTick() [App.jsx:77]
    → Lookup asset by brokerSymbol/derivSymbol
    → For each tab matching asset:
      → Build/update OHLC candle in candleStoreRef [App.jsx:93-110]
      → Store in candleStoreRef Map<tabId, Map<tf, candles[]>> [App.jsx:118]
      → Flag key in tickSyncPendingRef [App.jsx:119]
      → Schedule rAF flush [App.jsx:120]
  → rAF fires flushTickSyncs() [App.jsx:46]
    → Read unique keys from tickSyncPendingRef [App.jsx:51]
    → Read FRESH candles from candleStoreRef [App.jsx:60] ← NOT from pending map!
    → setTabs() with updated candleHistory [App.jsx:56-66]
  → CanvasChart reads tabs[n].candleHistory and renders
```

### Flow 2: History Fetch → Chart (background merge)
```
Tab opened → handleOpenTab() [App.jsx:~570]
  → fetchCandles(symbol, 60, 1440) [App.jsx:589]
  → Binance WS → proxy → Binance REST /klines
  → Response arrives: handleCandles() [App.jsx:122]
    → Lookup asset, find matching tabs
    → Read existing tick-built candles from candleStoreRef [App.jsx:135]
    → Merge: fetched history + live ticks, dedup by time [App.jsx:136-140]
    → Store merged in candleStoreRef [App.jsx:144]
    → syncCandlesToTab() → setTabs() [App.jsx:145]
```

### Flow 3: Trade Lifecycle
```
User clicks CALL/PUT → TradePanel.handleTrade()
  → DemoEngine.placeTrade() [engine/DemoEngine.js:72]
    → Validate: amount, balance, risk limits, news block
    → Create position, deduct balance
    → _persist() → _saveState() → localStorage
  → Every tick: checkTP_SL() [DemoEngine.js:~358] → checkExpiry() [DemoEngine.js:~428]
    → _stampLastPrices() on each position [DemoEngine.js:~690]
    → TP/SL hit: resolve, credit balance
    → Expired: _resolvePosition() with price-driven outcome
  → _persist() writes closed trades to autobot_options_history
```

### Flow 4: Page Refresh — State Restore
```
Page loads → useDemoEngine() [DemoEngine.js:814]
  → new DemoEngine() → constructor [DemoEngine.js:53]
    → _loadState() reads autobot_engine_state [DemoEngine.js:772]
    → Restore: balance, positions, pendingOrders, risk settings
    → For expired positions (Date.now() >= expiresAt):
      → _resolvePosition() with _lastPrice [DemoEngine.js:65]
    → For alive positions: keep original expiresAt (no extension)
  → useEffect → syncState() [DemoEngine.js:843]
    → Mirror engine state into React state
  → Tabs restored from autobot_tabs [App.jsx:206]
  → Assets reload from Binance/Deriv feeds
  → Ticks start flowing → candles build from scratch
```

### Flow 5: Asset Icon Rendering
```
Asset data created → normalizeBinanceSymbol() [data/binanceMapping.js:23]
  → icon = CDN URL (cryptocurrency-icons SVG)
  → iconFallback = data URI (generated colored circle)
AssetIcon component [components/AssetIcon.jsx]
  → Binance: <img src={icon} onError={iconFallback} />
  → Forex: flag emoji span
  → Default: colored text badge
Used in: ChartArea (header + tabs), TradePanel (header + position cards), AssetPanel
```

## Known Gotchas (bugs we've already fixed — don't reintroduce)

| # | Bug | Symptom | Fix | Date |
|---|-----|---------|-----|------|
| 1 | **Chrome PNA prompt** | "access other apps and services" dialog | BinanceFeed skips localhost on HTTPS [BinanceFeed.js:19-24] | Jul 1 |
| 2 | **syncState not called on mount** | Positions disappear on refresh, reappear after trade | useEffect → syncState() in useDemoEngine [DemoEngine.js:843] | Jul 1 |
| 3 | **Position duration extended** | Refresh adds downtime to position time | Store absolute expiresAt, resolve expired on load [DemoEngine.js:53-68] | Jul 1 |
| 4 | **Tick guard blocked restored tabs** | No chart ticks after refresh | Removed historyReadyRef guard from handleAssetTick [App.jsx:112-119] | Jul 1 |
| 5 | **flushTickSyncs race condition** | History erased after merge | Read from candleStoreRef (not stale pending map) [App.jsx:46-66] | Jul 1 |
| 6 | **Binance icons as text** | Raw CDN URLs shown instead of coin images | AssetIcon component handles all 3 icon types [AssetIcon.jsx] | Jul 1 |
| 7 | **Secrets in git history** | Google API keys from scraped broker HTML | .gitignore excludes docs/broker-html-snapshots/ | Jul 1 |
| 8 | **git add -A committed artifacts** | 229 files accidentally committed | .gitignore: .playwright-mcp/, screenshots/, .claude/settings.json | Jul 1 |

## Test Commands (copy-paste to verify each subsystem)

```bash
# 1. Build check
npm run build                                    # zero errors required

# 2. WebSocket — Binance proxy
ssh gcp-vps@34.81.61.52 'docker logs binance-proxy --tail 3'
# Expected: "Fetched 441 USDT pairs" + "Connected to Binance WS"

# 3. WebSocket — full path test
ssh gcp-vps@34.81.61.52 'cd /tmp && node -e "
const ws=require(\"/tmp/node_modules/ws\");
const w=new ws(\"wss://options.autobotsignal.io/ws/binance\");
w.on(\"open\",()=>{w.send(JSON.stringify({type:\"get_symbols\"}));});
w.on(\"message\",d=>{const m=JSON.parse(d.toString());if(m.type===\"symbols\"){console.log(m.symbols.length+\" symbols\");w.close();}});
setTimeout(()=>process.exit(1),5000);
"'
# Expected: "441 symbols"

# 4. Candle fetch test
ssh gcp-vps@34.81.61.52 'cd /tmp && node -e "
const ws=require(\"/tmp/node_modules/ws\");
const w=new ws(\"wss://options.autobotsignal.io/ws/binance\");
w.on(\"open\",()=>{w.send(JSON.stringify({type:\"market:candles\",symbol:\"BTCUSDT\",granularity:60,count:3}));});
w.on(\"message\",d=>{const m=JSON.parse(d.toString());if(m.type===\"candles\"){console.log(\"Candles:\",m.candles?.length);w.close();}});
setTimeout(()=>process.exit(1),10000);
"'
# Expected: "Candles: 3"

# 5. Production health
curl -sk -o /dev/null -w "%{http_code}\n" https://options.autobotsignal.io/health
# Expected: 200

# 6. localStorage persistence (in browser console)
Object.keys(localStorage).filter(k=>k.startsWith('autobot_'))
# Expected: 20+ keys including autobot_engine_state, autobot_tabs, etc.
```

## Production Architecture

```
GCP Server (34.81.61.52)
  ├─ nginx (host, :80/:443, TLS via Let's Encrypt)
  │   ├─ /          → autobot-options:8095 (SPA)
  │   ├─ /ws/deriv  → deriv-proxy:8096 (WebSocket)
  │   └─ /ws/binance→ binance-proxy:8097 (WebSocket)
  ├─ autobot-options  — nginx:alpine + Vite SPA
  ├─ deriv-proxy      — Node.js WS proxy → Deriv API (wss://ws.derivws.com)
  └─ binance-proxy    — Node.js WS proxy → Binance (wss://stream.binance.com:9443)
                         441 USDT pairs via exchangeInfo, klines via REST API

Port map (avoiding conflicts):
  8091 = phpMyAdmin (DO NOT USE)
  8092 = autobot-admin
  8095 = autobot-options SPA
  8096 = deriv-proxy (internal: 8091)
  8097 = binance-proxy (internal: 8092)
```

## localStorage Key Reference

| Key | Source | Content |
|-----|--------|---------|
| `autobot_engine_state` | DemoEngine | balance, positions[], pendingOrders[], all risk settings |
| `autobot_options_history` | DemoEngine | Closed trades (max 100), used by HistoryView |
| `autobot_tabs` | App.jsx | Chart tabs array [{id, asset, timeframe, candleHistory}] |
| `autobot_active_tab` | App.jsx | Active tab ID string |
| `autobot_chart_prefs` | ChartArea | chartType, indicators, overlays, periods |
| `autobot_custom_inds` | ChartArea | Custom indicators array |
| `autobot_alerts` | App.jsx | Price alerts array |
| `autobot_trade_*` | TradePanel | amount, duration, tp, sl |
| `autobot_mg_*` | TradePanel | Martingale: enabled, auto, multiplier, steps |
| `autobot_da_*` | TradePanel | D'Alembert: enabled, auto, unit, stake |
| `autobot_cp_*` | TradePanel | Compounding: enabled, auto, pct, steps |
| `autobot_backtest` | BacktesterView | All strategy params (JSON) |
| `autobot_asset_*` | AssetPanel | search, category filter |
| `autobot_hist_*` | HistoryView | search, filter, sort |
| `autobot_ecal_filter` | EconomicCalendar | Impact filter |
| `autobot_sound_muted` | App.jsx | Boolean string |
| `autobot_push_enabled` | usePushNotifications | Boolean string |
| `pit_zoom_v2` | CanvasChart | Per-chart zoom level |
| `blg_drawing_lines` | CanvasChart | Drawing lines array |

## Quick Fixes Reference

| Problem | Fix |
|---------|-----|
| Positions gone after refresh | Check `autobot_engine_state` in localStorage. If missing, `syncState()` might not be called — verify `useEffect(() => { syncState() }, [])` in DemoEngine hook. |
| Chart blank, no ticks | Check browser console for WS errors. Verify binance-proxy is running: `docker logs binance-proxy`. Check `candleStoreRef` — should build candles from tick 1. |
| History not loading | Check that `handleCandles` is called (add console.log). Verify `fetchCandles` sends correct granularity (60 for 1m). Check binance-proxy klines response. |
| Icons showing as text | Verify AssetIcon component is imported. Check `asset.source === 'binance'` branch in AssetIcon. |
| Balance resets to $10k | `_loadState()` might be failing. Check localStorage `autobot_engine_state` is valid JSON. |
| Container won't start | Port conflict: check `docker ps` for port usage. 8091=phpMyAdmin, 8092=autobot-admin. |
| Vite "does not provide an export" | `touch src/App.jsx` to force Vite re-evaluation. Do NOT keep editing — it's a Vite cache issue. |

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
- Chart shows "Waiting for market data…" when Deriv proxy is unavailable — do NOT seed mock data
- All price updates come exclusively from the Deriv WebSocket proxy (`deriv-proxy.js`)
- `generateCandleHistory()` and `generateInitialAssets()` exist for backtesting ONLY — never wire them into the live data path
- When adding features, always use real Deriv data paths (`onDerivAssetTick`, `onDerivCandles`, `marketData.fetchCandles`)

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
  1. Verify deriv-proxy is running: `lsof -i :8091`
  2. Send a real request and inspect the response: `node -e "const ws=new (require('ws'))('ws://localhost:8091'); ws.on('open',()=>ws.send(JSON.stringify({type:'market:candles',symbol:'R_50',granularity:60,count:5}))); ws.on('message',d=>console.log(JSON.parse(d.toString())));"`
  3. Confirm response structure matches what downstream code expects (type, symbol, candles[].epoch/open/high/low/close)
  4. Run `npm run build` — zero errors required
- When Deriv returns new message types (like `auto_list_strategies`), study the response structure BEFORE writing code to consume it
- All data paths must be traceable end-to-end: Deriv WS → proxy → DerivFeed → useMarketData → App → ChartArea → CanvasChart
- If data isn't rendering, trace each layer with the browser console before touching code

## Deployment Rules (NON-NEGOTIABLE)

### Production Architecture

```
GCP Server (34.81.61.52)
  ├─ nginx (host, :80/:443)
  │   ├─ /      → autobot-options Docker :8095 (SPA)
  │   └─ /ws    → deriv-proxy Docker :8096 (WebSocket)
  ├─ autobot-options  — Vite SPA served by nginx:alpine
  └─ deriv-proxy      — Node.js WS proxy → Deriv API (wss://ws.derivws.com)
```

- **Domain:** options.autobotsignal.io (Let's Encrypt SSL, auto-renew)
- **Repo:** github.com/SpinnCompany/autobot-options
- **Deploy:** `git push` → SSH to GCP → `git pull` → `docker build` → `docker run`
- **SPA build arg:** `VITE_WS_URL=wss://options.autobotsignal.io/ws` (REQUIRED for production)
- **Docker --no-cache:** Required when changing build args (Vite bakes them at build time)

### NEVER — Deployment Anti-Patterns

1. **NEVER add simulation/demo fallback code.** If the deriv-proxy isn't reachable, DEPLOY THE PROXY. Do not seed fake assets, simulated prices, or mock candles. The app shows "Waiting for market data…" until real Deriv data arrives.
2. **NEVER deploy without deriv-proxy running.** The SPA depends on the proxy for ALL data. Without it the terminal is blank.
3. **NEVER use cached Docker builds when changing VITE_WS_URL.** Force `--no-cache` or the old URL stays in the bundle.
4. **NEVER hardcode WebSocket URLs.** Use `VITE_WS_URL` env var (dev default: `ws://localhost:8091`).
5. **Port 8091 is phpMyAdmin** — deriv-proxy uses internal port 8091 mapped to host port 8096.

### Deploy Checklist

```bash
# 1. Push code
cd autobot-options && git push origin main

# 2. Pull on GCP
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options && git pull origin main'

# 3. Rebuild deriv-proxy (if server/ changed)
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options/server && docker build -t deriv-proxy:latest . && docker stop deriv-proxy && docker rm deriv-proxy && docker run -d --name deriv-proxy --restart unless-stopped --network autobot-network -p 127.0.0.1:8096:8091 deriv-proxy:latest'

# 4. Rebuild SPA with production WS URL
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options && docker build --no-cache --build-arg VITE_WS_URL=wss://options.autobotsignal.io/ws -t autobot-options:latest . && docker stop autobot-options && docker rm autobot-options && docker run -d --name autobot-options --restart unless-stopped --network autobot-network -p 8095:80 autobot-options:latest'

# 5. Verify
curl -sk -o /dev/null -w '%{http_code}' https://options.autobotsignal.io/health  # → 200
ssh gcp-vps@34.81.61.52 'docker logs deriv-proxy --tail 3'  # → "Deriv connected"
ssh gcp-vps@34.81.61.52 'docker exec autobot-options grep -c options.autobotsignal.io /usr/share/nginx/html/assets/index-*.js'  # → >0
```

### Data Flow (production)

```
Deriv API (wss://ws.derivws.com)
    ↕
deriv-proxy.js (Docker, 127.0.0.1:8096)
    ↕  wss://options.autobotsignal.io/ws (nginx TLS termination)
    ↕
Browser (DerivFeed → useMarketData → App.jsx)
    ├─ onDerivAssetTick → setAssets (asset panel prices)
    └─ onDerivCandles → syncCandlesToTab (chart OHLC)
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
  → DemoEngine.placeTrade() deducts balance, creates position
  → setTimeout fires after duration seconds → _resolvePosition()
  → 55% win rate, configurable payout (82% default)
  → TP/SL checked every 500ms tick → auto-close on cross
  → Pending orders checked every tick → auto-execute on cross
  → Saves to localStorage trade history (last 100)
```

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
