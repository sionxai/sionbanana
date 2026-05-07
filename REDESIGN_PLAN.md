# 시온바나나 → 로컬 단일 사용자 도구 리뉴얼 작업 지시서

> 작성일: 2026-04-30
> 목적: Firebase SaaS → 로컬 도구 (사용자 PC + ChatGPT 구독 OAuth)
> 대상: Claude Code 다음 세션

---

## 0. 결정 요약

| 항목 | 결정 |
|------|------|
| AI Provider | **Codex CLI OAuth 단독** (Gemini 삭제, OpenAI API 키도 미사용) |
| 배포 형태 | **git clone + npm start** |
| 채팅 | **제거** |
| 데이터 마이그레이션 | **새 출발** (기존 Firestore 데이터 무시) |
| 스토리보드 기능 | **유지** (텍스트 생성도 같은 OAuth 경로) |
| 요금제 분기 | **하지 않음** — Plus/Pro/Business 어느 플랜이든 동일 동작 |
| 프레임워크 | **Next.js 단일 프로젝트 유지** (Express 분리 X) |
| 데이터 저장 | 메타 = SQLite(`better-sqlite3`), 이미지 = 파일시스템, 프리셋 = 기존 JSON 재사용 |

---

## 1. 변경 범위 요약

| 분류 | 개수 |
|------|------|
| ❌ 통째로 삭제 | **약 80개 파일** |
| 🔧 부분 수정 | **약 20개 파일** |
| 🆕 신규 작성 | **5~7개 파일** |
| ✅ 그대로 유지 | UI 마크업, Tailwind, Radix, Zod 스키마, 프롬프트 빌더 함수 전부 |

---

## 2. 핵심 아키텍처 변경

### 2.1 인증 흐름 (단일)
```
사용자 PC: codex login (1회) → ~/.codex/auth.json 생성
                                        │
                                        ▼
Next.js API Route → lib/codex-oauth.ts (토큰 로드/리프레시)
                                        │
                                        ▼
fetch('https://chatgpt.com/backend-api/codex/responses', {
  headers: {
    Authorization: 'Bearer <access_token>',
    'chatgpt-account-id': '<account_id>',
    'OpenAI-Beta': 'responses=experimental'
  },
  body: { model: 'gpt-5.5', input: [...], tools: [...], stream: true }
})
                                        │
                                        ▼
SSE 스트림 파싱 → 텍스트 또는 base64 PNG 추출
```

### 2.2 데이터 흐름
```
이미지 생성 → 파일시스템 저장 (data/images/YYYY-MM/{uuid}.png)
            → SQLite INSERT (메타데이터)
            → 프론트엔드에 /api/library에서 fetch

프리셋 → presets-migration-data.json 그대로 재사용 (읽기 전용 + 사용자 추가는 SQLite)

스토리보드 스타일 → data/storyboard-styles.json (Firestore 데이터를 JSON으로 export 후 파일로 사용)
```

---

## 3. Phase별 작업 순서

### Phase 1 — Codex OAuth 모듈 신규 작성 (난이도: M, 우선순위: P0)

**신규 파일**: `lib/codex-oauth.ts`

작업 항목:
1. `~/.codex/auth.json` 후보 경로 4개 순차 검색 (`$CODEX_HOME`, `$CHATGPT_LOCAL_HOME`, `~/.codex/auth.json`, `~/.chatgpt-local/auth.json`)
2. JSON 읽기 → `{ tokens: { access_token, id_token, refresh_token, account_id } }` 추출
3. `id_token` 디코드 (JWT) → `https://api.openai.com/auth.chatgpt_account_id` 클레임에서 `account_id` 보강
4. `access_token`의 `exp` 클레임 디코드 → 5분 마진 사전 리프레시 판단
5. 만료 시 `POST https://auth.openai.com/oauth/token` (`grant_type=refresh_token`, `client_id=app_EMoamEEZ73f0CkXaXp7hrann`) 호출 → `auth.json` 다시 쓰기 (mode 0o600)
6. in-memory 캐시 (Next.js 서버 메모리)
7. **AGPL 회피를 위해 ima2-gen 의존성 사용 금지 — 약 400줄 직접 구현**

**신규 파일**: `lib/codex-fetch.ts`

