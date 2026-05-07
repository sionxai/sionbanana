# 작업 지시서: Codex Device Code OAuth — Web 자체 인증 흐름

> 대상 AI 에이전트: 이 문서만 읽고도 cold start로 작업 가능합니다.
> 통합 검토자: Claude (별도 세션)

---

## 1. 환경 정보

| 항목 | 값 |
|------|------|
| worktree 경로 | `/Users/nohshinhee/Documents/2. coding/sionbanana/.claude/worktrees/gallant-robinson-873eaa` |
| 브랜치 | `claude/gallant-robinson-873eaa` |
| 기준 commit | 작업 시작 시점의 `HEAD` (zoom UX 패치 통합 후) |
| dev server | `http://localhost:3000` (이미 떠있음 — 새로 띄우지 마세요) |
| node_modules | 설치 완료 (`npm install` 다시 X) |
| 기존 인증 자산 | `lib/codex-oauth.ts` — `~/.codex/auth.json` 읽기 + 자동 refresh 이미 구현됨 |
| 참고 문서 | `REDESIGN_PLAN.md` (전반), 이전 작업 지시서 `TASK_zoom_ux.md` |

---

## 2. 목표

시온바나나가 **codex CLI 의존 없이** 자체 web UI에서 OAuth Device Code Flow로 ChatGPT 계정 인증을 처리한다. 결과:

- 신규 사용자: `git clone` → `npm install` → `npm run dev` → 브라우저 → **`/auth` 페이지에서 9자 코드 입력 흐름**으로 로그인 → 즉시 이미지/텍스트 생성 사용
- 기존 사용자: `~/.codex/auth.json` 우선 활용 (지금처럼). web 로그인은 fallback으로 동작
- 로그아웃 버튼 한 클릭으로 토큰 제거

---

## 3. 사용자 사전 조건 (UI에서 안내)

`/auth` 페이지 상단에 굵게 표기:

1. **ChatGPT 구독 활성화** (Plus / Pro / Business / Enterprise 어느 플랜이든)
2. **ChatGPT 설정 → 보안 → "Codex용 장치 코드 인증 활성화" 켜기**
   - 이 설정이 꺼져 있으면 codex device 인증 자체가 거부됨 (OpenAI 정책)
   - 안내 옆에 "ChatGPT 보안 설정 열기" 버튼: `https://chatgpt.com/#settings/Security` 새 탭

---

## 4. OAuth Device Code Flow 명세

표준 RFC 8628. OpenAI/Codex 측 endpoint와 client는 다음을 사용:

```
client_id:    app_EMoamEEZ73f0CkXaXp7hrann   (codex CLI와 동일 — refresh도 이 client로 처리됨)
scope:        openid profile email offline_access
device_code endpoint:  POST https://auth.openai.com/oauth/device/code
token endpoint:        POST https://auth.openai.com/oauth/token
verification URL 패턴: device code endpoint 응답의 verification_uri / verification_uri_complete
```

### 4.1 device code 발급

```http
POST https://auth.openai.com/oauth/device/code
Content-Type: application/x-www-form-urlencoded

client_id=app_EMoamEEZ73f0CkXaXp7hrann
&scope=openid%20profile%20email%20offline_access
```

응답 (200):
```json
{
  "device_code": "...",       // 서버용 — 절대 사용자에게 노출 X
  "user_code": "5BI9-OC2Y0",  // 사용자에게 표시
  "verification_uri": "https://chatgpt.com/codes",
  "verification_uri_complete": "https://chatgpt.com/codes?user_code=5BI9-OC2Y0",
  "expires_in": 600,
  "interval": 5
}
```

응답이 4xx면 user에게 "Codex용 장치 코드 인증이 비활성화돼 있을 수 있습니다" 안내 + ChatGPT 보안 설정 링크.

### 4.2 token polling

```http
POST https://auth.openai.com/oauth/token
Content-Type: application/x-www-form-urlencoded

client_id=app_EMoamEEZ73f0CkXaXp7hrann
&device_code=<device_code>
&grant_type=urn:ietf:params:oauth:grant-type:device_code
```

응답 처리:

