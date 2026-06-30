# Brokers WebSocket Communication Architecture

> Documented from the ATS-Project source code at `/home/p/SpinnTask/Kosalley/git/ATS-Project/src/brokers/`

---

## Overview

The ATS-Project supports **6 broker platforms**, each with its own WebSocket API pattern. All brokers share common data types defined in `TradingCommon.py` (no WebSocket code there—just Enums, dataclasses, and utility classes).

### Shared Types (`TradingCommon.py`)

| Category | Types |
|---|---|
| **Trade direction** | `TradeType` — CALL, PUT |
| **Trade lifecycle** | `TradeStatus` — PENDING, OPEN, WIN, LOSS, DRAW, EXPIRED, ERROR, UNKNOWN |
| **Asset classes** | `AssetType` — BINARY, VANILLA, TURBO, DIGITAL, FOREX, CFD, CRYPTO, STOCK, ETF, INDEX, COMMODITY, OTC, UNKNOWN |
| **Execution timing** | `ExecutionTiming` — MARKET, NEXT_MINUTE |
| **Data classes** | `Asset`, `TradeResult`, `TradeHistoryEntry`, `Trade` |
| **Utilities** | `TimezoneHelper` (UTC/local conversion), `ErrorMapper` (broker-specific error → user-friendly message) |

### WebSocket Libraries Used Summary

| Broker | Library | Async Model | Protocol |
|---|---|---|---|
| **Deriv** | `websocket-client` (WebSocketApp) | Background thread | Raw JSON-RPC |
| **ExpertOption** | `websocket-client` (WebSocketApp) | Background thread | Custom JSON |
| **IQ Option** | `websocket-client` (WebSocketApp) | Background thread | Socket.IO-like JSON |
| **OlympTrade** | `websockets` (async) | Thread + asyncio event loop | Custom JSON |
| **Pocket Option** | `python-socketio` (AsyncClient) | asyncio | Socket.IO |
| **Quotex** | `websocket-client` (WebSocketApp) | Background thread | Socket.IO v4 |

---

## 1. Deriv API

**Library:** `websocket-client` (`websocket.WebSocketApp`)  
**Async model:** Dedicated daemon thread  
**Connection URL:** `wss://ws.derivws.com/websockets/v3?app_id=62085`

### Connection & Authentication Flow

```
1. Create WebSocketApp with callbacks: _onWsOpen, _onWsMessage, _onWsError, _onWsClose, _onWsPong
2. Start background thread → run_forever(ping_interval=15, ping_timeout=10)
3. Wait for connection_event (threading.Event) set by _onWsOpen (15s timeout)
4. Authorize: {"authorize": "<token>"}
5. Server responds: {"authorize": {...account info...}, "msg_type": "authorize"}
6. Subscribe to asset list: {"asset_index": 1}
7. Subscribe to ticks: {"ticks": "R_100"} or {"ticks": "1HZ100V"}
8. Subscribe to candles: {"candles": "R_100", "granularity": 60, "count": 100}
```

### Message Format

- **Request format:** `{"<action>": <value>, ...}` — objects with a single action key
- **Response format:** `{"msg_type": "<action>", "...": ..., "echo_req": {...original request...}}` — every response echoes the original request
- **Error format:** `{"msg_type": "<action>", "error": {"code": "...", "message": "..."}, "echo_req": {...}}`

### Key API Calls

