# 작업 지시서: 코드 리뷰 후속 정리 (P1 검증/commit + 위생)

> 대상 AI 에이전트: 이 문서만 읽고도 cold start로 작업 가능합니다.
> 통합 검토자: 메인 Claude (별도 세션)

---

## 1. 환경 정보

| 항목 | 값 |
|------|------|
| worktree 경로 | `/Users/nohshinhee/Documents/2. coding/sionbanana/.claude/worktrees/gallant-robinson-873eaa` |
| 브랜치 | `claude/gallant-robinson-873eaa` |
| 기준 commit | `565e9b06` "1.65v fix: reference 자동 fallback 제거" |
| dev server | `http://localhost:3001` (이미 떠있음 — 새로 띄우지 마세요. PID는 `lsof -i :3001`로 확인) |
| 데이터 디렉토리 | `./data/images/{YYYY-MM}/{id}.png` (worktree 상대) |
| node_modules | 설치 완료 (`npm install` 다시 X) |
| 참고 문서 | `TASK_device_code_auth.md`, `TASK_zoom_ux.md` (포맷/맥락 참고) |
| 인증 | Codex OAuth — `~/.codex/auth.json` 또는 `data/codex-auth.json` |

---

## 2. 배경 및 목표

코드 리뷰(메인 Claude가 진행)에서 P1 8건, P2 14건, P3 3건이 도출됨. 이후 working tree에 누군가 P1 핵심 fix들을 작성해 두었는데 **commit이 안 된 채로 누적**되어 있고, 다른 진행 중인 zoom UX 변경과 섞여 있음. 이대로 두면:

- 일부 fix가 working tree에서 깨질 위험
- 회귀 추적 어려움 (단일 commit으로 묶이면)
- 무엇이 적용됐는지 사용자가 추적 불가

**목표**: working tree의 변경들을 의도별로 분리하여 검증 후 단계별 commit. 미처리 P1 일부 직접 처리. P3 cleanup.