| 상태 | error | 동작 |
|------|------|------|
| 200 | — | 성공: `{ access_token, refresh_token, id_token, expires_in }` 받음 → 디스크 저장 → 종료 |
| 400 | `authorization_pending` | 계속 대기 (interval 초마다 재시도) |
| 400 | `slow_down` | interval +5초 늘려 재시도 |
| 400 | `expired_token` | 만료. 처음부터 새 device code 발급 안내 |
| 400 | `access_denied` | 사용자가 거부. 종료 + 메시지 |
| 그 외 | — | 실패 메시지 표시 |

polling 최대 시간: `expires_in` (보통 600초). 그 안에 승인 안 되면 expired.

---

## 5. 변경 대상 파일

| 파일 | 종류 |
|------|------|
| `app/api/auth/device-start/route.ts` | 🆕 device code 발급 (4.1) |
| `app/api/auth/device-poll/route.ts` | 🆕 single poll round-trip (status: pending/success/expired/denied/error) |
| `app/api/auth/logout/route.ts` | 🆕 DELETE — auth 파일 삭제 + cache clear |
| `app/api/auth/status/route.ts` | 🆕 GET — 현재 인증 상태 + 만료 정보 (`/api/health`보다 더 간결) |
| `app/auth/page.tsx` | 🆕 dynamic ssr:false — `auth-view` 동적 import |
| `app/auth/auth-view.tsx` | 🆕 메인 로그인 UI (시온이 보낸 이미지 디자인 참고) |
| `lib/codex-oauth.ts` | 🔧 후보 경로에 `<DATA_DIR>/codex-auth.json` 추가, 우리 web 인증으로 받은 토큰을 그쪽에 저장 |
| `lib/local/storage.ts` | 🔧 `getDataDir()` export (이미 있으면 무시) |
| `components/auth-status-banner.tsx` | 🔧 "터미널 명령" 안내 → "로그인 페이지로 이동" CTA 버튼 |
| `app/usage/usage-view.tsx` | 🔧 "로그아웃" 버튼 추가 + 클릭 시 confirm + DELETE 호출 |
| `components/studio/studio-navigation.tsx` | 🔧 "로그인" 또는 "사용량" 옆에 인증 상태 표시 (선택) |

위 외 파일은 건드리지 마세요. 특히 다른 도메인 컴포넌트(prompt/storyboard/generate 등) 코드는 변경 X.

---

## 6. 토큰 저장 위치 정책

**우선순위 순서 (읽기)**:

1. `<SIONBANANA_DATA_DIR or ./data>/codex-auth.json` — web 로그인이 만든 토큰 (이번에 추가)
2. `$CHATGPT_LOCAL_HOME/auth.json`
3. `$CODEX_HOME/auth.json`
4. `~/.chatgpt-local/auth.json`
5. `~/.codex/auth.json` — codex CLI가 만든 토큰

**쓰기**: web 로그인이 성공하면 항상 **#1 위치(`<DATA_DIR>/codex-auth.json`)**에 저장. `~/.codex/auth.json`은 절대 우리가 덮어쓰지 않음 (codex CLI 사용자 환경 보호).

**파일 권한**: 0o600 (owner read/write 만)

**파일 포맷**: 기존 `~/.codex/auth.json`과 동일한 shape:
```json
{
  "tokens": {
    "access_token": "...",
    "id_token": "...",
    "refresh_token": "...",
    "account_id": "..." 
  },
  "last_refresh": "2026-05-01T..."
}
```
이 포맷이면 기존 `lib/codex-oauth.ts`의 `loadFreshAuth`가 변경 없이 처리 가능.

**로그아웃 시**: `<DATA_DIR>/codex-auth.json`을 삭제. `~/.codex/auth.json`은 건드리지 않음 (codex CLI 환경 보호).

---

## 7. UI 명세 (`/auth` 페이지)

시온이 본 디자인(스크린샷)을 참고하되 시온바나나 톤(Tailwind + Radix + dark mode)으로 통일.

### 7.1 상태 머신

```
idle → starting → awaiting (코드 표시 + polling) → success → /studio로 이동
                       ↘ expired → idle
                       ↘ denied  → idle (안내 + 다시 시작 버튼)
                       ↘ error   → idle (에러 메시지)
```

### 7.2 컴포넌트

