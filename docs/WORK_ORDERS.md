# Sion Banana — 작업지시 대장 (WORK_ORDERS)

> - 정본: `docs/COMPANY.md` — 전략·우선순위 충돌 시 COMPANY.md가 우선한다.
> - 지시·보고·대화에서 지시는 **`SB WO-###`**로 부른다 (타 프로젝트 대장과 혼동 방지).
> - 상태 흐름: `초안 → 발행 → 진행 → 검수 → 완료/반려`. 상태 변경은 즉시 이 문서에 반영한다.
> - 작업 세션은 자기 브랜치 커밋까지만 수행한다. 병합·push·배포는 CEO가 검수 후 수행한다.
> - 현황판 `docs/dashboard.html`은 이 대장과 COMPANY.md를 요약하는 뷰어 전용 문서다 (COMPANY.md §7-9).

## 대표자 할 일

- [ ] T-01 **UNAPPROVED — implement 금지.** 미션 확장 개정안(v0.2.0) 승인 여부 결정 — "AI 고품질 미디어 제작 전반(이미지·영상·영화·CF·PPT + 스토리·시나리오)" 반영은 대표가 별도 승인하기 전 제안일 뿐이며 구현 범위가 아니다.
- [x] T-02 1차 exact cleanup 승인·실행 — R3 Checker PASS 후 완전 병합·미사용 로컬 브랜치 2개만 `git branch -d`로 삭제했다. ignored 파일 또는 고유 커밋이 있는 worktree 3개와 연결 branch는 보존하며, 추가 삭제·prune·push는 새 승인 전까지 금지한다.
- [ ] T-03 자격증명 노출 대응안 승인 여부 결정 — 사용처 확인 및 필요한 교체 범위를 먼저 확정한다.
- [ ] T-04 모션에셋 결함 수정안 승인 여부 결정 — 4위상 프롬프트 중복과 2행 시트 미러링 진단을 바탕으로 수정 범위를 확정한다.
- [ ] T-05 웹 유입 추진 여부 결정 — 현재 로컬·미배포 방침을 유지하면 보류한다. 추진하려면 COMPANY.md DN-002/DEC-007 방향 재검토와 공식 공개 경로 확정 후 GA4·Search Console 속성, 읽기 권한, 배포를 각각 승인한다.

> T-02의 위 exact local cleanup만 2026-08-17 대표 결정으로 승인·실행됐다. T-01·T-03~T-05와
> T-02의 추가 삭제·prune·push는 미승인이며, 정식 작업지시는 아래 상태표에 `SB WO-###`로 기록한다.

## 세션 명부

| 이름 | 전담 영역 | 현재 임무 | 이력 |
|---|---|---|---|
| CEO | 기획·전략·작업지시·검수·정본 관리 | SB WO-003 완료 · T-02 정리 승인 대기 | 2026-08-07 취임 |

## 상태표

| ID | 발행일 | 제목 | 담당 | 우선순위 | 목표일 | 상태 | 검수 결과 |
|---|---|---|---|---|---|---|---|
| SB WO-001 | 2026-08-13 | CEO 현황판·AIDE 분석 상태 정본 갱신 | CEO(Sol) / 문서 Maker(Luna) | P0 | 2026-08-13 | 완료 | PASS · ACCEPT WITH FOLLOW-UP |
| SB WO-002 | 2026-08-15 | AIDE 현황판·유입 통계 최신화 | CEO(Sol) / 문서 Maker(Terra) / 독립 Checker | P0 | 2026-08-15(KST) | 완료 | PASS · ACCEPT WITH FOLLOW-UP |
| SB WO-003 | 2026-08-16 | 저장소·맥락 1차 안정화 | CEO(Sol) / Maker(Terra) / 독립 Checker | P0 | 2026-08-16(KST) | 완료 | PASS · CANONICAL_CONFIRMED |

## 지시서

발행 시 이 아래에 전문을 누적 기록한다. 필수 규격: ID / 우선순위 / 담당 / 목표일 / 의존성 /
목표 / 배경(정본 문서 경로·조항) / 변경 범위(파일 목록) / 완료 기준(검증 방법 + KPI 관측) /
금지 사항 / 위험등급 / 예상 대표자 투입시간 / 롤백 방법 / 보고 형식.

### SB WO-001 — CEO 현황판·AIDE 분석 상태 정본 갱신

- **ID:** `SB WO-001`
- **우선순위:** P0
- **담당:** CEO(Sol, 작업 통제·최종 판정) / Luna(문서 Maker) / 독립 Checker(읽기 전용 검수)
- **목표일:** 2026-08-13
- **의존성:** `docs/COMPANY.md` v0.1.2 §§2·5·6·7, AIDE
  `docs/ANALYTICS_STANDARD_V1.md` v1 §§1·8, AIDE
  `data/analytics-contract.json`의 `statusReport` 계약, 2026-08-13 저장소 실측
