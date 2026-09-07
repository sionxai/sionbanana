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
- [x] T-04 모션에셋 결함 수정안 승인 — 2026-09-07 대표 지시("권장순서대로 수정해줘", 모션 디벨롭 제안 6항목 판정의 1순위)로 승인. 수정 범위 = `SB WO-007`(walk/run/idle 8위상 배분·jump/attack 단발 종료 문장·행 방향 지시 강화·2행 미러링 자동 감지→`flipX`). 후속 단계(프리셋 10종·재생 기본값·프레임 표시 → 모션 세트·베이스 결속·통합 내보내기 → 구간 재생성 스파이크)는 WO-008 이후로 순차 발행한다.
- [ ] T-05 웹 유입 추진 여부 결정 — 현재 로컬·미배포 방침을 유지하면 보류한다. 추진하려면 COMPANY.md DN-002/DEC-007 방향 재검토와 공식 공개 경로 확정 후 GA4·Search Console 속성, 읽기 권한, 배포를 각각 승인한다.
- [ ] T-06 `~/.codex/config.toml` 스키마 충돌 대응 방향 결정 — `[agents]` 블록(ChatGPT 데스크톱 앱 기록)이 codex CLI 0.144.0 파서와 충돌해 **codex CLI·MCP 기동 불능** (2026-08-21 실측, CEO는 임시 CODEX_HOME으로 우회 중). 앱이 소유한 파일이라 임의 수정 보류 — 앱 업데이트 대기 / CLI 채널 갱신 / 블록 수동 조정 중 택일 필요. **2026-09-07 추가 실측:** codex CLI 0.153.4에서 동일 config로 `codex exec` 정상 기동(우회 불필요). 대표 확인 후 닫기 후보.
- [ ] T-07 모션 "문제 구간 선택·수정 → 재생성 → 전후 비교 → 적용/되돌리기"(제안 항목 5·6) 구현 범위 결정 — 3단계 스파이크(2026-09-07) 결과: 마스크 인페인팅 **지원 확인**(`input_image_mask`, 얼굴·옷·배경 보존, `input_fidelity`는 거부), 앵커 스트립 재생성은 유효 5/10에서 연속성 5/5·정체성 5/5·스케일 +18% 일정, 무효 5/10은 인접 셀 접촉 슬라이싱 병합(레이아웃·격자로 대응 가능). 선택지: (A) 마스크 모드만 먼저 / (B) 마스크+스트립 동시 / (C) 보류. 규모 대(세션 분할). 제안 전문: 스크래치패드 `wo012-proposal.md`(승인 시 대장 전재).

> T-02의 위 exact local cleanup만 2026-08-17 대표 결정으로 승인·실행됐다. T-01·T-03~T-06과
> T-02의 추가 삭제·prune·push는 미승인이며, 정식 작업지시는 아래 상태표에 `SB WO-###`로 기록한다.

## 세션 명부

| 이름 | 전담 영역 | 현재 임무 | 이력 |
|---|---|---|---|
| CEO | 기획·전략·작업지시·검수·정본 관리 | 모션에셋 디벨롭 프로그램 진행 — SB WO-007(T-04 수정) → WO-008(프리셋·재생·표시) → 세트/내보내기 → 구간 재생성 스파이크 | 2026-08-07 취임 |

## 상태표

| ID | 발행일 | 제목 | 담당 | 우선순위 | 목표일 | 상태 | 검수 결과 |
|---|---|---|---|---|---|---|---|
| SB WO-001 | 2026-08-13 | CEO 현황판·AIDE 분석 상태 정본 갱신 | CEO(Sol) / 문서 Maker(Luna) | P0 | 2026-08-13 | 완료 | PASS · ACCEPT WITH FOLLOW-UP |
| SB WO-002 | 2026-08-15 | AIDE 현황판·유입 통계 최신화 | CEO(Sol) / 문서 Maker(Terra) / 독립 Checker | P0 | 2026-08-15(KST) | 완료 | PASS · ACCEPT WITH FOLLOW-UP |
| SB WO-003 | 2026-08-16 | 저장소·맥락 1차 안정화 | CEO(Sol) / Maker(Terra) / 독립 Checker | P0 | 2026-08-16(KST) | 완료 | PASS · CANONICAL_CONFIRMED |
| SB WO-004 | 2026-08-21 | MCP 영상 도구 create_video·get_video | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-08-22(KST) | 완료 | PASS · 스모크 실증 · 병합 7e12d8f3 |
| SB WO-006 | 2026-09-02 | 영상 소스 upload 변형 — 프레임 체이닝 1급화 | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-09-03(KST) | 완료 | PASS · 체이닝 스모크 YAVG 3.16 · 병합 1ffdc4b3 |
| SB WO-007 | 2026-09-07 | 모션에셋 T-04 결함 수정 — 8위상 배분·단발 종료·2행 미러링 자동 반전·행 반복 자동 제외 | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-09-07(KST) | 완료 | PASS · 84/84 · 실생성 9장 스모크 · 병합 89ee900f(서버 재기동 대기) |
| SB WO-008 | 2026-09-07 | 모션 프리셋 10종·동작별 재생 기본값·프레임 정보 표시·슬로모션·MCP 감지 요약 | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-09-07(KST) | 완료 | PASS · 95/95 · 장전·피격 실생성 · 브라우저 실물 · 병합 875133b7 |
| SB WO-009 | 2026-09-07 | 모션 세트 서버측 — 베이스 결속·다중 동작 순차 생성·공통 설정+예외·상태 추적 | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-09-07(KST) | 완료 | PASS · 93/93 · 세트 실기 3/3+왼쪽 반전 · 병합 e20bfe35 |
| SB WO-010 | 2026-09-07 | 모션 세트 UI — 세트 만들기·공통 설정+동작별 예외·상태판 | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-09-07(KST) | 완료 | PASS · tsc/lint 0 · 브라우저 전 흐름 실물 · 병합 62e4c98e |
| SB WO-011 | 2026-09-07 | 세트 통합 내보내기(시트+JSON) · MCP 세트 도구 | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-09-07(KST) | 완료 | PASS · 47/47 · ZIP 실기 · MCP 4도구 실호출 · 병합 2d7ea239 |

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
- **상태:** `완료` — 후보 `bfea5938` 독립 Checker PASS, exact cleanup 후 CEO `CANONICAL_CONFIRMED`.
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

### SB WO-004 — MCP 영상 도구 create_video·get_video

- **ID:** `SB WO-004`
- **우선순위:** P1
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현 — 2단 위임) / 검수 CEO 직접
- **목표일:** 2026-08-22 KST
- **의존성:** 기존 모션 MCP 패턴(`create_motion`→`get_motion`), `/api/video` 계약(불변),
  Codex 자문(2026-08-21, gpt-5.6-terra read-only — 대장 외부 기록), 대표 승인(2026-08-21)
- **목표:** sionbanana MCP(`scripts/mcp-server.mjs`)에 `create_video`(비동기 잡 생성)와
  `get_video`(폴링) 2개 도구를 추가해, 클로드·코덱스 외부 세션이 로컬 이미지 id로 영상을
  생성하고 결과 파일 경로를 받을 수 있게 한다.
