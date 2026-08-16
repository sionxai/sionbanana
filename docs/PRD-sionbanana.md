# 시온바나나(Sion Banana) — 구현 계약서(PRD)

> **문서 상태: 보조 구현 명세(Supplemental) · 비정본(Non-canonical).** CEO 보존 브랜치
> `claude/ceo-skill-check-e77efc`의 `aab16778`에서 생성되어 `597bde4d`까지 보존된 원본을
> SB WO-003 canonical 후보에 회수했다. 전략·우선순위·현재 상태·완료 판정은
> `docs/COMPANY.md`와 `docs/WORK_ORDERS.md`가 우선하며, 실제 구현 계약은 추적된 현재 코드와
> 승인된 개별 작업지시를 함께 대조한다. 이 문서의 [가정]/[확인필요]만으로 새 구현에
> 착수하지 않는다.

---

## 1. 프로젝트 개요

**한 줄 설명:** ChatGPT(Codex) 계정 자격으로 gpt-image를 호출하여, **캐릭터·장소·오브젝트 레퍼런스 시트로 일관성을 고정한 채 시나리오 키프레임(스토리보드)을 대량 생성**하는 로컬 우선 이미지 제작 스튜디오.

**누구를:** 영상/숏폼 콘텐츠 제작자, AI 영상 강사, 스토리보드·콘티 작가 (1인 제작 워크플로우).

**왜:** 일반 이미지 생성 도구는 (a) 컷마다 인물·공간·소품 외형이 새로 그려져 **일관성이 무너지고**, (b) 12~24컷 시나리오를 한 번에 일관되게 뽑는 파이프라인이 없으며, (c) 결과물을 씬별로 정리·검수하는 흐름이 없다. 시온바나나는 레퍼런스 고정 + 일괄 생성 + 씬별 정리/검수를 하나의 도구로 묶는다.

**핵심 플로우(요약):**
`Codex 로그인 → 레퍼런스 시트 생성/업로드 → 단일·병렬 탐색 → 스토리보드 spec 작성 → 일괄 생성(run) → 전수 검수 → 씬별 정리(organize)/업스케일/딜리버리`

**제품 형태:** 로컬에서 실행하는 단일 사용자 웹앱(Next.js) + 보조 CLI(`scripts/*.mjs`) + MCP 서버. 기존 코드베이스를 **재구현 가능한 수준으로 명세**한다.

---

## 2. 목표와 비목표

### Goals (P0)
- G1. Codex OAuth 1회 로그인으로 gpt-image 생성을 호출한다(별도 API 키 입력 없이 ChatGPT 구독 자격 사용).
- G2. 단일 프롬프트 생성 + 동일 프롬프트 N장 병렬 배치(기본 동시성 4) 생성.
- G3. 캐릭터/장소/오브젝트 레퍼런스 이미지를 업로드·연결(referenceGallery)하여 인물·공간 일관성을 유지.
- G4. 스토리보드 spec(JSON) → 일괄 생성(run) → 씬별 폴더 + index.html 정리(organize) 파이프라인.
- G5. 모든 생성 결과를 로컬 파일시스템에 영구 저장(프롬프트 사이드카 포함)하고 갤러리/히스토리에서 재사용.

### 기능 Non-Goals
- NG-F1. **멀티 테넌트 SaaS·회원가입·과금 시스템을 만들지 않는다.** (단일 로컬 사용자 전제 — 11번 [확인필요-차단])
- NG-F2. **이미지 편집기(레이어·마스크·인페인트 UI)를 만들지 않는다.** 생성·업스케일·참조 연결까지만 다룬다.
- NG-F3. **실시간 협업/공유 링크/댓글을 만들지 않는다.** 결과물은 로컬 파일/HTML로만 전달한다.

### 디자인 Non-Goals
- NG-D1. 그라데이션 배경·네온 글로우 금지. 단색 surface만 사용.
- NG-D2. 다중 그림자 중첩(shadow 남발) 금지. 토큰에 정의된 elevation 2단계만 사용.
- NG-D3. 이모지 장식·일러스트 아이콘 혼용 금지. 아이콘은 `lucide-react` 단일 세트만.

---

## 3. 기술 스택 & 구현 제약

### 3.1 스택 (버전 고정 — "최신" 금지)
| 영역 | 패키지 | 버전 | 이유 / 대안(제외) |
|---|---|---|---|
| 프레임워크 | `next` | `14.2.5` | App Router + Route Handler로 생성 API와 UI를 한 프로젝트에. 대안 Next 15.x 제외(현 코드 14.2.5 고정) |
| 런타임 | `react`,`react-dom` | `18.3.1` | Next 14.2.5 호환 |
| 언어 | `typescript` | `^5.4.5` | strict 타입. `any` 금지(25번) |
| 스타일 | `tailwindcss` | `^3.4.4` | 토큰 기반 유틸. 대안 CSS-in-JS 제외(빌드 단순화) |
| 애니메이션 | `tailwindcss-animate` | `^1.0.7` | 토큰화된 모션만 |
| UI 프리미티브 | `@radix-ui/react-*` | avatar `^1.0.3`, label `^2.0.2`, scroll-area `^1.0.5`, slot `^1.0.2`, tabs `^1.1.13`, toggle-group `^1.1.11` | 접근성 내장 |
| 서버상태 | `@tanstack/react-query` | `^5.45.0` | 생성/갤러리 캐싱·재시도 |
| 검증 | `zod` | `^3.23.8` | client+server 공통 스키마(15번) |
| 토스트 | `sonner` | `^1.4.2` | 성공/실패 알림(17번) |
| 아이콘 | `lucide-react` | `^0.381.0` | 단일 아이콘 세트 |
| 클래스 | `clsx` `^2.1.1`, `tailwind-merge` `^2.2.2`, `class-variance-authority` `^0.7.0` | — | 변형 스타일 |
| MCP | `@modelcontextprotocol/sdk` | `^1.29.0` | 외부 세션에서 도구 호출 |

devDeps: `eslint 8.57.1`, `eslint-config-next 14.2.5`, `@types/node ^20.14.9`, `@types/react ^18.3.3`, `postcss ^8.4.38`, `autoprefixer ^10.4.19`.

### 3.2 배포
- **로컬 단일 머신** 실행 기본(`next dev`/`next start`, 포트 `3002`). [가정] — SaaS 배포(Vercel 등) 아님. 근거: Codex OAuth 자격과 로컬 파일 저장에 의존. 변경 시 11번 [확인필요-차단] 참조.