- **목표:** 승인된 첫 작업지시를 발행하고, CEO HTML 현황판과 AIDE 분석 상태 정본을
  배포·계측·Git·NOW 진행 상황의 실제 상태에 맞춰 갱신한다.
- **배경:** `docs/COMPANY.md` §2는 수익화 이전 제품 검증을, §5는 실제 제작 결과 기반
  KPI를 요구한다. §6의 NOW는 1개 완료/5개이고, §7은 증거 없는 완료 판정을 금지하며
  현황판을 정본 요약 뷰어로 정의한다. AIDE 분석 규격은 미배포 프로젝트를
  `not_deployed`, 측정 미연결을 `not_instrumented`로 보고하고 방문자 0과 구분하도록
  요구한다.
- **변경 범위:** `docs/WORK_ORDERS.md`, `docs/dashboard.html`,
  `docs/analytics-status.json`만 생성·수정한다.
- **완료 기준:**
  1. `python3 -m json.tool docs/analytics-status.json`으로 JSON 파싱과 필수 필드·허용 상태를
     확인한다.
  2. `rg`로 현황판의 `최근 완료`, `진행 중 업무`, `위험·막힘`, `다음 행동`,
     `CEO 판단 및 대표 승인 필요사항`, `유입 지표 · GA4`와 유입 우선 지표 라벨을
     확인하고, 구형 해시와 미승인 제안을 정식 지시로 오인하게 하는 표현이 없음을 확인한다.
  3. `git diff --check`와 `git status --short`로 공백 오류와 변경 범위를 확인한다.
  4. KPI 관측: NOW 진척이 1/5(20%)로 표시되고, 오늘·7일·30일 유입과 인기
     페이지/기능·핵심 CTA/문의가 숫자 0 대신 `미연결` 또는 `집계 전`으로 보이는지
     확인한다. Search Console, 로컬 제품 사용, 문의/결제 원장을 서로 다른 원천과
     상태로 표시하고 로컬 원시 레코드를 방문자·완료 워크플로우·매출로 해석하지 않는다.
  5. CEO가 한 차례만 실행하는 typecheck·lint·test·build 결과와 실물 확인 결과를 받은
     뒤 검수 로그와 상태를 최종 갱신한다. 명령 결과를 받기 전에는 실행 예정·미확인으로
     구분해 기록한다.
- **금지 사항:** 공개·유료 배포, push·병합·커밋, 외부 시스템 쓰기, 운영 데이터·DB·권한
  변경, 비밀값·측정 ID·속성 ID·토큰·개인정보 기록, 미수집 지표를 0으로 표기, 클릭을
  매출로 해석, 지정 세 파일 밖의 수정, 문서 Maker가 npm 전체 검증을 중복 실행하는 행위
  (CEO가 승인 범위에서 한 차례 실행하는 검증은 허용).
- **위험등급:** R2 — 정본과 분석 상태 계약을 함께 바꾸지만 런타임 계측이나 개인정보
  전송 동작은 바꾸지 않는다. 독립 Checker 검수가 필수다.
- **예상 대표자 투입시간:** 15~25분 — 현황판 실물 확인, 전체 검증 결과 확인, T-01~T-04
  승인 여부 판단은 별도다.
- **롤백 방법:** 세 파일의 SB WO-001 변경분만 승인 전 기준으로 되돌린다. 다른 사용자·
  세션의 미커밋 변경은 건드리지 않으며, 배포·DB·외부 시스템 롤백은 발생하지 않는다.
- **보고 형식:** 변경 파일과 각 SHA256, 구현 요약, 검증 명령·작업 디렉터리·exit code·
  관찰 결과, 가정·한계·남은 위험을 기록한다. Maker는 PASS나 회귀 없음으로 최종
  판정하지 않고 Checker와 CEO가 판정한다.

#### 상태 이력

- 2026-08-13 00:07 KST — 대표 승인에 따라 `발행`.
- 2026-08-13 00:07 KST — 문서 Maker가 착수하여 `진행`.
- 2026-08-13 00:13 KST — CEO 명령 검증 결과를 반영하고 독립 Checker·실물 확인 단계인
  `검수`로 이동.
- 2026-08-13 00:16 KST — Codex in-app Browser의 로컬 파일 접근 차단으로 실물 확인을
  `BLOCKED_ENVIRONMENT`로 기록하고 `검수` 유지.
- 2026-08-13 00:26:25 KST — 독립 Checker가 DoD 1~5를 모두 PASS로 판정. 위험등급 R2
  유지, 최소 재작업 없음.
- 2026-08-13 00:27 KST — CEO가 문서·분석 상태 갱신 목적 달성을 인정해
  `ACCEPT WITH FOLLOW-UP`으로 판정하고 `완료`로 이동.

### SB WO-002 — AIDE 현황판·유입 통계 최신화