핵심 함수 시그니처:
```ts
export async function callCodexResponses(input: {
  prompt?: string | Message[];
  model?: 'gpt-5.5' | 'gpt-5.4' | 'gpt-5.5';
  mode: 'text' | 'image';
  imageOptions?: { quality, size, moderation, references?: Buffer[] };
  signal?: AbortSignal;
}): Promise<{
  text?: string;
  images?: Array<{ buffer: Buffer; revisedPrompt?: string }>;
  usage?: { inputTokens: number; outputTokens: number };
}>
```

내부 구현:
- 헤더 3개 주입 (Bearer, chatgpt-account-id, OpenAI-Beta)
- 멀티모달 입력 시 `input_image` 요소로 data URL (base64) 변환
- `tools: [{ type: 'image_generation', quality, size, moderation: 'low' }]` 또는 텍스트 모드는 tools 생략
- SSE 파서: `\n\n` boundary, `event: response.output_item.done` 필터, `image_generation_call.result` 또는 `output_text.delta` 수확
- 비-스트림 폴백 지원

---

### Phase 2 — API 라우트 변환 (난이도: L, 우선순위: P0)

#### 2.1 `app/api/generate/route.ts` 🔧
**현재**: Gemini Nano + Firebase Auth + Firestore quota
**변경**:
- L80~195 (Auth/Quota 체크) **전부 삭제**
- L237~309 (Firestore 저장) **전부 삭제**
- L438~580 (Gemini API 호출) → `callCodexResponses({ mode: 'image', ... })` 한 줄
- L345~394 (`buildPrompt`) **유지**
- Zod 스키마 **유지**
- 응답 형식: `{ ok, image: { url: '/api/images/<uuid>', width, height } }`로 단순화

#### 2.2 `app/api/storyboard/route.ts` 🔧 (가장 큰 작업)
**현재**: OpenAI Chat Completions (`gpt-4o-mini`)
**변경**:
- L929~974, L1097~1108, L1153~1200 (OpenAI fetch 3곳) → `callCodexResponses({ mode: 'text', model: 'gpt-5.5' })`
- 모델명 변경: `gpt-4o-mini` → `gpt-5.5`
- 프롬프트 빌더 3개 (`buildJsonPrompt`, `buildSoraPromptV2`, `buildNaturalPrompt`) **완전 유지** (최근 1.56v 작업분 보존)
- `characterNotes` 처리 **유지**
- Zod 스키마 **유지**
- JSON Schema 응답 모드는 Codex Responses API의 `response_format` 또는 정규식 후처리로 대체

#### 2.3 `app/api/prompt/route.ts` 🔧
**현재**: OpenAI Chat Completions
**변경**:
- L38~75 (OpenAI fetch) → `callCodexResponses({ mode: 'text' })`
- `buildPromptInstruction` (L119~183) **유지**

#### 2.4 `app/api/storyboard/styles/route.ts` 🔧
**변경**: Firestore 조회 → `data/storyboard-styles.json` 읽기 (JSON 파일로 export 1회 후 파일 기반)

#### 2.5 `app/api/download/route.ts` ✅
**유지** (외부 URL 프록시, Firebase 무관)

#### 2.6 ❌ 통째 삭제
- `app/api/user/bootstrap/route.ts`
- `app/api/user/status/route.ts`
- `app/api/user/switch-plan/route.ts`
- `app/api/admin/*` (전체 15개)
- `app/api/plan/request/route.ts`
- `app/api/chat/send/route.ts`

#### 2.7 🆕 신규 라우트
- `app/api/library/route.ts` (GET/POST: 이미지 메타 페이지네이션)
- `app/api/library/[id]/route.ts` (PATCH: favorite/title, DELETE: soft/hard)
- `app/api/images/[id]/route.ts` (파일시스템에서 PNG 스트리밍)
- `app/api/health/route.ts` (Codex 인증 상태 + 데이터 디렉토리 정보)

---

### Phase 3 — Firebase 의존성 제거 (난이도: M, 우선순위: P1)

#### 3.1 `lib/firebase/*` ❌ 통째 삭제
- `admin.ts`, `client.ts`, `storage.ts`, `firestore.ts`, `rest-api.ts`
- `chat.ts`, `chat-rest-only.ts`, `chat-sdk.ts`
- `realtime-chat-sdk.ts`, `realtime-messages.ts`

#### 3.2 `lib/entitlements.ts` ❌ 삭제

#### 3.3 `lib/presets/firestore.ts`, `lib/presets/firestore-admin.ts` ❌ 삭제 → 🆕 `lib/presets/local-store.ts` 신규
- `presets-migration-data.json`을 시드로 메모리에 로드
- 사용자 추가 프리셋은 SQLite `presets` 테이블

