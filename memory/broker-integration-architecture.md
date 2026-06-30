---
name: broker-integration-architecture
description: Architecture for building AutobotOptions into its own broker platform — demo trading engine, real account support, price feeds
metadata:
  type: project
---

# AutobotOptions — Own Broker Architecture

> **Clarified 2026-06-29:** This is a standalone broker platform, NOT a multi-broker terminal. Other broker integrations (Deriv, Pocket Option, Quotex, etc.) live in the separate desktop Python bot (ATS-Project). This web app builds our own broker.
>
> **"Paper trading" = "Demo trading"** — they mean the same thing here. The simulated engine is the demo account mode. Real mode comes later with the backend engine.
>
> **References:** [[broker-protocol-study]] for competitor protocol patterns (reference only, not integration targets)

## Architecture Vision

```
AutobotOptions Web App (THIS PROJECT)
├── Demo Trading (current engine — working)
│   └── Simulated prices, instant execution, virtual balance
├── Real Trading (future — own broker engine)
│   └── Live prices, real execution, real balance
└── NOT: connecting to Deriv/PocketOption/Quotex/etc.
    └── Those are in ATS-Project desktop bot (separate codebase)


ATS-Project Desktop Bot (SEPARATE — Python)
├── Connects to: Deriv, Pocket Option, Quotex,
│               IQ Option, ExpertOption, OlympTrade
└── Runs automated strategies across multiple brokers
```

## Phase Architecture

### Phase 1: Demo Trading Terminal (CURRENT — ✅ Working)
```
┌─ App.jsx ─────────────────────────────────────┐
│  useWebSocket (simulated 500ms ticks)          │
│  DemoEngine.placeTrade()                       │
│  PriceFeedEngine (4 modes)                     │
│  localStorage trade history                    │
│  Branded as "Demo Trading" in UI               │
└────────────────────────────────────────────────┘
```

### Phase 2: Demo Engine Extraction (✅ COMPLETED June 2026)
```
src/
├── engine/
│   ├── DemoEngine.js        ✅ Extracted from App.jsx
│   │                        — Trade execution, positions, TP/SL, alerts
│   │                        — Pending orders, risk mgmt, rollover, journal
│   │                        — React hook wrapper (useDemoEngine)
│   └── PriceFeedEngine.js   ✅ 4 market modes
│                            — random, trending(up/down), volatile, sideways
├── App.jsx                  ✅ Slimmed to ~560 lines (was 900+)
│                            — Delegates all trading to DemoEngine
│                            — UI state only: tabs, sections, settings
└── components/              UI only — no business logic
```

### Phase 3: Own Broker Backend (FUTURE)
```
┌─ React Frontend (this project) ────────────────┐
│  BrokerClient                                   │
│       │ WebSocket                               │
│       ▼                                         │
│  ┌─ autobot-engine (new service) ───────────┐   │
│  │  Price Engine (synthetic or aggregated)   │   │
│  │  Order Matcher (CALL/PUT execution)       │   │
│  │  Risk Engine (SL/TP, exposure limits)     │   │
│  │  Account Manager (demo + real accounts)   │   │
│  │  WebSocket Server                         │   │
│  └───────────────────────────────────────────┘   │
│       │ HTTP                                     │
│  ┌─ autobot-api (existing) ──────────────────┐   │
│  │  User accounts, auth, persistence          │   │
│  │  Trade history, analytics, reporting       │   │
│  │  MariaDB                                   │   │
│  └────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

## Current Architecture (as of 2026-06-30)

```
autobot-options/
├── index.html                 # Inter font preload, Vite entry
├── vite.config.js             # Vite 8 + React 19 + Tailwind CSS 4
├── public/favicon.svg         # Orange zap logo
└── src/
    ├── main.jsx               # React 19 root mount
    ├── App.jsx                # Main terminal (~560 lines) — 4-panel grid, tabs, settings
    ├── index.css              # PIT-TERMINAL dark theme (~1100 lines), responsive breakpoints
    ├── engine/
    │   ├── DemoEngine.js      # Trading core (~817 lines): positions, TP/SL, alerts, martingale
    │   │                      # compounding, pending orders, risk mgmt, rollover/extend
    │   │                      # trade journal, persistence, React hook wrapper
    │   └── PriceFeedEngine.js # Market simulation (~97 lines): random, trending, volatile, sideways
    ├── data/
    │   ├── mockData.js        # 20 assets, price/candle generators, 7 indicators
    │   │                      # TF_MAP, history persistence, constants
    │   └── economicCalendar.js # 21 events, rolling dates, active event detection
    ├── hooks/
    │   ├── useWebSocket.js    # Simulated 500ms tick feed (real WS via VITE_WS_URL)
    │   ├── useSound.js        # Audio feedback for trade events
    │   └── useKeyboardShortcuts.js # Hotkeys (Space=Call, Enter=Put, numbers=presets)
    └── components/
        ├── Sidebar.jsx        # Left nav: Trade, Positions, History, Analytics, Calendar, Journal
        ├── AssetPanel.jsx     # Search, category filter, sentiment bars, win rates, quick stats
        ├── ChartArea.jsx      # Toolbar, settings modal, multi-chart grid, indicators, drawing tools
        ├── CanvasChart.jsx    # Physics-grade canvas: candles, 5 indicators, trendlines, fib
        │                      # zoom/pan, sub-panels, crosshair, PIT-TERMINAL colors
        ├── TradePanel.jsx     # CALL/PUT (~1203 lines), TP/SL, martingale, compounding
        │                      # entry orders, risk mgmt, position cards, extend, journal notes
        ├── HistoryView.jsx    # Trade history + CSV export, notes, journal link
        ├── AnalyticsView.jsx  # P&L analytics, win rate
        ├── JournalView.jsx    # Dedicated journal — all annotated positions, searchable
        ├── EconomicCalendar.jsx # Upcoming events, impact filters, live countdowns
        ├── ConfirmModal.jsx   # Styled confirmation dialog
        └── ToastContainer.jsx # Toast notifications