- **ID:** `SB WO-002`
- **우선순위:** P0
- **담당:** CEO(Sol, 작업 통제·최종 판정) / Terra(문서 Maker) / 독립 Checker(읽기 전용 검수)
- **목표일:** 2026-08-15 KST
- **의존성:** `docs/COMPANY.md` v0.1.2 §§2·5·6·7, AIDE
  `docs/ANALYTICS_STANDARD_V1.md` v1 §§1~2·4·7~10, AIDE
  `data/analytics-contract.json`의 `statusReport` 계약, 2026-08-15 대표 지시와 저장소 실측
- **목표:** canonical CEO 현황판과 분석 상태를 2026-08-15 KST 요청 시점의 정본·Git·분석
  원천 실제 상태에 맞춰 갱신한다. 원천이 확인되지 않은 값은 숫자로 꾸미지 않고 연결 상태와
  한계로 보고한다.
- **배경:** `docs/COMPANY.md` §2는 수익화 이전 로컬 제품 검증 단계를, §5는 트래픽·생성량이
  아닌 실제 제작 결과를 KPI로 요구한다. §6은 NOW 진행 상태를, §7.4·§7.9는 증거 기반 완료와
  주요 작업 후 현황판 갱신을 요구한다. AIDE 규격은 미배포·미계측을 방문자 0과 구분하고,
  공급자·단위가 다른 방문·제품 사용·실제 전환 원천을 합산하지 않도록 한다.
- **변경 범위:** `docs/WORK_ORDERS.md`, `docs/dashboard.html`,
  `docs/analytics-status.json`만 수정한다.
- **완료 기준:**
  1. 시작 HEAD·미커밋·worktree를 확인하고, 공개 페이지 렌더·POST 없이 기존 공식 읽기 전용
     경로나 로컬 원장만 조사해 원천별 관측시각을 ISO 8601과 KST로 기록한다.
  2. 현황판에 `projectId=sionbanana`, 공급자, 측정 단위, 품질(`정확` 또는 `근사`), 관측시각,
     오늘·최근 7일·최근 30일을 표시한다. 가능할 때만 직전 7일·일별 30일·인기 페이지·유입경로·
     핵심 CTA·문의·예약·구매를 표시하고, 확인 불가 값은 `미연결`, `자료 없음`, `권한 없음`
     중 실제 사유로 기록한다. 기준시각·HEAD·파일 해시와 현재 단계·진척·최근 완료·진행 중 업무·
     위험·막힘·다음 행동·CEO 승인 필요사항도 2026-08-15 증거로 갱신한다.
  3. GA4·Search Console·Firebase RTDB·로컬 제품 원장·문의/예약/구매 원천을 분리하고 서로
     다른 단위를 합산하지 않는다. 날짜 경계, 관리자·개발 유입, 중복 가능성, 실제 전환 인정
     기준을 명시한다.
  4. `docs/analytics-status.json`은 AIDE 계약의 필수 필드와 허용 상태를 유지하고
     `updatedAt` 및 실제 구현·배포·검증 상태를 최신화하며 비밀·개인정보를 포함하지 않는다.
  5. JSON 파싱·AIDE 계약 필드/허용 상태·HTML 필수 섹션/라벨·금지된 숫자 대체·비밀 패턴·
     공백 오류를 로컬에서 검증한다. 독립 Checker가 같은 계약과 산출물을 재검증한 뒤 CEO가
     완료 여부를 판정한다.
  6. 로드맵 상태는 `docs/COMPANY.md` §6과 일치시킨다. 다른 상태를 시사하는 저장소 흔적은
     현황판에서 임의 승격하지 않고 CEO 안건으로 반환한다. Maker 착수 전 세 파일 SHA256을
     재확인하고 시작 기준과 다르면 덮어쓰지 않는다.
- **금지 사항:** 공개 페이지 렌더, 방문 수를 늘릴 수 있는 경로, POST·운영 쓰기, 배포·push·
  커밋·병합, 외부 계정·속성 생성, 자격증명·권한·운영 DB 규칙 변경, 측정 ID·속성 ID·토큰·
  개인정보 기록, 미수집값을 0으로 표기, 서로 다른 단위 합산, CTA 클릭을 매출로 간주,
  2026-08-12·08-13 수치를 2026-08-15 현재값처럼 재사용, 지정 세 파일 밖의 수정.
- **위험등급:** R2 — 정본 뷰어와 AIDE 상태 계약을 함께 바꾸므로 독립 Checker가 필수다.
  런타임 계측·외부 수집·개인정보 전송 동작은 바꾸지 않는다.
- **예상 대표자 투입시간:** 15~25분 — 최신 원천·한계 확인과 승인 필요사항 판정.
- **롤백 방법:** 세 파일의 `SB WO-002` 변경분만 시작 시점 SHA256 기준으로 되돌린다. 다른
  사용자·세션의 미커밋 변경과 외부 시스템은 건드리지 않는다.