#### 3.4 `lib/storyboard/firestore-admin.ts` ❌ 삭제 → 🆕 `lib/storyboard/local-store.ts` 신규
- `data/storyboard-styles.json` 파일 기반

#### 3.5 `lib/env.ts` 🔧 단순화
- Firebase 12개 환경 변수 → 제거
- 추가: `SIONBANANA_DATA_DIR`, `CODEX_HOME` (선택)

#### 3.6 🆕 `lib/local/db.ts` 신규
- `better-sqlite3` 초기화
- 마이그레이션 함수 (테이블: `images`, `presets`, `tags`, `image_tags`, `settings`)
- 단일 사용자라 트랜잭션 단순

#### 3.7 🆕 `lib/local/storage.ts` 신규
- `data/images/YYYY-MM/{uuid}.png` 저장/읽기
- `SIONBANANA_DATA_DIR` 환경변수 우선, 기본 `./data`

---

### Phase 4 — UI 컴포넌트 슬림화 (난이도: M~L, 우선순위: P1)

#### 4.1 `components/studio/studio-shell.tsx` 🔧 (3165줄, 가장 무거움)
- L364: `useAuth()` **제거**
- L19, 22~24: Firebase Storage/Firestore import **제거** (`uploadUserImage`, `deleteUserImage`, `saveGeneratedImageDoc`, `deleteGeneratedImageDoc`)
- L25, 922, 983, 1446, 1508, 1573, 2325, 2398, 2437, 2739: `shouldUseFirestore` 조건 **전부 제거** (true 분기만 남기지 말고, 새 로컬 API로 교체)
- ~100줄 슬림화

#### 4.2 `components/studio/generation-history-view.tsx` 🔧
- L12, 246: `useAuth()` 제거
- L15, 443, 473, 516: `shouldUseFirestore` 분기 제거
- L16~17, 485, 518: Firebase 호출 → `/api/library/[id]` PATCH/DELETE

#### 4.3 `components/studio/batch-studio-shell.tsx`, `variations-studio-shell.tsx` 🔧
- 각 ~80줄 슬림화 (Firebase 저장 로직 → 로컬 API)

#### 4.4 `components/studio/preset-library-context.tsx` 🔧
- `shouldUseFirestore` 대기 로직 **제거** → 즉시 ready

#### 4.5 `components/account/user-menu.tsx` 🔧
- 플랜/쿼터 UI 전체 삭제 → 빈 컴포넌트 또는 단순 정보 표시

#### 4.6 `components/account/account-menu.tsx` 🔧
- `useAuth`, `/api/user/status` 호출 제거

#### 4.7 ❌ 통째 삭제
- `components/auth/*` (auth-gate, login-form, register-form)
- `components/providers/auth-provider.tsx`
- `components/billing/*`
- `components/chat/*`
- `components/admin/*`

#### 4.8 ✅ 그대로 유지 (변경 0)
- `prompt-panel.tsx`, `workspace-panel.tsx`, `history-panel.tsx`
- `use-generation-coordinator.ts`, `state/generation-sm.ts`
- `history-sync.ts`, `reference-sync.ts`
- `storyboard-generator.tsx`
- `sketch-canvas.tsx`, `diff-slider.tsx`, `drag-handle.tsx`
- `components/ui/*` 전체 (Radix 기반 UI)

---

### Phase 5 — 페이지/레이아웃 정리 (난이도: S, 우선순위: P1)

#### 5.1 `app/providers.tsx` 🔧
- `AuthProvider` 제거 → `QueryClientProvider` + `ReferenceProvider` 만 남김

#### 5.2 `app/studio/layout.tsx` 🔧
- `AuthGate` 래퍼 제거

#### 5.3 ❌ 통째 삭제
- `app/account/page.tsx`
- `app/admin/*` (page, presets, chat 전체)
- `app/billing/page.tsx`
- `app/chat/page.tsx`

#### 5.4 ✅ 유지
- `app/studio/page.tsx`, `app/studio/batch/page.tsx`, `app/studio/history/page.tsx`, `app/studio/variations/page.tsx`, `app/studio/presets/page.tsx`
- `app/prompt/page.tsx`, `app/presets/page.tsx`
- `app/layout.tsx` (네비게이션 일부 정리)
- `app/page.tsx`

---

### Phase 6 — Hooks 정리 (난이도: S, 우선순위: P1)

