# 작업 지시서: 통합 기준 브랜치를 `feature/webtoon-studio`에서 `main`으로 복원

> 대상 AI 에이전트: 이 문서만 읽고도 cold start로 작업 가능합니다.
> 작성: 2026-09-17, makemov 세션(Claude)이 조사한 사실을 바탕으로 작성. 실행은 시온바나나 세션이 대표 승인 뒤에 한다.
> 성격: 코드 변경 없음. git 포인터 1개 이동 + 문서 9줄 갱신 + 작업본 전환. 되돌리기 쉬움.

---

## 0. 요약

`feature/webtoon-studio`는 6월에 웹툰 스튜디오 기능용으로 만든 브랜치인데, 8월 16일(DEC-008)부터 엔진 전체의 **코드 통합 기준**으로 쓰이고 있다. `main`은 8월 6일 `9751b62a`에서 멈췄고, 이 브랜치에 통째로 포함된 조상이다(갈라진 커밋 0). 그래서 대표가 "웹툰 스튜디오 브랜치가 왜 트렁크냐"고 헷갈려 한다.

할 일: `main`을 `feature/webtoon-studio` 끝으로 **빨리감기**하고, 문서의 "통합 기준"을 `main`으로 고치고, 작업본을 `main`으로 옮긴다. `feature/webtoon-studio`는 당분간 같은 커밋을 가리키는 별칭으로 남긴다.

## 1. 환경 정보 (2026-09-17 조사 시점)

| 항목 | 값 |
|---|---|
| 저장소 | `/Users/nohshinhee/Documents/2. coding/sionbanana` · 원격 `origin` = `https://github.com/sionxai/sionbanana.git` |
| `main` | `9751b62a` (2026-08-06, "refactor(skill): SKILL.md 921줄 → 절차 522줄 + 원장 분리") |
| `feature/webtoon-studio` | `6494d96c` (2026-09-17). `main`에 없는 커밋 140개(docs 57·feat 46·merge 24·fix 12 …). 작업본 HEAD |
| 조상 관계 | `git merge-base --is-ancestor main feature/webtoon-studio` → 참. **빨리감기 가능, 충돌 없음** |
| 합쳐진 가지 | `claude/sb-wo-023-video-motion`, `claude/sb-wo-024-alignment` (둘 다 `feature/webtoon-studio`에 병합 완료) |
| 안 합쳐진 가지 | `claude/arduino-environment-data-project-1cc604`(워크트리 있음), `claude/ceo-skill-check-e77efc`(워크트리 있음) — 건드리지 않는다 |
| 워크트리 | `.claude/worktrees/arduino-environment-data-project-1cc604` @ `b273f7db` · `friendly-pasteur-0d29a6` (detached `0bd298af`) · `key-visual-work-721540` @ `597bde4d` |
| 작업본 상태 | 추적 파일 수정 5 · 미추적 17 (다른 세션 소유. 이 작업에서 손대지 않는다. 이 지시서 파일은 별도로 미추적 +1) |
| 상주 서버 | launchd `com.sionbanana.server`, `WorkingDirectory` = 저장소 루트. 브랜치 이름과 무관하며, 같은 커밋으로 옮기므로 **재빌드 불필요** |
| 포털·스킬 | makemov 포털은 `.claude/skills` 경로를 읽는다(브랜치 무관). 스킬 정리 커밋 `bf23893c`·`22c8649a`·`6494d96c`가 이 브랜치에 있다 |

## 2. 배경 — 이름이 왜 이런가

- 2026-06-02 `0bd298af`에서 `feature/webtoon-studio` 생성. 첫 커밋들은 스튜디오 UI 성능·@핸들(6/12~6/17), 7/2에 스킬 3종(image-gen·thumbnail·**webtoon**) 정비. 앱에 `app/studio/webtoon`·`app/api/webtoon`·`lib/webtoon`이 실제로 있다 — 처음엔 이름이 맞았다.
- 2026-08-16 DEC-008(`docs/COMPANY.md`)과 `AGENTS.md`·`CLAUDE.md`가 "코드 통합 기준 = `feature/webtoon-studio`"로 못 박았고, 이후 WO 워크트리들이 여기서 갈라져 여기로 합쳐졌다(`docs/WORK_ORDERS.md` 5곳).
- `main`으로 돌리지 않은 이유는 문서에 없다. 역할이 바뀌었는데 이름만 남은 상태다.