- **보고 형식:** 결론 / 갱신한 현황판 경로 / 현재 분석 원천 / 최신 핵심수치 / 보완한 내용 /
  검증 증거 / 대표 승인 필요사항 / 남은 한계.

#### 상태 이력

- 2026-08-14 23:53 UTC (2026-08-15 08:53 KST) — 대표 지시에 따라 `발행`.
- 2026-08-14 23:53 UTC (2026-08-15 08:53 KST) — 정본·Git 대조와 분석 원천 읽기 전용 정찰에 착수하여 `진행`.
- 2026-08-15 00:14 UTC (2026-08-15 09:14 KST) — Maker가 현황판과 분석 상태를 확정 관측에 맞춰 교정하고 최소 로컬 검증 후 독립 Checker 단계인 `검수`로 이동. 최종 판정은 대기한다.
- 2026-08-15 00:19 UTC (2026-08-15 09:19 KST) — 독립 Checker 1차 판정은 내용 DoD
  1~4·6 PASS, DoD 5 FAIL이었다. 세 파일이 untracked라 병합 산출물에서 누락될 위험과
  `git diff --check`가 실제 파일을 검사하지 못한 점을 확인해 `검수` 상태에서 재작업했다.
- 2026-08-15 00:19 UTC (2026-08-15 09:19 KST) — 정확히 대상 세 파일만 Git 추적 대상으로
  staged하고 `git diff --cached --check` exit 0을 확인해 독립 Checker 재판정을 요청했다.
- 2026-08-15 00:21 UTC (2026-08-15 09:21 KST) — 독립 Checker 재판정에서 DoD 1~6 전부
  PASS, 최소 재작업 없음으로 확인했다. CEO가 `ACCEPT WITH FOLLOW-UP`으로 판정해 `완료`로
  이동했다.

### SB WO-003 — 저장소·맥락 1차 안정화

- **ID:** `SB WO-003`
- **우선순위:** P0
- **담당:** CEO(Sol, 계약·최종 판정) / Terra(Maker, 유일 writer) / 독립 Checker(읽기 전용)
- **목표일:** 2026-08-16 KST
- **상태:** `완료` — 후보 `bfea5938` 독립 Checker PASS, CEO `READY_FOR_CLEANUP`.
- **위험등급:** R2 — 다중 브랜치 이력·정본·분석 상태 계약을 한 후보로 통합하므로 독립
  Checker가 필수다. 런타임 인증·권한·배포·운영 데이터는 변경하지 않는다.
- **목표:** 고유 산출물을 잃지 않으면서 canonical root
  `/Users/nohshinhee/Documents/2. coding/sionbanana`의 `feature/webtoon-studio`에 추적 가능한
  단일 로컬 후보를 만들고, 제외된 사용자·WIP·생성 파일은 바이트 그대로 보존한다.
- **배경:** WO-002 문서 3파일은 staged 상태였고, CEO 문서는 별도 보존 브랜치에, 최신
  image-gen 교훈은 local `main`에, PPT skill·스타일 38파일은 Arduino worktree에,
  Webtoon Studio 구현은 root untracked 상태로 분산돼 있었다. 삭제·stash·강제 checkout
  없이 각 소유권을 분리해야 canonical 검수가 가능하다.

#### SourceRefs와 규범 계약

| ID | 출처·버전·위치 | 핵심 규범 |
|---|---|---|
| SRC-USER-20260816 | 대표 지시 `저장소·맥락 1차 안정화`, 2026-08-16 | 모든 고유 작업 보존, WO/feature별 분리, canonical 6종 정합화, 충돌 없는 것만 통합, 좁은 검증, 삭제·push·deploy·network·install 금지 |
| SRC-AGENTS | root `AGENTS.md`, 2026-08-16 시작본 SHA256 `974eb75e…299` | 기존 dirty·사용자·타 에이전트 변경을 보존하고 증거 없이 완료를 선언하지 않음 |
| SRC-COMPANY-WO | `docs/COMPANY.md` v0.1.2와 `docs/WORK_ORDERS.md` WO-002 스냅샷 | 정본 결정·상태 기록은 실제 HEAD와 검수 상태를 반영하고, 코드 흔적만으로 완료 승격 금지 |
| SRC-AIDE-STANDARD | `/Users/nohshinhee/Documents/2. coding/aide/docs/ANALYTICS_STANDARD_V1.md` v1 §8, `/Users/nohshinhee/Documents/2. coding/aide/data/analytics-contract.json` schemaVersion 1 | 미배포=`not_deployed`, 미계측=`not_instrumented`; unavailable은 0이 아니며 공급자·단위를 합산하지 않음 |

#### 시작 기준과 출처 이력

- root base: `feature/webtoon-studio` @
  `5af8de946c8ca56ac15a49daf1ed804e78c072a6`.
