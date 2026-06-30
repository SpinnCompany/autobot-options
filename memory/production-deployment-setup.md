---
name: production-deployment-setup
description: GCP deployment architecture, anti-patterns, and deploy checklist for autobot-options
metadata:
  type: project
  created: 2026-06-30
  updated: 2026-07-01
---

# Production Deployment Setup

## Server

- **Host:** GCP VM at 34.81.61.52 (gcp-vps)
- **Domain:** options.autobotsignal.io
- **SSL:** Let's Encrypt via certbot, auto-renew
- **Repo:** github.com/SpinnCompany/autobot-options

## Containers

| Container | Image | Port | Network |
|-----------|-------|------|---------|
| autobot-options | nginx:stable-alpine + Vite build | 0.0.0.0:8095→80 | autobot-network |
| deriv-proxy | node:22-alpine + ws | 127.0.0.1:8096→8091 | autobot-network |
| binance-proxy | node:22-alpine + ws | 127.0.0.1:8097→8092 | autobot-network |

## Nginx (host-level)

- Listens :80/:443 for options.autobotsignal.io
- `/` proxies to autobot-options:8095 (SPA)
- `/ws/deriv` proxies to deriv-proxy:8096 with WebSocket Upgrade headers
- `/ws/binance` proxies to binance-proxy:8097 with WebSocket Upgrade headers
- SSL managed by certbot
- Config at `/etc/nginx/sites-available/options.autobotsignal.io`

## Build Args (REQUIRED for production)

| Arg | Value | Purpose |
|-----|-------|---------|
| VITE_WS_URL | wss://options.autobotsignal.io/ws/deriv | Deriv market data |
| VITE_BINANCE_WS_URL | wss://options.autobotsignal.io/ws/binance | Binance market data |

## Critical Rules (learned 2026-06-30 → 2026-07-01)

1. **Port 8091 is phpMyAdmin** — deriv-proxy must use a different host port (8096)
2. **Port 8092 is autobot-admin** — binance-proxy must use a different host port (8097)
3. **Docker --no-cache required** when changing build args like VITE_WS_URL
4. **NEVER add simulation fallbacks** — the app depends on the deriv-proxy. If the proxy isn't reachable, deploy the proxy, don't fake data.
5. **VITE_WS_URL and VITE_BINANCE_WS_URL** must be set at Docker build time
6. **All data is real Deriv/Binance data** — no mockData, no PriceFeedEngine in production path
7. **BinanceFeed has HTTPS guard** — won't attempt localhost connection from HTTPS pages (prevents Chrome PNA permission prompt)

## Deploy Commands

### Full deploy (all containers)
```bash
# 1. Push code
cd autobot-options && git push origin main

# 2. Pull on GCP + rebuild all
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options && git pull origin main'

# 3. Rebuild deriv-proxy
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options/server && docker build -t deriv-proxy:latest . && docker stop deriv-proxy 2>/dev/null; docker rm deriv-proxy 2>/dev/null; docker run -d --name deriv-proxy --restart unless-stopped --network autobot-network -p 127.0.0.1:8096:8091 deriv-proxy:latest'

# 4. Rebuild binance-proxy
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options/server && docker build -f Dockerfile.binance -t binance-proxy:latest . && docker stop binance-proxy 2>/dev/null; docker rm binance-proxy 2>/dev/null; docker run -d --name binance-proxy --restart unless-stopped --network autobot-network -p 127.0.0.1:8097:8092 binance-proxy:latest'

# 5. Rebuild SPA with both WS URLs
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options && docker build --no-cache --build-arg VITE_WS_URL=wss://options.autobotsignal.io/ws/deriv --build-arg VITE_BINANCE_WS_URL=wss://options.autobotsignal.io/ws/binance -t autobot-options:latest . && docker stop autobot-options 2>/dev/null; docker rm autobot-options 2>/dev/null; docker run -d --name autobot-options --restart unless-stopped --network autobot-network -p 8095:80 autobot-options:latest'

# 6. Verify
curl -sk -o /dev/null -w '%{http_code}' https://options.autobotsignal.io/health  # → 200
ssh gcp-vps@34.81.61.52 'docker logs binance-proxy --tail 3'  # → "Connected to Binance WS"
ssh gcp-vps@34.81.61.52 'docker exec autobot-options grep -c "options.autobotsignal.io/ws/binance" /usr/share/nginx/html/assets/index-*.js'  # → >0
```

### SPA-only deploy (most common)
```bash
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options && git pull origin main && docker build --no-cache --build-arg VITE_WS_URL=wss://options.autobotsignal.io/ws/deriv --build-arg VITE_BINANCE_WS_URL=wss://options.autobotsignal.io/ws/binance -t autobot-options:latest . && docker stop autobot-options 2>/dev/null; docker rm autobot-options 2>/dev/null; docker run -d --name autobot-options --restart unless-stopped --network autobot-network -p 8095:80 autobot-options:latest && sleep 2 && curl -sk -o /dev/null -w "%{http_code}" https://options.autobotsignal.io/health'
```

## Verification

- `curl -sk https://options.autobotsignal.io/health` → 200 OK
- `docker logs deriv-proxy` → "Deriv connected"
- `docker logs binance-proxy` → "Fetched 441 USDT pairs" + "Connected to Binance WS"
- Browser: open https://options.autobotsignal.io → assets load, chart shows candles, Binance icons render as images

## localStorage Keys (full state persistence)

| Key | Purpose |
|-----|---------|
| `autobot_engine_state` | Balance, positions, orders, risk settings |
| `autobot_options_history` | Closed trade history (max 100) |
| `autobot_tabs` / `autobot_active_tab` | Chart tabs |
| `autobot_chart_prefs` | Chart type, indicators, overlays |
| `autobot_custom_inds` | Custom indicators |
| `autobot_trade_*` | Trade amount, duration, TP/SL |
| `autobot_mg_*` / `autobot_da_*` / `autobot_cp_*` | Martingale, D'Alembert, compounding |
| `autobot_asset_*` / `autobot_hist_*` / `autobot_ecal_*` | UI filters |
| `autobot_backtest` | Backtester params |
| `autobot_alerts` / `autobot_sound_*` / `autobot_push_*` | Misc preferences |
