# AutobotOptions — Project Memory Bank

## Project Overview

**AutobotOptions** is a standalone demo binary options trading terminal built with Vite 8 + React 19 + Tailwind CSS 4. It provides a professional trading experience with live Deriv price feeds, multi-asset charting, position management, and trade history — designed as the foundation for a full broker platform.

## Architecture (2026-06-30 — session complete, all 4 bugs fixed, trading-charts patterns integrated)

```
autobot-options/
├── index.html                 # Plus Jakarta Sans, plain_logo.png favicon
├── vite.config.js             # Vite 8 + React 19 + Tailwind CSS 4
├── public/
│   ├── logo.png               # AutobotSignal wordmark (165×80)
│   └── plain_logo.png         # AutobotSignal icon (36×36)
└── src/
    ├── main.jsx               # React 19 root mount
    ├── App.jsx                # Main terminal — 4-panel grid, tabs, settings, replay
    │                          # Clean slate on refresh (no persisted tabs)
    │                          # historyReadyRef gates chart rendering until fetchCandles returns
    │                          # rAF-batched tick syncs (flushTickSyncs)
    ├── index.css              # PIT-TERMINAL design system per rules/design-system.md §14
    │                          # --pit-* tokens with legacy aliases
    │                          # Glass morphism, grid bg, reduced-motion, @keyframes spin
    ├── engine/
    │   ├── DemoEngine.js      # Trading core: positions, TP/SL, alerts, martingale
    │   │                      # compounding, pending orders, risk mgmt, rollover/extend
    │   │                      # trade journal, persistence, React hook wrapper
    │   │                      # ★ big.js precise arithmetic for all money math
    │   │                      # ★ price-driven trade resolution (CALL wins when exitPrice > entryPrice)
    │   ├── PriceFeedEngine.js # 4 market modes: random, trending, volatile, sideways
    │   └── BacktestEngine.js  # Strategy backtester: RSI, SMA cross, MACD cross
    ├── data/
    │   ├── mockData.js        # 20 assets, generators, 7 indicators, VWAP, Volume Profile
    │   │                      # Order Book, TF_MAP, history persistence, constants
    │   ├── economicCalendar.js # 21 events, rolling dates, active event detection
    │   └── derivMapping.js    # Deriv symbol normalization + forex flag emojis
    ├── hooks/
    │   ├── useMarketData.js   # Deriv feed orchestrator (fetchCandles reuses shared WS)
    │   ├── useWebSocket.js    # Simulated 500ms tick feed (real WS via VITE_WS_URL)
    │   ├── useSound.js        # Audio feedback for trade events
    │   ├── useKeyboardShortcuts.js # Hotkeys: Space=Call, Enter=Put, numbers=presets
    │   ├── usePushNotifications.js # Browser Notification API wrapper
    │   └── feeds/
    │       └── DerivFeed.js   # WebSocket adapter for deriv-proxy (:8091)
    │                          # fetchCandles() reuses shared WS via _send()
    └── components/
        ├── Sidebar.jsx        # Left nav: plain_logo.png + 9 section icons
        ├── AssetPanel.jsx     # Search, category filter, forex flag emojis, win rates
        ├── ChartArea.jsx      # Toolbar, settings, multi-chart, indicators, drawing, replay
        │                      # UTC clock, loading placeholder (CanvasChart unmounted during load)
        │                      # 4 chart types: Area, Area Split, Candles, Bar
        ├── CanvasChart.jsx    # Physics canvas: candles, 5 indicators, VWAP, MTF, VP, DOM
        │                      # ★ detectDataChanges in rAF loop (independent of React ticks)
        │                      # ★ skipAnimRef: instant first 2 frames, then 300ms interpolation
        │                      # ★ page visibility gate (skips drawFrame when tab hidden)
        │                      # ★ zoomTarget initialized at mount (no useEffect delay)
        │                      # ★ area-split chart type (trading-charts style green/red gradient)
        │                      # Smooth 300ms tick interp, 450ms slide, smoothed price scale
        ├── TradePanel.jsx     # CALL/PUT, TP/SL, martingale, compounding, entry orders
        │                      # Risk mgmt, position cards, extend, journal notes
        │                      # Math.abs() on P&L display (fixed double negative)
        ├── SettingsModal.jsx   # Tabbed settings: Chart / Overlays / Alerts
        │                      # 4 chart types: Area, Area Split, Candles, Bar
        ├── HistoryView.jsx    # Trade history + CSV export, notes
        ├── AnalyticsView.jsx  # P&L analytics, win rate, pie chart
        ├── JournalView.jsx    # Annotated positions, searchable
        ├── EconomicCalendar.jsx # Upcoming events, impact filters, live countdowns
        ├── HeatmapView.jsx    # Color-coded asset performance grid
        ├── CorrelationMatrix.jsx # Forex pair Pearson correlation table
        ├── BacktesterView.jsx # Strategy config + results + equity curve
        ├── ConfirmModal.jsx   # Styled confirmation dialog
        └── ToastContainer.jsx # Toast notifications
```