```

## Demo Engine Interface

```js
class DemoEngine {
  startingBalance = 10000
  balance = 10000
  positions = []
  baseAmount = 100
  lastTradeResult = null  // 'win' | 'loss' | null
  lastTradeProfit = 0     // dollar profit/loss from last resolved trade
  pendingOrders = []      // entry orders awaiting price trigger

  // Risk management
  dailyLossLimit = 0       // 0 = disabled
  maxPositionPct = 0       // 0 = disabled
  maxDailyTrades = 0       // 0 = disabled
  minPayoutPct = 0         // 0 = disabled
  newsBlockEnabled = false // block during active economic events
  newsBlockLevels = { high: true, medium: true, low: false }
  dailyTradeCount = 0

  // Core trading
  placeTrade({ asset, direction, amount, duration, tp, sl, payoutPercent, entryPrice }) → boolean
  closePosition(posId, currentPrice) → boolean  // early close (65% refund)
  doubleUp(pos, currentPrice) → boolean         // duplicate position
  extendPosition(posId, extraSeconds, currentPrice) → boolean  // 10% fee

  // Pending orders
  placePendingOrder({ asset, direction, amount, duration, entryPrice, tp, sl, payoutPercent }) → boolean
  cancelPendingOrder(orderId) → boolean
  checkPendingOrders(assetPrices) → string[]  // returns triggered order IDs

  // TP/SL & alerts
  checkTP_SL(assetPrices) → boolean    // called on every tick
  checkAlerts(alerts, assetPrices) → number[]  // returns triggered alert IDs

  // Trade journal
  setPositionNote(posId, note) → boolean

  // Account management
  resetAccount(startingBalance = 10000)
  getSummary() → { balance, openCount, dailyPnl, totalTrades, winRate }
  destroy()  // cleanup timers
}
```

## Key Design Decisions

### DECIDED ✅
1. **Platform identity:** This is our own broker. Other brokers are in the desktop bot.
2. **Token Storage:** localStorage encrypted (for future real accounts)
3. **Demo = Paper:** Same thing. UI says "Demo Trading."
4. **Architecture scope:** Standalone broker platform. No multi-broker terminal features.
5. **Demo account model:** Unlimited free demo — one-click reset to $10k, no login required. Multiple named profiles later if needed.
6. **Price feed for real mode:** Demo-only for now. Real prices not needed until backend engine exists.
7. **Real account activation:** Demo-only for now. Entire platform runs in demo mode. No real money features.
8. **Order execution:** Instant fill at shown price — market maker model. User always gets the displayed price.
9. **Chart data source:** Demo engine always drives charts. No external data sources needed.
10. **Regulatory scope:** Undecided. Build features first, compliance later when real mode is closer.

### All decisions resolved (2026-06-29)
No PENDING items remain. The platform is focused entirely on demo trading with instant execution and a single price source. Real mode, external data, and regulatory compliance are deferred until the backend engine exists.

## Implementation Status

### Completed ✅ (June 2026)

| Feature | Files |
|---------|-------|
| DemoEngine extraction | engine/DemoEngine.js |
| Price feed modes (4 modes) | engine/PriceFeedEngine.js, ChartArea.jsx |
| TP/SL with auto-close | TradePanel.jsx, DemoEngine.js |
| Martingale + Compounding (dual, auto/manual) | TradePanel.jsx |
| Pending entry orders | DemoEngine.js, TradePanel.jsx |
| Rollover / Extend position | DemoEngine.js, TradePanel.jsx |
| Risk Management (loss limit, position %, trade cap, min payout, news blocker) | DemoEngine.js, TradePanel.jsx |
| Trade journal (notes + Journal page) | DemoEngine.js, TradePanel.jsx, JournalView.jsx |
| Drawing tools (trendlines, fib, horizontal) | CanvasChart.jsx, ChartArea.jsx |
| 5 chart indicators (EMA, BB, SMA, RSI, MACD) | CanvasChart.jsx, ChartArea.jsx, mockData.js |
| Multi-chart layouts (2-up, 4-up) | ChartArea.jsx |
| Economic Calendar (21 events) | EconomicCalendar.jsx, economicCalendar.js |
| Market sentiment bars | AssetPanel.jsx |
| Mobile responsive (3 breakpoints) | index.css, App.jsx |
| Account reset button | TradePanel.jsx, DemoEngine.js |
| OTC vs Real badge | ChartArea.jsx |
| Toast duration control | ChartArea.jsx, App.jsx |
| Candle rolling fix | App.jsx, mockData.js |
| Emoji-free icon UI | All components |

### Remaining

| Tier | Items |
|------|-------|
| Deferred (final stage) | Account types (#25), Deposit/Withdrawal (#26) — require real account backend |
| Complex | Real WebSocket (#29), Order book (#32), Volume profile (#33), Market replay (#35), Backtester (#36), Correlation matrix (#39), and 11 others |

**Note:** Real account features (#25, #26) are explicitly deferred to the final development stage. The backend engine (autobot-engine) must exist before real account management makes sense. Current focus is demo-only trading terminal completeness.

**Progress:** 27 of 46 gap audit items (59%). See [[broker-gap-audit]] for full status.

## Related Memories
- [[broker-protocol-study]] — Competitor protocol patterns (reference only)
- [[broker-gap-audit]] — 46 features to implement, prioritized
- [[broker-guidance-protocol]] — Updated decision framework