| Action | Request | Response `msg_type` |
|---|---|---|
| **Authorize** | `{"authorize": "<token>"}` | `authorize` |
| **Subscribe ticks** | `{"ticks": "R_100"}` / `{"ticks_history": "R_100", "end": "latest", "count": 10, "subscribe": 1}` | `tick` (streaming) / `ticks_history` |
| **Subscribe candles** | `{"candles": "R_100", "granularity": 60, "count": 500}` | `candles` / `ohlc` (streaming) |
| **Get active symbols** | `{"active_symbols": "brief"}` | `active_symbols` |
| **Buy contract** | `{"buy": "<contract_id>", "price": 10}` | `buy` |
| **Sell contract** | `{"sell": "<contract_id>", "price": 0}` | `sell` |
| **Get portfolio** | `{"portfolio": 1}` | `portfolio` |
| **Get proposal** | `{"proposal": 1, "amount": 10, "basis": "stake", "contract_type": "CALL", "currency": "USD", "duration": 1, "duration_unit": "t", "symbol": "R_100"}` | `proposal` |
| **Ping** | Auto via WebSocket ping/pong frames (ping_interval=15s) | — |
| **Unsubscribe** | `{"forget": "<subscription_id>"}` | `forget` |
| **Transaction stream** | `{"transaction": 1, "subscribe": 1}` | `transaction` |
| **Get account settings** | `{"get_settings": 1}` | `get_settings` |

### Subscription Pattern

1. Send subscribe request (e.g., `{"ticks": "R_100"}`)
2. Server returns a **subscription ID** (e.g., `{"subscription": {"id": "abc123..."}}`)
3. Server then continuously pushes `tick` messages with the same subscription ID
4. To unsubscribe, send `{"forget": "<subscription_id>"}`

### Tick Message
```json
{"tick": {"ask": 1234.56, "bid": 1234.50, "epoch": 1719000000, "id": "abc123...", "pip_size": 2, "quote": 1234.53, "symbol": "R_100"}, "msg_type": "tick"}
```

### SSL Configuration
- Certificate verification **DISABLED**: `sslopt={"cert_reqs": ssl.CERT_NONE}`
- This is consistent across ALL broker implementations

---

## 2. ExpertOption API

**Library:** `websocket-client` (`websocket.WebSocketApp`)  
**Async model:** Dedicated daemon thread with auto-reconnect (exponential backoff: 1s→60s, max 10 attempts)  
**Base URL:** `wss://fr24g1eu.expertoption.com/`  
**Full URL includes:** `wss://fr24g1eu.expertoption.com/ws/v45?app_os=...&app_version=30.0.4&app_build_number=27274&app_brand=expertoption&app_theme=dark&app_device_info=desktop&app_session_id=...`

### Connection & Authentication Flow (Out-of-Band Token)

```
1. Selenium browser automation opens https://app.expertoption.com/
2. User logs in manually (5-minute timeout)
3. Script captures auth_token cookie and crossdomain_token from localStorage
4. WebSocket connects with session-aware URL and custom User-Agent header
5. First message after connect: {"action": "subscribe", "name": "session", "data": {"session": "<crossdomain_token>"}, "msgid": <counter>}
6. Then sends platform init sequence with user info
7. Server confirms with session data and account info
```

### Message Format

```
[protocol_version, message_type, data, ...]
```

- Protocol version: string (varies)
- Message type: string action
- Data: dict with action-specific fields
- Messages also include `"msgid"` for request/response correlation

### Key Message Types

| Action/Type | Direction | Purpose |
|---|---|---|
| `"session"` | Client→Server | Authenticate with crossdomain token |
| `"auth"` | Server→Client | Authentication confirmation |
| `"profile"` | Client→Server | Request account profile |
| `"profile"` | Server→Client | Account balance, currency, settings |
| `"subscribe"` / `"unsubscribe"` | Client→Server | Subscribe/unsubscribe to data streams |
| `"list"` | Client→Server | Request asset list |
| `"quote"` | Server→Client | Real-time price quotes (streaming) |
| `"candle"` | Server→Client | Historical & streaming candle data |
| `"buy"` | Client→Server | Place trade |
| `"order"` | Server→Client | Trade confirmation/status updates |
| `"history"` | Client→Server | Request trade history |
| `"closed_deals"` | Server→Client | Completed trade records |
| `"ping"` | Client→Server | Keepalive |
| `"pong"` | Server→Client | Keepalive response |
| `"time"` | Client→Server | Server time sync request |
| `"time"` | Server→Client | Server timestamp |

### Subscription for Price Data