- **배경:** 영상 생성은 6월부터 앱(`/api/video`)·CLI(`agent-video.mjs`)에 존재하나 MCP
  도구가 없어 외부 세션에서 접근 불가(2026-08-21 CEO 조사). COMPANY.md §7-1 핵심 흐름
  우선 원칙 내에서 기존 기능의 접근성 개선이며 T-01 미션 확장과 무관 — 신규 기능·확장
  아님. KPI 관측: 검수 시 MCP 경유 영상 제작 1회 실기 확인으로 갈음.
- **변경 범위 (이 3개 파일만):**
  1. `scripts/mcp-server.mjs` — 도구 2개 등록
  2. `scripts/video-worker.mjs` — 신규 detached worker (`motion-worker.mjs` 미러)
  3. `tests/mcp-video.test.mjs` — 신규 계약·상태 전이 테스트 (mock, 실서버 무의존)
- **핵심 계약:** `create_video` 즉시 `running`+jobId 반환(waitMs≤30000 지원) / 잡 기록
  `data/video-jobs/` / `get_video`는 `running|ready|failed`만 반환 / `failed`엔 조치 가능한
  `reason`(+서버 에러 코드 보존) / `ready`엔 절대 `videoPath`(실존·크기>0 검증)+bytes+
  contentType+sha256, base64 금지 / 입력 source는 `{type:"imageId"}` 단일 변형(유니온 확장
  후속) / worker 타임아웃 `SIONBANANA_VIDEO_TIMEOUT_MS` 기본 20분, deadline 초과 시
  `failed` 전환 / preflight는 서버 health까지만(progrok 문제는 잡 실패로 기록).
- **완료 기준(검증 커맨드):** `node --check` 2파일 / package.json test 규약(register-ts-alias
  --import)으로 `tests/mcp-video.test.mjs` PASS / 회귀: 같은 방식 `tests/motion-mcp.test.mjs`
  `tests/mcp-server-batch.test.mjs` PASS / 검수 시 CEO가 재실행 + 실기 스모크(create→ready→
  파일 실존) 1회.
- **금지:** 변경 3파일 밖 수정, `/api/video`·기존 12개 도구 동작 변경, git commit·push,
  npm install, 테스트의 실서버·네트워크 의존, base64 결과 반환.
- **위험등급:** R2 — 공유 파일 `mcp-server.mjs` 수정, 회귀 테스트 필수. 런타임 앱 코드 불변.
- **예상 대표자 투입시간:** 0~5분 (검수 완료 보고 확인만).
- **롤백:** 전용 브랜치(`claude/sb-wo-004-mcp-video`) 폐기로 완결. canonical 불변.
- **보고 형식:** 변경 파일 / 구현 요약 / 검증 커맨드·exit code·테스트 로그 / 가정 / 미해결.
  Maker는 PASS 자기 판정 금지, 무증거 완료 주장은 반려. 검증 미실행 항목은
  '구현 완료 / 검증 미실행'으로 구분.

#### 상태 이력

- 2026-08-21 17:5x KST — 대표 승인("승인")으로 `발행`. 전용 워크트리
  `.claude/worktrees/sb-wo-004-mcp-video` (`claude/sb-wo-004-mcp-video` @ `da264feb`,
  base `feature/webtoon-studio`) 생성.
- 2026-08-21 18:0x KST — Maker(Codex exec, --full-auto 샌드박스·네트워크 차단) 구현 반환.
  porcelain 대조로 지정 3파일만 변경 확인, `검수` 진입.
- 2026-08-21 18:12 KST — CEO 재검증 통과(구문 2파일·신규 6/6·회귀 11/11) + 결함 1건
  직접 수정 + 실기 스모크 `ready` 실증. `완료`. 병합 `7e12d8f3`.

### SB WO-006 — 영상 소스 upload 변형 (프레임 체이닝 1급화)

- **ID:** `SB WO-006` · **우선순위:** P1 · **목표일:** 2026-09-03 KST
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현 — 2단 위임) / 검수 CEO 직접
- **의존성:** SB WO-004 계약(`create_video`/`get_video`), 모션 upload 검증 헬퍼, `lib/local/storage.ts` 이미지 저장 규약, 대표 승인(2026-09-02 "A,B 파트 전부 진행")
- **목표:** `create_video.source`에 `{type:"upload", imagePath|dataUrl}` 추가. MCP가 이미지를 `data/images/<월버킷>/`에 png+json+thumb.webp로 등록 후 기존 imageId 흐름으로 진행 → 컷1 마지막 프레임 경로만 넘기면 컷2가 이어짐(프레임 체이닝). 응답에 `sourceImageId` 포함.
- **배경:** 2026-09-02 실측 — 다른 세션이 raw 파일 쓰기(`data/images/refs-hope/chain-dragon-cut1-end.png`)로 체이닝을 실증. 이를 도구 계약으로 승격해 raw 쓰기 없이 재현 가능하게 한다(COMPANY §7-1 핵심 흐름 내 접근성 개선, T-01과 무관). 파트 A(스킬 문서)와 짝.
- **변경 범위:** `scripts/mcp-server.mjs`, `tests/mcp-video.test.mjs` 2파일. worker·라우트 불변. 상주 서버 재기동 불필요(MCP 프로세스는 세션마다 새로 뜸).
- **완료 기준:** `node --check` / 신규·기존 `mcp-video` 테스트 PASS(upload imagePath·dataUrl·거부 5케이스·imageId 회귀) / 회귀 `motion-mcp`·`mcp-server-batch` PASS / CEO 실기 스모크: 기존 영상 마지막 프레임 → upload → `ready` + 이음매 YAVG 측정.
- **금지:** 2파일 밖 수정, 기존 도구 동작 변경, commit·push, npm install, 실서버 의존 테스트, 사이드카에 절대경로·비밀 기록.
- **위험등급:** R2(공유 파일 mcp-server.mjs) · **대표자 투입:** 0~5분 · **롤백:** 브랜치 `claude/sb-wo-006-video-upload` 폐기.
- **보고 형식:** WO-004와 동일.

#### 상태 이력

- 2026-09-02 21:1x KST — 대표 승인으로 `발행`. 워크트리 `.claude/worktrees/sb-wo-006-video-upload` (`claude/sb-wo-006-video-upload` @ `9dd7bfdb`) 생성, Maker 위임 가동.
- 2026-09-02 21:3x KST — Maker 반환, porcelain 정확히 2파일 확인 → `검수`.
- 2026-09-02 21:4x KST — CEO 재검증(구문·mcp-video 9/9·회귀 11/11) + 코드 정독 + 실기 스모크 PASS → `완료`. WO 커밋 `f389c72d`, 병합 `1ffdc4b3`.

### SB WO-007 — 모션에셋 T-04 결함 수정 (4위상 중복 · 2행 미러링)

