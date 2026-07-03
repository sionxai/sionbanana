#!/bin/bash
set -eu

PLIST_NAME="com.sionbanana.server.plist"
PLIST_DST="${HOME}/Library/LaunchAgents/${PLIST_NAME}"

echo "Booting out com.sionbanana.server LaunchAgent if loaded..."
if launchctl bootout gui/501/com.sionbanana.server 2>/dev/null; then
  echo "LaunchAgent booted out."
else
  echo "LaunchAgent was not loaded or already removed."
fi

echo "Removing ${PLIST_DST} if present..."
rm -f "$PLIST_DST"

echo "수동 런처 SionBanana.command로 복귀 가능"
exit 0
