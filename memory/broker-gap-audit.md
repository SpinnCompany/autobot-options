---
name: broker-gap-audit
description: 46 missing features vs real broker platforms (Pocket Option, Quotex, Olymp Trade, Deriv, IQ Option, ExpertOption) — prioritized by implementation effort
metadata:
  type: project
  updated: 2026-07-01
---

# Broker Gap Audit — 46 Missing Features

Real binary options broker platforms have sophisticated trading environments. This audit lists what AutobotOptions is missing, organized by implementation priority.

**Status as of July 1, 2026: 37/46 complete (80%). Recent additions: live Binance data (441 pairs), full localStorage persistence (engine state, tabs, UI), absolute position expiry, Chrome PNA fix, secret cleanup.**

Last verified: 2026-06-30 — complete codebase review.

## Quick Wins (10 items — ALL DONE ✅)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Keyboard Shortcuts | ✅ done | Space/Enter for CALL, Esc for PUT, number keys for amounts. useKeyboardShortcuts hook. |
| 2 | Daily/Session P&L Tracking | ✅ done | DemoEngine.dailyPnl. Shown in TradePanel account bar ("Today" column). |
| 3 | Trade Confirmation Toggle | ✅ done | App.jsx confirmTrades state. TradePanel shows "Confirm"/click-again flow with pulse animation. |
| 4 | Amount Quick Multipliers | ✅ done | ×2 and ÷2 buttons in TradePanel next to stepper. |
| 5 | Win Rate Per Asset | ✅ done | AssetPanel computes per-asset win rate from trade history. Shown next to each asset. |
| 6 | Trade History CSV Export | ✅ done | HistoryView has CSV export button with Download icon. |
| 7 | Sound Toggle | ✅ done | Volume2/VolumeX button in TradePanel header. Persisted to localStorage. |
| 8 | Position Timer Ring | ✅ done | SVG circular countdown ring in PositionCard with smooth transition. |
| 9 | Asset Panel Quick Stats | ✅ done | Spread, payout %, daily high/low range shown per asset. |
| 10 | Toast Duration Control | ✅ done | ChartArea settings: 3s/5s/10s/Stay. Persisted. |

## Medium Effort (18 items — 16 DONE, 2 PENDING)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 11 | Drawing Tools | ✅ done | Horizontal lines (H), trendlines (T), fibonacci (F). Keyboard shortcuts. Clear button on canvas. |
| 12 | Chart Indicator Overlay | ✅ done | All 5 indicators: EMA(9)+BB(20,2) bundled, SMA(configurable period), RSI(configurable period), MACD(configurable fast/slow/signal). Toggled in Settings modal. |
| 13 | Multiple Chart Layouts | ✅ done | Single, 2-up, 4-up grid. Toggle buttons in toolbar. Mini headers per chart. |
| 14 | Take Profit / Stop Loss | ✅ done | TP/SL inputs in Advanced section. % quick-sets (+1/2/5%, -1/2/5%). Auto-close on price cross in DemoEngine.checkTP_SL(). Trade markers on chart. |
| 15 | Martingale + Compounding | ✅ done | Dual independent strategies. Auto (multiplier) and Manual (fixed steps). Per-step enable/disable. Persisted to localStorage. |
| 16 | Double Up Button | ✅ done | Button on open position cards. Opens duplicate position at current price. |
| 17 | Rollover / Extend | ✅ done | +60s button on position cards. Charges 10% fee. Resets timer. DemoEngine.extendPosition(). |
| 18 | Pending / Scheduled Orders | ✅ done | Full entry order form (direction, price, amount, duration, TP/SL). Order list with cancel. Auto-executes on price cross via DemoEngine.checkPendingOrders(). |
| 19 | Price Alerts | ✅ done | Add above/below current price from ChartArea settings. Checked every tick. Toast + sound on trigger. |
| 20 | Economic Calendar | ✅ done | EconomicCalendar.jsx — 21 events across USD/EUR/GBP/JPY/AUD/CHF. Impact filter (high/med/low). Live countdowns. Active event detection for news blocker. |
| 21 | Market Sentiment Indicator | ✅ done | CALL/PUT % bar in AssetPanel rows computed from trade history. |
| 22 | OTC vs Real Market Indicator | ✅ done | LIVE/OTC badge in ChartArea toolbar, connected to VITE_WS_URL env var. |
| 23 | Countdown To Next Candle | ✅ done | Shows seconds remaining in ChartArea toolbar, updates every second. |
| 24 | Spread Display | ✅ done | Spread + daily high/low range in asset panel rows. |
| 25 | Multiple Account Types | 🔒 deferred | Demo/Real account toggle. Deferred to final stage — real account engine must exist first. |
| 26 | Deposit/Withdrawal Simulation | 🔒 deferred | Simulated deposit/withdrawal UI. Deferred to final stage alongside real accounts. |
| 27 | Risk Management Tools | ✅ done | Daily loss limit, max position % of balance, max daily trades, min payout %, news event blocker (configurable impact levels). All in TradePanel Risk section + DemoEngine. |
| 28 | Trade Journal / Notes | ✅ done | Notes on positions (inline input on cards). Dedicated JournalView page. HistoryView note editing. Search across journal entries. |

