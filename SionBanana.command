#!/bin/zsh
set -u
setopt NO_BG_NICE  # zsh가 백그라운드 작업(&)을 nice +5로 깎는 것 방지 — 서버는 일반 우선순위로

PROJECT_DIR="/Users/nohshinhee/Documents/2. coding/sionbanana"
PORT="${SIONBANANA_PORT:-3002}"
URL="http://localhost:${PORT}/studio"
SERVER_PID=""

# Grok 영상 프록시 설정
GROK_PROXY_HOST="127.0.0.1"
GROK_PROXY_PORT="${SIONBANANA_GROK_PROXY_PORT:-18645}"
GROK_PROXY_URL="http://${GROK_PROXY_HOST}:${GROK_PROXY_PORT}/v1"
GROK_PROXY_PID=""
export SIONBANANA_GROK_PROXY="$GROK_PROXY_URL"

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
  if [[ -n "$GROK_PROXY_PID" ]] && kill -0 "$GROK_PROXY_PID" 2>/dev/null; then
    echo "Stopping Grok proxy..."
    kill "$GROK_PROXY_PID" 2>/dev/null
  fi
}

trap cleanup INT TERM EXIT

# --- Grok 영상 프록시 자동 기동 (영상 기능용, 선택적) ---
# 이미 떠 있으면 재사용, 아니면 띄운다. progrok 미설치/미로그인이면 경고만 하고 계속(이미지 생성은 정상 동작).
if curl -fsS -o /dev/null "${GROK_PROXY_URL}/models" >/dev/null 2>&1 || lsof -nP -iTCP:"$GROK_PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Grok 프록시가 이미 실행 중입니다 (${GROK_PROXY_URL})."
elif command -v progrok >/dev/null 2>&1; then
  if [[ -f "$HOME/.progrok/auth.json" ]]; then
    echo "Grok 프록시를 시작합니다 (${GROK_PROXY_URL})..."
    progrok proxy --host "$GROK_PROXY_HOST" --port "$GROK_PROXY_PORT" >/tmp/sionbanana-grok-proxy.log 2>&1 &
    GROK_PROXY_PID=$!
  else
    echo "[안내] progrok 로그인이 필요합니다. 영상 기능을 쓰려면 'progrok login' 후 다시 실행하세요. (이미지 생성은 정상)"
  fi
else
  echo "[안내] progrok 미설치. 영상 기능을 쓰려면 'npm install -g progrok && progrok login'. (이미지 생성은 정상)"
fi

should_build=1
if [[ "${SIONBANANA_SKIP_BUILD:-0}" == "1" ]]; then
  if [[ -d ".next" ]]; then
    should_build=0
    echo "Skipping build because SIONBANANA_SKIP_BUILD=1 and .next exists."
  else
    echo "SIONBANANA_SKIP_BUILD=1 was set, but .next was not found. Building first."
  fi
fi

if [[ "$should_build" == "1" ]]; then
  echo "Building SionBanana for production..."
  if ! npm run build; then
    echo
    echo "SionBanana build failed. Server was not started."
    echo "Fix the build errors above, then run this launcher again."
    echo
    echo "Press any key to close this window."
    read -k 1
    exit 1
  fi
fi

echo "Starting production server on port $PORT..."
npm run start -- -p "$PORT" &
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