- **ID:** `SB WO-007` · **우선순위:** P1 · **목표일:** 2026-09-07 KST
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현) / 검수 CEO 직접
- **의존성:** T-04 진단(4위상 프롬프트 중복·2행 시트 미러링, 현황판 2026-08-12), 대표 승인(2026-09-07 "권장순서대로 수정해줘" — 모션 디벨롭 제안 6항목 판정의 권장 순서 1단계), `lib/motion/*` 현행 파이프라인
- **목표:** (1) walk/run/idle 8위상 목록 + 프레임 수 균등 배분 + N>위상 수일 때 중간 포즈 문장으로 연속 중복 제거 (2) jump/attack에 루프 문장 대신 단발 종료 문장 (3) Direction 지시문의 행 단위 미러링 금지 강화(기존 "Do not mirror" 문장 유지) (4) 엔진 `detectMirroredRows`로 2행 이후 좌우 반전을 자동 감지해 해당 행 `flipX` 자동 적용 + `project.mirrorDetection` 기록(라우트 `autoFlipRows` 옵션, 업로드 시트 기본 비활성, 재빌드 시 재감지 없이 보존).
- **배경:** COMPANY.md NOW-004(프리셋·모션 실물 검수)·DEC-005(모션은 핵심 자산의 후속 출력). 원인은 2026-08-12 진단으로 확정됐고 수정 범위만 T-04로 대기 중이었다. 이후 단계(프리셋 10종·세트·구간 재생성 스파이크)의 모든 생성 품질이 이 결함에 종속되므로 1순위.
- **변경 범위:** `lib/motion/{prompt,engine,storage,types}.ts`, `app/api/motion/projects/route.ts`, `tests/motion-{prompt,engine,storage}.test.mjs` 8파일. MCP 스키마·UI·custom 프리셋 불변. 스펙 전문은 세션 스크래치패드 `wo007-spec.md`(감지 알고리즘: 48×48 alpha/luma descriptor, 행0 기준 dSame/dFlip 최소거리 비교, 행 점수 > 0.12 && 과반 양수).
- **완료 기준:** 모션 테스트 5파일(`motion-prompt/engine/storage/mcp/export`) PASS + `tsc --noEmit` exit 0 (CEO 재실행) / 코드 정독(범위·결정성·하위호환) / CEO 실기 스모크: 워크트리 개발 서버(별도 포트·격리 데이터 디렉터리)로 walk·run·idle 4×2 실생성 → 프레임 간 근사중복 수(구 프롬프트 3002 서버 대비)·2행 방향·`mirrorDetection` 확인.
- **금지:** 8파일 밖 수정, commit·push, npm install, 프리셋 추가, MCP 스키마 변경, 테스트 삭제·완화.
- **위험등급:** R2 — 프롬프트 변경은 생성 품질에 직접 영향, 자동 반전은 오판 시 행 전체 반전(단 `flipX`로 사용자 가시·수동 복구 가능, 업로드 기본 비활성) · **대표자 투입:** 0~5분 · **롤백:** 브랜치 `claude/sb-wo-007-motion-t04` 폐기.
- **보고 형식:** WO-006과 동일.

#### 상태 이력

- 2026-09-07 10:3x KST — 대표 지시로 `발행`. 워크트리 `.claude/worktrees/sb-wo-007-motion-t04` (`claude/sb-wo-007-motion-t04` @ `104e894d`, base `feature/webtoon-studio`) 생성, 시작 porcelain 0줄, Maker 위임 가동. codex CLI 0.153.4가 사용자 config로 직접 기동됨(T-06 우회 불필요).
- 2026-09-07 10:45 KST — Maker 1차 반환(정확히 8파일, "구현 완료 / 검증 미실행" — 샌드박스 키체인 -50). CEO 재실행: 79건 중 1건 실패(대칭 도형 점수 단언). 원인 = sharp 리샘플의 좌우 미세 비대칭으로 동일 프레임 행은 dSame=0 → 정규화 점수가 -1로 고정. 조치: 엔진 분모에 절대 하한 0.02 추가(잡음 기반 반전 차단, CEO 직접 4줄) + 테스트 단언 `|score|<0.05` → `score<=0`(양수 금지, 보호 조건 유지·이유 주석). → **79/79 · tsc 0** → `검수`. 1차 체크포인트 커밋 `3d4be759`.
- 2026-09-07 10:46~10:55 KST — CEO 실기 스모크(워크트리 dev 서버 3012, 격리 데이터 디렉터리; 구 프롬프트 기준선은 3002). **미러링:** 신 프롬프트 walk-1 원본 2행이 실제로 왼쪽을 향함 → `mirrorDetection` 점수 0.71로 자동 반전, 파생 8프레임 전부 오른쪽 향함(결함 B 실물 검증 1/1; 구 2건·신 나머지 6건은 미러링 없음, 점수 -0.53~-0.91). **복제:** 행 반복 비율(행간 (i,i+4) 평균거리 ÷ 행내 인접 평균거리) — 구 walk 0.46·0.34 / 신 walk 0.28·0.47 / 근·원 다리 문구 walk 0.46·0.37 / 신 run **0.08**(2행이 1행과 픽셀 동일) / idle 1.37·attack 2.00·reload 1.28. 결론: **4위상 복제는 프롬프트 문구가 아니라 모델 성향**(8위상·근원다리 문구 모두 무효, 7/7). → 결함 A 실효 수정을 위해 같은 워크트리에서 **2차 라운드 발행**: 엔진 `detectRepeatedRows`(비율<0.4) + `project.duplicateDetection` + 순환 프리셋 생성 시 반복 행 자동 `excluded`(라우트 `autoExcludeRepeatedRows`, 업로드·단발·custom 기본 off). 스펙 `wo007-round2-spec.md`, 왕복 2/2.
- 2026-09-07 11:07~11:15 KST — Maker 2차 반환(정확히 6파일, 검증 미실행 보고) → CEO 재실행 **84/84 · tsc 0** → 보관 원본 8장 재등록 스모크(아래 검수 로그) → 2차 커밋 `d9a8bde7`, 병합 `89ee900f` → `완료`. T-04 닫힘.

### SB WO-008 — 모션 프리셋 10종 · 동작별 재생 기본값 · 프레임 정보 표시 · 슬로모션 · MCP 감지 요약