## 3. 목표 / 비목표

**목표**
1. `main` = `feature/webtoon-studio` (같은 커밋).
2. 문서의 "통합 기준"이 `main`을 가리킨다.
3. 작업본이 `main`에 있고, 이후 커밋·WO 워크트리가 `main` 기준이다.

**비목표**
- 코드·빌드·서버 변경 없음. 다른 세션의 미커밋 파일 22개를 정리·커밋·삭제하지 않는다.
- `feature/webtoon-studio` 즉시 삭제 없음. 원격 `push`는 대표 승인 뒤 별도.
- 기존 워크트리 3개와 그 브랜치는 그대로 둔다.

## 4. 작업 순서

각 단계는 **확인 커맨드 출력이 기대값과 같을 때만** 다음으로 간다.

### 0단계 — 결정 기록 (실행 전)
`docs/COMPANY.md`에 결정 한 줄을 등록한다(번호는 대장의 다음 번호). 내용: "코드 통합 기준을 `main`으로 복원. `feature/webtoon-studio`는 2026-09-17 `6494d96c`까지의 통합 기준이었고 같은 커밋을 가리키는 별칭으로 유지, 삭제는 별도 결정." 기록 없이 진행하지 않는다.

### 1단계 — 원격 상태 확인
```bash
git fetch origin
git log --oneline main..origin/main | wc -l          # 기대: 0 (원격 main이 로컬 main보다 앞서면 멈추고 보고)
git log --oneline origin/main..main | wc -l          # 로컬이 앞선 수 (참고)
git ls-remote --heads origin feature/webtoon-studio  # 원격에 이 가지가 있는지 (있으면 7단계에서 함께 처리)
```

### 2단계 — `main` 포인터 빨리감기 (체크아웃 없이)
```bash
git fetch . feature/webtoon-studio:main
```
- 이 명령은 빨리감기가 아니면 **실패**하므로 안전하다. `-f`·`branch -f`를 쓰지 않는다.
- 확인: `git rev-parse main feature/webtoon-studio` 두 줄이 같다. 작업본 HEAD·파일은 변하지 않는다(`git status --porcelain | wc -l` 이전과 동일 = 22).

### 3단계 — 문서 갱신 (9줄, 아래 목록 그대로)
"통합 기준"의 현재값만 `main`으로 바꾸고, 과거 기록(날짜·해시가 붙은 이력 문장)은 그대로 둔다.

| 파일:줄 | 지금 | 바꿀 내용 |
|---|---|---|
| `docs/COMPANY.md:7` | `기준 코드 통합 상태: feature/webtoon-studio / f90b8751…` | `기준 코드 통합 상태: main / <2단계 후 main 해시>` (이전 값은 괄호로 이력 표기) |
| `docs/COMPANY.md:184` | DEC-008 본문의 브랜치 이름 | **그대로 둔다**(과거 결정 기록). 0단계의 새 결정이 이를 갱신한다 |
| `AGENTS.md:20` | `코드 통합 기준은 feature/webtoon-studio의 f90b8751` | `코드 통합 기준은 main(2026-09-17 복원, 그전은 feature/webtoon-studio의 f90b8751)` |
| `CLAUDE.md:19` | 같은 문장 | 같은 방식으로 |
| `docs/WORK_ORDERS.md:187, 205, 352, 392, 701` | WO 이력 속 `base feature/webtoon-studio` | **그대로 둔다**(당시 사실). 대신 대장 상단 규칙 절에 "2026-09-17부터 새 WO 워크트리는 `main`을 base로 한다"를 한 줄 추가 |

확인: `grep -n "feature/webtoon-studio" CLAUDE.md AGENTS.md docs/COMPANY.md docs/WORK_ORDERS.md` 결과가 모두 이력 문맥(날짜·"그전은"·WO 기록)에만 남는다.