### 3.3 환경변수 표
| 변수명 | 용도 | 필수 | 예시값 | 클라이언트 노출 |
|---|---|---|---|---|
| `SIONBANANA_DATA_DIR` | 생성물·인증 저장 루트 | 아니오(기본 `./data`) | `/Users/me/sionbanana-data` | 불가 |
| `CHATGPT_LOCAL_HOME` | Codex CLI `auth.json` 위치 | 아니오 | `~/.codex` | 불가 |
| `CODEX_HOME` | Codex 홈 경로 | 아니오 | `~/.codex` | 불가 |
| `CODEX_RESPONSES_ENDPOINT` | 이미지/텍스트 생성 엔드포인트 | 아니오(기본값 내장) | `https://...` | 불가 |
| `CODEX_USAGE_ENDPOINT` | 사용량 조회 | 아니오 | `https://...` | 불가 |
| `DEFAULT_IMAGE_MODEL` | 기본 이미지 모델 | 아니오 | `gpt-image` | 불가 |
| `DEFAULT_TEXT_MODEL` | 기본 텍스트(프롬프트 보정) 모델 | 아니오 | `gpt-5.5` | 불가 |
| `OPENAI_API_KEY` | API 키 대체 경로(OAuth 미사용 시) | 아니오 | `sk-...` | 불가 |
| `GEMINI_API_KEY` | 보조 생성 백엔드 | 아니오 | `AI...` | 불가 |
| `SIONBANANA_GROK_PROXY` | 영상 생성 프록시(P2) | 아니오 | `http://...` | 불가 |

> **모든 비밀값은 서버 전용.** `NEXT_PUBLIC_` 접두사 사용 금지(클라이언트 노출 불가). API URL 하드코딩 금지(25번) — 전부 `lib/env.ts` 경유.

### 3.4 명령어
```bash
npm run dev         # 개발 서버 (localhost:3002)
npm run build       # 프로덕션 빌드
npm run start        # 프로덕션 실행
npm run lint         # next lint + scripts ESLint
npm run typecheck    # tsc --noEmit
npm run test         # node --test (tests/**, test/**)
```

### 3.5 파일 구조 (디렉터리 트리 + 책임)
```
app/
  (pages)/ ...                # 화면(서버/클라 컴포넌트). 비즈니스 로직 직접 작성 금지
  studio/ batch/ characters/ story/ history/ presets/ variations/
  prompt/ presets/ usage/ auth/
  api/                       # Route Handler (얇은 어댑터: 검증→lib 호출→응답)
    generate/  images/[id]/  story-references/
    storyboard/  story/storyboard/  storyboard/styles/
    prompt/  download/  usage/  health/
    auth/{device-start,device-poll,status,logout}/
    video/  videos/[id]/      # 영상(P2)
lib/                          # 모든 비즈니스 로직 (서버)
  codex-oauth.ts              # device flow·토큰 갱신·auth.json 로드
  codex-fetch.ts              # Codex responses 호출 래퍼
  env.ts constants.ts types.ts
  local/storage.ts           # data/images 저장·조회(파일+JSON 사이드카)
  characters.ts character-mentions.ts   # 캐릭터 라이브러리·@handle 치환
  story-references.ts story-projects.ts story-mentions.ts
  story-tones.ts story-cinematography.ts camera.ts aspect.ts
  image-resize.ts concurrency.ts history-records.ts
  storyboard/types.ts presets/*
components/ui/                # 디자인 토큰 기반 프리미티브(버튼·입력·카드·모달·토스트)
scripts/                      # 보조 CLI (UI와 동일 lib 재사용)
  agent-generate.mjs storyboard.mjs mcp-server.mjs check-coverage.mjs
data/ (= SIONBANANA_DATA_DIR) # 런타임 산출물(.gitignore)
  images/<YYYY-MM>/<id>.png + <id>.json
  agent-runs/<ISO>-<slug>/{manifest.json,review.html,images/}
  storyboard/<project>/{spec.json,summary.json,scene-N/,index.html}
  codex-auth.json
tests/  test/                 # node:test
```
**규칙:** Route Handler·컴포넌트에 fetch/DB/파일 로직 직접 작성 금지. 전부 `lib/`로 분리하고 어댑터만 둔다.

---

## 4. 데이터 모델 / 스키마

저장소는 **로컬 파일시스템 + JSON 사이드카**(전통 RDB 아님). 아래는 논리 엔티티. [확인필요-차단] 멀티유저 전환 시 동일 스키마를 DB 테이블로 승격(임시기준: 파일 기반).

| 엔티티 | 필드 | 타입 | 필수 | 기본값 | 제약/enum | 인덱스 | 관계 | PII | 설명 |
|---|---|---|---|---|---|---|---|---|---|
| **ImageRecord** | id | string(cuid류) | Y | 생성 | 고유 | 파일명 | — | N | 생성 이미지 |
| | bucket | string | Y | `YYYY-MM` | `^\d{4}-\d{2}$` | 디렉터리 | — | N | 월별 버킷 |
| | ext | enum | Y | `png` | `png\|jpg\|webp` | — | — | N | 확장자 |
| | rawPrompt | string | Y | `""` | ≤8000자 | — | — | N | 사용자 입력 |
| | refinedPrompt | string | N | `""` | ≤8000자 | — | — | N | 모델 보정본 |
| | params | json | N | `{}` | quality/size/aspect/count | — | — | N | 생성 파라미터 |
| | reference | json | N | `null` | `{primary, gallery[]}` /api/images/<id> | — | →ImageRecord | N | 참조 연결 |
| | createdAt | ISO string | Y | now | — | 정렬키 | — | N | |
| **AgentRun** | dir | string | Y | `<ISO>-<slug>` | 고유 | 디렉터리 | →ImageRecord[] | N | CLI 실행 단위 |
| | slug,category | string | Y | — | slug `^[a-z0-9-]+$` | category 그룹 | — | N | |
| | manifest | json | Y | — | prompt/params/reference/imageUrl | — | — | N | review.html 생성 근거 |
| **Character** | id | string | Y | 생성 | 고유 | — | →ImageRecord | N* | 재사용 캐릭터 |
| | name | string | Y | — | 1~40자 | — | — | N* | 표시명 |
| | handle | string | Y | — | `^[\w가-힣]{1,20}$` 고유 | 유니크 | — | N* | `@handle` 멘션 키 |
| | imageId | string | Y | — | ImageRecord.id | — | →ImageRecord | N* | 참조 이미지 |
| | tags | string[] | N | `[]` | — | — | — | N | 필터용 |
| **StoryReference** | id | string | Y | 생성 | 고유 | — | →ImageRecord | N | 업로드 참조 시트 |
| | imageUrl | string | Y | `/api/images/<id>` | — | — | →ImageRecord | N | |
| **StoryboardProject** | name | string | Y | — | 고유 | 디렉터리 | →Cut[] | N | spec 단위 |
| | spec | json | Y | — | title/outDir/defaults/scenes[].cuts[] | — | — | N | 생성 계약 |
| **AuthSession** | accountId | string | Y | — | — | — | — | **Y** | Codex 계정 ID |
| | tokens | json | Y | — | access/id/refresh | — | — | **Y** | 절대 로그·클라 노출 금지 |
| | expiresAt | number(ms) | Y | — | — | — | — | Y | 갱신 트리거 |