- **ID:** `SB WO-008` · **우선순위:** P1 · **목표일:** 2026-09-07 KST
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현) / 검수 CEO 직접
- **의존성:** SB WO-007 병합 `89ee900f`(`isCyclicAction`·`autoFlipRows`·`autoExcludeRepeatedRows`·감지 기록), 대표 승인(2026-09-07 "권장순서대로" — 1단계), 모션 디벨롭 제안 항목 2·3·4
- **목표:** (1) 프리셋 10종+custom(대기·이동·질주·점프·공격·장전·피격·넘어짐·스턴·일어나기)과 메타데이터(라벨·순환·기본 재생·권장 프레임)를 단일 원천으로 두고 라우트·MCP·UI가 공유 (2) 생성 시 기본 애니메이션 loop가 프리셋 기본(이동 계열 loop/단발 once)을 따르고 요청 `fps`·`loop`가 우선 (3) 플레이어 `N장 / F FPS / T초` 표시 + 감지 요약 배지(중복 행 제외·2행 반전 보정) + 0.25×/0.5×/1× 슬로모션 (4) 다이얼로그 `열×행=N장` 안내와 생성 소스 12장 상한(실측 근거) (5) MCP create_motion 프리셋 10종·`autoFlipRows`·`autoExcludeRepeatedRows`·`fps`·`loop` 전달, get_motion ready 응답에 `mirroredRows`·`repeatedRows`·`excludedFrames` 요약.
- **배경:** 제안 항목 2(모션 체크 10종·동작별 설정·기본 재생 방식)·3(프레임 설정 표시, 24장은 실측과 충돌 → 8 기본/12 상한)·4(슬로모션). 세트·공통설정·상태판은 WO-009/010.
- **변경 범위:** `lib/motion/prompt.ts`, `lib/motion/storage.ts`, `app/api/motion/projects/route.ts`, `scripts/mcp-server.mjs`, `components/studio/motion/motion-create-dialog.tsx`, `components/studio/motion/motion-player.tsx`, `tests/motion-{prompt,mcp,storage}.test.mjs` 9파일. 스펙 전문: 스크래치패드 `wo008-spec.md`.
- **완료 기준:** 모션 테스트 5파일 + `mcp-server-batch` PASS · `tsc --noEmit` 0 · `next lint` 대상 2컴포넌트 0 · `node --check scripts/mcp-server.mjs` (CEO 재실행) / 코드 정독 / CEO 실기: 격리 dev 서버에서 새 프리셋 2종(장전·피격) 실생성 + 브라우저로 다이얼로그·플레이어 표시 확인 + MCP 스키마 회귀.
- **금지:** 9파일 밖 수정, commit·push, npm install, 세트/배치 기능(별도 WO), WO-007 규칙 변경, 테스트 삭제·완화.
- **위험등급:** R2(MCP 공유 파일·UI) · **대표자 투입:** 0~5분 · **롤백:** 브랜치 `claude/sb-wo-008-motion-presets` 폐기.
- **보고 형식:** WO-007과 동일.

#### 상태 이력

- 2026-09-07 11:2x KST — `발행`. 워크트리 `.claude/worktrees/sb-wo-008-motion-presets` (`claude/sb-wo-008-motion-presets` @ `088b484a`) 생성, Maker 위임 가동.
- 2026-09-07 11:25 KST — Maker 반환(정확히 9파일, "구현 완료 / 검증 미실행"). CEO 재실행: 테스트 6파일 **95/95** · tsc 0 · next lint 2컴포넌트 0 · `node --check` OK → `검수`.
- 2026-09-07 11:26~11:35 KST — 실기: 격리 dev 서버 3012에서 4×4 생성 요청 400 확인 / 장전·피격 4×2 실생성(77s·59s) → `loop=once`, 8프레임 상이(행 반복 비율 1.52·1.59), 미러링 없음 / 브라우저 실물: 플레이어 `4장 / 12 FPS / 0.33초`·배지(중복 행 제외 4장·2행 반전 보정)·0.25×/0.5×/1×, 다이얼로그 프리셋 10종+직접 입력·보조 라벨·`열×행 = 8장 · 권장 8장 · 생성 상한 12장`·자동 제외 안내 → 커밋 `2f531eb6`, 병합 `875133b7` → `완료`.

### SB WO-009 — 모션 세트 서버측 (베이스 캐릭터 결속 · 다중 동작 순차 생성 · 공통 설정+예외 · 상태 추적)

- **ID:** `SB WO-009` · **우선순위:** P1 · **목표일:** 2026-09-07 KST
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현) / 검수 CEO 직접
- **의존성:** SB WO-007·008 병합(`875133b7`), 대표 승인(2026-09-07 "권장순서대로" — 1·2단계: 공통 설정과 예외·동작별 상태판·베이스 시트 결속), 제안 항목 1·2·4
- **목표:** 세트 레코드(`data/motion-sets/<id>/set.json` + `reference.png`): 베이스(설명·화풍·기본 방향·좌우 반전 허용·피사체·캐릭터 id·참조 이미지) + 공통(열·행·FPS) + 멤버(프리셋·설명·예외·상태·projectId). `POST /api/motion/sets`가 세트를 만들고 분리 워커(`scripts/motion-set-worker.mjs`)가 `run-next` 라우트를 반복 호출해 멤버를 **순차** 생성(생성 로직은 서버측 TS `runNextMember`, 워커는 시퀀서). 기본 방향 왼쪽은 생성 후 전 프레임 `flipX` 반전으로 구현. 조회·목록·예외 수정·재생성·삭제 API. 프로젝트 라우트에는 optional `style`만 추가.
- **변경 범위:** `lib/motion/set-types.ts`·`lib/motion/set-storage.ts`·`app/api/motion/sets/route.ts`·`app/api/motion/sets/[id]/route.ts`·`app/api/motion/sets/[id]/run-next/route.ts`·`scripts/motion-set-worker.mjs`·`tests/motion-sets.test.mjs`(신규 7) + `app/api/motion/projects/route.ts`(style). 스펙 전문: 스크래치패드 `wo009-spec.md`.
- **완료 기준:** `motion-sets` + 회귀 4파일 PASS · tsc 0 · `node --check` 워커 (CEO 재실행) / 코드 정독(원자 쓰기·경계·비밀 미기록·stale running 처리) / CEO 실기: 격리 dev 서버에서 세트(대기·이동·장전 3멤버, 참조 이미지 포함) 생성 → 워커 순차 완료 → 상태 전이·projectId·facing left 반전 확인.
- **금지:** 목록 밖 수정, commit·push, npm install, MCP·UI(후속 WO-010/011), 기존 프로젝트 API 계약 변경.
- **위험등급:** R2(새 저장 경로·워커 스폰) · **대표자 투입:** 0~5분 · **롤백:** 브랜치 `claude/sb-wo-009-motion-sets` 폐기.
- **보고 형식:** WO-008과 동일.

#### 상태 이력

- 2026-09-07 11:4x KST — `발행`. 워크트리 `.claude/worktrees/sb-wo-009-motion-sets` (`claude/sb-wo-009-motion-sets` @ `875133b7`) 생성, Maker 위임 가동.
- 2026-09-07 11:44 KST — Maker 1차 반환: 7파일 작성 후 **ChatGPT 사용 한도 소진으로 중단**(테스트 파일 미작성, tsc 오류 1건). CEO 직접 수정 1줄(`busy: true as const`). 앱 이미지 생성은 별도 한도라 정상임을 프로브로 확인. 대표 확인(11:47 "chatgpt 한도는 리셋되었어") 후 2차 라운드(테스트 파일 작성만) 발행.
- 2026-09-07 11:46~11:52 KST — CEO 실기(격리 dev 서버 3012): 참조 포함 세트(대기 · 이동 fps10 · 장전 3×2 once) → 워커 순차 생성 3/3 ready(약 3분), 예외 설정·이름(`세트 · 라벨`)·loop 반영, 세 동작이 같은 캐릭터로 유지 / 왼쪽 방향 세트(로봇, allowMirror off) → 전 프레임 `flipX`, 파생 시트 실물 왼쪽 향함 → PASS.
- 2026-09-07 11:57 KST — Maker 2차 반환(테스트 파일 1개, 검증 미실행) → CEO 재실행 **93/93**(신규 14) · tsc 0 · 워커 구문 OK → 커밋 `b6283c9b`, 병합 `e20bfe35` → `완료`.

