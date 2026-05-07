#!/bin/zsh
set -u

PROJECT_DIR="/Users/nohshinhee/Documents/2. coding/sionbanana/.claude/worktrees/gallant-robinson-873eaa"
PORT="${SIONBANANA_PORT:-3002}"
URL="http://localhost:${PORT}/studio"
SERVER_PID=""

cd "$PROJECT_DIR" || exit 1

echo "SionBanana local launcher"
echo "Project: $PROJECT_DIR"
echo "URL:     $URL"
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "npm command not found. Install Node.js/npm first."
  echo
  echo "Press any key to close this window."
  read -k 1
  exit 1
fi

if curl -fsS -o /dev/null "$URL" >/dev/null 2>&1; then
  echo "SionBanana is already running. Opening browser..."
  open "$URL"
  echo
  echo "Press any key to close this window."
  read -k 1
  exit 0
fi

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo
    echo "Stopping SionBanana server..."
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
}

trap cleanup INT TERM EXIT

echo "Starting dev server on port $PORT..."
npm run dev -- -p "$PORT" &
SERVER_PID=$!

echo "Waiting for server to become ready..."
for attempt in {1..60}; do
  if curl -fsS -o /dev/null "$URL" >/dev/null 2>&1; then
    echo "Ready. Opening browser..."
    open "$URL"
    echo
    echo "Keep this Terminal window open while using SionBanana."
    echo "Close this window or press Ctrl+C to stop the server."
    wait "$SERVER_PID"
    exit $?
  fi

  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Server process exited before it became ready."
    echo
    echo "Press any key to close this window."
    read -k 1
    exit 1
  fi

  sleep 1
done

echo "Timed out waiting for SionBanana to start."
echo "Check the server log above for errors."
echo
echo "Press any key to close this window."
read -k 1
exit 1