- **공통:** ImageRecord/AgentRun/Character/StoryReference는 `id`(또는 dir)·`createdAt` 보유. `updatedAt`은 Character·StoryboardProject만(가변).
- **삭제정책:** ImageRecord/AgentRun = **hard delete**(파일 삭제, 복원 불가 — 삭제 전 확인모달 P0). Character = **soft delete**(`deletedAt` 플래그, 갤러리에서 숨김).
- **소유:** 단일 사용자 전제이므로 `ownerId` 생략. 멀티유저 전환 시 전 엔티티에 `userId` 추가([확인필요-차단]).
- **PII:** AuthSession.tokens/accountId만 민감. Character.name이 실명일 수 있어 N* 표기(로그 출력 시 마스킹 권장).

---

## 5. 기능 명세

### F1. Codex 로그인 (P0)
- **User Story:** 사용자로서, 별도 API 키 없이 ChatGPT 계정으로 로그인해 생성 자격을 얻고 싶다.
- **GWT:** *Given* 비인증 상태, *When* `/auth`에서 "ChatGPT로 로그인" 클릭, *Then* device flow 코드 표시 → 브라우저 인증 → `codex-auth.json` 저장 → `/studio`로 이동.
- **실패:** 인증 미완료 60초 → "인증이 완료되지 않았습니다. 다시 시도하세요"; 토큰 만료 → 자동 refresh, 실패 시 재로그인 유도.

### F2. 단일 이미지 생성 (P0)
- **User Story:** 프롬프트와 옵션(품질·사이즈·종횡비·참조)을 주고 이미지 1장을 생성한다.
- **GWT:** *Given* 인증·프롬프트 입력, *When* "생성", *Then* 로딩 표시 → 60~120초 내 결과 1장 → 갤러리·히스토리에 저장 + 성공 토스트.
- **실패:** 빈 프롬프트 → 버튼 비활성화; 502(모델 무응답) → "생성에 실패했습니다(코드 표시). 재시도" + 재시도 버튼; 안전필터 거부 → "이 요청은 생성할 수 없습니다. 표현을 완화하세요" 안내.

### F3. 병렬 배치 생성 (P0)
- **User Story:** 같은 프롬프트로 N장(예 10장)을 동시에 탐색한다.
- **GWT:** *Given* batch=N·동시성 C(기본 4), *When* "배치 생성", *Then* 진행률(완료/전체) 표시 → 성공분 갤러리 적재 → 카테고리 index 자동 생성.
- **실패:** 일부 컷 실패 시 부분 성공 허용(예 8/10), 실패분만 재시도 버튼. 동시성>4는 rate limit 경고.

### F4. 레퍼런스 연결 (P0)
- **User Story:** 캐릭터/장소/오브젝트 시트를 업로드하거나 기존 이미지를 골라 생성에 참조로 건다.
- **GWT:** *Given* 참조 1~5개 선택, *When* 생성, *Then* `reference.gallery`로 전달되어 인물·공간 외형이 유지된 결과 생성.
- **실패:** 업로드 10MB 초과 → 거부 문구; 지원 외 포맷(png/jpg/webp 아님) → 거부.

### F5. 스토리보드 파이프라인 (P0)
- **User Story:** spec(JSON)으로 다씬·다컷을 한 번에 생성하고 씬별로 정리한다.
- **GWT:** *Given* 유효한 spec, *When* run, *Then* 컷별 2K 이미지 생성 → summary 산출; *When* organize, *Then* `outDir/scene-N/<slug>_v1.png` + `index.html`(스토리라인·대사·카메라 캡션) 생성.
- **실패:** spec 검증 실패 → 어느 컷·필드인지 명시; 일부 컷 실패 → summary에 실패 표기, 부분 재생성 후 병합 가능.

### F6. 캐릭터 라이브러리 (P1)
- **User Story:** 자주 쓰는 캐릭터를 핸들로 등록해 프롬프트에서 `@핸들`로 호출한다.
- **GWT:** *Given* 등록된 캐릭터, *When* 프롬프트에 `@민수`, *Then* 매칭 이미지가 참조 슬롯에 자동 첨부.

### F7. 업스케일 (P1)
- **User Story:** 선택한 결과를 2K(2048×1152)로 확정한다.
- **GWT:** *Given* 원본 run, *When* 업스케일, *Then* manifest의 프롬프트·참조를 재사용해 고해상 재생성.

### F8. 사용량 조회 (P2) / F9. 영상 생성(Grok) (P2)
- 사용량: Codex usage 엔드포인트 표시. 영상: 프록시 경유 image-to-video(외부 의존, 기본 비활성).

---

## 6. 화면 / 라우팅

브레이크포인트(px 고정): `sm 640 / md 768 / lg 1024 / xl 1280`. **데스크톱 우선**(제작 도구), md 미만은 단일 컬럼 축약.

| 경로 | 역할 | 핵심 컴포넌트 | 4상태 | 반응형 |
|---|---|---|---|---|
| `/auth` | 비인증 | DeviceLoginCard | 로딩(코드발급)/빈(미시작)/에러(만료)/성공(리다이렉트) | 1컬럼 고정 420px |
| `/studio` | 인증 | PromptForm, OptionBar, ResultGrid, ReferencePicker | 로딩(스피너+예상시간)/빈("프롬프트를 입력하세요")/에러(토스트+재시도)/성공(그리드) | ≥lg 2컬럼(폼+결과), <lg 세로 스택 |
| `/studio/batch` | 인증 | BatchForm, ProgressBar, ResultGrid | 로딩(N/총 진행률)/빈/에러(부분실패 목록)/성공 | 동일 |
| `/studio/characters` | 인증 | CharacterGrid, RegisterModal, TagFilter | 로딩(스켈레톤)/빈("등록된 캐릭터 없음")/에러/성공 | 그리드 2→3→4열(md→lg→xl) |
| `/studio/story` | 인증 | SpecEditor, RunPanel, SceneAccordion | 로딩(컷별 진행)/빈(spec 없음)/에러(검증 메시지)/성공(index 링크) | ≥lg 편집기+미리보기 2분할 |
| `/studio/history` | 인증 | HistoryList(무한스크롤) | 로딩/빈("생성 기록 없음")/에러/성공 | 리스트 1열, 카드 그리드 옵션 |
| `/studio/presets`,`/prompt`,`/presets` | 인증 | PromptCatalog(434 항목 검색·태그) | 로딩/빈(검색결과 0)/에러/성공 | 그리드 |
| `/usage` | 인증 | UsagePanel | 로딩/빈/에러/성공 | 1열 |