```python
# Subscribe to price quotes for specific assets
self.send_message("subscribe", "price", {"asset_ids": [1, 2, 3]})

# Server streams: {"type": "price", "data": {"asset_id": 1, "ask": 1.2345, "bid": 1.2340, "time": 1719000000}}

# Subscribe to candles
self.send_message("subscribe", "candle", {"asset_id": 1, "size": 60, "count": 100})

# Unsubscribe
self.send_message("unsubscribe", "price", {"asset_ids": [1]})
```

### Trading Commands

```python
# Place trade
self.send_message("buy", None, {
    "asset_id": 1,
    "amount": 100,
    "type": "call",  # or "put"
    "time": 60,      # duration in seconds
    "user_balance_id": 12345
})

# Server response: {"type": "order", "data": {"id": 67890, "status": "open", ...}}
```

### Ping/Keepalive

- Library-level auto-ping: `ping_interval=20`, `ping_timeout=10`, `ping_payload="keepalive"`
- Application-level pong handler: `_onWsPong`

---

## 3. IQ Option API

**Library:** `websocket-client` (`websocket.WebSocketApp`)  
**Async model:** Dedicated daemon thread  
**URL:** `wss://{host}/echo/websocket` (Socket.IO-style `/echo/websocket` endpoint)

### Connection & SSID Authentication

```
PHASE 1 — HTTP Authentication:
  1. POST to https://{host}/api with email/password via requests.Session
  2. Server returns ssid cookie stored in global_value.SSID

PHASE 2 — WebSocket Startup:
  3. Connect to wss://{host}/echo/websocket (SSL cert verification disabled)
  4. Socket.IO handshake happens automatically
  5. Server sends "40" (Socket.IO connect confirmation)
  6. Client sends "42["ssid",{"ssid":"<ssid_value>"}]"
  7. Server responds with profile data confirming auth
  8. Subscriptions begin
```

### Message Format (Socket.IO over WebSocket)

Uses **Socket.IO framing** over raw WebSocket:

| Socket.IO Code | Meaning |
|---|---|
| `0` | Open/connect |
| `40` | Socket.IO connect confirmation (namespace) |
| `41` | Disconnect |
| `42["event", data]` | Event message with JSON payload |
| `43["event", data]` | Binary event |

Messages are JSON arrays: `[event_name, payload_dict]`

### Core Channel/Object Architecture

**Channels** (`ws/chanels/`): Each channel is a class handling one specific WebSocket event protocol.
- `SSID` — SSID authentication
- `SetActives` — Subscribe to asset price streams
- `Candles` — Request candle data
- `BuyV2`/`BuyV3`/`BuyPlaceOrderTemp` — Place trades
- `Buyback` — Close positions
- `SellOption` — Sell digital options
- `Heartbeat` — Ping/pong keepalive
- `GetBalances` — Account balance
- `GetPositions` — Open positions
- `GetOrder` — Pending orders
- `Instruments` — Available instruments
- `StrikeList` — Strike prices for options
- `TradersMood` — Market sentiment

**Objects** (`ws/objects/`): Parser classes that normalize raw WebSocket messages into typed Python objects.
- `Candles` — Normalizes candle data
- `BetInfo` — Normalizes bet information
- `ListInfoData` — Normalizes asset/instrument data
- `Profile` — Normalizes user profile
- `Timesync` — Server time synchronization

### Subscription Flow

```python
# 1. Subscribe to assets
api.subscribe("live-deal-binary-option-placed")  # event name

# 2. Set active assets (sends: 42["set-actives", {"actives": [1,2,3]}])
api.SetActives.set_actives([1, 2, 3])

# 3. Request candles
api.getcandles(active_id=1, size=60, count=100)
# Sends: 42["candles", {"active_id": 1, "size": 60, "count": 100}]

# 4. Streaming price updates arrive as:
# 42["listInfoData", {"active_id": 1, "ask": 1.2345, "bid": 1.2340, ...}]
```

### Trading Commands

