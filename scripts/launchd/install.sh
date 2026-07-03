#!/bin/bash
set -eu

PROJECT_DIR="/Users/nohshinhee/Documents/2. coding/sionbanana"
PLIST_NAME="com.sionbanana.server.plist"
PLIST_SRC="${PROJECT_DIR}/scripts/launchd/${PLIST_NAME}"
PLIST_DST="${HOME}/Library/LaunchAgents/${PLIST_NAME}"
HEALTH_URL="http://localhost:3002/api/health"

echo "Booting out any existing com.sionbanana.server LaunchAgent..."
launchctl bootout gui/501/com.sionbanana.server 2>/dev/null || true
for _ in {1..30}; do
  launchctl print gui/501/com.sionbanana.server >/dev/null 2>&1 || break
  sleep 1
done

echo "Installing ${PLIST_NAME} to ${HOME}/Library/LaunchAgents/..."
cp "$PLIST_SRC" "${HOME}/Library/LaunchAgents/"

echo "Bootstrapping com.sionbanana.server..."
launchctl bootstrap gui/501 "$PLIST_DST"

echo "Waiting for SionBanana health check at ${HEALTH_URL}..."
for _ in {1..90}; do
  if response="$(curl -fsS "$HEALTH_URL" 2>/dev/null)" && printf '%s' "$response" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
    echo "READY"
    exit 0
  fi

  sleep 2
done

echo "Timed out waiting for SionBanana health check."
exit 1