### 6.1 폼 입력 표 — `/studio` PromptForm
| 필드 | 타입 | placeholder | 기본값 | 필수 | 검증규칙 | 에러문구 | 비활성화조건 |
|---|---|---|---|---|---|---|---|
| prompt | textarea | "장면을 묘사하세요…" | `""` | Y | 1~8000자 | "프롬프트는 1자 이상 8000자 이하" | 생성 중 |
| quality | select | — | `medium` | Y | `low\|medium\|high\|auto` | — | 생성 중 |
| size | select | — | `2k-16:9` | N | 사전 정의 토큰만 | "지원하지 않는 사이즈" | 생성 중 |
| count | select | — | `1` | Y | `1\|2\|4` | — | 생성 중 |
| references | picker | — | `[]` | N | 0~5개, 각 ≤10MB, png/jpg/webp | "참조는 최대 5개·각 10MB" | 생성 중 |

### 6.2 UI 카피 표(발췌)
| 위치 | 상황 | 문구 | 버튼 |
|---|---|---|---|
| /auth | 인증 대기 | "브라우저에서 인증을 완료하세요. 코드: {code}" | 취소 |
| /studio | 빈 결과 | "아직 생성한 이미지가 없습니다." | 생성 |
| 토스트 | 생성 성공 | "이미지 1장을 생성했습니다." | — |
| 토스트 | 생성 실패 | "생성에 실패했습니다 ({code}). 다시 시도하세요." | 재시도 |
| 토스트 | 안전필터 | "이 요청은 생성할 수 없습니다. 표현을 완화해 주세요." | — |
| 모달 | 삭제 확인 | "이미지를 삭제하면 복구할 수 없습니다. 삭제할까요?" | 삭제 / 취소 |

---

## 7. API 명세

베이스: 동일 오리진(`/api/*`). 모든 응답 JSON. 인증=Codex 세션(쿠키/서버 보관 토큰) 유효성.

| 메서드 | 경로 | 인증 | 권한 | 요청 | 성공(코드) | 실패(코드) |
|---|---|---|---|---|---|---|
| GET | `/api/health` | 불필요 | any | — | `{ok,version,codex:{authenticated,accountId,expiresAt},defaults}` (200) | — |
| POST | `/api/auth/device-start` | 불필요 | any | — | `{device_code,user_code,verification_uri,expires_in}` (200) | 502 |
| POST | `/api/auth/device-poll` | 불필요 | any | `{device_code}` | `{ok:true}`/`{ok:false,pending:true}` (200) | 400/410(만료) |
| GET | `/api/auth/status` | 불필요 | any | — | `{authenticated:boolean}` (200) | — |
| POST | `/api/auth/logout` | 필요 | self | — | `{ok:true}` (200) | 401 |
| POST | `/api/generate` | 필요 | self | `GenerateBody`(아래) | `{ok,images:[{id,imageUrl}],revisedPrompt}` (200) | 400/401/429/502 |
| GET | `/api/images` | 필요 | self | `?cursor&limit&bucket&sort` | `{ok,items:[ImageItem],nextCursor}` (200) | 401 |
| GET | `/api/images/[id]` | 필요 | self | — | image/png 바이너리 (200) | 404 |
| DELETE | `/api/images/[id]` | 필요 | self | — | `{ok:true}` (200) | 401/404 |
| POST | `/api/story-references` | 필요 | self | `{imageBase64,mime}` | `{ok,imageUrl,id}` (200) | 400(10MB/포맷) |
| POST | `/api/storyboard` | 필요 | self | `{spec}` 또는 jobs | `{ok,jobs:[...]}` (200) | 400/502 |
| GET | `/api/storyboard/styles` | 필요 | self | — | `{styles:[...]}` (200) | 401 |
| POST | `/api/prompt` | 필요 | self | `{rawPrompt,context}` | `{refinedPrompt}` (200) | 400/502 |
| GET | `/api/download` | 필요 | self | `?id` | 파일 다운로드 (200) | 404 |
| GET | `/api/usage` | 필요 | self | — | `{usage:{...}}` (200) | 401/502 |

### 7.1 GenerateBody (TS)
```ts
type GenerateBody = {
  prompt: string;                       // 1..8000
  options?: {
    quality?: "low"|"medium"|"high"|"auto"; // 기본 medium
    imageSize?: string;                 // "2k-16:9" 등 토큰 → 서버에서 px 매핑
    aspectRatio?: string;               // "16:9"|"9:16"|"1:1"|"original"
    count?: 1|2|4;                      // 기본 1
  };
  referenceImageUrl?: string;           // /api/images/<id>
  referenceGallery?: string[];          // 최대 5, /api/images/<id>
  idempotencyKey?: string;              // 중복요청 방지
};
```

### 7.2 공통 에러 포맷 (고정)
```json
{"error":{"code":"VALIDATION_ERROR","message":"프롬프트는 1자 이상이어야 합니다.","fields":{"prompt":"required"}}}
```
코드 enum: `VALIDATION_ERROR`(400) · `UNAUTHENTICATED`(401) · `RATE_LIMITED`(429) · `UPSTREAM_NO_IMAGE`(502) · `NOT_FOUND`(404) · `PAYLOAD_TOO_LARGE`(413).

### 7.3 목록(`/api/images`) 규칙
- **pagination:** cursor 기반(`createdAt` 역순), `limit` 기본 30·최대 100.
- **sorting:** `sort=created_desc`(기본)`|created_asc`.
- **filtering:** `bucket=YYYY-MM`.
- **빈 결과:** `{ok:true,items:[],nextCursor:null}` (200). 에러 아님.

---

## 8. 상태 · 엣지케이스 · 에러처리