#### 6.1 ❌ 삭제
- `use-firestore-images.ts`
- `use-storage-images.ts`
- `use-chat.ts`, `use-chat-rtdb.ts`, `use-chat-rest.ts`
- `use-admin-chats-sdk.ts`, `use-admin-chats-rtdb.ts`
- `use-user-profile.ts`

#### 6.2 🔧 수정
- `use-generated-images.ts` → 로컬 `/api/library` 호출로 변경
- `use-generate-image.ts` → 인증 헤더 제거, 응답 스키마 단순화

#### 6.3 ✅ 유지
- `use-resizable.ts`

---

### Phase 7 — 인프라 & 정리 (난이도: S, 우선순위: P2)

#### 7.1 `package.json` 🔧
**제거**:
```
- firebase
- firebase-admin
```
**추가**:
```
+ better-sqlite3
+ eventsource-parser  (SSE 파서, 신뢰성 위해)
```
**npm scripts**:
- `dev`, `build`, `start`, `lint` 유지
- `npm run setup` 신규 (SQLite 초기화 스크립트)

#### 7.2 ❌ 설정 파일 삭제
- `.firebaserc`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `cors.json`
- `vercel-env-guide.md`
- `firebase-debug.log`

#### 7.3 🆕 새 `.env.example`
```bash
# 데이터 디렉토리 (비워두면 ./data)
SIONBANANA_DATA_DIR=

# Codex 인증 파일 위치 (비워두면 ~/.codex/auth.json)
CODEX_HOME=

# 기본 모델
DEFAULT_TEXT_MODEL=gpt-5.5
DEFAULT_IMAGE_QUALITY=medium
```

#### 7.4 🔧 README 갱신
- 로컬 도구로의 변환 안내
- 설치: `git clone` → `npm install` → `npx @openai/codex login` → `npm run setup` → `npm run dev`
- 데이터 경로 안내
- 약관 회색 영역 면책 (사용자 본인 계정 한정)

#### 7.5 ❌ 마이그레이션 스크립트 삭제
- `scripts/migrate-presets.ts` (Firestore 의존)
- 단, `presets-migration-data.json` 자체는 ✅ 유지 (시드 데이터로 사용)

---

## 4. 신규 작성 파일 골격

### 4.1 `lib/codex-oauth.ts` (요지)
```ts
const AUTH_FILE_CANDIDATES = [
  process.env.CHATGPT_LOCAL_HOME && `${process.env.CHATGPT_LOCAL_HOME}/auth.json`,
  process.env.CODEX_HOME && `${process.env.CODEX_HOME}/auth.json`,
  `${homedir()}/.chatgpt-local/auth.json`,
  `${homedir()}/.codex/auth.json`,
].filter(Boolean);

const REFRESH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

let cache: { token: string; accountId: string; expiresAt: number } | null = null;

export async function getCodexAuth(): Promise<{ accessToken: string; accountId: string }> {
  if (cache && cache.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return { accessToken: cache.token, accountId: cache.accountId };
  }
  const file = await locateAuthFile();
  const data = JSON.parse(await fs.readFile(file, 'utf-8'));
  let { access_token, refresh_token, id_token, account_id } = data.tokens;
  account_id ??= decodeJwt(id_token)?.['https://api.openai.com/auth.chatgpt_account_id'];
  if (isExpiredOrSoon(access_token)) {
    ({ access_token, refresh_token } = await refreshTokens(refresh_token));
    await fs.writeFile(file, JSON.stringify({ ...data, tokens: { ...data.tokens, access_token, refresh_token } }, null, 2), { mode: 0o600 });
  }
  cache = { token: access_token, accountId: account_id, expiresAt: decodeJwt(access_token).exp * 1000 };
  return { accessToken: access_token, accountId: account_id };
}
```

### 4.2 `lib/codex-fetch.ts` (요지)
```ts
import { getCodexAuth } from './codex-oauth';

export async function callCodexResponses(opts: {
  mode: 'text' | 'image';
  model?: string;
  input: Array<{ role: string; content: any }>;
  imageOptions?: { quality?: string; size?: string };
  signal?: AbortSignal;
}) {
  const { accessToken, accountId } = await getCodexAuth();
  const tools = opts.mode === 'image'
    ? [{ type: 'image_generation', quality: opts.imageOptions?.quality ?? 'medium', size: opts.imageOptions?.size ?? '1024x1024', moderation: 'low' }]
    : undefined;

  const res = await fetch('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'chatgpt-account-id': accountId,
      'OpenAI-Beta': 'responses=experimental',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model ?? 'gpt-5.5',
      input: opts.input,
      tools,
      tool_choice: tools ? 'required' : undefined,
      reasoning: { effort: 'none' },
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok) throw new Error(`Codex error ${res.status}: ${await res.text()}`);
  return parseSSE(res.body!);
}
```

