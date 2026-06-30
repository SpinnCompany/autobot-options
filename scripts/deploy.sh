#!/usr/bin/env bash
# ─── AutobotOptions — Production Deploy Script ───
#
# Deploys to GCP: options.autobotsignal.io
#
# Two modes:
#   docker  — Build & run Docker container on :8095 (fast, self-contained)
#   nginx   — Deploy static dist/ to host-level nginx (needs nginx config on server)
#
# Usage:
#   bash scripts/deploy.sh docker     # Docker deployment (recommended)
#   bash scripts/deploy.sh nginx      # Host-level nginx deployment
#
# ═══════════════════════════════════════════════════════════

set -euo pipefail

GCP_HOST="gcp-vps@34.81.61.52"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-docker}"

echo "=== AutobotOptions Deploy — Mode: $MODE ==="
echo "    Domain: options.autobotsignal.io"

# ─── Step 1: Build locally ──────────────────────────────────
echo "[1/4] Building production bundle..."
cd "$APP_DIR"
npm run build
echo "  ✓ Build complete"

JS_HASH=$(ls "$APP_DIR/dist/assets/index-"*.js 2>/dev/null | head -1 | grep -oP 'index-\K[^.]+' || echo "unknown")
echo "  ✓ JS hash: $JS_HASH"

# ─── Step 2: Verify build output ────────────────────────────
if [ ! -f "$APP_DIR/dist/index.html" ]; then
  echo "  ✗ ERROR: dist/index.html not found — build failed"
  exit 1
fi

# ─── Step 3: Deploy ─────────────────────────────────────────
case "$MODE" in
  docker)
    echo "[2/4] Deploying via Docker to $GCP_HOST..."
    echo "  → Copying source to server..."
    ssh "$GCP_HOST" "mkdir -p /home/gcp-vps/autobot-options"
    rsync -avz --delete \
      --exclude='node_modules' \
      --exclude='dist' \
      --exclude='.git' \
      "$APP_DIR/" "$GCP_HOST:/home/gcp-vps/autobot-options/"
    echo "  → Building Docker image and starting container..."
    ssh "$GCP_HOST" "cd /home/gcp-vps/autobot-options && \
      docker build -t autobot-options:latest . && \
      docker stop autobot-options 2>/dev/null || true && \
      docker rm autobot-options 2>/dev/null || true && \
      docker run -d \
        --name autobot-options \
        --restart unless-stopped \
        --network autobot-network \
        -p 8095:80 \
        autobot-options:latest"
    echo "  ✓ Docker container started on port 8095"
    ;;

  nginx)
    echo "[2/4] Deploying via host-level nginx to $GCP_HOST..."
    DEPLOY_PATH="/var/www/options.autobotsignal.io"
    echo "  → Target: $DEPLOY_PATH"
    echo "  → Copying dist via tar pipe..."
    tar -C "$APP_DIR/dist" -czf - . | \
      ssh "$GCP_HOST" "sudo mkdir -p $DEPLOY_PATH && \
        sudo rm -rf $DEPLOY_PATH/* && \
        sudo tar -xzf - -C $DEPLOY_PATH && \
        sudo chown -R www-data:www-data $DEPLOY_PATH"
    echo "  ✓ Files deployed to $DEPLOY_PATH"

    echo "[3/4] Reloading nginx..."
    ssh "$GCP_HOST" 'sudo nginx -t && sudo nginx -s reload' 2>/dev/null || \
      ssh "$GCP_HOST" 'sudo systemctl reload nginx' 2>/dev/null || true
    echo "  ✓ nginx reloaded"
    ;;

  *)
    echo "  ✗ Unknown mode: $MODE"
    echo "  Usage: bash scripts/deploy.sh [docker|nginx]"
    exit 1
    ;;
esac

# ─── Step 4: Verify ─────────────────────────────────────────
echo "[4/4] Verifying deployment..."

case "$MODE" in
  docker)
    HEALTH=$(ssh "$GCP_HOST" 'curl -s -o /dev/null -w "%{http_code}" http://localhost:8095/health' 2>/dev/null || echo "000")
    if [ "$HEALTH" = "200" ]; then
      echo "  ✓ Health check: 200 OK"
    else
      echo "  ⚠ Health check returned: $HEALTH"
    fi
    ;;
  nginx)
    HEALTH=$(curl -sk -o /dev/null -w "%{http_code}" https://options.autobotsignal.io/health 2>/dev/null || echo "000")
    if [ "$HEALTH" = "200" ]; then
      echo "  ✓ Health check: 200 OK (https://options.autobotsignal.io/health)"
    else
      echo "  ⚠ Health check returned: $HEALTH"
    fi
    ;;
esac

echo ""
echo "=== Deploy Complete ==="
echo "  URL:        https://options.autobotsignal.io"
echo "  Port:       8095 (Docker direct)"
echo "  Hash:       $JS_HASH"
echo "  Mode:       $MODE"