- 헤더: 플러그 아이콘 + "Codex 계정 / 생성 전에 연결해 주세요"
- 사전 조건 카드: ChatGPT 보안 설정 안내 + 외부 링크 버튼
- 인증 카드 (awaiting 상태):
  - **9자 user_code** 큰 글씨로 표시 (예: `5BI9-OC2Y0`)
  - "인증 페이지 열기" 버튼 → `verification_uri_complete` 새 탭으로 open
  - "코드 복사" 버튼 → clipboard
  - 진행 표시 (스피너 또는 "승인 대기 중...")
  - 만료 카운트다운 (`expires_in`을 기준으로 mm:ss)
  - "취소" 버튼 → polling 중단 + idle 복귀
- 성공 시: "로그인 성공" 토스트 + 자동으로 `/studio` 이동 (또는 시온이 원래 가던 페이지로)

### 7.3 polling 구현

클라이언트가 `/api/auth/device-poll`을 5초마다 fetch. 서버가 `expires_in` 동안 한 번씩만 OpenAI에 polling. `slow_down` 응답이 오면 클라이언트가 interval을 늘리도록 응답에 `next_interval_ms` 포함.

abort 시: 클라이언트는 더 이상 호출 안 함. 서버는 별도 상태 보관 안 함 (stateless polling — 매 요청마다 device_code 함께 보냄).

⚠ device_code는 server-only로 보관. 클라이언트가 보관 X. 즉 `/api/auth/device-start`가 응답에 device_code 포함하지 말고, 서버가 메모리(또는 임시 파일)에 보관 + session id를 클라이언트에 줌. 클라이언트가 그 session id로 polling.

```ts
// server side state (메모리, 단일 사용자 도구라 OK)
const pendingDeviceFlows = new Map<string, {
  deviceCode: string;
  expiresAt: number;
  interval: number;
  createdAt: number;
}>();
```

---

## 8. API 명세

### 8.1 `POST /api/auth/device-start`

요청: 본문 없음.

응답 (200):
```json
{
  "ok": true,
  "session": "sess_abc123",
  "userCode": "5BI9-OC2Y0",
  "verificationUri": "https://chatgpt.com/codes",
  "verificationUriComplete": "https://chatgpt.com/codes?user_code=5BI9-OC2Y0",
  "expiresIn": 600,
  "interval": 5
}
```

응답 (실패):
```json
{ "ok": false, "reason": "...", "code": "DEVICE_AUTH_DISABLED|UPSTREAM_ERROR|..." }
```

### 8.2 `POST /api/auth/device-poll`

요청:
```json
{ "session": "sess_abc123" }
```

응답:
```json
{ "ok": true, "status": "pending" | "success" | "expired" | "denied" | "error", "nextIntervalMs": 5000, "reason": "..." }
```

성공 시 서버가 `<DATA_DIR>/codex-auth.json` 저장 + session 정리. 클라이언트는 `success` 받으면 `/studio` 이동.

### 8.3 `DELETE /api/auth/logout`

응답:
```json
{ "ok": true, "removed": true|false }
```

`<DATA_DIR>/codex-auth.json` 삭제. `~/.codex/auth.json` 건드리지 않음. `lib/codex-oauth.ts`의 in-memory cache도 clear (`clearCodexAuthCache()` 이미 export됨).

### 8.4 `GET /api/auth/status`

`/api/health`와 별개로 더 가벼운 응답.
```json
{ "authenticated": true, "email": "...", "planType": "pro", "expiresAt": 1234567890000, "source": "web" | "codex-cli" }
```

`source`: 토큰을 어디서 읽었는지. UI에서 "codex CLI 인증을 사용 중" / "web 로그인 사용 중"을 구분 표시할 수 있게.

---

## 9. 검증 절차

### 9.1 새 환경 시뮬

```bash
# 임시로 codex CLI 인증을 비활성화
mv ~/.codex/auth.json ~/.codex/auth.json.bak
# 우리 데이터 디렉토리도 비우기
rm -f data/codex-auth.json
```

1. `http://localhost:3000/studio` 진입 → AuthStatusBanner 노란 배너 등장 + "로그인" 버튼
2. 클릭 → `/auth` 페이지 이동
3. ChatGPT 보안 설정 열기 (한 번만)
4. "연결 시작" 버튼 → 9자 user_code 표시
5. "인증 페이지 열기" 클릭 → 새 탭에서 ChatGPT가 코드 입력 대기 (또는 자동 입력된 상태)
6. 승인 → 5~10초 안에 `/auth` 페이지가 "로그인 성공" 토스트 + `/studio` 이동
7. AuthStatusBanner 사라짐. `/usage` 가서 plan_type 등 정상 확인
8. 이미지 1장 생성 → 정상