### 8.1 상태 5종
| 종류 | 대상 | 관리 방식 |
|---|---|---|
| 서버 상태 | 갤러리·히스토리·usage·생성결과 | TanStack Query(키별 캐시·재시도1·staleTime 30s) |
| 클라 UI 상태 | 모달 open·선택셀·진행률 | `useState`/`useReducer`(컴포넌트 로컬) |
| 폼 상태 | 프롬프트·옵션 | 제어 컴포넌트 + zod resolver |
| URL 상태 | 탭·필터·bucket·cursor | searchParams(`?bucket=&sort=`) — 새로고침/공유 시 복원 |
| 인증 상태 | 로그인 여부·만료 | 서버 세션(`/api/auth/status`) + Query, 만료 시 자동 refresh |

### 8.2 엣지케이스
- **권한 없음(비인증):** API 401 → 클라 `/auth` 리다이렉트. 화면은 인증 가드로 숨김 + 서버 재검증(필수).
- **네트워크 실패:** Query 재시도 1회 후 에러 상태 + 재시도 버튼.
- **빈 데이터:** 각 화면 빈상태 문구(6.2).
- **중복 요청:** `idempotencyKey`로 동일 본문 재요청 무시(같은 키 다른 본문 → 400).
- **동시성:** 배치/스토리보드 동시성 상한 `min(16, cpu-2)`, UI 기본 4. 초과분 큐잉.
- **재시도:** 502/429/503/504/timeout만 자동 재시도(`--retry`), 그 외(400 등)는 즉시 실패.
- **안전필터 반복 502:** 동일 컷 3회 연속 502 → "생성 거부(콘텐츠 정책)" 분기 안내, 무한 재시도 금지.

---

## 9. 인증 · 권한 · 보안

### 9.1 권한 매트릭스 (역할: `비인증` / `인증된 로컬 사용자`)
| 리소스 | 비인증(화면) | 비인증(API) | 인증(화면) | 인증(API) |
|---|---|---|---|---|
| `/auth` | 보임 | device-* 허용 | 리다이렉트→/studio | — |
| `/studio*`,`/usage` | 숨김→/auth | 401 | 보임 | self 허용 |
| `/api/generate`,`/images`,`/story-references`,`/storyboard` | — | 401 | — | self 허용 |
| `/api/images/[id]` DELETE | — | 401 | 확인모달 후 | self 허용 |

> 단일 사용자 전제로 역할은 2종. [확인필요-차단] 멀티유저면 `owner/admin` 추가 + 전 API에 `userId` 소유검증.

### 9.2 보안 규칙
- **토큰 저장:** Codex 토큰은 **서버 파일(`codex-auth.json`)에만** 저장. 클라이언트로 전송·`localStorage` 저장 금지. 화면엔 `authenticated`,`accountId`만 노출.
- **CSRF:** 상태 변경 API(POST/DELETE)는 same-origin 검사 + (쿠키 세션 사용 시) CSRF 토큰.
- **CORS:** 동일 오리진만 허용. 와일드카드 금지.
- **rate limit:** `/api/generate` 사용자당 동시 4, 분당 상한 설정(429 반환).
- **업로드 제한:** `/api/story-references` ≤10MB, mime `image/png|jpeg|webp`만(서버 재검증).
- **로그:** 토큰·base64 이미지·accountId를 로그에 출력 금지. 에러 로그는 코드·요약만.
- **서버 권한 재검증:** 모든 보호 API는 클라 가드와 무관하게 서버에서 인증 재확인(클라 전용 권한검증 금지).

### 9.3 접근성 (WCAG 2.2 AA)
- 전 인터랙션 키보드 도달, `:focus-visible` 2px 아웃라인.
- 아이콘 전용 버튼 `aria-label` 필수(예: 삭제, 다운로드).
- 상태를 색으로만 전달 금지(성공/실패는 아이콘+텍스트 동반).
- 대비: 본문 4.5:1, 큰 텍스트/아이콘 3:1(토큰 검증, 12.2).

---

## 10. 테스트 계획 & 완료의 정의

### 10.1 테스트 표
| 레벨 | 대상 | 도구 | 예 |
|---|---|---|---|
| 단위 | zod 스키마, size 토큰 매핑, concurrency, character-mentions | node:test | `2k-16:9→2048x1152` 매핑 |
| 통합 | `/api/generate` 검증·에러포맷, `/api/images` pagination | node:test + mock Codex | 빈 프롬프트→VALIDATION_ERROR |
| E2E | 로그인→생성→갤러리, 스토리보드 run→organize | (Playwright 권장, P1) | 아래 GWT |
| 접근성 | 폼·모달 키보드·aria | axe(P1) | 모달 포커스 트랩 |
| API 계약 | 공통 에러포맷 일관성 | 스냅샷 | 모든 4xx가 `{error:{code,message}}` |

**E2E (Given-When-Then):**
- *Given* 인증된 사용자가 `/studio`, *When* 프롬프트 입력 후 생성, *Then* 결과 1장이 그리드에 보이고 `/studio/history`에 기록된다.
- *Given* 유효한 spec, *When* run 후 organize, *Then* `outDir/scene-*/`에 컷 수만큼 PNG와 `index.html`이 생성된다.

### 10.2 DoD 체크리스트 (사람이 체크 가능)
- [ ] 비인증 상태로 `/studio` 접근 시 `/auth`로 리다이렉트된다.
- [ ] ChatGPT 로그인 후 프롬프트 1건이 60~120초 내 1장 생성되어 갤러리에 보인다.
- [ ] 동일 프롬프트 batch=4가 부분 실패해도 성공분이 저장되고 실패분 재시도 버튼이 보인다.
- [ ] 참조 5개 초과 또는 10MB 초과 업로드가 거부 문구와 함께 막힌다.
- [ ] spec run→organize가 씬별 폴더 + 대사·카메라 캡션이 있는 index.html을 만든다.
- [ ] 모든 4xx 응답이 `{error:{code,message}}` 포맷이다.
- [ ] 토큰/이미지 base64가 클라이언트·로그 어디에도 노출되지 않는다.
- [ ] 모든 아이콘 버튼에 aria-label이 있고 키보드로 조작된다.
- [ ] `npm run typecheck`·`npm run lint`·`npm run test`가 통과한다.

---

## 11. 명시적 가정 & 미결정

### [가정] (임시 구현 기준 = 즉시 구현)
- A1. **단일 사용자 로컬 도구**로 구현(회원/멀티테넌트 없음). 근거: Codex OAuth·로컬 파일 의존. 변경 시 데이터 모델·권한 전반 영향(차단 Q1).
- A2. 저장은 **파일시스템 + JSON 사이드카**(DB 없음). 변경 시 4번 스키마를 DB로 승격.
- A3. 디자인은 **다크 스튜디오 톤**(12번). 근거: 기존 index/review HTML이 `#15181d` 계열 다크. 자산 제공 시 교체.
- A4. 기본 해상도 **2K(2048×1152)**, 탐색은 1.9K 허용. 근거: 딜리버리 품질 기준.

