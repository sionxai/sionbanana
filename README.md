# 시온 바나나 (Sion Banana) — 로컬 도구 버전

본인의 ChatGPT 구독 (Plus/Pro/Business/Enterprise 어느 플랜이든)으로 PC에서 직접 돌리는 AI 이미지 + 스토리보드 워크플로우 도구. Firebase / 별도 백엔드 / 별도 API 결제 없이, **Codex CLI OAuth 인증**으로 `gpt-image-2` (이미지) + `gpt-5.5` (텍스트)를 호출한다.

## 기술 스택

- Next.js 14 (App Router) + React 18 + TypeScript
- TailwindCSS + Radix UI
- React Query + Zustand
- **OAuth**: `~/.codex/auth.json`을 직접 읽어 `chatgpt.com/backend-api/codex/responses` 호출
- **데이터 저장**: 로컬 (현재는 localStorage 기반 히스토리, SQLite 통합은 후속 작업)

## 시작하기

### 사전 준비

1. **Node.js 18+** 설치
2. **Codex CLI 로그인** (한 번만):
   ```bash
   npx @openai/codex login
   ```
   브라우저가 열리면 본인의 ChatGPT 계정으로 로그인. 이후 `~/.codex/auth.json`에 토큰이 저장된다.
3. ChatGPT 구독 (Plus/Pro/Business/Enterprise 중 아무거나) 활성 상태여야 함.

### 실행

```bash
git clone <레포 URL>
cd sionbanana
npm install
npm run dev
```

`http://localhost:3000` 에서 접속.

### 환경 변수 (모두 선택)

`.env.local`에 필요 시 작성. 항목은 `.env.example` 참고.

```bash
SIONBANANA_DATA_DIR=          # 데이터 디렉토리. 비워두면 ./data
CODEX_HOME=                    # ~/.codex 외 다른 위치를 쓸 때만
CHATGPT_LOCAL_HOME=            # 보조 인증 디렉토리
CODEX_RESPONSES_ENDPOINT=      # 보통 변경 불필요
DEFAULT_TEXT_MODEL=gpt-5.5
DEFAULT_IMAGE_MODEL=gpt-5.5
```

## 동작 확인

먼저 `/api/health`를 호출해서 인증 상태를 확인:

```bash
curl http://localhost:3000/api/health
```

응답에 `codex.authenticated: true` 가 보이면 OK. `false`면 `npx @openai/codex login`을 다시 실행.

### 테스트

pure 함수 단위 테스트는 Node.js 내장 test runner로 실행한다.

```bash
npm test
```

타입 정합성은 기존 TypeScript 설정으로 확인한다.

```bash
npm run typecheck
```

## 주요 페이지

- `/studio` — 단일 이미지 생성
- `/studio/variations` — 변형 생성
- `/studio/batch` — 배치 생성
- `/studio/presets` — 프리셋 기반 생성
- `/studio/history` — 생성 기록
- `/prompt` — 스토리보드 / Sora 프롬프트 생성기
- `/presets` — 프리셋 둘러보기

## 주요 API 라우트

| 라우트 | 설명 |
|------|------|
| `POST /api/generate` | 이미지 생성 (Codex OAuth → gpt-image-2) |
| `POST /api/storyboard` | 스토리보드 텍스트 생성 (JSON / 자연어 / Sora 템플릿) |
| `POST /api/prompt` | 프롬프트 최적화 |
| `GET /api/storyboard/styles` | 영상 스타일 목록 |
| `GET /api/download` | 외부 이미지 프록시 다운로드 |
| `GET /api/health` | Codex 인증 상태 확인 |

## 약관 / 면책

- 본 도구는 **OpenAI Codex CLI의 OAuth 토큰을 직접 활용**해 ChatGPT 백엔드 API를 호출한다. 약관상 회색 영역이며, 본인 ChatGPT 계정으로 본인 PC에서만 사용할 것을 권장.
- GitHub에 공개 배포 시 OpenAI가 차단할 가능성이 있다.
- ChatGPT 구독 사용 한도 (이미지 일일 한도 등)는 OpenAI 백엔드가 강제하므로, 별도 코드에서 분기하지 않는다.

## 마이그레이션 메모

이 레포는 Firebase 기반 SaaS 시온바나나에서 로컬 단일 사용자 도구로 전환된 결과물이다. 자세한 작업 지시서는 [`REDESIGN_PLAN.md`](./REDESIGN_PLAN.md) 참고.

남은 후속 작업:
- `lib/firebase/*` stub 파일 완전 제거 (호출처 정리 후)
- SQLite 기반 영구 히스토리 (`lib/local/db.ts`, `app/api/library`, `app/api/images`)
- 약관 변경 추적 + 모델 이름 업데이트 자동화

## 라이선스

내부용. 외부 배포 시 OpenAI 약관 검토 필요.
