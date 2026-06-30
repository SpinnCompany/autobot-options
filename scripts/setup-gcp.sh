#!/usr/bin/env bash
# ─── AutobotOptions — GCP Server Initial Setup ───
#
# Run ONCE on the GCP server to configure nginx + SSL for options.autobotsignal.io.
# Assumes: Docker container already running on port 8095 (or will be started).
#
# Usage (on GCP server as root):
#   sudo bash setup-gcp.sh
#
# ═══════════════════════════════════════════════════════════

set -euo pipefail

DOMAIN="options.autobotsignal.io"
NGINX_SITE="/etc/nginx/sites-available/$DOMAIN"
NGINX_ENABLED="/etc/nginx/sites-enabled/$DOMAIN"

echo "=== AutobotOptions GCP Setup — $DOMAIN ==="

# 1. Install nginx + certbot if not present
echo "[1/5] Checking prerequisites..."
if ! command -v nginx &>/dev/null; then
  echo "  → Installing nginx..."
  apt-get update -qq && apt-get install -y -qq nginx
fi
if ! command -v certbot &>/dev/null; then
  echo "  → Installing certbot..."
  apt-get install -y -qq certbot python3-certbot-nginx
fi
echo "  ✓ Prerequisites OK"

# 2. Copy nginx site config
echo "[2/5] Installing nginx site config..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/nginx-site.conf" "$NGINX_SITE"
echo "  ✓ Config installed at $NGINX_SITE"

# 3. Enable the site
echo "[3/5] Enabling site..."
if [ -f "$NGINX_ENABLED" ]; then
  rm "$NGINX_ENABLED"
fi
ln -s "$NGINX_SITE" "$NGINX_ENABLED"
echo "  ✓ Site enabled"

# 4. Test nginx config
echo "[4/5] Testing nginx config..."
nginx -t
echo "  ✓ Config OK"

# 5. Obtain SSL certificate
echo "[5/5] Obtaining Let's Encrypt SSL certificate..."
echo "  → Make sure DNS A record for $DOMAIN points to this server's IP"
echo "  → HTTP (port 80) must be reachable from the internet"
echo ""
read -rp "  Continue with SSL setup? [y/N] " answer
if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --email admin@autobotsignal.io --redirect
  echo "  ✓ SSL certificate obtained"
  echo "  ✓ Auto-renewal cron job installed"
else
  echo "  ⚠ SSL skipped — run 'sudo certbot --nginx -d $DOMAIN' later"
fi

# Reload nginx
systemctl reload nginx

echo ""
echo "=== Setup Complete ==="
echo "  URL: https://$DOMAIN"
echo "  Config: $NGINX_SITE"
echo "  Verify: curl -sI https://$DOMAIN/health"
