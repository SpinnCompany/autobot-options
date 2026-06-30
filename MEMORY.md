# AutobotOptions — Project Memory Bank

**Session:** June 30, 2026 — 39/46 gap audit (85%). All 15 bugs fixed. Per-client tick filtering on both proxies. i18n live. Code-split.

## Architecture (current)

```
autobot-options/
├── server/
│   ├── binance-proxy.js       # WS proxy → Binance (441 USDT pairs)
│   │                          # ★ per-client tick filtering (clientSubs Map)
│   │                          # ★ always subbed to all 441 from Binance
│   │                          # ★ sendTick() only forwards to subscribed clients
│   ├── deriv-proxy.js         # WS proxy → Deriv API
│   │                          # ★ per-client tick filtering (clientSubs Map)
│   │                          # ★ sendTick() — same architecture as binance
│   ├── Dockerfile             # deriv-proxy image
│   └── Dockerfile.binance     # binance-proxy image
└── src/
    ├── main.jsx               # React 19 root + i18n init
    ├── App.jsx                # Main terminal — dual-source tick routing
    │                          # ★ source-aware candle building (name+source guard)
    │                          # ★ rAF-batched flushTickSyncs
    │                          # ★ tab subscription restoration on refresh
    │                          # ★ stripped tab persistence (no candle data)
    ├── index.css              # PIT-TERMINAL design system
    ├── engine/
    │   ├── DemoEngine.js      # Trading core: TP/SL, expiry, martingale, etc.
    │   │                      # ★ fixed: slice(0,100), TP/SL lastTradeResult
    │   │                      # ★ price-driven trade resolution
    │   ├── PriceFeedEngine.js # 4 market modes (for backtesting only)
    │   └── BacktestEngine.js  # Strategy backtester
    ├── data/
    │   ├── mockData.js        # 20 assets, generators, indicators, constants
    │   ├── binanceMapping.js  # Binance symbol → asset format, CDN coin icons
    │   ├── derivMapping.js    # Deriv symbol normalization
    │   └── economicCalendar.js # 21 events, rolling dates
    ├── i18n/
    │   ├── index.js           # i18next config, 3 languages, localStorage persistence
    │   ├── en.json            # English (source of truth, ~300 keys)
    │   ├── es.json            # Spanish
    │   └── ar.json            # Arabic
    ├── hooks/
    │   ├── useBinanceData.js  # Binance feed hook
    │   │                      # ★ no mass subscription (only on tab open)
    │   │                      # ★ settled reset on disconnect
    │   │                      # ★ 250ms batched price updates
    │   ├── useMarketData.js   # Deriv feed hook (same architecture)
    │   │                      # ★ no mass subscription
    │   │                      # ★ settled reset on disconnect
    │   ├── useWebSocket.js    # Pure WebSocket-only hook (NO simulation)
    │   ├── useSound.js, useKeyboardShortcuts.js, usePushNotifications.js
    │   └── feeds/
    │       ├── BinanceFeed.js # Binance WS adapter (HTTPS guard)
    │       └── DerivFeed.js   # Deriv WS adapter (HTTPS guard)
    └── components/            # 17 components (7 lazy-loaded)
```

## Data Flow — Tick Pipeline (Push-Only, Zero Polling)

```
Binance WS (441 streams, 1 tick/sec each)
  → binance-proxy (ALWAYS receives all 441 ticks)
    → sendTick(symbol, price, epoch)
      → clientSubs[client].has(symbol)? YES → send / NO → skip
  → BinanceFeed._handle() → onTick()
  → useBinanceData.onAssetTickRef() → handleAssetTick('binance')
    → source-aware asset lookup (a.brokerSymbol === symbol)
    → source-aware tab matching (tab.source === source)
    → candleStoreRef OHLC build → rAF flushTickSyncs
    → setTabs() → ChartArea → CanvasChart (rAF render loop)

Deriv WS
  → deriv-proxy (per-client filtering, same architecture)
  → DerivFeed → useMarketData → handleAssetTick('deriv')
    → same candle pipeline

NO setInterval for prices. NO REST polling. NO simulation fallback.
All data arrives via WebSocket push.
```

## Production Architecture

```
GCP Server (34.81.61.52)
  nginx (host, :80/:443, TLS)
    /           → autobot-options :8095 (SPA, nginx:alpine)
    /ws/binance → binance-proxy :8097 (node:22, per-client filter)
    /ws/deriv   → deriv-proxy :8096 (node:22, per-client filter)
```

## Gap Audit — 39/46 (85%)

| Tier | Done | Pending |
|------|------|---------|
| Quick Wins | 10 | 0 |
| Medium | 16 | 2 (deferred — Account Types, Deposit) |
| Complex | 13 | 5 (all backend-dependent) |

**Remaining (7):** #25-26 Account/Deposit, #30-31 Social/Tournaments, #44-46 Auth/Security/Execution

## Bug Status — 0 Open

All 15 known bugs from CLAUDE.md resolved. See [[session-2026-06-30-bugs]] for full list.

## localStorage Key Reference

| Key | Source | Content |
|-----|--------|---------|
| `autobot_engine_state` | DemoEngine | balance, positions, pending orders, risk settings |
| `autobot_options_history` | DemoEngine | Closed trades (max 100) |
| `autobot_tabs` | App.jsx | Tab config (asset, timeframe, source) — NO candle data |
| `autobot_active_tab` | App.jsx | Active tab ID |
| `autobot_lang` | i18n | Language code (en/es/ar) |
| `autobot_chart_prefs` | ChartArea | chartType, indicators, overlays |
| `autobot_alerts` | App.jsx | Price alerts |
| `autobot_trade_*` | TradePanel | amount, duration, tp, sl |
| `autobot_mg_*` | TradePanel | Martingale settings |
| `autobot_cp_*` | TradePanel | Compounding settings |
| `autobot_sound_muted` | App.jsx | Boolean |
| `pit_zoom_v2` | CanvasChart | Per-chart zoom level |
| `blg_drawing_lines` | CanvasChart | Drawing lines |

## Tick Stability — Key Design Decisions

1. **Proxy always subscribes to ALL symbols from upstream** (Binance 441, Deriv active). Per-client filtering is at the FORWARDING layer only — it never affects upstream subscriptions.

2. **Client receives ZERO ticks until explicit subscribe** — new connections get empty `clientSubs` Set. No tick leak during the connect→subscribe window.

3. **Frontend only subscribes when tabs open** — no mass subscription from `onSymbols`. `handleAssetSelect` + auto-open + restored-tabs effect manage subscriptions.

4. **Subscription restoration on refresh** — `restoredSubsDone` effect re-subscribes all tabs loaded from localStorage once assets are available.

5. **Zero polling** — no `setInterval` for price data. All `setInterval` sites are UI clocks (countdown timers, position card timers) or the market replay feature (historical data playback). WebSocket feeds use `setTimeout` for reconnection only (one-shot, not interval).

- [Session June 30 Bugs](memory/session-2026-06-30-bugs.md)
- [Broker Gap Audit](memory/broker-gap-audit.md)
- [Broker Protocol Study](memory/broker-protocol-study.md)
- [Broker Integration Architecture](memory/broker-integration-architecture.md)
- [Broker Guidance Protocol](memory/broker-guidance-protocol.md)
- [Production Deployment Setup](memory/production-deployment-setup.md)
- [trading-charts Study](memory/trading-charts-study.md)