- root status: `--untracked-files=all` 48 entries, newline status stream SHA256
  `186f40589e1e6020a963168b255eb761e961a6280f7b27c291e4c0ef82b95539`.
- 시작 staged 3: `docs/WORK_ORDERS.md`, `docs/dashboard.html`,
  `docs/analytics-status.json`.
- Arduino: `claude/arduino-environment-data-project-1cc604` @
  `0bd298af18d09d0a539b59c879ace78712a2f85e`; dirty skill SHA256
  `c14d65c0efbf791b4d0f92e9831497512ec9535b07a8a18e2ec5dd936eb838a4`.
- Arduino `data/styles`: 38 files, 상대경로+파일 SHA 집계
  `f35a18dd2423f0a2dc4db917ce7f89fdd55d1e614fb983afdd9cddd3ce700989`.
- local `main`: merge-base `0bd298af…` 이후 10 commits, 최종
  `9751b62a4456bbc2b19d5a04177afd2ef9844286`; 고유 변경은 image-gen skill,
  `references/LESSONS.md`, thumbnail skill 세 경로다.
- CEO source: `claude/ceo-skill-check-e77efc`의 4 doc commits
  `aab16778` → `324a14fd` → `b7f4c5d3` → `597bde4d`; 시작 `COMPANY.md`,
  `CLAUDE.md`, `PRD-sionbanana.md`는 해당 브랜치와 byte-identical이었다.

#### 인벤토리와 소유권

| 인벤토리 | 조치·소유권 |
|---|---|
| Arduino skill 1 + `data/styles` 38 | Arduino 보존 커밋 1개 후 root에는 PPT routing만 신형 skill에 적용, 자산은 byte-identical 복사 |
| WO-002 staged 문서 3 | 편집 전 독립 스냅샷 커밋으로 보존 |
| local main skill 이력 10 commits | 두 부모를 유지한 local merge commit. root skill과 main 첫 고유 커밋의 전체 SHA 동일성을 근거로 main 후속판 채택 |
| CEO 문서 `COMPANY`, `CLAUDE`, `PRD`, 대장·현황판 | source commits를 기록하고 canonical 후보에 정합화. PRD는 보조·비정본으로 명시 |
| root Webtoon WIP 16 files | untracked·미완료로 유지. clean checkout 기능으로 서술하거나 stage하지 않음 |
| 기타 제외 dirty/untracked 40 files | canonical 편집 직전 경로+내용 집계 SHA256 `c68dfcf6a4fa371a4ca8983a3ccb1da4dcce7501bbbe3f000f090d241b5524e7`; byte-identical·unstaged 유지 |
| `.codex/config.toml` | SHA256 `fdcfc227…ec1e`, secret-like 값 없음. AGENTS 안전 규칙으로 재현 가능해 필요성 미충족; untracked·unstaged 유지 |

제외 40파일 집계 레시피는 최종 `git status --porcelain=v1 --untracked-files=all` 순서에서
`.codex/config.toml`을 뺀 untracked 36파일의 `shasum -a 256` 행을 먼저, tracked modified
4파일의 같은 행을 뒤에 이어 붙인 뒤 전체 스트림을 다시 SHA256으로 계산하는 방식이다.

#### 정확한 변경 범위

1. Arduino 보존: `.claude/skills/sionbanana-image-gen/SKILL.md`, 기존
   `data/styles/**` 38파일과 해당 branch index/commit.
2. root skill 통합: image-gen skill, `references/LESSONS.md`, thumbnail skill,
   `data/styles/**` 38파일.
3. canonical/context 후보: `docs/COMPANY.md`, `docs/WORK_ORDERS.md`, `CLAUDE.md`,
   `AGENTS.md`, `docs/dashboard.html`, `docs/analytics-status.json`, `README.md`, 보조·비정본
   표기를 추가한 `docs/PRD-sionbanana.md`.
4. 위 목록 밖 root dirty/untracked/generated 파일은 읽기 전용이며 stage하지 않는다.

#### 완료 기준(Checker 판정 전 Maker DoD)

1. 시작 root/Arduino SHA·상태·38자산 집계가 고정 기준과 일치한다.
2. Arduino 39경로만 비밀 패턴 검사·stage하고 로컬 보존 커밋을 만든다.
3. WO-002 staged 3파일을 편집 전 JSON·HTML·공백 검사 후 별도 로컬 커밋한다.
4. local main 고유 변경이 세 skill 경로뿐임을 merge-tree/diff로 확인하고 두 이력을 merge
   commit으로 보존한다. 의미 선택이 필요한 충돌이면 중단한다.
5. Arduino 자산 38파일을 byte-identical로 복사하고 PPT routing만 최신 merged skill에
   적용한다. 스타일 ID·spec cut·HTML 참조·PNG 33개가 1:1이고 누락이 없어야 한다.