### SB WO-010 — 모션 세트 UI (세트 만들기 · 공통 설정+동작별 예외 · 상태판)

- **ID:** `SB WO-010` · **우선순위:** P1 · **목표일:** 2026-09-07 KST
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현) / 검수 CEO 직접
- **의존성:** SB WO-009 병합(`e20bfe35`, 세트 API·스키마), WO-008 프리셋 메타, 대표 승인(2026-09-07 "권장순서대로" — 1·2단계의 UI 부분), 제안 항목 1·2·4
- **목표:** (1) 새 세트 다이얼로그 — 베이스(참조 이미지 업로드/캐릭터 라이브러리, 설명, 화풍, 기본 방향, 좌우 반전 허용, 피사체) + 공통 설정(열·행·FPS) + 동작 체크(프리셋 10종+custom, 보조 라벨) + 동작별 예외(열·행·FPS·재생 방식·설명) → `POST /api/motion/sets` (2) 세트 상태판 — 멤버 표(상태 배지·썸네일·실효 프레임·열기·재생성), 5초 폴링, 세트 삭제 (3) 셸 통합 — `새 세트` 버튼, 프로젝트/세트 탭, 열기 시 기존 플레이어로.
- **변경 범위:** `components/studio/motion/motion-shell.tsx`, `motion-set-dialog.tsx`(신규), `motion-set-board.tsx`(신규) 3파일. 스펙 전문: 스크래치패드 `wo010-spec.md`.
- **완료 기준:** tsc 0 · next lint 3컴포넌트 0 · `motion-sets`·`motion-storage` 회귀 PASS (CEO 재실행) / CEO 브라우저 실물: 세트 생성 → 상태판 폴링 → ready 멤버 열기 → 재생성 → 삭제.
- **금지:** 3파일 밖 수정, commit·push, npm install, 세트 API·서버 변경, 새 의존성.
- **위험등급:** R1(UI 전용) · **대표자 투입:** 0~5분 · **롤백:** 브랜치 `claude/sb-wo-010-motion-set-ui` 폐기.
- **보고 형식:** WO-009와 동일.

#### 상태 이력

- 2026-09-07 12:0x KST — `발행`. 워크트리 `.claude/worktrees/sb-wo-010-motion-set-ui` (`claude/sb-wo-010-motion-set-ui` @ `e20bfe35`) 생성, Maker 위임 가동.
- 2026-09-07 12:21 KST — Maker 반환(정확히 3파일, 검증 미실행). CEO: tsc 오류(세트 다이얼로그 open 상태 변수명 `setCreateOpen` 충돌) 4줄 직접 수정 → **tsc 0 · next lint 0 · 회귀 33/33**.
- 2026-09-07 12:24~12:30 KST — 브라우저 실물(격리 dev 서버 3012, in-app 브라우저): 새 세트 다이얼로그(이름·설명·2×2·대기+장전 체크) → 생성 → 세트 탭 상태판(pending→ready 2/2, 썸네일, 실효 4장) → 열기(플레이어 `wo010-ui-set · 대기`, `4장 / 12 FPS / 0.33초`) → 재생성(장전 pending→ready, 기존 프로젝트 유지) → 세트 삭제(목록 비움, 프로젝트 3건 유지). 숨김 패널에서는 폴링을 건너뛰어 수동 새로고침으로 확인(설계대로). → 커밋 `da9ac1a9`, 병합 `62e4c98e` → `완료`.

### SB WO-011 — 세트 통합 내보내기(스프라이트 시트+JSON) · MCP 세트 도구

- **ID:** `SB WO-011` · **우선순위:** P1 · **목표일:** 2026-09-07 KST
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현) / 검수 CEO 직접
- **의존성:** SB WO-009·010 병합(`62e4c98e`), 기존 `lib/motion/export.ts` 번들 절차, MCP motion 도구 패턴, 제안 항목 6(스프라이트 시트+JSON 내보내기)·2단계(MCP 세트 노출)
- **목표:** (1) `lib/motion/set-export.ts` — ready 멤버 전부를 한 시트(동작당 한 행, 합집합 캔버스, 지면선 정렬, 스케일 미정규화·sizeReport 명시)+`animation.json`(동작별 애니메이션·fps·loop)+frames/+README(+GIF)로 번들 (2) `GET /api/motion/sets/[id]/export-file` (3) MCP `create_motion_set`·`get_motion_set`·`list_motion_sets`·`export_motion_set` (4) 상태판 `통합 내보내기` 버튼.
- **변경 범위:** `lib/motion/set-export.ts`(신규), `app/api/motion/sets/[id]/export-file/route.ts`(신규), `scripts/mcp-server.mjs`, `components/studio/motion/motion-set-board.tsx`, `tests/motion-set-export.test.mjs`(신규), `tests/motion-mcp.test.mjs` 6파일. 스펙 전문: 스크래치패드 `wo011-spec.md`.
- **완료 기준:** 신규·회귀 테스트 5파일 PASS · tsc 0 · `node --check` MCP · lint 상태판 (CEO 재실행) / CEO 실기: 격리 서버에서 세트 통합 ZIP 내려받아 시트·JSON 검증 + MCP 세트 도구 스키마 회귀.
- **금지:** 6파일 밖 수정, commit·push, npm install, 기존 프로젝트 export 계약 변경, 새 의존성.
- **위험등급:** R2(MCP 공유 파일) · **대표자 투입:** 0~5분 · **롤백:** 브랜치 `claude/sb-wo-011-motion-set-export` 폐기.
- **보고 형식:** WO-010과 동일.

#### 상태 이력

- 2026-09-07 12:3x KST — `발행`. 워크트리 `.claude/worktrees/sb-wo-011-motion-set-export` (`claude/sb-wo-011-motion-set-export` @ `62e4c98e`) 생성, Maker 위임 가동.
- 2026-09-07 12:56 KST — Maker 반환(정확히 6파일, 검증 미실행). CEO 재실행: 테스트 5파일 **47/47** · tsc 0 · MCP 구문 OK · lint 0. 직접 수정 0건.
- 2026-09-07 12:57~13:05 KST — 실기(격리 dev 서버 3012): 참조 포함 세트(대기·피격 2×2) 생성→ready → `export-file?gif=1` ZIP 4.77MB: `sprite-sheet.png` 1952×1216(4열×2행, 동작당 한 행), `animation.json` 8프레임·애니메이션 2개(대기 loop 12fps·피격 once)·sizeReport, `frames/<action>/`, README, `preview-idle.gif`·`preview-hit.gif` / MCP 모듈 직접 호출(서버 발견을 3012로 재작성): `list_motion_sets`·`get_motion_set`(effectiveFrames 4/4, 감지 요약)·`export_motion_set`(ZIP 4.26MB 저장)·`create_motion_set`(업로드 참조, 1멤버)→폴링→ready(실효 2장: 2×2 대기의 반복 행 자동 제외) 전부 PASS → 커밋 `6ba23d7c`, 병합 `2d7ea239` → `완료`.

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
- **1차 판정:** `READY_FOR_CLEANUP`. 후보를 v0.1.3 활성 정본으로 승인하고 SB WO-003을
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