```python
# Binary option buy
api.buy(active_id=1, price=100, direction="call", duration=1)
# Generates: 42["binary-options.open-option", {
#     "active_id": 1,
#     "option_type_id": 1,
#     "direction": "call",
#     "expired": 1719000060,
#     "price": 100
# }]

# Digital option buy (BuyV3)
api.buyv3(active_id=1, price=100, direction="call", duration=5)
# Generates: 42["digital-options.place-digital-option", {...}]

# Close position
api.close_position(position_id=123)
# Generates: 42["position.close", {"position_id": 123}]
```

### Keepalive

```python
# Heartbeat channel sends periodic pings
42["heartbeat", {"heartbeat": timestamp, "heartbeatTime": timestamp}]
```

---

## 4. OlympTrade API

**Library:** `websockets` (async Python library, NOT websocket-client)  
**Async model:** Dedicated daemon thread running `asyncio.new_event_loop()` + `loop.run_forever()`  
**Messages sent thread-safely via:** `asyncio.run_coroutine_threadsafe()`  
**Base URL:** `wss://ws.olymptrade.com/...`

### Connection & Authentication

```
PHASE 1 — Token/Session Acquisition (Selenium + Chrome DevTools Protocol):
  1. Selenium launches Chrome to https://olymptrade.com/platform
  2. Captures access_token cookie
  3. Monitors CDP performance logs for Network.webSocketCreated to extract CID values:
     - cid_ver (version)
     - cid_app (application ID)
     - cid_device (device fingerprint)
     - cid_os (OS identifier)

PHASE 2 — WebSocket Connection:
  4. Builds WebSocket URL with CID parameters in query string
  5. Captures Sec-WebSocket-Extensions, Origin, User-Agent headers from CDP
  6. Connects with custom headers and SSL context
  7. SSL verify_mode = CERT_NONE

PHASE 3 — Auth via WebSocket:
  8. Sends auth message with token after connection established
```

### Message Format

Plain JSON objects and arrays:
```json
["<message_type>", <data_dict>]
```
or
```json
["<message_type>", <param1>, <param2>, ...]
```

### Key Message Types

| Type | Direction | Purpose |
|---|---|---|
| `"auth"` | Client→Server | Authenticate with token |
| `"profile"` | Server→Client | Account profile data |
| `"subscribe"` | Client→Server | Subscribe to asset quotes |
| `"unsubscribe"` | Client→Server | Unsubscribe |
| `"quote"` | Server→Client | Streaming price quotes |
| `"candle"` | Server→Client | Candle data |
| `"buy"` | Client→Server | Place trade |
| `"order_result"` | Server→Client | Trade confirmation |
| `"history"` | Client→Server | Request trade history |
| `"history"` | Server→Client | Historical trade data |
| `"asset_list"` | Client→Server | Request available assets |
| `"ping"` | Bidirectional | Keepalive |

### Subscription Pattern

```python
# Subscribe to quotes for specific assets
send_message(["subscribe", {"assets": [1, 2, 3]}])

# Server starts streaming
# On receive: ["quote", {"asset": 1, "bid": 1.2340, "ask": 1.2345, "time": 1719000000}]
```

### Trading Commands

```python
# Place binary option trade
send_message(["buy", {
    "asset_id": 1,
    "amount": 100,
    "type": "call",  # or "put"
    "expiration": 60  # seconds
}])

# Server response: ["order_result", {"order_id": 123, "status": "accepted"}]
```

### Keepalive

- WebSocket-level ping/pong frames
- Application-level `["ping", {}]` / `["pong", {}]` messages

---

## 5. Pocket Option API

**Library:** `python-socketio` (`socketio.AsyncClient`)  
**Transport:** Engine.IO over `aiohttp` — forced **WebSocket only** (no long-polling fallback)  
**Socket.IO path:** `socket.io` (not the default `/socket.io`)  
**URL:** From `Regions` enum, e.g. `wss://demo-api-eu.po.market`

### Connection & Authentication Flow

