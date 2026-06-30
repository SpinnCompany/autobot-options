---
name: production-deployment-setup
description: GCP deployment architecture, anti-patterns, and deploy checklist for autobot-options
metadata:
  type: project
  created: 2026-06-30
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

## Nginx (host-level)

- Listens :80/:443 for options.autobotsignal.io
- `/` proxies to autobot-options:8095 (SPA)
- `/ws` proxies to deriv-proxy:8096 with WebSocket Upgrade headers
- SSL managed by certbot
- Config at `/etc/nginx/sites-available/options.autobotsignal.io`

## Critical Rules (learned 2026-06-30)

1. **Port 8091 is phpMyAdmin** — deriv-proxy must use a different host port (8096)
2. **Docker --no-cache required** when changing build args like VITE_WS_URL
3. **NEVER add simulation fallbacks** — the app depends on the deriv-proxy. If the proxy isn't reachable, deploy the proxy, don't fake data.
4. **VITE_WS_URL** must be set at Docker build time: `--build-arg VITE_WS_URL=wss://options.autobotsignal.io/ws`
5. **All data is real Deriv data** — no mockData, no PriceFeedEngine in production path

## Deploy Command (one-shot)

```bash
ssh gcp-vps@34.81.61.52 'cd /home/gcp-vps/autobot-options && git pull origin main && cd server && docker build -t deriv-proxy:latest . && docker stop deriv-proxy 2>/dev/null; docker rm deriv-proxy 2>/dev/null; docker run -d --name deriv-proxy --restart unless-stopped --network autobot-network -p 127.0.0.1:8096:8091 deriv-proxy:latest && cd .. && docker build --no-cache --build-arg VITE_WS_URL=wss://options.autobotsignal.io/ws -t autobot-options:latest . && docker stop autobot-options 2>/dev/null; docker rm autobot-options 2>/dev/null; docker run -d --name autobot-options --restart unless-stopped --network autobot-network -p 8095:80 autobot-options:latest && sleep 2 && curl -sk -o /dev/null -w "%{http_code}" https://options.autobotsignal.io/health'
```

## Verification

- `curl -sk https://options.autobotsignal.io/health` → 200 OK
- `docker logs deriv-proxy` → "Deriv connected"
- Browser: open https://options.autobotsignal.io → assets load, chart shows candles, no console errors