6. COMPANY·WORK_ORDERS·CLAUDE·AGENTS·dashboard·analytics-status를 실제 후보 상태와
   정합화한다. Webtoon은 WIP, T-01은 `UNAPPROVED — implement 금지`, SB WO-003은 `검수`다.
7. README는 확인된 모델·인증·저장·route만 갱신하고, PRD는 보조·비정본으로 명시한다.
8. 2026-08-16 로컬 원천 5종을 읽기 전용으로 재집계하고 source별 관측시각·단위를
   분리한다. 외부 GA4·Search Console·전환은 `미연결/자료 없음`을 유지한다.
9. JSON/AIDE 계약, HTML parse, canonical pointer/content, asset count/digest/reference,
   diff 공백과 제외 인벤토리 무변경을 좁게 검증한다. 실행 동작을 바꾸지 않았으므로 전체
   build/test는 수행하지 않는다.

#### 금지 사항

- `reset --hard`, 내용 폐기 checkout/restore, force push·push, stash·삭제, worktree/branch
  create/delete/prune, 파일 삭제·이동, 배포, fetch/network, dependency install, 외부·운영 쓰기.
- 광범위 `git add`, 미승인 T-01 구현, 미수집 분석값 0 대체, 서로 다른 레코드 단위 합산,
  Webtoon WIP를 clean checkout 구현으로 표현, Maker의 PASS·회귀 없음·완료 자기 판정.

#### 보존 커밋과 롤백

- Arduino 보존: `b273f7db8ef82ccb30e37fc0dd067386b4fd8a84`.
- WO-002 스냅샷: `661bc1c5b6c06d91db0c98127c88b4f8c74c99df`.
- local main merge: `55eabb0ca036c8064aa304dfa504cdfbd225b2fc`.
- PPT root 통합: `f90b87513f566c532e6335f86ab514fcf88ca6a6`.
- canonical 후보: `bfea5938984ebbe3d6c6a1b6d40303d0e4c387fe`.
- 모든 보존점은 local commit이며 외부 push가 없다. 롤백이 필요하면 Checker가 지정한 후보
  변경만 새 작업으로 되돌리고, 기존 사용자·WIP 파일이나 보존 branch를 삭제하지 않는다.

#### 보고 형식

- 기준 HEAD, 산출물 commit SHA와 commit별 정확한 파일, 보존/제외 인벤토리, 명령·작업
  디렉터리·exit code·수집/통과/실패/skip 수, 가정, 한계, 최종 해시를 기록한다.
- Maker는 관찰 사실만 반환하고 `PASS`를 선언하지 않는다. Checker는 독립 위험등급,
  DoD별 충족표, 경계 사례, `PASS/FAIL/INCONCLUSIVE`, 최소 재작업을 반환한다.

#### 상태 이력

- 2026-08-16 KST — 대표 안정화 지시로 `발행`, Sol이 R2·직렬 실행·유일 writer 계약을 확정.
- 2026-08-16 KST — 시작 48-entry status와 Arduino skill/38자산 해시 일치 후 `진행`.
- 2026-08-16 KST — Arduino, WO-002, local main, PPT를 네 로컬 보존점으로 분리하고 canonical
  문서 후보 작성에 착수. 삭제·push·deploy·network 없음.
- 2026-08-16 KST — Maker가 좁은 검증과 최종 인벤토리 대조 후 독립 Checker 단계인
  `검수`로 인계한다. 최종 판정과 정본 승격은 대기한다.
- 2026-08-16 KST — 독립 Checker가 후보 `bfea5938`을 R2-high로 재평가하고 DoD 전 항목
  PASS(두 비차단 제한 포함)로 판정했다. 허용 범위 밖 변경·유실·ref/worktree 삭제 없음.
- 2026-08-16 KST — CEO가 외부 AIDE 원계약을 직접 재대조하고 제외 40파일 집계 해시를
  재현해 두 제한을 해소했다. 최종 판정 `READY_FOR_CLEANUP`, v0.1.3 정본 승격, WO 완료.
- 2026-08-17 KST — R3 cleanup Checker가 기록 커밋 `715cde98`과 exact branch 후보 2개를
  DoD 5/5 PASS로 판정. 추가 worktree 3개는 ignored 파일·고유 커밋 때문에 제거 대상에서 제외.
- 2026-08-17 KST — `claude/key-visual-work-721540`(`0bd298af`)과
  `claude/skill-hope-lessons`(`9751b62a`)만 `git branch -d`로 삭제. worktree 4개, WIP 41경로,
  Arduino/CEO source branch와 ignored 자산을 보존하고 `CANONICAL_CONFIRMED`로 마감.

## 검수 로그

판정은 해당 지시서 아래에 검수 로그 항목으로 남긴다 — 재실행한 검증 커맨드, 독립 재계산,
실물 확인 내용, 세션의 일탈·가정에 대한 승인/반려, 병합 커밋 해시까지 기록한다.

### SB WO-003 — 저장소·맥락 1차 안정화