## Design System — PIT-TERMINAL (governed by rules/design-system.md §14)

| Token | Value | Usage |
|-------|-------|-------|
| `--pit-accent` | `#f57b00` | Active states, borders, chart line, accent — THE ONLY ACCENT |
| `--pit-accent-light` | `#ff9f3d` | Gradients, hover |
| `--pit-accent-dark` | `#e06c00` | Pressed |
| `--pit-bg` | `#0a0c12` | Page background |
| `--pit-surface` | `rgba(18,22,30,0.85)` | Glass panels |
| `--pit-surface-solid` | `#0f1118` | Sidebar (solid, never glass per §13.1) |
| `--pit-surface-elevated` | `rgba(22,28,38,0.95)` | Cards |
| `--pit-text-primary` | `#f2f6ff` | Headings, main text |
| `--pit-text-secondary` | `#c8d0e0` | Body text |
| `--pit-text-muted` | `#8a94b0` | Captions, labels |
| `--pit-green` | `#10b981` | CALL, wins, profit, bull candles |
| `--pit-red` | `#ef4444` | PUT, losses, bear candles |
| `--pit-chart-bg` | `#080c14` | Chart background |

**Icons:** lucide-react only. No emojis — exception: country flags in forex pairs + economic calendar.

**Font:** Plus Jakarta Sans (400–800) from Google Fonts · 2-space indent · single quotes · trailing commas

**Minimum font size:** 11px (NO 9px/10px per June 2026 update)

**Animation:** `prefers-reduced-motion` mandatory · max 300ms · only opacity/transform

## State Architecture

| Owner | State | Persistence |
|-------|-------|-------------|
| **DemoEngine** | balance, positions, pending orders, daily counts, risk limits | localStorage (history), in-memory (session) |
| **App.jsx** | tabs, activeSection, assets, settings, chart layout | localStorage (settings, NOT tabs) |
| **ChartArea** | chartType, indicators, volumes, MTF, drawings | localStorage (`autobot_chart_prefs`) |
| **TradePanel** | amount, duration, TP/SL, martingale, compounding | localStorage (per-key) |
| **CanvasChart** | zoom per symbol+timeframe, drawing lines | localStorage (`pit_zoom_v2`, `blg_drawing_lines`) |

## Responsive Layout

| Breakpoint | Layout |
|------------|--------|
| Desktop (≥1024px) | 4-column: sidebar 56px · asset 300px · chart 1fr · trade 300px |
| Tablet (768–1024px) | 3-column: narrow sidebar · chart · trade. Asset overlay |
| Mobile (≤767px) | Single column, 6-tab bottom bar, panels as full-width overlays |

## Trade Execution Flow