### [확인필요-차단] (답 없으면 구조가 크게 바뀜 — 단, 임시기준으로 구현 진행)
- Q1. **단일 로컬 사용자 vs 멀티유저 SaaS?** → 임시기준 A1(단일). 멀티유저면 인증·`userId` 소유검증·DB 도입 필요.
- Q2. **생성 백엔드 우선순위(Codex OAuth vs OPENAI_API_KEY vs Gemini)?** → 임시기준: Codex OAuth 우선, 미인증 시 `OPENAI_API_KEY` 폴백, Gemini 비활성.
- Q3. **이미지 hard delete 정책 유지?** → 임시기준: hard delete + 확인모달. (감사/휴지통 필요 시 soft로 전환)

### [확인필요-비차단] (기본값으로 구현 가능)
- Q4. Next 14.2.5 고정 유지 vs 15.x 업그레이드 → 임시기준: 14.2.5 유지.
- Q5. E2E 도구(Playwright) 채택 여부 → 임시기준: P1로 Playwright.
- Q6. 영상 생성(Grok) 활성화 → 임시기준: 비활성(P2, 프록시 미설정 시 메뉴 숨김).
- Q7. 사용량 화면 표시 항목 범위 → 임시기준: Codex usage 원본 그대로 표시.

---

## 12. 디자인 시스템 & 톤앤매너

> 자산 미제공 → 12.1~12.7은 [가정](A3). 기존 산출물 HTML의 다크 팔레트를 근거로 토큰화.

### 12.1 브랜드 톤
- 무드 키워드: **집중(Focused) · 정밀(Precise) · 무대 뒤(Backstage)**.
- 레퍼런스 제품: Linear(정보 밀도·다크), Vercel 대시보드(절제된 뉴트럴).
- 금지 톤: 화려한 그라데이션·네온·플레이풀 이모지·스큐어모픽.

### 12.2 컬러 토큰
| 토큰 | HEX | 용도 | 금지용도 | 대비검증 |
|---|---|---|---|---|
| `--background` | `#0F1115` | 앱 배경 | 텍스트 | — |
| `--surface` | `#15181D` | 카드·패널 | 본문 텍스트 | 대비 기준面 |
| `--border` | `#23262D` | 구분선·입력 테두리 | 텍스트 | — |
| `--text` | `#E6E9EE` | 본문 | 배경 | vs background 13:1 ✅ |
| `--muted` | `#8A9099` | 보조 텍스트 | 본문 강조 | vs background 4.6:1 ✅(본문 최소 충족) |
| `--primary` | `#3EC47A` | 주요 액션·성공 강조 | 큰 면적 배경 | vs surface 5.2:1 ✅ |
| `--secondary` | `#5B8DEF` | 보조 액션·링크 | 위험 표시 | vs surface 4.8:1 ✅ |
| `--success` | `#3EC47A` | 성공 | danger | 텍스트+아이콘 동반 |
| `--warning` | `#E0B341` | 경고 | 성공 | 텍스트+아이콘 동반 |
| `--danger` | `#E5564E` | 삭제·실패 | 성공 | vs surface 4.5:1 ✅ |
> 금지(25번): 토큰 외 임의 HEX·inline style 사용 금지. 색만으로 상태 전달 금지.

### 12.3 타이포그래피
- 서체: 시스템 스택 `-apple-system, "Pretendard", "Noto Sans KR", system-ui, sans-serif`(한글 우선). 코드/슬러그: `ui-monospace, SFMono-Regular, Menlo`.
- px 스케일: `12 / 13 / 14(본문) / 16 / 18 / 20 / 24 / 28`.
- 행간: 본문 1.6, 캡션 1.45, 제목 1.2. 자간: 제목 `-0.01em`, 본문 0. 굵기: 400/500(라벨)/600(제목).

### 12.4 레이아웃
- **8px 그리드**(보조 4px). spacing 토큰: `4,8,12,16,24,32,48`.
- 컨테이너 최대폭 `1280px`. 스튜디오 작업영역은 풀폭 허용(그리드 갤러리).
- 브레이크포인트: `sm640 / md768 / lg1024 / xl1280`(6번과 동일).

### 12.5 컴포넌트
| 컴포넌트 | radius | shadow | 상태별 |
|---|---|---|---|
| 버튼 | 8px | none(primary), none(ghost) | hover 밝기+6%, active 누름 1px, disabled opacity .5, focus-visible 2px `--secondary` |
| 입력/textarea | 8px | none | focus 테두리 `--secondary`, error 테두리 `--danger`+하단 에러문구 |
| 카드 | 10px | `0 1px 2px rgba(0,0,0,.4)`(elevation-1) | hover elevation-2 `0 4px 12px rgba(0,0,0,.5)` |
| 모달 | 12px | elevation-2 | 배경 overlay `rgba(0,0,0,.6)`, 포커스 트랩, Esc 닫기 |
| 토스트(sonner) | 8px | elevation-1 | success/danger/warning 좌측 4px 컬러바 + 아이콘 |
| 내비 | 0 | 하단 border `--border` | active 항목 `--text`+좌측 2px `--primary` |
> elevation은 위 2단계만(NG-D2).

### 12.6 모션
- duration: 진입/상태변화 `150ms`, 모달/오버레이 `200ms`. easing: `cubic-bezier(0.2,0,0,1)`(standard).
- 금지: 1회 200ms 초과 장식 애니메이션, 무한 반복(스피너 제외), parallax.

### 12.7 접근성
- `:focus-visible` 2px `--secondary` 아웃라인(전 인터랙티브 요소).
- 키보드: 모달 포커스 트랩·Esc 닫기, 그리드 화살표 이동(P1).
- 아이콘 버튼 `aria-label` 필수, 토스트 `role="status"`/에러 `role="alert"`.
- 대비 기준 12.2 충족, 색+텍스트/아이콘 병행.

---

### 부록: AI 코딩 에이전트 전달 원칙(검증 완료)
- 모든 기능(F1~F9)은 데이터·화면·API·권한·테스트 중 최소 3개와 연결됨.
- 모든 사용자 액션은 성공/실패 결과를 가짐(5·6·8번).
- 권한은 클라 UI 숨김 + 서버 재검증 모두 명시(9번).
- 미결정은 11번에 [가정]/[확인필요] + 임시기준으로 분류됨 → 에이전트는 멈추지 않는다.