**비-범위 (별도 작업)**:
- P1 #6/#7 Firebase stub cleanup — 5+ 파일 영향, 별도 작업 지시서
- MCP server 설계
- P2 항목 (#11 dead callback, #16 Firestore Timestamp 잔재, #20 SSE streaming, #21 동시성 한도 등)

---

## 3. 현재 working tree 상태 (snapshot)

```
M  .env.example
M  app/api/generate/route.ts            # P1 fix: zod 스키마, SSRF, idempotency, HTTP status
M  app/usage/page.tsx                   # 의도 파악 필요
M  app/usage/usage-view.tsx             # 의도 파악 필요
M  components/studio/batch-studio-shell.tsx       # zoom UX + model fallback 정리
M  components/studio/camera-config.ts             # 의도 파악 필요 (zoom?)
M  components/studio/diff-slider.tsx              # zoom UX (pan/zoom 추가로 추정)
M  components/studio/generation-history-view.tsx  # 의도 파악 필요
M  components/studio/history-panel.tsx            # 드래그 드롭 외부 파일 지원 (메인 Claude 추가)
M  components/studio/prompt-panel.tsx             # 의도 파악 필요
M  components/studio/studio-shell.tsx             # 메인 Claude 추가분 + zoom UX 잔재
M  components/studio/variations-studio-shell.tsx  # zoom UX + model fallback
M  components/studio/workspace-panel.tsx          # 라벨 fallback 정리 + zoom UX
M  hooks/use-generate-image.ts                    # P1 fix: timeout 통일 + idempotencyKey
M  lib/codex-fetch.ts                             # 진단 로그 추가 + gpt-5.5 fallback (메인 Claude)
M  lib/codex-oauth.ts                             # P1 fix: atomic write
M  tsconfig.tsbuildinfo                           # 빌드 산출물 (commit X)
?? components/studio/use-image-pan-zoom.ts        # zoom UX 신규 훅
```

**중요**: `tsconfig.tsbuildinfo`는 빌드 산출물이라 commit하지 말 것.

---

## 4. 작업 단계

각 step은 **독립 commit**으로 분리. typecheck 통과 후에만 commit.

### Step A: 코드 리뷰 P1 fix 통합 commit

**대상 파일**: `app/api/generate/route.ts`, `lib/codex-oauth.ts`, `hooks/use-generate-image.ts`, `lib/codex-fetch.ts`, `.env.example`

#### A.1 정밀 검증 (파일별)

각 파일의 working tree 변경을 `git diff HEAD -- <path>`로 검토하고, 다음 검증 포인트를 통과하는지 확인:

**`app/api/generate/route.ts`**:
- [ ] `generationOptionsSchema`가 `.strict()` 적용됨 (알 수 없는 키 거부)
- [ ] `referenceImage`, `referenceGallery`, `count` 등 위험 옵션이 모두 typed
- [ ] `idempotencyKey`는 정규식 `^[A-Za-z0-9_.:-]+$`로 검증, 8~128자
- [ ] `idempotencyCache`가 TTL(10분) 이후 expire되도록 cleanup 로직 있음
- [ ] SSRF 가드: 외부 host URL은 거부. `pathname`이 `/api/images/...`로 시작하는지 검증 (정규식 host 검증 부족 문제 fix). data: URL은 별도 처리 path
- [ ] HTTP status code: 입력 오류 400, 인증 실패 401, 충돌 409, 업스트림 502, 내부 500 — 모두 명시
- [ ] 부분 실패(count=N 중 일부만 성공) 시 `partial` 필드 응답 + 클라이언트가 인지 가능한 형태
- [ ] 전체 실패 시 sample SVG로 위장된 200 응답이 아닌 5xx 반환

**`lib/codex-oauth.ts`**:
- [ ] `writeAuthFile`이 tmp 파일 → `fs.rename`으로 atomic 교체
- [ ] rename 실패 시 tmp 파일 cleanup (`fs.unlink` in catch)
- [ ] `getCodexAuth`와 `getCodexAuthStatus`가 동일한 inflight Promise를 공유 (race 방지)
- [ ] cache mutate가 단일 path로 통일

**`hooks/use-generate-image.ts`**:
- [ ] `GENERATE_TIMEOUT_MS = 180000` 단일 상수
- [ ] 90초 timeout 잔재 없음 (이전 90초 vs 180초 불일치 fix)
- [ ] `idempotencyKey`가 `crypto.randomUUID()` 또는 fallback으로 자동 생성 + 옵션 통과

**`lib/codex-fetch.ts`** (메인 Claude 추가분):
- [ ] `DEFAULT_IMAGE_MODEL` / `DEFAULT_TEXT_MODEL` fallback이 `"gpt-5.5"` (이전 `gpt-5.5`에서 변경)
- [ ] 진단 로그 (`codex request: model=...`, `response.failed payload:`) 유지 — MCP 도입 시까지 유용
- [ ] `response.failed` 이벤트의 전체 payload를 logTag와 함께 console.error로 출력

**`.env.example`**:
- [ ] `DEFAULT_TEXT_MODEL`, `DEFAULT_IMAGE_MODEL`이 `gpt-5.5`로 갱신됨

#### A.2 동작 검증

dev server는 이미 떠있음 (포트 3001). 변경은 hot reload로 반영.

1. **이미지 생성 1회 시도**: brower http://localhost:3001/studio → "고양이" 같은 간단 prompt → 결과 PNG 받음. 응답에 `model: "gpt-image-2"` 박힘 확인.
2. **idempotency 동작**:
   ```bash
   KEY="test-$(date +%s)"
   curl -X POST http://localhost:3001/api/generate \
     -H "Content-Type: application/json" \
     -d "{\"prompt\":\"a cat\",\"options\":{\"idempotencyKey\":\"$KEY\"}}" -o /tmp/r1.json
   curl -X POST http://localhost:3001/api/generate \
     -H "Content-Type: application/json" \
     -d "{\"prompt\":\"a cat\",\"options\":{\"idempotencyKey\":\"$KEY\"}}" -o /tmp/r2.json
   diff /tmp/r1.json /tmp/r2.json  # 동일하거나 두 번째가 cached로 빠르게 응답
   ```
3. **SSRF 거부**: `referenceImage: { url: "https://example.com/foo.png" }` 보내면 400 또는 명시적 거부 응답. `referenceImage: { url: "/api/images/abc" }`는 통과.
4. **잘못된 옵션 키 거부**: `options.unknownKey: "x"` 보내면 zod로 거부 (400).
5. **typecheck**: `npx tsc --noEmit` 0 errors.
6. **dev server log 확인**: `/tmp/dev-server.log`에 에러 없음.

#### A.3 commit

```
1.66v fix: 코드 리뷰 P1 통합 — generate input/SSRF/idempotency, atomic auth write, timeout 통일

- /api/generate: zod 스키마 strict + 모든 옵션 typed (#1), URL host 검증 추가 (#2),
  idempotencyKey + 10분 TTL 캐시 (#6), HTTP status code 일관화 (#7)
- lib/codex-oauth: writeAuthFile을 tmp + rename으로 atomic 교체 (#13)
- lib/codex-oauth: getCodexAuth/getCodexAuthStatus가 단일 path로 cache 갱신 (#3)
- hooks/use-generate-image: GENERATE_TIMEOUT_MS = 180000 단일 상수 (#4)
- hooks/use-generate-image: idempotencyKey 자동 생성/통과
- lib/codex-fetch: model fallback gpt-5.5 + 진단 로그 (response.failed payload, request model)
- .env.example: DEFAULT_*_MODEL 값 동기화

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

stage 명령:
```bash
git add app/api/generate/route.ts lib/codex-oauth.ts hooks/use-generate-image.ts lib/codex-fetch.ts .env.example
```

**검증 실패 항목 발견 시**: commit하지 말고 메인 Claude에 보고. working tree에 두기.

---

### Step B: handleDeleteAllRecords 디스크 정리 추가 (#5)

**대상**: `components/studio/studio-shell.tsx` (line ~2582 부근 `handleDeleteAllRecords`)

#### B.1 변경 내용

현재 `handleDeleteAllRecords`가 localStorage record와 Firestore stub만 정리하고 디스크 PNG는 그대로 둠 → 다음 마운트 시 디스크 fallback record로 좀비 부활.

목표: 모든 삭제 대상 record에 대해 `DELETE /api/images/<id>` 호출 추가. `Promise.allSettled`로 안전하게 처리하고 실패는 `console.warn`.

#### B.2 구현 가이드

```ts
// 기존 setLocalRecords([]) 또는 record loop 직후, 다음을 추가:
const deletableIds = recordsToDelete
  .filter(r => typeof r.imageUrl === "string" && r.imageUrl.startsWith("/api/images/"))
  .map(r => r.id);

await Promise.allSettled(
  deletableIds.map(id =>
    fetch(`/api/images/${id}`, { method: "DELETE" }).catch(error => {
      console.warn(`[DeleteAll] disk delete failed for ${id}`, error);
    })
  )
);

setDiskRecords([]);  // 1.64v에서 추가한 디스크 fallback도 비움
```

`recordsToDelete`는 함수 안에서 식별. `mergedRecords` 또는 `historyRecords`에서 `REFERENCE_IMAGE_DOC_ID` 제외한 list.

#### B.3 검증

1. `/studio` 또는 `/studio/history`에서 일괄 삭제 트리거 (보통 "전체 삭제" 또는 비슷한 버튼)
2. `data/images/{YYYY-MM}/` 폴더에서 PNG 파일들이 함께 사라졌는지 Finder/`ls`로 확인
3. 페이지 새로고침 → history가 좀비 부활하지 않고 비어 있음
4. typecheck

#### B.4 commit

```
1.67v fix: 일괄 삭제 시 디스크 PNG 파일도 함께 정리 (#5)

handleDeleteAllRecords가 localStorage + Firestore stub만 정리하고
data/images/ 디스크 파일은 그대로 두던 문제 fix. 1.64v에서 추가한
disk fallback record가 다음 마운트 시 좀비 부활하던 부작용 차단.

- 모든 삭제 대상 record에 대해 DELETE /api/images/<id> 병렬 호출
- diskRecords state도 함께 비워 즉시 UI 반영
- 실패는 console.warn (Promise.allSettled)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

stage:
```bash
git add components/studio/studio-shell.tsx
```

⚠️ **주의**: studio-shell.tsx에는 working tree에 다른 변경이 섞여 있을 수 있음. `git diff HEAD -- components/studio/studio-shell.tsx`로 확인하고, 본 step 변경 외 다른 부분이 staged되지 않도록 `git add -p`로 hunk별 stage 또는 임시 stash 활용.

---

### Step C: TASK_prompt_compose.md 삭제 (#25)

**배경**: 메인 Claude가 1.60v 시점에 작성했으나 회귀 진단 결과 내용 부정확. 잔존하면 향후 혼란 야기.

```bash
git rm TASK_prompt_compose.md
```

commit:
```
1.68v chore: 부정확한 TASK_prompt_compose.md 삭제

원래는 prompt 합성 일원화 외부 위임 문서였으나, 진짜 원인이 카테고리
자동 합성 useEffect 회귀(1.61v에서 복구)였음이 밝혀져 내용 무의미.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

### Step D: zoom UX 변경 정리 commit

**대상**: 다음 파일들의 working tree 변경 + untracked
- `components/studio/use-image-pan-zoom.ts` (untracked)
- `components/studio/diff-slider.tsx`
- `components/studio/batch-studio-shell.tsx` (zoom 부분 + model fallback `gemini-nano-banana` → `gpt-image-2` 정리)
- `components/studio/variations-studio-shell.tsx`
- `components/studio/workspace-panel.tsx` (라벨 fallback `Gemini Nano Banana` → `gpt-image-2` + zoom)
- `components/studio/prompt-panel.tsx`
- `components/studio/generation-history-view.tsx`
- `components/studio/camera-config.ts`
- `app/usage/page.tsx`, `app/usage/usage-view.tsx` (zoom 관련 인지 의도 파악 필요)

#### D.1 의도 파악

각 파일의 변경을 `git diff HEAD -- <path>`로 검토하여 의도 카테고리 분류:

- **zoom UX 본체**: use-image-pan-zoom 훅, diff-slider pan/zoom, batch/variations zoom 적용
- **model 라벨 fallback 정리** (workspace-panel, batch-studio-shell): 1.62v/1.63v 흐름의 후속
- **기타** (usage 페이지, generation-history-view, camera-config, prompt-panel): zoom과 무관할 수 있음 — 의도 별도 분류

`TASK_zoom_ux.md` 문서가 있으면 거기 명세 참고.

#### D.2 분리 commit 전략

가능하면 다음과 같이 분리:

**Step D-1**: model 라벨 fallback 정리만 먼저
- workspace-panel.tsx의 `Gemini Nano Banana` → `gpt-image-2` 부분만
- batch-studio-shell.tsx의 fallback 두 곳 (`(response as any).model || "gemini-nano-banana"` → `... || "gpt-image-2"`)
- `git add -p`로 hunk별 stage

```
1.69v fix: 잔존 Gemini 라벨 fallback 정리 (workspace/batch 마무리)
```

**Step D-2**: zoom UX 본체
- use-image-pan-zoom.ts (untracked → add)
- diff-slider.tsx
- batch/variations/workspace-panel/prompt-panel의 zoom 적용 부분
- generation-history-view, camera-config의 zoom 관련 변경

```
1.70v feat: 워크스페이스/배치/변형 zoom + pan UX 통합 (TASK_zoom_ux.md)

- useImagePanZoom 훅 신규 — pan/zoom 통합 처리
- diff-slider에 transform/panZoomBind/isPanning prop 추가
- batch-studio-shell, variations-studio-shell, workspace-panel에서 훅 적용
- prompt-panel, camera-config 등에서 zoom 옵션 노출
```

**Step D-3**: 나머지 (usage, generation-history-view 등 zoom 무관 변경)
- 의도가 명확하면 단독 commit
- 의도 모호하면 메인 Claude에 보고하고 working tree에 보존

#### D.3 검증

1. **typecheck**: 각 commit 후 `npx tsc --noEmit`
2. **dev server**:
   - `/studio/batch`에서 zoom in/out, pan 동작
   - `/studio/variations`에서 동일
   - diff slider에서 pan + zoom 동시 동작
   - 콘솔 에러 없음

---

### Step E: 드래그 드롭 외부 파일 지원 commit

**대상**: `components/studio/history-panel.tsx`

메인 Claude가 이미 작성: `handleDrop`이 `dataTransfer.files`도 처리, `handleDragOver`에서 internal/external dropEffect 구분.

#### E.1 검증

1. 데스크톱 Finder에서 PNG/JPG 파일을 reference 카드(우측 "기준 이미지" 박스)로 드래그 드롭 → 등록되는지
2. history 목록에서 이미지를 reference 카드로 드래그 → 등록되는지
3. 이미지가 아닌 파일(예: `.txt`)을 드롭 → 무시되는지
4. typecheck

#### E.2 commit

```
1.71v feat: 기준 이미지 드롭존이 외부 파일도 받음

이전엔 history record id 드래그(application/x-yesgem-record-id)만 처리.
데스크톱에서 끌어온 파일은 무시됐음.

- handleDrop: dataTransfer.files 처리 분기 추가, 이미지 MIME만 허용
- handleDragOver: types에 "application/x-yesgem-record-id" 포함 여부로
  dropEffect를 "move"/"copy" 분기

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

stage:
```bash
git add components/studio/history-panel.tsx
```

---

## 5. 종합 검증 체크리스트

모든 step 후 수행:

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `git status -s` — working tree에 의도된 잔존 변경만 (예: `tsconfig.tsbuildinfo` 같은 빌드 산출물)
- [ ] `git log --oneline -10` — 1.66v ~ 1.71v commit이 의미 단위로 분리됨
- [ ] dev server (포트 3001) 정상 동작
- [ ] 브라우저 콘솔 에러 없음
- [ ] 이미지 생성 1회 정상 (gpt-image-2 응답)
- [ ] 일괄 삭제 → 디스크 파일 정리 확인
- [ ] 드래그 드롭 외부 파일 OK
- [ ] zoom/pan UX 정상

---

## 6. 결과 보고 양식

```markdown
## commit 목록
- 1.66v fix: ...                <hash>
- 1.67v fix: ...                <hash>
- 1.68v chore: ...              <hash>
- 1.69v fix: ...                <hash> (있으면)
- 1.70v feat: ...               <hash>
- 1.71v feat: ...               <hash>

## working tree 잔존
- (commit 안 된 변경 목록 — 의도 모호한 항목 등)

## 검증 결과
- Step A: typecheck 통과 / 이미지 생성 OK / idempotency 동작 / SSRF 거부
- Step B: 일괄 삭제 후 disk 파일 정리 확인
- Step C: TASK_prompt_compose.md 삭제 완료
- Step D: zoom UX 정상 동작 / 라벨 fallback 정리
- Step E: 외부 파일 드롭 OK / history 드래그 OK

## 알려진 한계 / 보고 사항
- (메인 Claude 검토 필요한 항목)
- (의도 모호해서 working tree에 보존한 변경)
```

---

## 7. 빠른 체크리스트 (Step별)

### Step A
- [ ] zod schema strict + 모든 옵션 typed
- [ ] SSRF: pathname 기반 검증 + 외부 host 거부
- [ ] idempotencyKey TTL 10분 캐시 동작
- [ ] HTTP status 4xx/5xx 명시
- [ ] writeAuthFile tmp + rename + 실패 시 cleanup
- [ ] getCodexAuth/Status 단일 inflight 공유
- [ ] timeout 180000 단일 상수
- [ ] 진단 로그 유지

### Step B
- [ ] handleDeleteAllRecords가 DELETE /api/images/<id> 호출
- [ ] Promise.allSettled
- [ ] diskRecords 비움
- [ ] 일괄 삭제 후 disk 파일 사라짐

### Step C
- [ ] TASK_prompt_compose.md 삭제

### Step D
- [ ] use-image-pan-zoom.ts 추가
- [ ] diff-slider pan/zoom prop 적용
- [ ] batch/variations zoom 동작
- [ ] model 라벨 fallback `gpt-image-2`로 통일

### Step E
- [ ] handleDrop이 외부 파일 처리
- [ ] 이미지 MIME만 허용
- [ ] dropEffect 동적 분기

---

## 8. 안전 가이드

- **Destructive 명령 금지**: `git reset --hard`, `git push --force`, `git checkout -- .`, `rm -rf` 등 사전 승인 없이 실행 X
- **`--no-verify`, `--amend` 금지**: pre-commit hook 우회 금지. amend 대신 새 commit
- **불확실한 변경**: working tree에 두고 메인 Claude에 보고
- **자기 발견 외 변경**: 본 지시서에 없는 다른 변경 발견 시 그대로 두고 보고
- **dev server 재시작 X**: 이미 포트 3001로 떠있음. 포트 3000은 다른 프로젝트(AICUT) 점유 중이니 절대 건드리지 말 것
- **Codex 인증 파일 (`~/.codex/auth.json`, `data/codex-auth.json`) 건드리지 말 것**

---

## 9. 별도 위임 (본 task 비-범위)

다음은 별도 작업 지시서로 처리:

- **TASK_firebase_stub_cleanup.md** (작성 예정): #6/#7 Firebase stub + `shouldUseFirestore` 7군데 분기 제거. 5+ 파일 영향, 메인 Claude가 별도 작성.
- **MCP server 설계**: `/api/generate`, `/api/images` 등을 wrap한 MCP 도구 5-7개. 별도 spec 문서.
- **P2 항목** (#11 dead callback, #16 Timestamp 잔재, #20 SSE streaming, #21 동시성 한도, #22 디스크 fallback prompt 라벨): MCP 도입 후 또는 별도 sprint.

---

본 작업은 working tree 정리 + P1 마무리 commit이 목적이므로, 새로운 기능 추가나 리팩토링은 범위 밖입니다. 의문 있으면 메인 Claude에 묻고 진행하세요.