```
User clicks CALL/PUT → TradePanel.handleTrade()
  → Validates: amount > 0, amount ≤ balance, openCount < MAX_OPEN(5)
  → Risk checks: daily loss limit, max position %, max daily trades,
                 min payout %, news event blocker
  → TP/SL direction validation
  → DemoEngine.placeTrade() deducts balance, creates position
      with expiresAt = openTime + duration * 1000
  → Every tick (real-time, no polling):
      1. checkTP_SL(assetPrices)   — TP/SL takes priority
      2. checkExpiry(assetPrices)  — tick-driven, uses real market price
      3. checkPendingOrders(assetPrices)
  → Expired positions: _resolvePosition() uses current market price as exitPrice
  → 55% win rate, configurable payout (82% default)
  → All positions record: closeReason ('expired'|'tp'|'sl'|'early_close')
  → Persisted to localStorage (14 fields)
```

## Chart Data Flow (Tick-Driven)

```
Deriv WS → deriv-proxy.js (:8091) → DerivFeed → useMarketData
  → onDerivAssetTick → candleStoreRef (mutates) → syncCandlesToTab ([...candles])
  → React re-render → ChartArea useMemo → CanvasChart useEffect → needsRedraw
  → next rAF frame → drawFrame()
```

No polling. Each tick triggers redraw on next animation frame (~16ms).

## Completed Features (June 30 session)

| Feature | Files |
|---------|-------|
| Chart live-update fix | `App.jsx` — [...candles] spread in syncCandlesToTab |
| Forex flag emojis | `derivMapping.js` — 24 currency → flag map |
| All settings persisted | `ChartArea.jsx`, `TradePanel.jsx`, `App.jsx` — 11 localStorage keys |
| Chart smoothness | `CanvasChart.jsx` — 300ms tick interp, 450ms slide, price scale smoothing |
| Tab open/close resets zoom | `App.jsx` chartResetKey → `CanvasChart.jsx` resetKey effect |
| No noisy seed data | `App.jsx` — flat baseline instead of random candles |
| Clean slate on refresh | `App.jsx` — no tab persistence, no default tab, first Deriv asset auto-opens |
| Design system alignment | `index.css` — pit-* tokens, glass morphism 16px, reduced-motion, grid bg |
| Logo + branding | `Sidebar.jsx` — plain_logo.png, `index.html` — Plus Jakarta Sans |
| Font size compliance | All components — min 11px (no 9px/10px) |
| Trade panel sub-containers | `TradePanel.jsx` + `index.css` — unified .tp-sub pattern |
| UTC clock | `ChartArea.jsx` — right-aligned amber pill badge |
| Console log cleanup | `useMarketData.js` — removed tick stream debug logs |

### Bug Fixes (June 30 session)

| Bug | Fix |
|-----|-----|
| Double negative currency display | `TradePanel.jsx` — `Math.abs(pos.pnl)` |
| Timeframe change blanks chart | `App.jsx` — check candleStoreRef cache before clearing |
| Win/Loss is pure RNG | `DemoEngine.js` — price-driven: CALL wins when exitPrice > entryPrice |
| Chart laggy on first load | Removed seedDayHistory, chart starts with 1 real candle from tick |
| fetchCandles separate WebSocket | `DerivFeed.js` — reuse shared WS via `_send()` |
| Per-tick state updates flood React | `App.jsx` — rAF-batched `flushTickSyncs` |
| Chart transitions on first load | `CanvasChart.jsx` — skipAnimRef (2→1→0), zoom at mount, unmounted during load |
| Stale setInitialZoomDone refs | `CanvasChart.jsx` — removed orphaned calls |
| area-split gradient IndexSizeError | `CanvasChart.jsx` — clamped baselineRatio to [0,1] |

### Borrowed from trading-charts (adrianmanchev/trading-charts)

| Pattern | Source | Our Implementation |
|---------|--------|-------------------|
| Area split-color chart | `chart.js` d3 area + gradient | CanvasChart `area-split` type |
| Chart unmounted during load | `Chart.vue` `v-if="!loading"` | ChartArea `mappedCandles.length > 0` placeholder |
| Instant first render | d3 `.join(enter)` no transition | `skipAnimRef` countdown 2→1→0 |
| Zoom at mount | d3 no lifecycle delay | `zoomTarget` IIFE in useRef, removed useEffect |
| Page visibility gate | `visibility.js` | `document.hidden` skip in rAF stepFn |
| Precise decimal math | `arithmetic.js` / `big.js` | `mul/add/sub/div/round2` helpers in DemoEngine |
| rAF-driven change detection | `chart.js` update() | `detectDataChanges()` at 60fps in rAF loop |
| History-before-render | `Chart.vue` klines → chart() | `historyReadyRef` gate, fetchCandles before render |