---

## 13. 웹툰 생성 (Webtoon Studio)

> **2026-08-16 상태:** 이 절과 대응하는 route/page/component/storage/test 16파일은 로컬
> untracked WIP다. clean checkout 구현이나 완료 기능이 아니며, 별도 작업지시·검수 없이
> 이 절을 구현 승인으로 해석하지 않는다.
>
> 참고 선행 구현: `OU9999/codex-webtoon`(MIT). 동일한 Codex OAuth + 로컬 파일 인프라라 생성 백엔드·말풍선 렌더러·세로 export 로직을 차용·포팅한다. 본 블록은 1~12번 규칙(모호어 금지·P0/P1/P2·4상태·권한·테스트)을 동일하게 따른다.

### 13.1 개요 — 하나의 메뉴, 두 진입 모드
하단 내비게이션에 **"웹툰 생성"**을 추가한다(기존 `단일 생성`·`배치 생성`·`영상 생성`과 동일 계층). 진입 후 두 모드:

| 모드 | 진입 | 입력 | 산출 |
|---|---|---|---|
| **A. 직접 제작(manual)** | "빈 웹툰으로 시작" | 사용자가 패널·프롬프트·말풍선 직접 | WebtoonProject |
| **B. 시나리오 자동(scenario)** | "시나리오로 만들기" | 시나리오 텍스트(+선택: 캐릭터/배경 시트) | WebtoonProject **초안** |

**핵심 원칙:** 두 모드의 산출물은 **동일한 `WebtoonProject` 자료구조**(캔버스+패널+말풍선)로 수렴한다. 모드 B는 "초안을 자동 생성"할 뿐, **완성 후 항상 모드 A 에디터로 넘어가 수정**한다(완전 무인 자동 아님 — [가정] W-A1).

**플로우:**
```
모드 A: 웹툰 생성 → 빈 캔버스 → 패널 추가 → (패널별)이미지 생성 → 말풍선 → export
모드 B: 웹툰 생성 → 시나리오 입력 → [컷 분할 미리보기·확인] → 패널 일괄 생성(레퍼런스 일관성)
        → 말풍선 자동 배치 → 초안 캔버스 → (모드 A 에디터로)편집 → export
```

### 13.2 기능 명세 (P0/P1/P2)

| ID | 기능 | 우선순위 | User Story / GWT 요약 |
|---|---|---|---|
| **W1** | 웹툰 프로젝트 CRUD | P0 | 프로젝트 생성·저장·열기·삭제. *Given* 인증, *When* "빈 웹툰", *Then* 720px 캔버스 1개로 새 프로젝트 생성·저장 |
| **W2** | 패널 이미지 생성(레퍼런스 연결) | P0 | *Given* 패널·프롬프트·참조 0~5, *When* 생성, *Then* 패널 높이→size 자동선택해 후보 N장 생성, 1장 선택 |
| **W3** | 세로 캔버스 편집 | P0 | 패널 추가·삭제·드래그·리사이즈·순서변경. 캔버스 높이 자동(=max(panel.y+h)) |
| **W4** | 말풍선 레이어 | P0 | speech/monologue/thought/sfx 4종. 텍스트·위치·모양·꼬리·폰트·색 편집 |
| **W5** | 세로 PNG export | P0 | single / 자동분할(기본 12000px) / 캔버스경계 분할. 말풍선을 이미지에 합성 |
| **W6** | 시나리오→웹툰 자동(모드 B) | P1 | *Given* 시나리오 텍스트, *When* "시나리오로 만들기", *Then* 컷 분할 미리보기→확인→패널 일괄 생성+말풍선 자동 배치 |
| **W7** | 스토리보드 컷 import | P1 | 기존 `storyboard organize` 결과(씬별 컷)를 패널로 가져옴 |
| **W8** | 캐릭터 시트 앵커링 | P1 | 모드 B에서 캐릭터/배경 시트를 전 패널 referenceGallery로 고정(없으면 첫 패널을 마스터로 앵커링) |
| **W9** | 말풍선 폰트/스타일 프리셋 | P2 | 한글 웹툰용 폰트·말풍선 모양 프리셋 |

**실패 케이스:** 패널 생성 502/안전필터 → 9번 정책 동일(재시도/완화). 시나리오 비었음 → 버튼 비활성. export 폰트 미로드 → 로드 완료까지 대기(스피너).

### 13.3 데이터 모델 (codex-webtoon 차용 → 시온바나나 파일 저장)
저장: `data/webtoon/<projectId>/{project.json, state.json, candidates/<panelId>/<id>.{png,json}, exports/}`.

| 엔티티 | 필드 | 타입 | 필수 | 기본 | 제약/enum | 관계 |
|---|---|---|---|---|---|---|
| **WebtoonProject** | id,title | string | Y | — | 고유 | →Canvas[] |
| | mode | enum | Y | `manual` | `manual\|scenario` | — |
| | commonPrompt | string | N | `""` | ≤4000자 (전체 공통 톤) | — |
| | createdAt,updatedAt | ISO | Y | now | — | — |
| **Canvas**(에피소드) | id,projectId | string | Y | — | — | →Panel[] |
| | title | string | Y | `에피소드 1` | — | — |
| | width | number | Y | `720` | 360~1080 | — |
| | height | number | Y | auto | =max(panel.y+h) | — |
| | backgroundColor | string | Y | `#FFFFFF` | hex | — |
| | panelGap | number | Y | `24` | 0~120(px) | — |
| | commonPrompt | string | N | `""` | 에피소드 공통 톤 | — |
| | order | number | Y | 0 | — | — |
| **Panel** | id,canvasId | string | Y | — | — | →Bubble[] |
| | order | number | Y | 0 | — | — |
| | x,y,width,height | number | Y | 0,auto,720,auto | px | — |
| | prompt | string | N | `""` | ≤4000자 | — |
| | imageId | string | N | `null` | 선택 후보 ImageRecord | →ImageRecord |
| | referenceGallery | string[] | N | `[]` | 0~5 `/api/images/<id>` | →ImageRecord |
| | dialogue | json[] | N | `[]` | `{speaker,text,type}` (모드 B 산출, 말풍선 변환 전) | — |
| **Bubble** | id,panelId | string | Y | — | — | — |
| | type | enum | Y | `speech` | `speech\|monologue\|thought\|sfx` | — |
| | text | string | Y | — | ≤200자 | — |
| | x,y,width,height | number | Y | — | px(패널 상대좌표) | — |
| | style | json | N | 기본 | `{fontFamily,fontWeight,fontSize,fillColor,textColor,borderColor,borderWidth,shape,tailSide,tailPosition}` | — |

