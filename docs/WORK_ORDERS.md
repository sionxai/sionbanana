# Sion Banana — 작업지시 대장 (WORK_ORDERS)

> - 정본: `docs/COMPANY.md` — 전략·우선순위 충돌 시 COMPANY.md가 우선한다.
> - 지시·보고·대화에서 지시는 **`SB WO-###`**로 부른다 (타 프로젝트 대장과 혼동 방지).
> - 상태 흐름: `초안 → 발행 → 진행 → 검수 → 완료/반려`. 상태 변경은 즉시 이 문서에 반영한다.
> - 작업 세션은 자기 브랜치 커밋까지만 수행한다. 병합·push·배포는 CEO가 검수 후 수행한다.
> - 현황판 `docs/dashboard.html`은 이 대장과 COMPANY.md를 요약하는 뷰어 전용 문서다 (COMPANY.md §7-9).

## 대표자 할 일

- [ ] T-01 미션 확장 개정안(v0.2.0) 승인 여부 결정 — "AI 고품질 미디어 제작 전반(이미지·영상·영화·CF·PPT + 스토리·시나리오)" 반영. CEO 제안문 참조.
- [ ] T-02 워크트리·브랜치 정리안 승인 여부 결정 — 1단계(잔여 워크트리 3개 정리) + 2단계(main ↔ feature/webtoon-studio 통합 방향). CEO 제안문 참조.
- [ ] T-03 자격증명 노출 대응안 승인 여부 결정 — 사용처 확인 및 필요한 교체 범위를 먼저 확정한다.
- [ ] T-04 모션에셋 결함 수정안 승인 여부 결정 — 4위상 프롬프트 중복과 2행 시트 미러링 진단을 바탕으로 수정 범위를 확정한다.
- [ ] T-05 웹 유입 추진 여부 결정 — 현재 로컬·미배포 방침을 유지하면 보류한다. 추진하려면 COMPANY.md DN-002/DEC-007 방향 재검토와 공식 공개 경로 확정 후 GA4·Search Console 속성, 읽기 권한, 배포를 각각 승인한다.

> T-01~T-05는 모두 **미승인 대표자 제안**이며 정식 작업지시가 아니다. 승인된 작업은 아래
> 상태표와 지시서에 `SB WO-###`로만 기록한다.

## 세션 명부

| 이름 | 전담 영역 | 현재 임무 | 이력 |
|---|---|---|---|
| CEO | 기획·전략·작업지시·검수·정본 관리 | SB WO-002 완료 · 대표 안건 T-01~T-05 결정 대기 | 2026-08-07 취임 |

## 상태표

| ID | 발행일 | 제목 | 담당 | 우선순위 | 목표일 | 상태 | 검수 결과 |
|---|---|---|---|---|---|---|---|
| SB WO-001 | 2026-08-13 | CEO 현황판·AIDE 분석 상태 정본 갱신 | CEO(Sol) / 문서 Maker(Luna) | P0 | 2026-08-13 | 완료 | PASS · ACCEPT WITH FOLLOW-UP |
| SB WO-002 | 2026-08-15 | AIDE 현황판·유입 통계 최신화 | CEO(Sol) / 문서 Maker(Terra) / 독립 Checker | P0 | 2026-08-15(KST) | 완료 | PASS · ACCEPT WITH FOLLOW-UP |

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

## 검수 로그

판정은 해당 지시서 아래에 검수 로그 항목으로 남긴다 — 재실행한 검증 커맨드, 독립 재계산,
실물 확인 내용, 세션의 일탈·가정에 대한 승인/반려, 병합 커밋 해시까지 기록한다.

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