### SB WO-004 — MCP 영상 도구 create_video·get_video

- 검수 기준: 워크트리 `claude/sb-wo-004-mcp-video` base `da264feb`, 시작 porcelain 0줄.
  Maker 산출 후 porcelain — 정확히 지정 3파일(M `scripts/mcp-server.mjs`,
  신규 `scripts/video-worker.mjs`·`tests/mcp-video.test.mjs`). 범위 위반 0건.
- Maker(Codex exec, gpt-5.6-terra) 보고 — '구현 완료 / 검증 미실행': 샌드박스 키체인
  크래시(SecItemCopyMatching -50, exit 139 — CODEX_PROTOCOL §2 기지 일과성 이슈)로 node
  검증 전부 중단, 1회 재시도 후 규칙대로 구분 보고. `deno check` 대체 시도 1건 관찰.
- CEO 재실행 — `node --check` 2파일 exit 0. 신규 `tests/mcp-video.test.mjs` 1차 5/6:
  running→ready 케이스 FAIL 검출(`destPath parent must contain only regular,
  non-symbolic-link directories`). 회귀 `mcp-server-batch`+`motion-mcp` 11/11 PASS.
- CEO 직접 수정 1건(4줄) — `inspectReadyVideo`가 기존 `assertNoSymlinkDirectories`(전
  조상 심링크 검사, export_motion의 임의 사용자 경로용)를 `data/videos` 내부로 봉쇄가
  끝난 결과 경로에 재사용 → `/var` 등 OS 심링크 상위 경로 오탐 거부. video-worker와 동일한
  realpath 봉쇄(`assertPathInside(realVideosRoot, realVideoDir)`)로 교체. 최종 파일
  심링크는 기존 `O_NOFOLLOW`가 차단. 수정 후 신규 테스트 6/6 PASS.
- 실기 스모크 — imageId `pxi7hm5h5pmsmlykpb` →
  jobId `video-job-1787303473751-1c5420e5-e284-41d7-b973-36dd13cd62e2`, 약 50초 후
  `ready`. `data/videos/2026-08/t3nn2slc67mt2qde9p.mp4`, 1,691,935 bytes, sha256
  `b533c016…9a81` — CEO가 `shasum -a 256`으로 독립 재계산해 도구 보고값과 일치 확인.
- 커밋 — WO 브랜치 `51755591`, `feature/webtoon-studio` 병합 `7e12d8f3` (로컬 전용,
  push·배포·브랜치 삭제 없음). 위임 왕복 1회.
- **판정: PASS · 완료.** 한계: 상주 MCP 서버 프로세스는 재시작 후부터 새 도구 노출.
  후속(백로그): source 유니온(imagePath/dataUrl) 확장, 전역 `sionbanana-remote` 스킬 영상 절.

### SB WO-006 — 영상 소스 upload 변형 (프레임 체이닝 1급화)

- 검수 기준: 워크트리 `claude/sb-wo-006-video-upload` base `9dd7bfdb`, 시작 porcelain 0줄 → Maker 후 정확히 `M scripts/mcp-server.mjs`, `M tests/mcp-video.test.mjs`. 범위 위반 0건.
- Maker(Codex exec, gpt-5.6-terra, --full-auto) 보고 — 구현 완료 / 검증 미실행(샌드박스 키체인 -50 기지 이슈, TAP 미수집을 근거로 PASS 자기판정 거부). 가정 명시: 썸네일 512/80, UTC 월버킷.
- CEO 재실행 — `node --check` exit 0 / `mcp-video` **9/9**(신규: imagePath 등록·dataUrl 등록·거부 5케이스·스키마 거부·imageId 회귀) / 회귀 `motion-mcp`+`mcp-server-batch` **11/11**.
- CEO 코드 정독 — 스키마 `motionUploadSourceSchema` 재사용 + superRefine; 검증 헬퍼 재사용(정규파일·심링크·8MB·PNG/JPEG 매직·repoRoot 봉쇄); 등록은 sharp PNG 정규화 → `data/images/<UTC YYYY-MM>/<19자 base36 id>.png|.json|.thumb.webp`(512/80, lib 상수와 동일) `wx` 원자 쓰기; 버킷 realpath 봉쇄; 사이드카는 basename만(절대경로·비밀 없음); dataUrl 파일명 폴백 `upload.png`. 직접 수정 0건.
- 실기 스모크 — E1(`k9rcrdm6ca9mt46ti71`) 정확한 마지막 프레임 `data/frames/wo006-cut1-end.png` → `create_video source:{type:"upload", imagePath}` → `sourceImageId tt7va0bz04omtk2i30q` 3파일 등록 확인(사이드카 필드 정합) → 5.04s `ready`, sha256 독립 재계산 일치 → **이음매 YAVG 3.16**(인접 프레임 2.3 · 다른 장면 57 기준 → 연속).
- 커밋 — WO `f389c72d`, 병합 `1ffdc4b3`(로컬 전용, push·배포·브랜치 삭제 없음). 상주 서버 재기동 불필요(MCP 프로세스는 세션마다 스폰). 위임 왕복 1회.
- **판정: PASS · 완료.** 파트 A(스킬 정본 `e99ccc73` + 전역 브리지)와 짝으로 프레임 체이닝이 도구·문서 양쪽에서 1급 지원됨. 후속(백로그): 컷 경계 BGM 연속성 실측, 체이닝 다단(3컷+) 드리프트 측정.

### SB WO-007 — 모션에셋 T-04 결함 수정 (4위상 중복 · 2행 미러링)

- 검수 기준: 워크트리 `claude/sb-wo-007-motion-t04` base `104e894d`, 시작 porcelain 0줄 → Maker 1차 정확히 8파일, 2차 정확히 6파일(모두 스펙 목록 내). 범위 위반 0건. 왕복 2/2(2차는 CEO 실측이 밝힌 모델 성향에 대한 스펙 보강).
- Maker(Codex exec, gpt-6-astra, effort high) 보고 — 두 라운드 모두 "구현 완료 / 검증 미실행"(샌드박스 키체인 -50 / exit 139, PASS 자기판정 거부).
- CEO 재실행 — 1차 79/79(아래 정정 후) · 2차 **84/84** · `tsc --noEmit` exit 0(두 라운드).
- CEO 직접 수정 2건 — (a) 엔진 정규화 분모에 절대 하한 0.02(4줄): 동일 프레임 행에서 리샘플 미세 비대칭만으로 점수가 튀는 것 차단 (b) 테스트 단언 1건 `|score|<0.05` → `score<=0`(대칭 행은 절대 양수가 될 수 없다는 보호 조건으로 강화, 사유 주석). 그 외 0건.
- 코드 정독 — descriptor·거리 함수 공유(중복 구현 없음), 결정적(무작위 없음), 반전 적용 후 버퍼로 반복 감지(이중 flop 없음), 재빌드는 재감지 없이 `flipX`·`excluded`·감지 기록 보존, 명시 control 우선, 레거시 project.json은 `null` 기본값으로 파싱, 라우트 기본값(자동 반전: 생성 소스 on / 자동 제외: 생성 소스+순환 프리셋 on / 업로드·단발·custom off).
- 실기 스모크(gpt-image-2 실생성 9장: 구 프롬프트 2장은 3002, 신 프롬프트 7장은 격리 dev 서버 3012) —
  · 미러링: 신 walk-1 원본 2행이 왼쪽을 향함 → `mirrorDetection` 0.71 → 자동 반전, 파생 8장 전부 오른쪽(1/1). 나머지 8장 미러링 없음(-0.53~-0.91).
  · 복제(행 반복 비율): 구 walk 0.46·0.34 / 신 8위상 walk 0.28·0.47 / 근·원 다리 문구 walk 0.46·0.37 / 신 run 0.08 / idle 1.37 / 기존 attack 2.00·reload 1.28 → **문구와 무관한 모델 성향**(7/7).
  · 최종 엔진 판정(보관 원본 8장 업로드 재등록, 48px): old-walk-2 0.31·new-run-1 0.10·new-walk-1 0.34(반전+제외 동시) → 2행 자동 제외 / old-walk-1 0.47·new-walk-2 0.42 경계 유지 / idle 0.86·attack 1.80·reload 1.63 미제외.