### 4단계 — 작업본 전환 (조건부)
전제: **작업본이 깨끗할 때만** 전환한다(전역 지침 "dirty worktree에서는 브랜치를 전환하지 않는다"). 추적 수정 5개는 소유 세션이 커밋하거나 보류하고, 미추적 17개는 그대로 있어도 전환에 영향이 없지만 규칙상 소유자 확인 뒤 진행한다.
```bash
git status --porcelain | grep -v '^??' | wc -l   # 기대: 0 이면 진행
git checkout main
git rev-parse --abbrev-ref HEAD                   # 기대: main
```
같은 커밋이라 파일은 바뀌지 않고 서버 재빌드도 필요 없다. 작업본을 당장 못 바꾸면 2·3단계까지만 하고 "작업본 전환 보류(사유: 미커밋 파일 소유 세션 확인 중)"로 보고한다. 그 사이의 커밋은 여전히 `feature/webtoon-studio`에 쌓이므로, 전환 전까지는 커밋할 때마다 `git fetch . feature/webtoon-studio:main`으로 `main`을 따라 올린다.

### 5단계 — 이후 규칙
- 새 WO 워크트리는 `git worktree add .claude/worktrees/<이름> -b claude/<이름> main`.
- 기존 워크트리 3개는 base 커밋이 이미 `main` 이력 안에 있으므로 손대지 않는다.

### 6단계 — 가지 정리 (2단계 이후, 비강제)
```bash
git branch -d claude/sb-wo-023-video-motion claude/sb-wo-024-alignment   # 이미 병합됨. -D 금지
```
`feature/webtoon-studio`는 삭제하지 않는다. 2026-10-01 이후 `git worktree list`와 `git branch --no-merged main`에 의존이 없으면 삭제를 별도 결정으로 올린다.

### 7단계 — 원격 (대표 승인 뒤에만)
```bash
git push origin main            # force 아님. 1단계에서 원격 main이 앞서 있었다면 하지 않는다
```
원격에 `feature/webtoon-studio`가 있으면 같은 커밋으로 `push`해 두고 삭제는 6단계 결정과 함께.

## 5. 검증 체크리스트 (보고에 출력 첨부)

- [ ] `git rev-parse main feature/webtoon-studio` 동일
- [ ] `git merge-base --is-ancestor feature/webtoon-studio main` 참
- [ ] `git status --porcelain | wc -l` 이 작업 전후 동일(다른 세션 파일 건드리지 않음)
- [ ] 문서 grep 결과가 이력 문맥에만 남음
- [ ] `curl -s http://localhost:3002/api/health` → `"authenticated": true` (서버 영향 없음 확인)
- [ ] `git worktree list` 3개 그대로
- [ ] (4단계 했으면) `git rev-parse --abbrev-ref HEAD` = `main`

## 6. 롤백

- 포인터: `git branch -f main 9751b62a` (작업 전 `main` 해시). 작업본은 원래 `feature/webtoon-studio`에 있으므로 영향 없음.
- 문서: 3단계 커밋을 `git revert` 하거나 파일별로 `git checkout <이전 커밋> -- <파일>`.
- 4단계 뒤라면 `git checkout feature/webtoon-studio`로 되돌아간다(같은 커밋).

## 7. 하지 말 것

- `git branch -f`, `git push --force`, `git branch -D` 사용 금지.
- 다른 세션의 미커밋·미추적 파일을 stash·커밋·삭제하지 않는다.
- `feature/webtoon-studio`를 이번 작업에서 지우지 않는다.
- 문서의 과거 기록(날짜·해시가 붙은 문장, DEC-008 본문, WO 이력)을 고쳐 쓰지 않는다.

## 8. 보고 형식

1. 0단계 결정 번호와 문장.
2. 1단계 원격 확인 출력(원격 main 앞섬 여부).
3. 2단계 전후 `git rev-parse` 출력.
4. 3단계 변경 파일·줄과 커밋 해시.
5. 4단계 실행 여부와 사유.
6. 5절 체크리스트 결과, 남은 결정(가지 삭제·푸시).