```
1. Create PocketOptionClient instance
2. Call connect(url, headers, auth) where:
   - url: wss://demo-api-eu.po.market
   - headers: Origin: https://m.pocketoption.com, User-Agent: Firefox UA
   - auth: AuthorizationData (session token, is_demo, uid, platform, isFastHistory, isOptimized)
   - Transports forced to ["websocket"]

3. Under the hood (python-socketio handles this):
   a. Engine.IO handshake over HTTP → upgrade to WebSocket
   b. Socket.IO "connect" event fires
   
4. Client manually emits "auth" event with AuthorizationData
5. Server responds with "successauth" event containing account info, balance, currency
6. Connection ready — subscriptions begin
```

### Message Format

**Engine.IO** + **Socket.IO** framing (handled by `python-socketio` library):

- **Engine.IO:** Handles transport, heartbeat, and message framing
- **Socket.IO events:** Named events emitted with JSON payloads

### Key Socket.IO Events

| Event | Direction | Data Model | Purpose |
|---|---|---|---|
| `"auth"` | Client→Server | `AuthorizationData` | Authenticate with session token |
| `"successauth"` | Server→Client | `SuccessAuthEvent` | Auth confirmation + account info |
| `"history"` | Client→Server | History request | Request candle/history data |
| `"candle"` | Server→Client | Candle data | Streaming/historical candles |
| `"order"` | Client→Server | Order request | Place trade |
| `"activeOrder"` | Server→Client | Order status | Live order update |
| `"closeOrder"` | Client→Server | Close request | Close position early |
| `"subscribe"` | Client→Server | Subscription request | Subscribe to instrument prices |
| `"unsubscribe"` | Client→Server | Unsubscription request | Unsubscribe |
| `"prices"` | Server→Client | Price update | Streaming price quotes |
| `"assets"` | Client→Server | Assets request | Request available instruments |
| `"assets"` | Server→Client | Asset list | Available instruments with metadata |
| `"deals"` | Server→Client | Deal history | Trade/deal history updates |
| `"chat"` | Server→Client | Chat messages | Support chat |

### Subscription Pattern

```python
# Subscribe to instrument price updates
client.emit("subscribe", {"instrument": "EURUSD_otc", "period": 60})

# Server streams "prices" events
# On receive: {"instrument": "EURUSD_otc", "bid": 1.12345, "ask": 1.12350, "timestamp": 1719000000}
```

### Trading Commands

```python
# Place trade
client.emit("order", {
    "instrument": "EURUSD_otc",
    "amount": 100,
    "type": "call",     # or "put"
    "expiration": 300,  # seconds
    "is_demo": True
})

# Server responds with "activeOrder" events during trade lifecycle
# {"order_id": 456, "status": "open", "instrument": "EURUSD_otc", ...}
# {"order_id": 456, "status": "win"/"loss", "profit": 185, ...}
```

### Keepalive

- Engine.IO ping/pong handled automatically by `python-socketio`
- Configurable via `engineio_logger` and ping interval settings

### generated_client.py

Auto-generated file providing typed wrappers around the Socket.IO client for Pocket Option's specific API endpoints.

---

## 6. Quotex API

**Library:** `websocket-client` (`websocket.WebSocketApp`)  
**Async model:** Background thread for WebSocket; asyncio used at the `stable_api.py` application layer for polling  
**URL:** `wss://ws2.qxbroker.com/socket.io/?EIO=4&transport=websocket` (Socket.IO v4 over WebSocket)  
**Default SSID source:** Quotex demo account via browser automation

### Connection & SSID Authentication

```
PHASE 1 — SSID Acquisition (Selenium):
  1. If no valid SSID, spawns Selenium browser to https://quotex.com/
  2. User logs in manually (or automated)
  3. Captures SSID from browser localStorage/cookies

PHASE 2 — WebSocket Connection:
  4. Connect to wss://ws2.qxbroker.com/socket.io/?EIO=4&transport=websocket
  5. Socket.IO v4 handshake:
     Server sends: 0{"sid":"...","pingInterval":25000,"pingTimeout":20000}
     Client sends: 40  (connect to default namespace)
     Server responds: 40{"sid":"..."}  (connected)

PHASE 3 — Authentication:
  6. On open callback sends: 42["authorization",{"session":"<SSID>","isDemo":1,"tournamentId":0}]
  7. Then subscribes to: tick, instruments, depth, chart notifications, pending list, indicators, drawings
  8. Server sends: 42["s_authorization",{"status":"success",...}]
  9. Connection accepted

REAUTHENTICATION:
  - On "41" (Socket.IO disconnect): flags reauth_needed
  - On "40" (reconnect): re-sends authorization if reauth_needed
  - On error containing "reject"/"unauthorized"/"auth": triggers Selenium SSID refresh, reconnects
```