- 결함별 결론 — B(2행 미러링): 자동 반전으로 실효 수정. A(4위상 복제): 프롬프트 구조 수정(8위상·균등 배분·단발 종료)은 완료했으나 생성 결과에는 무효 → 2차 라운드의 반복 행 자동 제외로 실효 확보(명확 케이스 3/3, 경계 2건은 UI 수동 제외).
- 커밋 — 1차 `3d4be759`, 2차 `d9a8bde7`, 병합 `89ee900f`(로컬 전용, push·배포·브랜치 삭제 없음). **상주 서버(3002)는 프로덕션 빌드라 재빌드·재기동 전까지 구 코드** — 다른 세션이 사용 중일 수 있어 대표 확인 후 재기동. 운영 데이터에 만든 기준선 프로젝트 2건은 분석 후 DELETE로 정리(원본 시트는 스크래치패드 보관).
- **판정: PASS · 완료.** T-04 닫힘. 후속: 임계 0.4 조정은 표본 누적 후 / MCP get_motion 감지 요약·UI 배지(WO-008) / 순환 프리셋 실효 프레임 4장 전제의 권장값 검토.

### SB WO-008 — 모션 프리셋 10종 · 동작별 재생 기본값 · 프레임 정보 표시 · 슬로모션 · MCP 감지 요약

- 검수 기준: 워크트리 `claude/sb-wo-008-motion-presets` base `088b484a`, 시작 porcelain 0줄 → Maker 정확히 9파일(스펙 목록 내). 범위 위반 0건. 왕복 1회.
- Maker(Codex exec, gpt-6-astra, effort high) 보고 — "구현 완료 / 검증 미실행"(키체인 -50 / exit 139). 가정: get_motion 감지 요약을 `mirrorDetection:{mirroredRows}`·`duplicateDetection:{repeatedRows,excludedFrames}` 중첩 형태로(행 인덱스 0부터) — CEO 채택.
- CEO 재실행 — 테스트 6파일 **95/95** · `tsc --noEmit` 0 · `next lint` 2컴포넌트 0 · `node --check scripts/mcp-server.mjs` OK. CEO 직접 수정 0건.
- 코드 정독 — 프리셋 메타 단일 원천(`motionActionPresetValues`·`MOTION_ACTION_PRESETS`)을 라우트·UI가 import, MCP는 동기화 주석과 함께 배열 복제; 라우트 12장 상한은 생성·참조 소스만(업로드 무제한); 기본 loop = 요청값 > 프리셋 기본 > loop; MCP 입력 스키마를 `motionCreateInputSchema`로 추출해 파싱(스코프 내 정리); 플레이어가 프레임별 `durationMs`를 재생 타이밍에 반영(부수 개선)·FPS 슬라이더 상한 30→60(라우트 상한과 일치).
- 실기 — 격리 dev 서버 3012: 4×4 생성 요청 → 400 `at most 12 frames` / 장전·피격 4×2 실생성(77s·59s): `loop=once`, 8프레임 상이(행 반복 비율 1.52·1.59), 미러링 없음, 장전 시트 조준→탄창 배출→삽입→장전 손잡이→재조준 순서 정상 / 브라우저(in-app): 플레이어 `4장 / 12 FPS / 0.33초`·배지 2종·0.25×/0.5×/1× 토글, 다이얼로그 프리셋 10종+직접 입력·`반복/단발 · 권장 N장` 보조 라벨·`열×행 = 8장 · 권장 8장 · 생성 상한 12장`·순환 프리셋 자동 제외 안내.
- 커밋 — WO `2f531eb6`, 병합 `875133b7`(로컬 전용). 상주 서버 재기동 대기(WO-007과 함께).
- **판정: PASS · 완료.** 제안 항목 2·3·4 충족(세트·공통 설정·상태판은 WO-009/010). 전역 브리지 스킬 모션 절 갱신(같은 시각).

### SB WO-009 — 모션 세트 서버측

- 검수 기준: 워크트리 `claude/sb-wo-009-motion-sets` base `875133b7`, 시작 porcelain 0줄 → Maker 1차 7파일(스펙 목록 내) + 2차 테스트 1파일. 범위 위반 0건. 왕복 2/2(2차는 한도 중단으로 남은 테스트 파일만).
- Maker 보고 — 1차: 한도 소진 중단(테스트 미작성). 2차: "작성 완료 / 검증 미실행"(키체인 -50).
- CEO 재실행 — `motion-sets` 14건 포함 5파일 **93/93** · `tsc --noEmit` 0 · `node --check scripts/motion-set-worker.mjs` OK. CEO 직접 수정 1줄(반환 타입 리터럴).
- 코드 정독 — 세트 디렉터리 경계·심링크 검사(프로젝트 저장소와 동일 방식), set.json temp+rename 원자 쓰기, 세트별 프로미스 락으로 claim/complete 직렬화, stale running(타임아웃+60s) 자동 failed 후 다음 진행, 완료 기록 시 claim 시각·action 일치 검사(경합 방어), 참조 base64·절대경로는 set.json에 미기록(매 요청 재구성), facing left = 생성 후 전 프레임 flipX 반전(rebuild), 워커는 run-next 시퀀서(서버 미발견 시 exit 1·세트 파일 불변), 프로젝트 라우트는 optional `style`만 추가.
- 실기 — 격리 dev 서버 3012: 참조 포함 3멤버 세트 순차 생성 3/3 ready(대기 4×2 loop 12 · 이동 4×2 loop **10**(예외) · 장전 **3×2 once**(예외)), 세 동작 동일 캐릭터(붉은 스카프·가죽 갑옷·석궁총) 유지, 상태 전이 pending→running→ready 관측 / 왼쪽 방향 세트(오브젝트, allowMirror off): 전 프레임 `flipX=true`, `mirrorDetection=null`(자동 반전 off 규칙), 파생 시트 실물 왼쪽 향함.
- 커밋 — WO `b6283c9b`, 병합 `e20bfe35`(로컬 전용). 상주 서버 재기동 대기(WO-007·008과 함께).
- **판정: PASS · 완료.** 제안 항목 1(베이스 등록: 참조·설명·화풍·방향·반전 허용)·2(동작 체크·동작별 설정)·4(동작별 상태) 서버측 충족. UI는 WO-010, 통합 내보내기·MCP 세트 도구는 WO-011.

