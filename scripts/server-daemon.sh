#!/bin/bash
set -u

PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PATH

PORT="${SIONBANANA_PORT:-3002}"
GROK_PROXY_PORT="${SIONBANANA_GROK_PROXY_PORT:-18645}"
SIONBANANA_GROK_PROXY="http://127.0.0.1:${GROK_PROXY_PORT}/v1"
export SIONBANANA_GROK_PROXY

PROJECT_DIR="/Users/nohshinhee/Documents/2. coding/sionbanana"
STUDIO_URL="http://localhost:${PORT}/studio"
GROK_MODELS_URL="${SIONBANANA_GROK_PROXY}/models"

cd "$PROJECT_DIR" || {
  echo "[daemon] failed to cd to ${PROJECT_DIR}"
  exit 1
}

STOP_FLAG="$HOME/Library/Application Support/SionBanana/server-stopped"
if [ -f "$STOP_FLAG" ]; then
  echo "[daemon] stopped by user; parked"
  while [ -f "$STOP_FLAG" ]; do
    sleep 10
  done
  echo "[daemon] resume requested; starting"
fi

echo "[daemon] $(date '+%F %T') start (port ${PORT})"

if curl -fsS -o /dev/null "$STUDIO_URL" 2>/dev/null; then
  echo "[daemon] port ${PORT} already served by another process; standing by as guardian"
  while curl -fsS -o /dev/null "$STUDIO_URL" 2>/dev/null; do
    sleep 10
  done
  echo "[daemon] foreign server stopped; taking over"
fi

if curl -fsS -o /dev/null "$GROK_MODELS_URL" 2>/dev/null || lsof -nP -iTCP:"$GROK_PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[daemon] grok proxy already available on port ${GROK_PROXY_PORT}; reusing"
elif command -v progrok >/dev/null 2>&1 && [[ -f "$HOME/.progrok/auth.json" ]]; then
  echo "[daemon] starting grok proxy on port ${GROK_PROXY_PORT}"
  progrok proxy --host 127.0.0.1 --port "$GROK_PROXY_PORT" >>/tmp/sionbanana-grok-proxy.log 2>&1 &
else
  echo "[daemon] warning: progrok proxy unavailable; video features disabled, image generation unaffected"
fi

if [[ ! -f ".next/BUILD_ID" ]]; then
  echo "[daemon] .next/BUILD_ID missing; running production build"
  if ! npm run build; then
    echo "[daemon] production build failed"
    exit 1
  fi
else
  echo "[daemon] .next/BUILD_ID exists; skipping production build"
fi

echo "[daemon] starting production server on port ${PORT}"
exec npm run start -- -H 127.0.0.1 -p "$PORT"