### 4.3 `lib/local/db.ts` (요지)
```ts
import Database from 'better-sqlite3';

export function openDb() {
  const db = new Database(`${dataDir()}/sionbanana.db`);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  return db;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  options TEXT NOT NULL,
  file_path TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  parent_id TEXT,
  batch_id TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  trashed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_images_created ON images(created_at DESC);
CREATE TABLE IF NOT EXISTS presets (...);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
```

---

## 5. 검증 체크리스트

Phase 1~7 완료 후 다음을 순차적으로 확인:

- [ ] `npx @openai/codex login` 후 `~/.codex/auth.json` 생성 확인
- [ ] `npm run dev` 기동 시 에러 없음
- [ ] `/api/health` 호출 → `{ ok: true, codex: { authenticated: true } }`
- [ ] 스튜디오 페이지 진입 → 로그인 게이트 없이 바로 표시
- [ ] 이미지 1장 생성 → `data/images/2026-04/{uuid}.png` 파일 생성 + SQLite INSERT
- [ ] 히스토리 페이지에서 방금 생성한 이미지 표시
- [ ] 스토리보드 생성 (자연어/JSON 두 모드 모두) → `gpt-5.5` 응답 받기
- [ ] 프롬프트 최적화 (`/api/prompt`) 동작
- [ ] 프리셋 페이지 → `presets-migration-data.json` 시드 표시
- [ ] `npm run lint` 통과
- [ ] `npm run build` 통과 (firebase 잔재 import 없음)

---

## 6. 리스크 & 완화

| 리스크 | 완화책 |
|------|------|
| Codex 비공식 endpoint 약관 위반 위험 | 시온 본인 계정으로 본인 PC에서만 사용. README에 면책 명시. GitHub 공개 시 OpenAI가 차단 가능 |
| `gpt-5.5` 모델이 Codex 플랜에 따라 다름 | 환경변수 `DEFAULT_TEXT_MODEL`로 오버라이드. 모델 이름은 Codex CLI 버전 따라 변동 가능성 |
| OpenAI가 OAuth 토큰 검증을 강화하면 깨짐 | 폴백 없음. 버전 잠금 + 변경 시 즉시 패치 정책 |
| 이미지 생성 응답 스키마 변경 | `image_generation_call.result` 키 외에 fallback (`output_image`, `image_url`) 시도하는 파서 |
| `studio-shell.tsx` 슬림화 중 회귀 | 한 commit에 한 영역만 (Firebase 제거, 그 다음 로컬 API 연결 등 단계 분리) |
| 기존 사용자 작업물 손실 | Q4=A "새 출발" 결정. 다만 시온이 보존하고 싶은 작업물 있으면 별도 export 스크립트 작성 (1회성) |

---

## 7. 작업 진행 권고

**1주차**:
- Day 1: Phase 1 (Codex OAuth 모듈) + 단위 테스트
- Day 2: Phase 2 — `app/api/storyboard/route.ts` 변환 (가장 큰 작업, 먼저 검증해야 OAuth 안정성 확인)
- Day 3: Phase 2 나머지 (`generate`, `prompt`, 신규 `library`/`images`/`health`)
- Day 4: Phase 3 (Firebase 제거 + 로컬 DB)
- Day 5: Phase 4 — `studio-shell.tsx` 슬림화

**2주차**:
- Day 6~7: Phase 4 나머지 (batch/variations, history-view)
- Day 8: Phase 5~6 (페이지/Hooks)
- Day 9: Phase 7 (인프라, README, .env)
- Day 10: 검증 체크리스트 + 회귀 테스트

---

## 8. 참고 자료

- [openai/codex (공식)](https://github.com/openai/codex)
- [lidge-jun/ima2-gen (참고용 — AGPL이라 의존 X, 패턴만 차용)](https://github.com/lidge-jun/ima2-gen)
- [Simon Willison — GPT-5.5 via Codex backdoor API](https://simonwillison.net/2026/Apr/23/gpt-5-5/)
- [vnt87/codex-api-endpoint](https://github.com/vnt87/codex-api-endpoint)