### 3단계 스파이크 — 구간 재생성 실현성 (CEO 직접 실험, 2026-09-07 12:00~12:13 KST)

- 목적: 제안 항목 5·6(문제 구간 수정·재생성) 구현 전 두 가지 미확인 사항 실측 — (a) Codex 이미지 백엔드의 마스크 인페인팅 지원 여부, (b) 직전·직후 프레임을 앵커로 한 구간 재생성의 연속성·정체성.
- (a) 마스크: `scratchpad/spike-mask.mjs`로 responses `image_generation` 도구에 `input_image_mask`(알파 0 = 편집 영역) 전달 → **HTTP 200, 지원 확인**. 프레임(석궁총 캐릭터)에서 무기만 지팡이로 교체, 얼굴·옷·자세·투명 배경 보존(마스크 밖 평균 픽셀 차 11/255, 안 19). 모델명 `gpt-image-2-codex`, `input_fidelity`는 `400 invalid_input_fidelity_model`로 거부. 출력은 약 3배 업스케일(334×474 → 1087×1447). 마스크 없는 프롬프트 편집은 캐릭터는 유지되나 투명 배경을 체커보드로 그려(차 174) 배제.
- (b) 앵커 스트립: 원본 walk(4×2)의 f4·f1을 앵커로 6×1 스트립(앵커 A · 수정 4포즈 · 앵커 B)을 참조 3장(원본 시트+앵커 2)으로 10회 생성 → 자동 슬라이싱 6칸 유효 **5/10**(무효 5회는 인접 셀 손·발 접촉으로 3~5칸 병합, sliceConfidence 0.3). 유효 5회: 앵커 A 거리 4·7·6·8·4, B 11·8·9·8·7(연속 판정 ≤12 **5/5**, 근사동일 ≤8 3/5), 평균색 차 3~6(정체성 유지), 수정 의도(팔 스윙 확대) 반영(원본 대비 9~21), 스트립 캐릭터 크기 +16~22%(중앙값 1.18, 일정 → 앵커 높이 정규화로 보정 가능).
- 결론: 항목 5·6은 **구현 가능**. 부분 수정(손·무기·장비)은 마스크 모드, 동작 연결·자세 구간은 앵커 스트립 모드(3×2 배치·고정 격자·재시도·스케일 보정 필요). 원본 보존·후보 비교·적용/되돌리기는 프레임 오버라이드 계층으로(기존 재빌드 파이프라인 재사용). 범위 확정은 T-07.
- 부수 산출: 기억 `reference_codex_image_mask_edit.md`, `reference_motion_asset_tuning.md` 갱신. 실험 데이터는 세션 스크래치패드(격리 데이터 디렉터리, 운영 데이터 무오염).

### SB WO-010 — 모션 세트 UI

- 검수 기준: 워크트리 `claude/sb-wo-010-motion-set-ui` base `e20bfe35`, 시작 porcelain 0줄 → Maker 정확히 3파일. 범위 위반 0건. 왕복 1회.
- Maker 보고 — "구현 완료 / 검증 미실행"(키체인 -50). 가정: 캐릭터 라이브러리 이미지 URL은 브라우저에서 접근 가능한 PNG/JPEG.
- CEO 재실행 — `tsc --noEmit` 0(변수명 충돌 4줄 직접 수정 후) · `next lint` 3컴포넌트 0 · 회귀 `motion-sets`+`motion-storage` 33/33.
- 코드 정독 — 세트 API 계약 준수(`POST /api/motion/sets` start:true, `PATCH {regenerate,start}`, `DELETE`), 폴링 5초·hidden 건너뜀, ready 멤버 메트릭 1회 지연 로드(실효 프레임·감지 배지), 열기는 기존 `selectProject` 재사용, 서버 코드 변경 없음.
- 실기 — in-app 브라우저 전 흐름 통과(상태 이력 참조). 관찰: 멤버 상태 라벨 `대기`(pending)가 동작 라벨 `대기`(idle)와 같은 단어라 표에서 혼동 여지 — 후속 UX 정리 후보(`대기 중`으로 변경).
- 커밋 — WO `da9ac1a9`, 병합 `62e4c98e`(로컬 전용). 상주 서버 재기동 대기.
- **판정: PASS · 완료.** 제안 항목 1·2·4의 UI 충족(베이스 등록 화면, 동작 체크·동작별 설정·기본 재생 방식, 동작별 생성 상태·결과 표시).

### SB WO-011 — 세트 통합 내보내기 · MCP 세트 도구

- 검수 기준: 워크트리 `claude/sb-wo-011-motion-set-export` base `62e4c98e`, 시작 porcelain 0줄 → Maker 정확히 6파일. 범위 위반 0건. 왕복 1회.
- Maker 보고 — "구현 완료 / 검증 미실행"(키체인 -50). 가정: 프로젝트 첫 애니메이션의 fps·loop 사용, 소수 기준점은 캔버스 바깥 올림 + 최근접 픽셀 배치 — CEO 채택.
- CEO 재실행 — `motion-set-export`·`motion-export`·`motion-mcp`·`mcp-server-batch`·`motion-sets` **47/47** · tsc 0 · `node --check` OK · lint 0.
- 코드 정독 — 합집합 캔버스(left/right/top/bottom = 프로젝트별 pivotX·groundY(median) 기준 최대치), 프레임을 세트 캔버스에 오프셋 합성(수직 반동 보존), 시트는 행=동작·열=프레임·빈 셀 투명, animation.json 인덱스 연속·pivot 공통, sizeReport·README 한계 명시, GIF 실패는 경고, ZIP 절차는 프로젝트 export와 동일; 라우트 쿼리 검증·404/409·cleanup; MCP 4도구 strict 스키마, imageId 참조 조회는 dataRoot realpath 봉쇄, get은 project.json에서 실효 프레임·감지 요약 계산.
- 실기 — 상태 이력 참조(ZIP 실물 + MCP 4도구 실호출 PASS). 관찰: `export_motion_set`에 `destPath`를 줘도 반환 `zipPath`는 dataRoot `motion-exports/` 경로였음(복사 여부 미확인 — 후속 확인 항목, 기능 자체는 정상).
- 커밋 — WO `6ba23d7c`, 병합 `2d7ea239`(로컬 전용). 상주 서버 재기동 대기.
- **판정: PASS · 완료.** 제안 항목 6(스프라이트 시트+JSON 내보내기, 세트 단위)과 2단계 MCP 노출 충족. 이로써 대표 승인 권장 순서의 1·2단계 전부와 3단계 스파이크가 완료됐고, 남은 결정은 T-07(항목 5·6 구현 범위).
