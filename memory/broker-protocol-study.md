---
name: broker-protocol-study
description: Complete synthesis of all 6 competitor broker WebSocket protocols — REFERENCE ONLY. Our own broker integrations live in the desktop bot, not this web app.
metadata:
  type: reference
---

# Broker Protocol Study — Complete Synthesis

> **IMPORTANT — 2026-06-29:** This document studies COMPETITOR broker protocols for reference. These integrations are NOT built into this web app. They live in the separate ATS-Project desktop Python bot. AutobotOptions is our OWN broker platform.
>
> **Source:** `/home/p/SpinnTask/Kosalley/git/AutoBotWeb/autobot-user/docs/brokers/` (7 files, ~30KB)
> **Python source:** `/ATS-Project/src/brokers/` (implementations for all 6 brokers)
> **Reference:** `docs/brokers-websocket-architecture.md` (detailed per-broker protocol docs)
> **Example UIs:** `example/` directory (5 saved broker platform HTML snapshots)
> **Date studied:** 2026-06-29

## The Two Protocol Families

Every binary options broker falls into one of exactly two WebSocket protocol families:

### Family A: Raw JSON (3 brokers)
Messages are plain JSON objects or arrays over a raw WebSocket. No framing, no event dispatch layer.

```
Deriv:       {"buy": "R_100", "price": 10, "parameters": {...}}
ExpertOption: ["buy", {"asset_id": 1, "amount": 100, "type": "call"}]
OlympTrade:  ["subscribe", {"assets": [1, 2, 3]}]
```

### Family B: Socket.IO Framing (3 brokers)
Messages use Socket.IO's wire protocol over a raw WebSocket. Each message has a type prefix:

```
42["eventName", {"key": "value"}]   ← Socket.IO event with JSON payload
40                                   ← connect to default namespace
41                                   ← disconnect
3                                    ← Engine.IO ping
2                                    ← Engine.IO pong
```

| Broker | Socket.IO Version | Transport | Auth Message |
|--------|------------------|-----------|-------------|
| **Pocket Option** | Real Socket.IO (python-socketio) | Engine.IO WS | `emit("auth", {session, isDemo, uid, platform})` |
| **Quotex** | Socket.IO v4 emulated | Raw WS | `42["authorization",{"session":"SSID","isDemo":true,"tournamentId":0}]` |
| **IQ Option** | Socket.IO-style | Raw WS | `42["ssid",{"ssid":"<value>"}]` |

---

## Authentication — Always Out-of-Band

No broker accepts username/password over WebSocket. All require a session token obtained externally:

| Broker | Token | Acquisition Method | Auth Payload |
|--------|-------|-------------------|-------------|
| **Deriv** | API token | Generated in account settings UI | `{"authorize": "<token>"}` |
| **Pocket Option** | SSID session | Browser cookie after login | `emit("auth", {session, isDemo, uid, platform})` |
| **Quotex** | SSID session | Selenium → localStorage extraction | `42["authorization",{"session":"SSID","isDemo":true}]` |
| **IQ Option** | SSID cookie | HTTP POST login → Set-Cookie | `42["ssid",{"ssid":"<value>"}]` |
| **ExpertOption** | Crossdomain token | Selenium → cookie + localStorage | `["session", "<token>"]` |
| **OlympTrade** | Access token + CID | Selenium + Chrome CDP → cookie + WS params | `["auth", "<token>"]` |

**Critical implication for browser-based frontend:** The Selenium/browser-automation token acquisition used by 5 of 6 brokers CANNOT run in a browser. For a React frontend, tokens must come from either:
1. A backend proxy service (autobot-api) that runs the Selenium flow server-side
2. User manually pasting tokens into the UI
3. Browser extension that extracts tokens from the broker's own web app

Deriv is the only broker with a clean API token model suitable for direct browser connection.

---

## Data Streaming — The Subscription Pattern

Every broker follows this identical pattern. You NEVER poll for prices:

```
CLIENT                              SERVER
  │                                   │
  │── subscribe(asset_id=1) ─────────▶│
  │                                   │
  │◀── tick {price:1.2345} ──────────│  ← pushed continuously
  │◀── tick {price:1.2346} ──────────│
  │◀── tick {price:1.2344} ──────────│
  │                                   │
  │── unsubscribe(asset_id=1) ───────▶│
  │                                   │
```

### Candles (OHLC) — Request + Optional Stream