### Binance Integration (2026-06-30)

| Feature | File | Description |
|---------|------|-------------|
| binance-proxy | `server/binance-proxy.js` | WS proxy to Binance stream (:8092), dynamic exchangeInfo |
| BinanceFeed | `src/hooks/feeds/BinanceFeed.js` | Browser WS adapter, same interface as DerivFeed |
| binanceMapping | `src/data/binanceMapping.js` | Dynamic symbol normalization, CDN SVG icons, SVG circle fallback |
| useBinanceData | `src/hooks/useBinanceData.js` | React hook wrapping BinanceFeed, 250ms batched price updates |
| Dual-source App.jsx | `src/App.jsx` | Generic handleAssetTick/handleCandles, source-aware merge, BIN badges |
| Zoom icons | `src/components/CanvasChart.jsx` | ZoomIn/ZoomOut lucide icons replacing +/− text |
| D'Alembert | `src/components/TradePanel.jsx` | Unit-based step strategy matching Deriv auto_list_strategies |
| Price throttling | `useMarketData.js`, `useBinanceData.js` | 250ms batched price updates, same-price skip guard |

**Data flow (dual-source):**
```
Deriv WS → deriv-proxy (:8091) → DerivFeed → useMarketData ─┐
Binance WS → binance-proxy (:8092) → BinanceFeed → useBinanceData ─┤
                                                                   ├→ App.jsx → AssetPanel + ChartArea
DemoEngine (simulated) ───────────────────────────────────────────┘
```

**Asset identity:** Composite key `${name}::${source}` — same display name from different sources is treated as separate assets with source badges.

**Deriv strategies covered:**
- ✅ Martingale (existing)
- ✅ D'Alembert (new — unit, initial_stake, take_profit, stop_loss, max_stake, max_contracts)
- ✅ Compounding (our own addition)

## Production Deployment (2026-06-30)

| Component | Location | Port |
|-----------|----------|------|
| SPA (nginx alpine) | Docker: autobot-options | 8095→80 |
| deriv-proxy (node:22) | Docker: deriv-proxy | 8096→8091 |
| binance-proxy (node:22) | Docker: binance-proxy | 8097→8092 |
| nginx (host) | GCP VM 34.81.61.52 | :80/:443 |
| SSL | Let's Encrypt / certbot | auto-renew |

**Domain:** https://options.autobotsignal.io
**Repo:** github.com/SpinnCompany/autobot-options
**Build args:** `VITE_WS_URL=wss://options.autobotsignal.io/ws/deriv` `VITE_BINANCE_WS_URL=wss://options.autobotsignal.io/ws/binance`

### Critical Rules
- **NEVER add simulation fallbacks** — all data is real Deriv data via deriv-proxy
- **Port 8091 is phpMyAdmin** — deriv-proxy mapped to host 8096
- **Docker --no-cache required** when changing VITE_WS_URL build arg
- **VITE_WS_URL** env var controls WS endpoint (dev: ws://localhost:8091)

- [Session June 30 Bugs](memory/session-2026-06-30-bugs.md) — ALL 7 BUGS FIXED
- [trading-charts Study](memory/trading-charts-study.md) — Complete analysis of adrianmanchev/trading-charts patterns borrowed

## Remaining (9 items — all need backend infrastructure)

| # | Feature | Blocker |
|---|---------|---------|
| 25-26 | Account Types, Deposit/Withdrawal | Real account backend |
| 29 | Real WebSocket | Backend engine |
| 30-31 | Social Trading, Tournaments | Multi-user backend |
| 43 | Multi-Language | i18n infrastructure |
| 44-46 | Auth, Security, Real Execution | Production backend |