- 공통 id/createdAt/updatedAt 보유. 삭제: 프로젝트=soft(휴지통), 패널/말풍선=hard(즉시, undo 1단계 P1).
- enum 전체값: `mode`, `Bubble.type`, `style.shape`(`rounded\|oval\|pill\|cloud\|square\|sharp\|rough\|jagged`), `style.tailSide`(`none\|top\|right\|bottom\|left`), `style.fontFamily`(`sans\|mono\|display\|serif`).

### 13.4 API 명세
| 메서드 | 경로 | 인증 | 요청 | 성공 | 실패 |
|---|---|---|---|---|---|
| POST | `/api/webtoon/projects` | self | `{title,mode}` | `{ok,project}` (201) | 400 |
| GET | `/api/webtoon/projects` | self | `?cursor&limit` | `{ok,items,nextCursor}` (200) | 401 |
| GET/PATCH/DELETE | `/api/webtoon/projects/[id]` | self | 부분 업데이트/삭제 | `{ok,project}`/`{ok}` | 404 |
| PUT | `/api/webtoon/projects/[id]/state` | self | 전체 `{canvases,panels,bubbles}` 동기화 | `{ok}` (200) | 400/409(버전충돌) |
| POST | `/api/webtoon/panels/[id]/generate` | self | `GenerateBody`(7.1 재사용)+`{panelId,height}` | `{ok,candidates:[{id,imageUrl}]}` (200) | 400/429/502 |
| POST | `/api/webtoon/autogen` | self | `{scenario,referenceGallery?,sheetRefs?}` | `{ok,draft:{cuts:[{prompt,dialogue,size}]}}` (200) | 400/502 |
| POST | `/api/webtoon/export` | self | `{projectId,mode:"single\|auto\|canvas",splitHeight?}` | `{ok,files:[/api/download?...]}` (200) | 400 |

- `panels/[id]/generate`는 **기존 `/api/generate` 로직(Codex OAuth, referenceGallery) 재사용** + 패널 높이→size 자동선택만 추가.
- `autogen`은 **텍스트 모델(gpt-5.5)로 시나리오를 컷 배열로 분할**(스토리보드 spec과 동일 산출 구조) → 이미지 생성은 W2가 처리. 컷 분할 결과를 먼저 반환해 **사용자 확인 후 생성**([가정] W-A2).
- 공통 에러 포맷·pagination·정렬은 7번 규칙 동일.

### 13.5 화면 / 라우팅
| 경로 | 역할 | 구성 | 4상태 | 반응형 |
|---|---|---|---|---|
| `/studio/webtoon` | 인증 | 프로젝트 목록 + [빈 웹툰][시나리오로 만들기] | 로딩/빈("웹툰 없음")/에러/성공 | 그리드 2→3→4열 |
| `/studio/webtoon/new` | 인증 | 모드 선택 → (B면)시나리오 입력+시트 선택+컷분할 미리보기 | 로딩(분할중)/빈/에러(검증)/성공(초안 생성) | 1컬럼 ≤md |
| `/studio/webtoon/[projectId]` | 인증 | **3분할 에디터**: 좌 패널레일·중앙 세로캔버스·우 인스펙터(프롬프트→후보→말풍선 3스텝) | 로딩(스켈레톤)/빈(패널0)/에러/성공 | ≥lg 3분할, lg미만 캔버스 단독+드로어 |

- 인스펙터 3스텝(codex-webtoon 차용): **1 프롬프트 → 2 후보 2×2 그리드 선택 → 3 말풍선 레이어**.
- UI 카피: 빈 캔버스 "패널을 추가해 웹툰을 시작하세요" / 모드 B 분할 후 "컷 12개로 나눴습니다. 이대로 생성할까요?" [생성][다시 분할].

### 13.6 모드 B 자동 생성 파이프라인 (상세)
```
1) 입력: 시나리오 텍스트 + (선택)캐릭터·배경 시트(referenceGallery)
2) 컷 분할: gpt-5.5 → cuts[{order, prompt(웹툰 패널용), dialogue[{speaker,text,type}], suggestedHeight}]
           (시온바나나 스토리보드 spec과 동일 철학: 컷=패널)
3) 패널 생성: cuts 순회 → /api/webtoon/panels/generate
           - 시트 있으면 referenceGallery로 전 패널 캐릭터 일관성 고정(W8)
           - 시트 없으면 첫 패널 결과를 마스터로 후속 패널 referenceGallery에 추가(마스터샷 앵커링)
4) 말풍선 자동 배치: dialogue[] → Bubble[] 변환
           - type=speech는 패널 하단/인물 추정 위치, monologue는 상단 박스(휴리스틱)
           - 위치는 초안값일 뿐, 모드 A에서 사용자가 조정
5) 초안 완성 → /studio/webtoon/[projectId] 에디터로 이동
```
- 안전필터(역사·폭력 등) 대응은 9번/스킬 노하우 동일(완화 단계).
- 컷 분할·말풍선 위치는 **결정적이지 않으므로 사람 검수 전제**(완전 자동 금지).

### 13.7 웹툰 블록 가정 & 확인필요
**[가정]**
- W-A1. 모드 B는 "초안 자동 생성 + 수동 편집" 모델(완전 무인 아님). 근거: 컷 분할·말풍선 위치는 검수 필요.
- W-A2. 모드 B는 컷 분할 결과를 먼저 보여주고 사용자 확인 후 이미지 생성(토큰·시간 낭비 방지).
- W-A3. 캔버스 너비 기본 720px(세로 웹툰 표준), 360~1080 조정 가능.

**[확인필요-차단]** (임시기준으로 구현 진행)
- W-Q1. **말풍선을 export PNG에 굽는다 vs 편집 가능한 오버레이로만 유지** → 임시: codex-webtoon처럼 **export 시 Canvas 2D로 합성(PNG에 포함)**, 편집 중엔 오버레이.
- W-Q2. **저장 단위: 프로젝트 전체 state.json 1파일 vs 패널별 파일** → 임시: `state.json` 단일 + `candidates/` 분리(codex-webtoon 방식).

**[확인필요-비차단]**
- W-Q3. 말풍선 한글 폰트 → 임시: `Noto Sans KR`(speech/monologue), SFX는 굵은 디스플레이체.
- W-Q4. export 자동분할 높이 → 임시: 12000px.
- W-Q5. 모드 B 1회 최대 패널 수 → 임시: 30(초과 시 분할 안내).