```
Request (one-shot):
  42["candles", {"asset": "EURUSD", "period": 60, "count": 100}]

Response:
  42["candles", {"data": [{time, open, high, low, close}, ...]}]

Stream (if subscribed):
  42["candle", {"time": ..., "open": ..., "close": ...}]  ← pushed each new candle
```

### Ticks — Real-Time Price Stream

```json
// Deriv
{"tick": {"ask": 1.2345, "bid": 1.2340, "epoch": 1719000000, "symbol": "R_100"}}

// Pocket Option
{"asset": "EURUSD_otc", "timestamp": 1719000000, "value": 1.2345}

// Quotex
{"asset": "EURUSD", "bid": 1.2345, "ask": 1.2350, "time": 1719000000}

// IQ Option (via listInfoData)
{"active_id": 1, "ask": 1.2345, "bid": 1.2340, "time": 1719000000}
```

### Sentiment — Buy/Sell Ratio

```json
{"asset": "EURUSD", "buy": 62, "sell": 38}
```

### Balance — Pushed After Every Trade

```json
// Pocket Option: "updateBalance" event
{"isDemo": 1, "balance": 49483.43}

// Deriv: balance in authorize response + pushed after trades
{"balance": {"balance": 1000, "currency": "USD"}}
```

---

## Trade Execution — The Universal Lifecycle

Every broker follows an identical 4-step lifecycle. The field names differ but the semantics are identical:

```
STEP 1: Client sends trade request ─────────────────────────────────
  42["order", {
    "asset": "EURUSD_otc",
    "amount": 100,           // stake in account currency
    "action": "call",        // "call" or "put"
    "time": 300,             // duration in seconds
    "isDemo": true,
    "optionType": 100        // 1=real market, 100=OTC
  }]

STEP 2: Server confirms (immediately) ──────────────────────────────
  42["s_order", {
    "id": "789",
    "status": "open",
    "asset": "EURUSD_otc",
    "openPrice": 1.0850,
    "amount": 100,
    "payoutPercent": 82
  }]

STEP 3: Server streams position updates (during trade) ─────────────
  42["position", {
    "id": "789",
    "currentPrice": 1.0862,
    "pnl": 12.50,
    "timeRemaining": 180
  }]

STEP 4: Server sends final result (at expiry) ──────────────────────
  42["position", {
    "id": "789",
    "status": "win",         // "win", "loss", "draw", "expired"
    "closePrice": 1.0870,
    "profit": 182.00,        // total returned (stake + profit for wins)
    "percentProfit": 82      // payout percentage
  }]
```

### Trade Field Mapping Across Brokers

| Concept | Deriv | Pocket Option | Quotex | IQ Option | ExpertOption | OlympTrade |
|---------|-------|--------------|--------|-----------|-------------|-----------|
| Asset ID | `"buy": "R_100"` | `asset: "EURUSD_otc"` | `asset: "EURUSD"` | `active_id: 1` (int) | `asset_id: 1` (int) | `asset_id: 1` (int) |
| Direction | `contract_type: "CALL"/"PUT"` | `action: "call"/"put"` | `action: "call"/"put"` | `direction: "call"/"put"` | `type: "call"/"put"` | `type: "call"/"put"` |
| Amount | `price: 10` | `amount: 100` | `amount: 100` | `price: 100` | `amount: 100` | `amount: 100` |
| Duration | `duration: 5, duration_unit: "s"` | `expiration: timestamp` | `time: 300` (secs) | `expired: timestamp` | `time: 60` (secs) | `expiration: 60` (secs) |
| Demo flag | (auto from token) | `isDemo: 0/1` | `isDemo: boolean` | (ssid determines) | `isDemo: boolean` | (token determines) |
| OTC flag | (auto from symbol) | `optionType: 100` | `optionType: 100` | `option_type_id: 3` (turbo) | N/A | N/A |

### Key Trade Rules (consistent across all brokers)
- **Min amount:** $1
- **Max amount:** $50,000 (varies slightly)
- **Min duration:** 5 seconds
- **Max duration:** 43,200 seconds (12 hours)
- **Max concurrent positions:** 10 (varies)
- **Payout:** Typically 80-93% depending on asset
- **Early close:** Available on most, refund varies (65-80%)

---

## OTC vs Real Market — The Critical Distinction

Brokers offer two fundamentally different trading modes:

### OTC (Over-The-Counter) — 24/7 Trading
- **Identifier:** Asset name ends with `_otc` suffix, or `optionType: 100`
- **Price source:** Broker's own price engine (synthetic, not from real exchanges)
- **Availability:** 24 hours, 7 days a week — always tradable
- **Duration model:** Fixed seconds from trade open (e.g., "expires in 300 seconds")
- **Used by:** All 6 brokers for demo accounts and synthetic assets