### Message Format (Socket.IO v4 Over WebSocket)

Messages use **Socket.IO v4 text framing**:

| Frame | Meaning |
|---|---|
| `0{...}` | Engine.IO open (handshake) |
| `40` | Connect to default namespace |
| `40{...}` | Connection confirmed |
| `41` | Disconnect |
| `42[...]` | Event with JSON payload |
| `43[...]` | Binary event |
| `3` | Ping |
| `2` | Pong |

For `42[...]` events, the inner array structure: `["event_name", {...payload...}]`

### Channel Architecture

**Channels** (`ws/channels/`): Each channel is a specialized class for one WebSocket operation.
- `SSID` — Manages SSID authentication lifecycle (login, reject handling, refresh)
- `Candles` — Requests and processes candle/history data
- `Buy` — Places trades (binary options)
- `SellOption` — Sells/closes open options

**Objects** (`ws/objects/`): Parser/normalizer classes.
- `Candles` — Parses and normalizes raw candle data
- `ListInfoData` — Parses instrument/asset data from API responses
- `Profile` — Parses user profile data
- `Timesync` — Server time synchronization

### Key Socket.IO Events

| Event | Direction | Purpose |
|---|---|---|
| `"authorization"` | Client→Server | Send SSID for auth |
| `"s_authorization"` | Server→Client | Auth confirmation |
| `"authorization/reject"` | Server→Client | Auth rejected → triggers SSID refresh |
| `"tick"` | Server→Client | Streaming price tick data |
| `"candles"` | Server→Client | Candle/history data |
| `"instruments"` | Server→Client | Available instruments list |
| `"depth"` | Server→Client | Order book depth |
| `"order"` | Client→Server | Place trade |
| `"s_order"` | Server→Client | Order confirmation |
| `"position"` | Server→Client | Position update (open/close) |
| `"profile"` | Server→Client | Account profile |
| `"history"` | Client→Server | Request trade history |

### Subscription Pattern

```python
# Subscriptions are sent automatically on connect
42["authorization",{"session":"<SSID>","isDemo":1,"tournamentId":0}]

# Subscribe to candles for specific asset
client.send_candles_request(asset="EURUSD", period=60, count=100)
# Sends: 42["candles",{"asset":"EURUSD","period":60,"count":100,"offset":0}]
# Receives: 42["candles",{"asset":"EURUSD","data":[{"open":1.1,"close":1.2,...}]}]

# Tick stream arrives automatically after auth:
# 42["tick",{"asset":"EURUSD","bid":1.12345,"ask":1.12350,...}]
```

### Trading Commands

```python
# Place binary option trade
client.buy(asset="EURUSD", amount=100, direction="call", duration=300)
# Sends: 42["order",{"asset":"EURUSD","amount":100,"direction":"call","duration":300,"isDemo":1}]

# Server response:
# 42["s_order",{"id":789,"status":"open","asset":"EURUSD",...}]
# Later:
# 42["position",{"id":789,"status":"win","profit":185,...}]
```

### Keepalive

- Socket.IO v4 built-in ping/pong: `3` (ping) / `2` (pong)
- Default interval: 25000ms (from handshake), timeout: 20000ms

---

## Common Patterns Across All Brokers

### 1. Thread-Based Concurrency
All brokers (except Pocket Option which uses native asyncio) run WebSocket connections in **dedicated daemon threads**. OlympTrade uses an asyncio event loop inside a thread. All others use blocking `run_forever()` in a thread.

### 2. SSL Certificate Verification Disabled
Every single broker sets `ssl.CERT_NONE` (or equivalent). This is universally applied.

