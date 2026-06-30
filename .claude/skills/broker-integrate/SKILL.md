---
name: broker-integrate
description: Pattern for adding real broker WebSocket connections to replace simulated price feeds
---

# Broker WebSocket Integration

Follow this pattern when connecting AutobotOptions to a real broker WebSocket API.

## Reference

Complete broker API documentation is at `docs/brokers-websocket-architecture.md` — covers Deriv, ExpertOption, IQ Option, OlympTrade, Pocket Option, and Quotex.

## Integration Pattern

### 1. Create Broker Adapter
```
src/brokers/<broker-name>/
├── adapter.js       # WebSocket connection + auth
├── transformer.js   # Normalize broker messages → PIT-terminal format
└── types.js         # JSDoc type definitions
```

### 2. Adapter Must Implement
```js
class BrokerAdapter {
  constructor(url, credentials)  // Connect + authenticate
  subscribe(symbols)             // Subscribe to price ticks
  unsubscribe(symbols)           // Clean up subscriptions
  onTick(callback)               // Callback receives {symbol, bid, ask, timestamp}
  onTradeResult(callback)        // Callback receives trade outcome
  placeTrade(params)             // Execute real trade
  close()                        // Graceful disconnect
}
```

### 3. Transformer Must Normalize
- Price ticks → `{symbol, price, bid, ask, timestamp}`
- Trade results → `{id, status:'win'|'loss', pnl, exitPrice}`
- Asset lists → `{name, category, price, payout, icon}`

### 4. Hook Into useWebSocket.js
The `useWebSocket` hook checks `VITE_WS_URL` env var:
- If unset → simulated feed (current behavior)
- If set → connect to real broker via adapter

```js
// src/hooks/useWebSocket.js pattern:
const adapter = VITE_WS_URL 
  ? new BrokerAdapter(VITE_WS_URL, credentials)
  : new SimulatedAdapter()
```

### 5. Environment Variables
```bash
# .env (never commit)
VITE_WS_URL=wss://ws.derivws.com/websockets/v3?app_id=XXXXX
VITE_BROKER_TOKEN=your_auth_token
VITE_BROKER_MODE=demo   # or 'real'
```

### 6. Safety Rules
- **ALWAYS** start with demo accounts — never test with real money
- **NEVER** hardcode broker URLs — use env vars
- **NEVER** commit tokens or credentials
- **ALWAYS** implement auto-reconnect with exponential backoff
- **ALWAYS** add the broker to `.env.example` with placeholder values
- SSL verification should be ENABLED (unlike ATS-Project Python bot)

## Sequence
```
1. User sets VITE_WS_URL + token in .env
2. App starts → useWebSocket checks for VITE_WS_URL
3. Creates BrokerAdapter → connects + authenticates
4. Subscribes to selected asset ticks
5. Ticks flow through transformer → update asset prices + charts
6. Trade execution → adapter.placeTrade() → broker API
7. Trade result → adapter.onTradeResult() → update positions
```