### Real Market — Exchange Hours Only
- **Identifier:** No suffix, or `optionType: 1`
- **Price source:** Real exchange data feeds
- **Availability:** Only during market hours (e.g., Forex: Mon-Fri, Stocks: exchange hours)
- **Duration model:** Expires at a specific wall-clock timestamp (e.g., 14:30:00 UTC)
- **Used by:** All 6 brokers for live/real accounts

---

## Reconnection — Universal Pattern

Every broker implements the same reconnection strategy:
1. **Exponential backoff** with jitter (1s → 2s → 4s → 8s → max 60s)
2. **Token refresh** on 401/auth rejection errors
3. **Max retry** limit (typically 10 attempts)
4. **Connection state machine:** `disconnected → connecting → connected → reconnecting`
5. **Ping/pong keepalive** every 15-25 seconds

---

## SSL — IMPORTANT: Disabled in Python Bot Only

The Python ATS-Project bot disables SSL verification on ALL broker connections (`ssl.CERT_NONE`). This is a Python bot workaround, NOT a pattern to replicate in the browser frontend. Browsers enforce proper SSL — if a broker endpoint has invalid certs, a browser WebSocket will fail. The solution is a **backend proxy** (autobot-api) that handles SSL-offloading.

---

## Broker-Specific Quirks

### Deriv
- Only broker with a clean, documented API token model
- JSON-RPC style: every request gets an echo of the original request in the response
- Subscription IDs must be tracked for unsubscribe (`forget_all` to unsubscribe everything)
- Synthetic volatility indices are their key differentiator (R_10 through R_100, Boom/Crash)

### Pocket Option
- Uses real Socket.IO (python-socketio library in Python, socket.io-client in browser)
- Configuration injected into page as `window.AppData` JavaScript object
- `platform: 3` identifies web platform
- Currency formatting is locale-aware with per-currency symbol maps
- Server list provided in config: `[{server: "wss://demo-api-eu.po.market", name: "EU"}]`

### Quotex
- Emulates Socket.IO v4 over raw WebSocket (not using the real socket.io library)
- Uses numeric request IDs (`requestId`) for correlation
- Requires settings-apply message before placing a trade
- Aggressive token refresh: on ANY auth rejection, spawns Selenium to extract fresh SSID
- PWA with service worker for offline/mobile

### IQ Option
- Uses integer asset IDs, not string symbols — must fetch initialization data first
- Every API call wrapped in `{name, version, body}` envelope over `sendMessage` event
- Turbo mode (1-5 min) vs Binary mode (5+ min) have different `option_type_id` values
- Expiration calculation is complex: turbos round to 30s boundaries, binaries to 15-min quarters

### ExpertOption
- React Native Web app (uses `react-native-stylesheet` in browser)
- Versioned API (`/ws/v45` with app version 30.0.4)
- Requires regional proxy for some locations (`http://127.0.0.1:12334`)
- Has both Google and Facebook OAuth integration
- Custom message format: `[protocol_version, message_type, data]`

### OlympTrade
- Only broker using async `websockets` library (all others use sync `websocket-client`)
- Requires Chrome DevTools Protocol to capture CID parameters from WebSocket creation
- CID parameters go in WebSocket URL query string (not in auth payload)
- Micro Frontend architecture (module federation with `remoteEntry.js`)
- Custom CSS variables for service tier colors (starter/advanced/expert/diamond)

---

## Common Trade Error Codes

| Code | Meaning | Occurs When |
|------|---------|------------|
| `ERROR_INACTIVE_ASSET` | Asset not available | Outside trading hours for real-market assets |
| `ERROR_INSUFFICIENT_BALANCE` | Low balance | Trade amount exceeds available balance |
| `ERROR_INVALID_AMOUNT` | Invalid amount | Below minimum ($1) or above maximum ($50k) |
| `ERROR_ALREADY_OPENED` | Duplicate position | Already have an open trade on this asset |
| `ERROR_TIME_OUT` | Trade timeout | Server didn't respond in time |
| `ERROR_ASSET_CLOSED` | Market closed | Trading session ended |

## Related Memories
- [[broker-integration-architecture]] — How to build this into AutobotOptions
- [[broker-gap-audit]] — 46 features missing vs real brokers
- [[broker-guidance-protocol]] — Decision framework for implementation choices