### 9.2 정리

```bash
mv ~/.codex/auth.json.bak ~/.codex/auth.json
```

### 9.3 로그아웃

1. `/usage` 페이지에서 "로그아웃" 버튼 클릭 → 확인 dialog
2. 클릭 → `<DATA_DIR>/codex-auth.json` 삭제
3. AuthStatusBanner 다시 등장
4. 단, `~/.codex/auth.json`이 살아 있으면 fallback으로 codex CLI 토큰 사용 → AuthStatusBanner 사라짐. UI에 "codex CLI 인증" 표시

### 9.4 보안

- device_code가 클라이언트로 누출되지 않는지 (DevTools Network 검사)
- token이 응답 body나 로그에 포함 안 되는지
- `/api/auth/device-poll`이 session 검증 없이 다른 폴드의 device_code를 받지 못하는지

### 9.5 typecheck/build

```bash
npx tsc --noEmit
# 통과 확인
```

---

## 10. 비-범위 (out of scope)

- ChatGPT 측 verification 페이지 디자인 X (OpenAI 통제)
- 모바일 native 앱 흐름 X (web only)
- 다중 계정 전환 X (단일 세션 1개 토큰만)
- API key 입력으로 codex 우회 X (subscription 정책상 device code만 활용)
- refresh_token 만료 처리 변경 X (`lib/codex-oauth.ts`가 이미 처리)
- 다른 OAuth provider (Google 등) X

---

## 11. 보안 / 약관 메모

- ChatGPT 약관상 OAuth 토큰을 외부 도구로 활용하는 건 회색 영역. 사용자 본인 계정·본인 PC에서만 사용한다는 전제에 한정.
- web UI라도 dev server는 `127.0.0.1`에 바인딩 (already default in Next.js dev)
- 토큰을 환경변수로 export하거나 console.log에 찍지 말 것
- in-memory pendingDeviceFlows는 단일 사용자 도구 가정. 멀티 프로세스/SSR 환경에서는 동작 안 함 — 그래도 OK (target 환경은 단일 dev process)

---

## 12. 결과 보고 양식

```
## 변경 파일
- app/api/auth/device-start/route.ts (+N)
- app/api/auth/device-poll/route.ts (+N)
- app/api/auth/logout/route.ts (+N)
- app/api/auth/status/route.ts (+N)
- app/auth/page.tsx (+N)
- app/auth/auth-view.tsx (+N)
- lib/codex-oauth.ts (+N -M)
- components/auth-status-banner.tsx (+N -M)
- app/usage/usage-view.tsx (+N)
- (그 외)

## 핵심 결정
- token 저장 위치: <DATA_DIR>/codex-auth.json
- session 보관: in-memory Map (단일 process)
- polling interval: 클라이언트 5초, slow_down 시 +5초

## 검증 결과
- 9.1 새 환경 시뮬: 통과 (로그인 → 이미지 생성 OK)
- 9.3 로그아웃: 통과
- 9.4 보안: token 클라이언트 노출 X 확인
- 9.5 typecheck: 통과

## 알려진 한계
- (있으면)
```

commit하지 말고 working tree에 두세요. 메인 Claude가 typecheck + 보안 검토 후 통합 commit합니다.

---

## 13. 빠른 체크리스트

- [ ] `/auth` 페이지가 시온이 본 스크린샷처럼 user_code + verification 안내
- [ ] device_code는 server-only, 클라이언트엔 session id만
- [ ] polling stateless (매 요청에 session id 포함)
- [ ] `<DATA_DIR>/codex-auth.json` 0o600
- [ ] `~/.codex/auth.json`은 절대 덮어쓰지 않음
- [ ] AuthStatusBanner의 "터미널" 안내 → "/auth로 이동" CTA로 변경
- [ ] `/usage` 페이지에 "로그아웃" 버튼 + confirm dialog
- [ ] expired/denied/error 상태 모두 UI 처리
- [ ] 만료 카운트다운 표시
- [ ] typecheck 통과
- [ ] 새 사용자 시뮬 (codex CLI auth 없는 상태)에서 로그인 → 생성 가능