## Complex (18 items — 1 DONE, 17 PENDING)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 29 | Real WebSocket Price Feed | ⬜ pending | Architecture exists in useWebSocket hook. Requires backend. |
| 30 | Social / Copy Trading | ⬜ pending | Major feature — requires multi-user backend. |
| 31 | Tournament Mode | ⬜ pending | Requires social features + backend. |
| 32 | Full Order Book | ✅ done | Synthetic L2 depth bars on chart (green bids / red asks). Toggle in Chart Settings. |
| 33 | Volume Profile | ✅ done | Volume-at-price histogram anchored to right side. Configurable bins. |
| 34 | VWAP Indicator | ✅ done | Yellow VWAP line overlay on main chart. Toggle in Chart Settings. |
| 35 | Market Replay | ✅ done | Replay toolbar with Play/Pause/Stop, speed selector (2x/5x/10x), progress bar. |
| 36 | Strategy Backtester | ✅ done | BacktestEngine + BacktesterView. 3 strategies (RSI, SMA cross, MACD cross). Stats + equity curve. |
| 37 | Multi-Timeframe Analysis | ✅ done | MTF Overlay toggle — higher TF candles as semi-transparent backdrop. |
| 38 | Correlation Matrix | ✅ done | Pearson correlation grid for forex pairs. Color-coded cells. |
| 39 | Heatmap | ✅ done | Color-coded asset performance grid. P&L bars, win rates, trend arrows. |
| 40 | Custom Indicators | ✅ done | Add SMA/EMA/RSI overlays from Chart Settings. Configurable source/period/color. Persisted. |
| 41 | Mobile Responsive Layout | ✅ done | 3 breakpoints: desktop (1024+), tablet (768-1024), mobile (≤767). Bottom bar. Overlay panels. |
| 42 | Push Notifications | ✅ done | Browser Notification API. Trade result alerts. Toggle in Chart Settings. |
| 43 | Multi-Language Support | ⬜ pending | i18n infrastructure needed. |
| 44 | Authentication & User Accounts | ⬜ pending | Requires backend + database. |
| 45 | API Rate Limiting & Security | ⬜ pending | Production deployment concern. |
| 46 | Real Broker Order Execution | ⬜ pending | Requires real WebSocket + backend engine. |

## Summary (2026-06-30 — final)

| Tier | Done | Pending | Total |
|------|------|---------|-------|
| Quick Wins | 10 | 0 | 10 |
| Medium | 16 | 2 (deferred) | 18 |
| Complex | 11 | 7 | 18 |
| **Total** | **37** | **9** | **46** |

**Progress:** 37 of 46 complete (80%). 2 deferred (#25-26), 7 pending (all require backend infrastructure).

**Next priorities:** Account Types (#25), Deposit/Withdrawal (#26) — the only remaining medium items. Then tackle complex items starting with Real WebSocket (#29), Volume Profile (#33), Market Replay (#35).

**How to apply:** Each feature should be verified via the `trade-test` skill after implementation. See [[broker-integration-architecture]] for architecture context, [[broker-guidance-protocol]] for decision framework.