### 3. Auto-Reconnect
All implementations include reconnection logic:
- **Deriv/ExpertOption:** Loop around `run_forever()` with backoff
- **IQ Option:** Same pattern
- **OlympTrade:** Reconnect via thread-safe asyncio scheduling
- **Pocket Option:** Handled by `python-socketio` library auto-reconnect
- **Quotex:** Reconnect with re-authentication on "40" (Socket.IO reconnect) events

### 4. Token/Session Acquisition
Methods vary but all acquire a session token:
- **Deriv:** Direct API token passed to constructor
- **ExpertOption:** Selenium browser → cookie extraction
- **IQ Option:** HTTP login → SSID cookie
- **OlympTrade:** Selenium + Chrome DevTools Protocol → cookie + CID extraction
- **Pocket Option:** Session token from browser
- **Quotex:** Selenium browser → SSID from localStorage

### 5. Subscription Pattern
All brokers follow a **subscription model** where:
1. Client sends subscribe message specifying assets
2. Server begins streaming price updates
3. Client sends unsubscribe to stop
4. Price updates arrive as push messages (not request/response)

### 6. Trade Lifecycle
```
1. Client: Trade request → Server (specifies asset, amount, direction, duration)
2. Server: Order confirmation → Client (order ID, status "open")
3. Server: Periodic position updates (P&L, time remaining)
4. Server: Final result → Client (WIN/LOSS/DRAW with final profit/loss)
```
Optionally: early close via `sell`/`closePosition`/`closeOrder` commands.

---

## Protocol Comparison Matrix

| Feature | Deriv | ExpertOption | IQ Option | OlympTrade | Pocket Option | Quotex |
|---|---|---|---|---|---|---|
| **Protocol** | Raw JSON-RPC | Custom JSON array | Socket.IO-like | Custom JSON array | Socket.IO | Socket.IO v4 |
| **WS Library** | websocket-client | websocket-client | websocket-client | websockets | python-socketio | websocket-client |
| **Auth Method** | API token in JSON | Selenium cookie token | HTTP → SSID cookie | Selenium CDP token | Socket.IO "auth" event | Selenium SSID |
| **Auth Message** | `{"authorize":"token"}` | `["session", token]` | `42["ssid",{ssid}]` | `["auth", token]` | `emit("auth", data)` | `42["authorization",...]` |
| **Price Stream** | `{"tick":{...}}` | `["quote",{...}]` | `42["listInfoData",...]` | `["quote",{...}]` | `"prices"` event | `42["tick",{...}]` |
| **Candles** | `{"candles":...}` | `["candle",{...}]` | `42["candles",...]` | `["candle",{...}]` | `"candle"` event | `42["candles",...]` |
| **Trade** | `{"buy":{...}}` | `["buy",{...}]` | `42["buyv3",...]` | `["buy",{...}]` | `emit("order",...)` | `42["order",{...}]` |
| **Keepalive** | WS ping/pong | WS ping/pong + app pong | `42["heartbeat",...]` | `["ping",...]` | Engine.IO ping | Socket.IO 3/2 |
| **Reconnect** | Manual loop | Exponential backoff | Manual loop | Async re-schedule | Library auto | Re-auth on "40" |
| **SSL Verify** | Disabled | Disabled | Disabled | Disabled | Disabled | Disabled |

---

## Key Takeaways

1. **Two WebSocket libraries dominate:** `websocket-client` (4 brokers) and `python-socketio` (1 broker) + `websockets` (1 broker).
2. **Two protocol styles:** Raw JSON messages (Deriv, ExpertOption, OlympTrade) vs Socket.IO-framed messages (IQ Option, Quotex, Pocket Option).
3. **Authentication is always out-of-band:** Either API token, HTTP cookie, or Selenium browser automation.
4. **All connections run in background threads** with auto-reconnect logic.
5. **All disable SSL certificate verification** (production concern).
6. **Message correlation** is done differently: Deriv uses `echo_req`, others use `msgid`/request IDs, Socket.IO events are event-name-based.
7. **All share the same trade lifecycle:** request → confirmation → streaming updates → final result.