- 검수 기준: base `5af8de94`, 후보 `bfea5938984ebbe3d6c6a1b6d40303d0e4c387fe`,
  Arduino 보존 `b273f7db`, main merge `55eabb0c`, PPT 통합 `f90b8751`.
- Maker 관찰: 표적 검증 9묶음 수집·9통과·0최종실패. 실행 동작 변경이 없어 전체
  build와 전체 test는 2건 skip. 제외 WIP 40파일+별도 config 1파일은 시작 해시 유지.
- 독립 Checker: R2-high, `PASS`. 변경 49경로가 skill 3 + styles 38 + context 8 allowlist와
  일치하고 main 10·CEO 4·Arduino 39 입력·worktree 4개가 모두 보존됐다고 판정.
- CEO 재검증: AIDE 원계약 required fields/status enum/daily30 합계 `true`, HTML parse 성공,
  로컬 원천 독립 재집계 5종 일치, 제외 WIP 집계 `c68dfc…524e7` 재현, staged 0 확인.
- **최종 판정:** `READY_FOR_CLEANUP`. 후보를 v0.1.3 활성 정본으로 승인하고 SB WO-003을
  완료한다. worktree·branch 삭제, push·deploy, 외부 변경은 수행하지 않았으며 T-02 별도
  승인이 필요하다.
- **cleanup 마감:** 2026-08-17 R3 Checker DoD 5/5 PASS 후 병합 브랜치 2개만 비강제
  삭제했다. 실행 후 root staged 0, 기존 modified 4 + untracked 37, worktree 4개,
  `data/styles` 38파일을 재확인했다. 추가 worktree는 보존했고 최종 판정은
  `CANONICAL_CONFIRMED`다. push·deploy·force·external 변경은 0건이다.

- `SB WO-001` 명령 검증 — 기준 HEAD
  `5af8de946c8ca56ac15a49daf1ed804e78c072a6`, 작업 디렉터리
  `/Users/nohshinhee/Documents/2. coding/sionbanana`.
  - `npm run typecheck`: exit 0.
  - `npm run lint`: exit 0. 기존 React Hooks 및 `next/image` 관련 경고 12건 관찰.
  - `npm test`: exit 0. tests 154 / pass 154 / fail 0 / cancelled 0 / skipped 0 / todo 0.
  - `npm run build`: exit 0. compile 성공, static pages 28/28. 같은 lint 경고 12건과
    Browserslist·`baseline-browser-mapping` 데이터 노후 안내 관찰.
- 위 결과는 명령 실행 관찰이며 제품 전체 회귀 또는 실물 검수 완료 판정이 아니다. 독립
  Checker 계약 대조 후 최종 판정하되, 환경 차단된 실물 확인은 미실행 한계로 남긴다.
- `SB WO-001` 브라우저 실물 확인 — 2026-08-13 00:16 KST, Codex in-app Browser에서
  로컬 `file://` 현황판 URL 열기를 시도했으나 보안 정책으로 차단되어 렌더 확인은
  미실행. 원인 분류는 `BLOCKED_ENVIRONMENT`다. 정책에 따라 다른 브라우저, 로컬 서버,
  우회 경로로 재시도하지 않는다. HTML 파싱과 필수 구조·라벨 검증을 대체 증거로
  사용하되 실물 확인 완료로 인정하지 않는다.
- 독립 Checker 최종 판정 — 기준시각 `2026-08-13T00:26:25+0900`, 기준 HEAD
  `5af8de946c8ca56ac15a49daf1ed804e78c072a6`. 검수 대상 SHA256은
  `docs/WORK_ORDERS.md` `ff8a74186bceacfecf6bdd697b64bf24d2377c3475ed642076942ade7770eb88`,
  `docs/dashboard.html` `b5d86b211d9644d9cf5121474d25b9a933bc5a94f83867e39450208d2b07f915`,
  `docs/analytics-status.json` `26802d0c97c1c66ed378706f1f90be60a19e80af40662d450ad5237f7da0f012`로
  기준과 일치. 독립 재평가 위험등급 R2 유지, DoD 1~5 전부 PASS, 최소 재작업 없음.
- CEO 최종 판정 — `ACCEPT WITH FOLLOW-UP`. 문서·분석 상태 갱신 목적은 달성되어
  `완료`로 기록한다. 후속 한계는 브라우저 `file://` 정책으로 실물 렌더가 미실행인 점과
  대상 문서가 현재 브랜치에서 untracked인 점이다. 이 판정은 제품 전체 실물·회귀 PASS를
  뜻하지 않는다.
- `SB WO-002` 시작 상태 확인 — 기준 HEAD
  `5af8de946c8ca56ac15a49daf1ed804e78c072a6`, 작업 디렉터리
  `/Users/nohshinhee/Documents/2. coding/sionbanana`.
  - `git status --short`: tracked dirty 5파일(`AGENTS.md`, `scripts/agent-generate.mjs`,
    `scripts/agent-video.mjs`, `scripts/storyboard.mjs`, `tests/storyboard.test.mjs`) +
    다수 untracked 관찰. 기존 변경 보존.
  - `git worktree list`: canonical + 3개 worktree 관찰.
  - `rg -n "gtag|GTM-|google tag|measurementId|analytics|GA4|firebase analytics|search console|gtm" -S ...`:
    docs 내 과거 보고 외 계측 코드 미발견.
- `SB WO-002` Maker 인계 관찰 — 기준 HEAD
  `5af8de946c8ca56ac15a49daf1ed804e78c072a6`, 원천 관측시각
  `2026-08-14T23:57:28.289Z` / `2026-08-15 08:57:28 KST`.
  - 시작 SHA256 세 건이 지시 기준과 일치했고, tracked dirty 5파일과 다수 untracked,
    canonical 외 worktree 3개를 관찰했다. 기존 변경은 보존했다.
  - 로컬 원천별 exact 재집계: images 총 4,818 / 오늘 0 / 7일 78 / 직전7일 312 /
    30일 2,200; videos 83 / 0 / 0 / 4 / 4; agent runs 2,469 / 0 / 36 / 290 /
    1,596; motion 27 / 0 / 5 / 0 / 27; webtoon 1 / 0 / 0 / 0 / 0. 서로 다른
    원천·단위는 합산하지 않았다.
  - 저장소에서 GA4·Search Console·Firebase Analytics·공개 URL·사업 전환 원장을
    확인하지 못했다. Firebase RTDB safe shallow GET은 실행환경 DNS 경계로 응답을 받지
    못해 `권한/환경 경계로 확인 불가`로 분리했다. 공개 페이지 렌더·POST·외부 쓰기는
    하지 않았다.
  - `python3 -m json.tool docs/analytics-status.json`: exit 0.
  - AIDE `analytics-contract.json` 대조: exit 0. 필수 필드 누락 0, 배포·계측 상태 허용값,
    일별 30일 항목 30개를 확인했다.
  - Python 표준 HTML parser: exit 0. 필수 섹션·라벨, GA4 미수집값의 숫자 0 오표기 없음,
    이종 단위 합산값 제거, T-05 방향 가드, 비밀 패턴 없음 확인.
  - `git diff --check -- docs/dashboard.html docs/analytics-status.json docs/WORK_ORDERS.md`:
    exit 0. 다만 당시 세 파일이 untracked여서 이 명령은 실질 공백 검사 근거로 인정하지 않는다.
- Maker 관찰과 인계 기록이며 PASS·회귀 없음·완료 판정이 아니다. 독립 Checker가 같은 계약과
  산출물을 재검증한 뒤 CEO가 최종 판정한다.
- `SB WO-002` 독립 Checker 1차 판정 — `FAIL`. 대상 산출물의 JSON·HTML·AIDE 계약·수치·
  원천 분리·정본 NOW 1/5·T-05 방향 가드는 PASS였으나 세 파일이 untracked여서 canonical
  갱신 누락 위험이 있고 기존 `git diff --check`가 공백을 실제 검사하지 못했다.
- CEO 최소 재작업 — 다른 staged 변경이 없음을 먼저 확인하고
  `git add -- docs/WORK_ORDERS.md docs/dashboard.html docs/analytics-status.json`으로 정확히
  세 파일만 추적 대상으로 추가했다. `git diff --cached --name-status`는 세 파일만 `A`,
  `git diff --cached --check`는 exit 0이었다. 커밋·push·배포는 실행하지 않았다.
- `SB WO-002` 독립 Checker 재판정 — 기준 HEAD
  `5af8de946c8ca56ac15a49daf1ed804e78c072a6`. 검수 대상 SHA256은
  `docs/WORK_ORDERS.md` `31cbccc7fea240895fc2f9abc61d76bdc6a3a9943ef4ea13a7363c17cad2c65d`,
  `docs/dashboard.html` `748dcd4c96181b7a0d9c5f0479fbea8ebba36fb7f3ead6c34319c581e44847a0`,
  `docs/analytics-status.json` `ade263df6e1b0a456e4716e311194d9193ce060c34c6557bede51d828b8e8352`로
  시작·종료가 일치했다. 독립 위험등급 R2 유지, DoD 1~6 전부 PASS, 최소 재작업 없음.
- CEO 최종 판정 — `ACCEPT WITH FOLLOW-UP`. 2026-08-15 기준 실제 원천·수치·미연결 상태를
  canonical 현황판과 분석 상태에 반영한 목표는 달성해 `완료`로 기록한다. 후속 한계는
  GA4·Search Console·사업 전환 원천 미연결, RTDB 확인 불가, 대상 세 파일 staged·미커밋,
  그 밖의 정본 사본 untracked 상태다. 이 판정은 제품 전체 기능·실물·회귀 PASS가 아니다.
