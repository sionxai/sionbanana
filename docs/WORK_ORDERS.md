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
- [x] T-07 모션 "문제 구간 선택·수정" 구현 범위 — 2026-09-07 대표 결정 **(B) 마스크+앵커 스트립 동시**("마스크와 앵커 스트립 동시에 진행하자"). 구현은 `SB WO-012`(오버라이드·후보·적용/되돌리기·셀) → `WO-013`(마스크·스트립 생성 모드+워커) → `WO-014`(구간 선택·마스크 브러시·전후 비교 UI) → `WO-015`(MCP 3도구·문서) 순. 규모 대, 세션 분할 가능하도록 각 WO에 스펙 파일 명시.

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
| SB WO-012 | 2026-09-07 | 프레임 오버라이드 계층·후보 저장·적용/되돌리기·셀 이미지 (구간 수정 기반) | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-09-07(KST) | 완료 | PASS · 86/86 · 적용·되돌리기 실기 · 병합 4f6b7ac8 |
| SB WO-013 | 2026-09-07 | 후보 생성 모드 — 마스크 인페인팅·앵커 스트립 재생성 + 후보 워커 | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-09-07(KST) | 완료 | PASS · 57/57 · 마스크 밖 보존 7 · 스트립 연속성 6/4/3 · 병합 20095e01 |
| SB WO-014 | 2026-09-07 | 구간 선택·마스크 브러시·후보 생성·전후 비교·적용/되돌리기 UI | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-09-07(KST) | 완료 | PASS · tsc/lint 0 · 브라우저 전 흐름(생성→적용→되돌리기) · 병합 84472070 |
| SB WO-015 | 2026-09-07 | MCP 후보 도구 4종 + 스킬 문서 (구간 수정 외부 노출) | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-09-07(KST) | 완료 | PASS · 26/26 · MCP 4도구 실호출(생성→적용→되돌리기) · 병합 067a4963 |
| SB WO-005 | 2026-09-07 | 영상 기본 모델 Grok Imagine 1.5 승격 + env 오버라이드 + 모델별 길이 상한 | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-09-07(KST) | 완료 | PASS · 33/33 · 병합 63df6fe4 · 서버 재빌드 반영 |
| SB WO-016 | 2026-09-07 | 마스크 밖 원본 강제 보존 · 후보 적용 충돌 검사 · 되돌리기 의미 명시 | CEO(Sol) / Maker(Codex exec) / 검수 CEO | P1 | 2026-09-07(KST) | 완료 | PASS · 69/69 · 마스크 밖 완전일치 100% · 충돌 409/force · 병합 c815e0da |

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

### SB WO-012 — 프레임 오버라이드 계층 · 후보 저장 · 적용/되돌리기 · 셀 이미지 (구간 수정 기반)

- **ID:** `SB WO-012` · **우선순위:** P1 · **목표일:** 2026-09-07 KST
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현) / 검수 CEO 직접
- **의존성:** T-07 결정(B), 3단계 스파이크 결과, WO-007~011 병합(`2d7ea239`), 제안 항목 5·6
- **목표:** 원본 `raw.png` 불변 원칙 아래 (1) 프레임 오버라이드 계층 — `frames[i].override`가 있으면 `buildArtifacts`가 방향 적용 셀 대신 `overrides/fNN.png`를 투입(이후 analyze·normalize·pack 재사용) (2) 후보 저장소 `candidates/<cid>/`(candidate.json·frames·masks, 상태 pending/running/ready/failed, 모드 mask/strip/upload) (3) 적용 = 후보 프레임을 원본 셀에 맞춤(bbox 높이 스케일·발 기준점 정렬) 후 오버라이드 기록·재빌드, 되돌리기 = 오버라이드 제거·재빌드 (4) 마스크 편집용 셀 이미지 GET(방향·매트 적용, trim·pivot 헤더). 업로드 모드로 생성 없이 전체 경로 검증 가능.
- **변경 범위:** `lib/motion/{types,storage}.ts`, `lib/motion/candidates.ts`(신규), 라우트 5개(`candidates`, `candidates/[cid]`, `candidates/[cid]/apply`, `revert`, `cells/[index]`), `tests/motion-candidates.test.mjs`(신규), `tests/motion-storage.test.mjs`. 스펙 전문: 스크래치패드 `wo012-spec.md`.
- **완료 기준:** 신규·회귀 5파일 PASS · tsc 0 (CEO 재실행) / 코드 정독(원자 쓰기·경계·오버라이드 무결성 오류·레거시 호환) / CEO 실기: 격리 서버에서 업로드 후보 → 적용 → 파생 프레임 교체 확인 → 되돌리기 원상복구.
- **금지:** 목록 밖 수정, commit·push, npm install, 생성 로직(WO-013), UI·MCP 변경.
- **위험등급:** R2(프로젝트 스키마 확장·재빌드 경로 변경) · **대표자 투입:** 0~5분 · **롤백:** 브랜치 `claude/sb-wo-012-motion-overrides` 폐기.
- **보고 형식:** WO-011과 동일.

#### 상태 이력

- 2026-09-07 13:1x KST — T-07 결정 접수 후 `발행`. 워크트리 `.claude/worktrees/sb-wo-012-motion-overrides` (`claude/sb-wo-012-motion-overrides` @ `16cf63c0`) 생성, Maker 위임 가동.
- 2026-09-07 14:01 KST — Maker 반환(정확히 10파일, 검증 미실행). CEO 재실행: 실패 2 + tsc 오류 1 → 원인 규명 후 직접 수정 3건 → **86/86 · tsc 0**.
- 2026-09-07 14:05 KST — CEO 실기(격리 dev 서버 3012): 8프레임 프로젝트 → `GET /cells/1`(187×359, trim·pivot 헤더) → 2배 확대·틴트 이미지를 upload 후보로 등록(ready) → apply(override 기록, 파생 f02만 변경 8.16, f01 불변 0.00, 캔버스 380×399 유지) → revert(override null, f02 복구 0.00, 오버라이드 파일 제거) → 후보 삭제 200 → 커밋 `b753b4b7`, 병합 `4f6b7ac8` → `완료`.

### SB WO-013 — 후보 생성 모드 (마스크 인페인팅 · 앵커 스트립 재생성) + 후보 워커

- **ID:** `SB WO-013` · **우선순위:** P1 · **목표일:** 2026-09-07 KST
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현) / 검수 CEO 직접
- **의존성:** SB WO-012 병합(`4f6b7ac8`), 3단계 스파이크 실측(마스크 지원·`input_fidelity` 거부·스트립 슬라이싱 실패율), T-07 결정(B)
- **목표:** (1) `mask` 후보 — 방향 적용 셀을 `input_image`, 마스크(없으면 캐릭터 bbox 자동)를 `input_image_mask`로 보내 편집 결과를 후보 프레임에 저장 (2) `strip` 후보 — 구간 앞뒤 이웃을 앵커로 포함한 스트립을 파생 시트·앵커 셀 참조와 함께 생성 → 자동 슬라이스(실패 시 최대 3회 재시도, 이후 격자 폴백) → 앵커 폐기·중간 셀 저장, `metrics`에 시도·신뢰도·배치 기록 (3) 분리 워커가 `run` 라우트를 1회 호출(세트 워커 패턴), 후보 생성 시 스폰.
- **변경 범위:** `lib/codex-fetch.ts`(마스크 옵션만), `lib/motion/candidate-generate.ts`(신규), `candidates/route.ts`(스폰), `candidates/[cid]/run/route.ts`(신규), `scripts/motion-candidate-worker.mjs`(신규), `tests/motion-candidate-generate.test.mjs`(신규) 6파일. 스펙 전문: 스크래치패드 `wo013-spec.md`.
- **완료 기준:** 신규·회귀 4파일 PASS · tsc 0 · `node --check` 워커 (CEO 재실행) / 코드 정독 / CEO 실기: 격리 서버에서 마스크 모드 실생성 1건(부분 수정 확인)·스트립 모드 실생성 1건(앵커 연속성 측정) → 적용까지.
- **금지:** 목록 밖 수정, commit·push, npm install, 서버 기동, 테스트에서 실제 API 호출, `input_fidelity` 사용, UI·MCP 변경.
- **위험등급:** R2(외부 생성 호출 경로 신설) · **대표자 투입:** 0~5분 · **롤백:** 브랜치 `claude/sb-wo-013-motion-candidate-generate` 폐기.
- **보고 형식:** WO-012와 동일.

#### 상태 이력

- 2026-09-07 14:1x KST — `발행`. 워크트리 `.claude/worktrees/sb-wo-013-motion-candidate-generate` (`@ 4f6b7ac8`) 생성, Maker 위임 가동.
- 2026-09-07 14:27 KST — Maker 반환(정확히 6파일, 검증 미실행) → CEO 재실행 **57/57 · tsc 0 · 워커 구문 OK**.
- 2026-09-07 14:28~14:38 KST — CEO 실기 1차: **스트립 PASS**(attempts 1, sliceConfidence 1, 4×1, 앵커 3·6 / 연속성 앵커→후보 6, 후보간 4, 후보→앵커 3으로 원본 6/5/6보다 부드러움 / 스케일 1.33 → 적용 후 1.00·1.01로 정규화). **마스크 FAIL**: 결과가 전체 재생성되고 배경 불투명화(마스크 안 114·밖 114). 4회 대조 진단으로 원인 규명 — 프롬프트가 "transparent (editable) area of the mask"를 언급하면 모델이 투명 배경을 편집 대상으로 오해(같은 마스크로 문구만 바꾸면 31/19, 좁은 마스크 16/10, 마스크 없음 56/59). 추가로 편집 결과는 항상 불투명 반환.
- 2026-09-07 14:40~14:50 KST — CEO 직접 교정 3건(프롬프트에서 마스크·투명 언급 제거 및 보존 대상 열거, 보호 대상 문장 분리, 입력 셀을 키 컬러로 합성→출력에 프로젝트 매트 재적용) + 테스트 단언 갱신 → **57/57 · tsc 0** → 실기 재검증: 마스크 안 20 · **밖 7** · 투명 41% 회복, 적용 결과 실물에서 무기만 교체되고 얼굴·의상·배경 보존 확인 → 커밋 `756454c6`, 병합 `20095e01` → `완료`.

### SB WO-014 — 구간 선택 · 마스크 브러시 · 후보 생성 · 전후 비교 · 적용/되돌리기 UI

- **ID:** `SB WO-014` · **우선순위:** P1 · **목표일:** 2026-09-07 KST
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현) / 검수 CEO 직접
- **의존성:** SB WO-012·013 병합(`20095e01`), T-07 결정(B), 제안 항목 5·6
- **목표:** (1) 타임라인 구간 선택(연속 구간, 수정됨 배지) (2) 수정 패널 — 모드(마스크/앵커 스트립)·수정 종류 칩·보호 대상 칩·마스크 브러시 캔버스(셀 이미지 위, 브러시 크기·지우개·초기화·프레임 간 복사) (3) 후보 생성·폴링·실패 사유 (4) 전후 비교(원본|후보 나란히, 구간 임시 재생) (5) 적용·되돌리기·후보 삭제.
- **변경 범위:** `components/studio/motion/motion-player.tsx`, `motion-fix-panel.tsx`(신규), `motion-shell.tsx` 3파일. 스펙 전문: 스크래치패드 `wo014-spec.md`.
- **완료 기준:** tsc 0 · next lint 3파일 0 · 회귀 `motion-candidates`·`motion-storage` (CEO 재실행) / CEO 브라우저 실물: 구간 선택 → 마스크 칠하기 → 후보 생성(실생성) → 비교 → 적용 → 되돌리기, 스트립 모드 1회.
- **금지:** 3파일 밖 수정, commit·push, npm install, 서버 계약 변경, 새 의존성.
- **위험등급:** R1(UI 전용) · **대표자 투입:** 0~5분 · **롤백:** 브랜치 `claude/sb-wo-014-motion-fix-ui` 폐기.
- **보고 형식:** WO-013과 동일.

#### 상태 이력

- 2026-09-07 14:5x KST — `발행`. 워크트리 `.claude/worktrees/sb-wo-014-motion-fix-ui` (`@ 20095e01`) 생성, Maker 위임 가동.
- 2026-09-07 15:12 KST — Maker 반환(정확히 3파일, 검증 미실행) → CEO 재실행 **tsc 0 · next lint 0 · 회귀 25/25**. 직접 수정 0건.
- 2026-09-07 15:13~15:30 KST — CEO 브라우저 실물(격리 dev 서버 3012): 타임라인 8번 선택(`선택 구간: 8 (1장)`) → 마스크 브러시 스트로크(231×456 캔버스) → 수정 지시·보호 요소 칩 → `수정 후보 생성` → `생성 중`→`준비됨`(서버 후보 `[7]` ready) → 원본|후보 비교 렌더 → `선택 프레임 적용` → 8번 `수정됨` 배지 + 서버 오버라이드 반영 → `선택 구간 되돌리기` → 배지 제거·서버 오버라이드 [1..5]로 복귀 → 커밋 `27c20d73`, 병합 `84472070` → `완료`.

### SB WO-015 — MCP 후보 도구 4종 + 스킬 문서

- **ID:** `SB WO-015` · **우선순위:** P1 · **목표일:** 2026-09-07 KST
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현) / 검수 CEO 직접
- **의존성:** SB WO-012·013·014 병합(`84472070`), T-07 결정(B) 4단계의 마지막
- **목표:** 다른 에이전트가 MCP로 구간 수정을 수행한다 — `create_motion_candidate`(mask/strip/upload, 파일 경로 또는 dataUrl) / `get_motion_candidate`(상태·사유·프레임 경로·metrics, waitMs 폴링) / `apply_motion_candidate`(선택 프레임) / `revert_motion_frames`. 도구 설명에 마스크 규약(알파 0=편집, 좁을수록 보존)과 스트립 규약(연속 구간·이웃 앵커) 명시. 전역 브리지 스킬·정본 스킬 문서 갱신은 CEO 직접.
- **변경 범위:** `scripts/mcp-server.mjs`, `tests/motion-mcp.test.mjs` 2파일. 스펙 전문: 스크래치패드 `wo015-spec.md`.
- **완료 기준:** `motion-mcp`·`mcp-server-batch`·`motion-candidates` PASS · `node --check` (CEO 재실행) / CEO 실기: MCP 모듈 직접 호출로 후보 생성→폴링→적용→되돌리기.
- **금지:** 2파일 밖 수정, commit·push, npm install, 서버 계약 변경.
- **위험등급:** R2(MCP 공유 파일) · **대표자 투입:** 0~5분 · **롤백:** 브랜치 `claude/sb-wo-015-motion-candidate-mcp` 폐기.
- **보고 형식:** WO-014와 동일.

#### 상태 이력

- 2026-09-07 15:3x KST — `발행`. 워크트리 `.claude/worktrees/sb-wo-015-motion-candidate-mcp` (`@ 84472070`) 생성, Maker 위임 가동.
- 2026-09-07 15:52 KST — Maker 반환(정확히 2파일). 이번 회차는 Maker가 Deno로 우회 검증해 MCP·batch 24건 통과를 자체 보고 → CEO Node 재실행 **26/26 · `node --check` OK · tsc 0**.
- 2026-09-07 15:53~15:58 KST — CEO 실기(MCP 모듈 직접 호출, 서버 발견을 3012로 재작성): `create_motion_candidate`(strip, 프레임 7) → pending → `get_motion_candidate` 폴링 5회 → ready(attempts 1·신뢰도 1·3×1·앵커 6·8, 프레임 절대경로 반환) → `apply_motion_candidate` → 오버라이드 [1..6] → `revert_motion_frames` → 잔여 [1..5] → 커밋 `8c6cec09`, 병합 `067a4963` → `완료`. 전역 브리지 스킬에 구간 수정 절 추가(CEO 직접).

### SB WO-005 — 영상 기본 모델 Grok Imagine 1.5 승격

- **ID:** `SB WO-005` · **우선순위:** P1 · **목표일:** 2026-09-07 KST
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현) / 검수 CEO 직접
- **의존성:** 대표 승인(2026-09-07 "영상기본모델 그록1.5는 해줘야지"), 2026-09-02 진단(기본값이 구형 `grok-imagine-video`로 하드코딩), xAI 1.5 사양(1~15초 · 480p/720p/1080p · 7개 화면비)
- **목표:** (1) 기본 모델 `grok-imagine-video-1.5`, 환경변수 `SIONBANANA_GROK_VIDEO_MODEL`로 덮어쓰기 (2) 모델별 최대 길이 단일 관리 — 1.5 계열 15초, 그 외 30초. 초과 요청은 **생성 호출 전에** 400으로 거부하고 사유에 모델·상한 명시 (3) 호출부가 `model`을 주면 그 값 우선(기존 동작 유지).
- **배경:** 다른 세션은 `model` 파라미터로 이미 1.5를 쓰고 새 스킬 문서도 1.5 기준인데 엔진 기본값만 구형이라, 명시를 잊으면 조용히 구버전이 쓰였다. 1.5는 15초 상한이므로 라우트의 기존 30초 허용과 충돌 — 모델별 상한으로 해소한다.
- **변경 범위:** `lib/grok-video.ts`, `app/api/video/route.ts`, `scripts/agent-video.mjs`(도움말 문구), `tests/grok-video-model.test.mjs`(신규) 4파일. 스펙 전문: 스크래치패드 `wo005-spec.md`.
- **완료 기준:** 신규·회귀 3파일 PASS · tsc 0 (CEO 재실행) / 코드 정독 / CEO 실기: 재기동한 상주 서버에서 모델 미지정 5초 영상 1건 생성 → 응답·사이드카 `model`이 1.5인지 확인, 20초 요청은 400.
- **금지:** 4파일 밖 수정, commit·push, npm install, MCP 스키마 변경, 테스트에서 외부 API 호출.
- **위험등급:** R2(생성 기본값 변경 — 길이 상한이 30→15로 좁아지는 사용자 가시 변화) · **대표자 투입:** 0~5분 · **롤백:** 브랜치 폐기 또는 env로 구모델 지정.
- **보고 형식:** WO-015와 동일.

#### 상태 이력

- 2026-09-07 16:0x KST — 대표 승인으로 `발행`. 워크트리 `.claude/worktrees/sb-wo-005-grok-video-15` 생성, Maker 위임 가동.
- 2026-09-07 18:33 KST — Maker 반환(정확히 4파일, 검증 미실행) → CEO 재실행 **33/33 · tsc 0**. 직접 수정 0건.
- 2026-09-07 18:35 KST — 병합 시 `scripts/agent-video.mjs`의 **메인 폴더 미커밋 변경**(2026-06-11, 정규식 이스케이프 정리)과 파일 단위 충돌 → 해당 변경을 패치로 백업·되돌린 뒤 병합하고 **원상 복원**(다른 줄이라 내용 충돌 없음, 커밋하지 않음). 병합 `63df6fe4`.
- 2026-09-07 18:35~18:36 KST — 대표 승인에 따라 상주 서버 재빌드(`npm run build` 성공, 28쪽 생성)·재기동(`launchctl kickstart -k`). 3002에서 `/api/motion/sets` 200, `/api/motion/projects/<id>/candidates` 200 확인 → 다른 세션이 보고한 "구 빌드·404" 해소. → `완료`.

### SB WO-016 — 마스크 밖 원본 강제 보존 · 후보 적용 충돌 검사 · 되돌리기 의미 명시

- **ID:** `SB WO-016` · **우선순위:** P1 · **목표일:** 2026-09-07 KST
- **담당:** CEO(Sol, 스펙·검수·판정) / Maker(Codex exec, 구현) / 검수 CEO 직접
- **의존성:** SB WO-012~015 병합, 다른 세션의 지적 3건(2026-09-07, 대표 전달)과 CEO 코드 확인, 대표 승인("진행")
- **배경(지적 확인 결과, 3건 모두 사실):** ① 마스크 밖 보존이 프롬프트 지시에만 의존 — CEO 실측에서도 마스크 밖 평균 픽셀 차 7로 0이 아님 ② 후보 적용에 버전 검사가 없어 오래된 후보가 이후 수정을 조용히 덮어씀 ③ `revert`가 최초 원본 복원인데 어디에도 명시돼 있지 않음. (①의 "서버 구 빌드" 지적은 같은 날 재빌드·재기동으로 해소.)
- **목표:** (1) 마스크 결과를 셀 크기로 되돌린 뒤 마스크 가중치(페더링)로 원본과 합성해 **마스크 밖 픽셀 동일**을 보장 (2) 후보에 생성 시점 기준선(프레임별 override id)을 기록하고 적용 시 불일치면 409, `force`로 강제 적용 (3) 되돌리기가 최초 원본 복원임을 API·MCP 설명·UI 문구에 명시.
- **변경 범위:** `lib/motion/{types,candidates,candidate-generate,storage}.ts`, apply 라우트, `scripts/mcp-server.mjs`, `components/studio/motion/motion-fix-panel.tsx`, 테스트 2파일 = 9파일. 스펙 전문: 스크래치패드 `wo016-spec.md`.
- **완료 기준:** 신규·회귀 4파일 PASS · tsc 0 · `node --check` · lint (CEO 재실행) / 코드 정독 / CEO 실기: 마스크 실생성 1건에서 **마스크 밖 픽셀 차 0** 확인, 후보 A·B 충돌 시나리오에서 409와 force 동작 확인.
- **금지:** 9파일 밖 수정, commit·push, npm install, 서버 기동, 되돌리기 동작 변경, 테스트 삭제·완화.
- **위험등급:** R2(생성 결과 후처리 추가·적용 경로 변경) · **대표자 투입:** 0~5분 · **롤백:** 브랜치 `claude/sb-wo-016-candidate-safety` 폐기.
- **보고 형식:** WO-005와 동일.

#### 상태 이력

- 2026-09-07 18:4x KST — 대표 승인("진행")으로 `발행`. 워크트리 `.claude/worktrees/sb-wo-016-candidate-safety` 생성, Maker 위임 가동.
- 2026-09-07 18:51 KST — Maker 1차 반환(정확히 9파일) → CEO 재실행 66/66 · tsc 0 · lint 0. 실기: 후보 PNG 마스크 밖 **완전일치 100%**, 충돌 409·force 정상. 그러나 **적용 산출물(오버라이드)** 은 마스크 밖 평균 44.8·완전일치 0.2% — `fitToCell`이 셀 정렬 후보까지 재정렬·리샘플하는 것이 원인으로 확인 → 2차 라운드 발행.
- 2026-09-07 19:04 KST — Maker 2차 반환(`cellAligned` 플래그 + 적용 분기) → CEO 재실행 **69/69 · tsc 0**. 실기 재측정: 오버라이드 vs 원본 셀 **마스크 밖 평균 0.000 · 완전일치 100%**(정규화 끈 대조군도 동일) → 커밋 `a0a82139`, 병합 `c815e0da` → `완료`.
- **CEO 측정 오류 정정:** 2차 라운드 직후 "파생 프레임 마스크 밖 12.3"으로 보고했으나, 파생 프레임은 트림·정규화로 **셀과 좌표계가 달라** 셀 기준 마스크 영역을 그대로 대면 안 된다. 올바른 대상인 오버라이드 파일로 재측정한 값이 위의 0.000이다. 잘못된 지표를 근거로 추가 수정을 지시하지 않았음을 기록한다.

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

### SB WO-012 — 프레임 오버라이드 계층 · 후보 저장 · 적용/되돌리기 · 셀 이미지

- 검수 기준: 워크트리 `claude/sb-wo-012-motion-overrides` base `16cf63c0`, 시작 porcelain 0줄 → Maker 정확히 10파일. 범위 위반 0건. 왕복 1회.
- Maker 보고 — "구현 완료 / 검증 미실행"(키체인 -50). 가정: 빈 원본 셀에는 최소 배율 0.25 적용. 한계 자진 신고: 다중 프로세스 동시 쓰기·강제 종료 중 복구는 미보장.
- CEO 재실행 1차 — 테스트 84/86(실패 2) · tsc 오류 1. **원인 규명 3건, 직접 수정:**
  1. `candidates/route.ts`의 `CandidateRequestError`가 TypeScript 생성자 파라미터 프로퍼티를 사용 → Node strip-only 모드가 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`로 거부 → 라우트 테스트 전체 실패. 저장소 기존 스타일(필드 선언+본문 할당)로 교체.
  2. `cells/[index]/route.ts`가 `new Response(Buffer)` — `BodyInit` 불일치(tsc TS2345) → `new Uint8Array(buffer)`.
  3. 신규 원자성 테스트가 `projectDir()`(심링크 경로)로 `fs.rename` 목을 걸어 **목이 한 번도 발화하지 않고 통과**(macOS `/var`→`/private/var`) → 같은 파일 기존 원자성 테스트와 동일하게 `realpath` 비교로 교정. 완화가 아니라 오탐 제거이며, 교정 후 롤백 경로가 실제로 검증됨.
- CEO 재실행 2차 — `motion-candidates`·`motion-storage`·`motion-engine`·`motion-export`·`motion-sets` **86/86** · `tsc --noEmit` 0.
- 코드 정독 — 오버라이드는 방향 적용(flipX 후) 버퍼를 치환하므로 이중 반전 없음; `fitToCell`은 bbox 높이 기준 스케일(0.25~4 클램프)+발 기준점 정렬로 스파이크의 +18% 드리프트를 흡수; apply/revert는 프로젝트별 뮤테이션 락 + 오버라이드 스냅샷 롤백 + 실패 시 이전 프레임으로 재빌드; 오버라이드 파일이 사라지면 조용히 무시하지 않고 409로 실패(무결성); 후보·오버라이드 경로는 자산 화이트리스트·심링크·경계 검사 통과; 레거시 project.json은 `override: null`로 파싱.
- 실기(격리 dev 서버 3012) — 상태 이력 참조. 핵심: 원본 `raw.png` 불변, 적용은 지정 프레임만 교체, 되돌리기는 완전 복구(픽셀 차 0.00).
- 커밋 — WO `b753b4b7`, 병합 `4f6b7ac8`(로컬 전용). 상주 서버 재기동 대기.
- **판정: PASS · 완료.** 항목 5·6의 기반(원본 보존·후보·적용/되돌리기) 확보. 생성 모드는 WO-013.

### SB WO-013 — 후보 생성 모드 (마스크 인페인팅 · 앵커 스트립)

- 검수 기준: 워크트리 `claude/sb-wo-013-motion-candidate-generate` base `8effa350`, 시작 porcelain 0줄 → Maker 정확히 6파일. 범위 위반 0건. 왕복 1회(이후 교정은 CEO 직접).
- CEO 재실행 — `motion-candidate-generate`(18건 신규) 포함 4파일 **57/57** · tsc 0 · 워커 구문 OK.
- **CEO 직접 수정 3건(실측 근거, 코드 주석에 남김):** ① `buildMaskEditPrompt`에서 "mask"·"transparent (editable) area" 언급 제거 — 이 표현이 모델에게 투명 배경을 편집 대상으로 읽히게 해 전체 재생성을 유발(114/114). ② 보호 대상을 별도 문장으로 분리(중복 어구 제거). ③ `runMaskCandidate`가 투명 셀 대신 **키 컬러 합성 이미지**를 보내고 결과에 **프로젝트 매트를 재적용** — 편집 결과가 항상 불투명으로 돌아와 초록 배경이 파생 프레임에 남던 문제 해결. 테스트 단언 3건 동반 갱신(완화 아님, 새 계약 검증 추가).
- 코드 정독 — `input_fidelity` 미사용(백엔드가 400으로 거부), 마스크는 도구 파라미터로만 전달; strip은 앵커 포함 셀 배치(≤4면 1행, 그 외 2행)·자동 슬라이스 3회 재시도 후 격자 폴백·`metrics`에 attempts/신뢰도/배치 기록; 상태 선점(`assertClaim`)으로 중복 실행 차단; 프레임 실패는 1회 재시도 후 후보 전체 failed.
- 실기(격리 dev 서버 3012, 실생성) — 스트립: 8프레임 프로젝트의 4~5번을 앵커 3·6으로 재생성, attempts 1·신뢰도 1, 연속성 6/4/3(원본 6/5/6), 적용 후 높이비 1.00·1.01. 마스크: 교정 후 안 20 · 밖 7 · 투명 41%, 실물에서 무기만 나무 막대로 교체되고 얼굴·의상·배경 보존.
- 커밋 — WO `756454c6`, 병합 `20095e01`(로컬 전용). 상주 서버 재기동 대기.
- **판정: PASS · 완료.** 항목 5의 두 생성 모드 확보. 기억 `reference_codex_image_mask_edit.md`에 프롬프트 3규칙 기록. UI는 WO-014, MCP는 WO-015.

### SB WO-014 — 구간 선택 · 마스크 브러시 · 전후 비교 · 적용/되돌리기 UI

- 검수 기준: 워크트리 `claude/sb-wo-014-motion-fix-ui` base `58e7c53f`, 시작 porcelain 0줄 → Maker 정확히 3파일. 범위 위반 0건. 왕복 1회. CEO 직접 수정 0건.
- CEO 재실행 — `tsc --noEmit` 0 · `next lint` 3파일 0 · 회귀 `motion-candidates`+`motion-storage` 25/25.
- 코드 정독 — 서버 계약 준수(후보 POST/폴링/apply/revert/DELETE, 후보 이미지·셀 자산 URL), 적용·되돌리기는 프로젝트 뮤테이션 잠금과 캐시 버전 갱신을 거침, 파괴적 동작 전 확인 대화상자, 서버 코드 무변경.
- 실기 — 브라우저 전 흐름 통과(상태 이력 참조). 검수 중 관찰: 자동화에서 `window.confirm`이 기본 취소로 처리되어 적용이 무시되던 것은 **UI 결함이 아니라 검수 방법 문제**였고, 확인을 승인으로 두면 정상 동작.
- **후속(UX, 기능 영향 없음):** ① 앵커 스트립 모드로 전환해도 마스크 브러시 영역이 계속 노출된다(서버는 strip에서 마스크를 무시하므로 무해하나 혼동 소지). ② 스트립 모드의 앵커 안내 문구(직전·직후 프레임 번호)가 화면에서 확인되지 않았다. 두 건은 WO-015 이후 UX 정리 후보.
- 커밋 — WO `27c20d73`, 병합 `84472070`(로컬 전용). 상주 서버 재기동 대기.
- **판정: PASS · 완료.** 제안 항목 5(구간 선택·수정 종류·보호 대상 지정)와 6(전후 비교·적용/되돌리기)의 UI 충족. 남은 것은 MCP 노출(WO-015).

### SB WO-015 — MCP 후보 도구 4종

- 검수 기준: 워크트리 `claude/sb-wo-015-motion-candidate-mcp` base `452e5bb0`, 시작 porcelain 0줄 → Maker 정확히 2파일. 범위 위반 0건. 왕복 1회. CEO 직접 수정 0건.
- Maker 보고 — 키체인 이슈를 **Deno 런타임으로 우회**해 MCP·batch 24건 통과를 자체 검증(이전 회차들과 달리 자체 실행 성공). 그래도 판정은 CEO Node 재실행으로 한다.
- CEO 재실행 — `motion-mcp`·`mcp-server-batch`·`motion-candidates` **26/26** · `node --check scripts/mcp-server.mjs` OK · tsc 0.
- 코드 정독 — 서버 주소는 `findMotionServer(context.fetchImpl)`로 해석하고 모든 호출에 주입 fetch 사용(테스트 가능), 파일 경로 입력은 기존 upload 검증 헬퍼 재사용(저장소 안·8MB·매직), 반환 절대경로는 realpath 경계 검사, 기존 도구 동작 불변.
- 실기 — MCP 4도구 실호출 전 경로 통과(상태 이력 참조).
- 커밋 — WO `8c6cec09`, 병합 `067a4963`(로컬 전용). 상주 서버 재기동 대기.
- **판정: PASS · 완료.** T-07 결정(B)의 4단계 프로그램(WO-012~015) 종료. 제안 항목 5·6이 서버·생성·UI·MCP 전 계층에서 구현됨.

### SB WO-005 — 영상 기본 모델 Grok Imagine 1.5 승격

- 검수 기준: 워크트리 `claude/sb-wo-005-grok-video-15` base `154bbf7b`, Maker 정확히 4파일. 범위 위반 0건. 왕복 1회. CEO 직접 수정 0건.
- CEO 재실행 — `grok-video-model`(신규)·`mcp-video`·`motion-mcp` **33/33** · tsc 0.
- 코드 정독 — `resolveDefaultGrokVideoModel(env)`가 런타임에 해석되므로 env 변경이 재시작 없이 반영된다(기존 `DEFAULT_GROK_VIDEO_MODEL` export는 하위호환으로 유지). 라우트는 **생성 호출 전에** 모델을 확정하고 상한을 검사하므로 초과 요청이 외부 API로 나가지 않는다. 확정 모델을 엔진에 명시 전달해 기본값 해석 지점이 하나가 됐다. 응답·사이드카의 `model` 기록 우선순위는 기존과 동일.
- 병합 특이사항 — 메인 폴더에 6월부터 남아 있던 `scripts/agent-video.mjs` 미커밋 변경과 파일 단위 충돌. 그 변경을 패치로 보존·복원하고 커밋하지 않았다(소유자 불명 잔여물이라 임의 커밋하지 않음).
- 실기 — 서버 재빌드·재기동 후 3002에서 신규 라우트 200 확인. 기본 모델 실호출 검증은 다음 영상 생성 시 확인 예정(대기).
- **판정: PASS · 완료.** 이제 `model` 미지정 호출도 1.5를 쓴다. 1.5는 15초 상한이므로 16~30초는 명시적으로 구모델을 지정해야 한다.

### SB WO-016 — 마스크 밖 원본 보존 · 적용 충돌 검사 · 되돌리기 명시

- 검수 기준: 워크트리 `claude/sb-wo-016-candidate-safety` base `c0ce510e`, Maker 1차 9파일 · 2차 5파일(모두 스펙 목록 내). 범위 위반 0건. 왕복 2/2. CEO 직접 수정 0건.
- 발단: 다른 세션의 지적 3건(2026-09-07). CEO가 코드로 확인해 **3건 모두 사실**로 판정했다. 서버 구 빌드는 같은 날 재빌드로, 나머지 2건은 이 작업지시로 처리.
- CEO 재실행 — 1차 66/66, 2차 **69/69** · tsc 0 · `node --check` OK · lint 0.
- 코드 정독 — `compositeInsideMask`는 마스크 알파 255 픽셀을 **원본 바이트째 복사**하므로 보존이 수치가 아니라 구조로 보장된다(페더는 편집 영역 안쪽으로만 번진다). 충돌 검사는 **쓰기 전에 전체 대상**을 검사해 부분 적용이 남지 않는다. `cellAligned` 후보는 크기 검증 후 `fitToCell` 없이 그대로 오버라이드가 된다(리샘플 제거). 레거시 후보는 `baseline: []`·`cellAligned: false`로 기존 동작을 유지한다.
- 실기(격리 dev 서버 3012, 마스크 실생성) —
  · 후보 PNG: 마스크 밖 평균 0.000, 완전일치 **100%**
  · 적용 산출물(오버라이드, 셀 크기): 마스크 밖 평균 0.000, 완전일치 **100%**(정규화를 끈 대조군도 동일 → 원인이 정규화가 아니라 재정렬이었음을 확인)
  · 충돌: 후보 A 생성 → B 적용 → A 재적용 시 **409**(사유에 프레임 번호) → `force: true`로 적용 성공
- 커밋 — WO `a0a82139`, 병합 `c815e0da`(로컬 전용). 상주 서버 재빌드·재기동으로 3002 반영.
- **판정: PASS · 완료.** 지적 3건 종결. 남은 한계: 파생 프레임은 트림·정규화를 거치므로 셀 좌표 기준의 픽셀 동일성이 그대로 이어지지는 않는다(설계상 정상, 오버라이드 단계까지 보장).

### SB WO-017 — P0 배치·적용 경계 검사 (내용 손실 차단 · 미검증 상태 명시 · 화면 구분)

- 발단: 외부 제안서 「모션에셋 생성기 디벨롭 수정 제안서 v1.0」(2026-09-08, 저장소 `242cfa8c` 기준). 대표가 P0/P1 분리와 **좁은 P0 우선**을 지시했다. 조건: 자동 분리기·공통 캔버스 유지, 실제 내용 손실과 비의도 빈 프레임만 차단, **단순 경계 접촉은 검토 대상으로 구분**, 의도된 소멸 프레임 허용, 판정을 적용·내보내기로 연결.
- CEO 사전 검증 — 제안서 주장을 코드로 대조했다. **확인된 결함:** `fitToCell`이 배율을 높이만으로 정해 폭 초과를 처리하지 않고 셀 밖 픽셀을 경고 없이 버린다 / 배치가 완전히 빗나가면 투명 빈 프레임을 조용히 반환한다 / 고정 격자 모드는 `sliceConfidence`를 1로 기록하고 UI 배지는 auto일 때만 그린다 / 스트립 폴백은 `layoutFallback`·신뢰도 0.3을 남기지만 읽는 곳이 없고 상태는 `ready` / 내보내기는 이 값들을 전혀 참조하지 않는다.
- **제안서 정정 2건** — ① §2.1의 "요청 3×2대로 분리" 기전은 **현행 auto 경로에서 재현되지 않는다**(감지 사각형을 쓰고 격자를 감지값으로 덮으며 신뢰도를 0.3으로 낮춘다). 고정 격자 분리는 `sliceMode: "grid"`와 스트립 폴백의 문제다 — 이 정정으로 P0에서 주 분리기를 제외했다. ② §7.2의 출력 단계 우려는 해당 없다. `normalizeFrames`는 전 프레임 bbox의 합집합에 여백을 더해 캔버스를 잡으므로 자르지 않는다. §7.3은 `scaleClamp` 0.25로 이미 절반은 걸려 있다.
- 위임 — 3분할(A 차단 코어 6파일 / B 명시·연결 10파일 / C 화면·레거시 보정 4파일). 각 왕복 1회. 3회 모두 Maker가 키체인 크래시(`SecItemCopyMatching -50`, exit 139)로 검증을 실행하지 못하고 **INCONCLUSIVE로 정직 보고**했다 — 통과 주장 없음. 검증은 전부 CEO가 실행했다.
- **Maker가 잡은 CEO 스펙 결함 1건** — A 스펙의 `placementEmpty` 정의(`copyWidth < 1`)가 좁았다. 크롭의 투명 부분만 셀과 겹치면 이 값이 양수여도 결과는 완전히 빈다. Maker가 질의했고 CEO 목표 2에 맞춰 전손까지 차단하도록 구현됐다.
- **CEO 직접 수정 3건** — ① 위 `placementEmpty` 조건에서 `lostPixels > 0` 요구를 제거했다(잘린 것 없이도 결과가 빌 수 있다). 오류 문구도 "전부 셀 밖으로 나가"→"남는 내용이 없어"로 교정. ② 빈 후보 검사 시 셀 크기를 `0×0`으로 보고하던 오류를 실제 값으로 고쳤다 — **테스트가 그 오류값을 정답으로 고정하고 있어 기대값도 함께 교정**했다(완화가 아니라 잘못된 기대값 수정). ③ 불투명 임계값 16을 상수로 승격하고 근거를 주석에 남겼다(`analyzeFrame`은 8을 쓰지만, 리샘플 프린지가 경계를 넘었다고 막으면 "경계 접촉은 검토" 구분이 무너진다).
- CEO 재실행 — 병합본 전체 **271/271** · tsc 0 · `node --check scripts/mcp-server.mjs` OK · lint 0.
- **실기(보존 K2 자료, 모델 호출 0)** — 사격 후보 3장을 새 검사기에 통과시켰다.
  · 프레임 2번 **BLOCKED** content-loss, 잘림 746px(우측 713 = 총열·총구 화염), 내용 386×458 vs 셀 363×460
  · 프레임 3번 **REVIEW** boundary-touch, 잘림 0px → 차단하지 않고 통과
  · 프레임 4번 **BLOCKED** content-loss, 잘림 290px. **내용(354×459)이 셀(357×461)보다 작은데도 피벗 배치 때문에 잘린다 — 크기 비교만으로는 못 잡는 사례.**
  · 당시에는 3장 모두 적용됐고 사람이 눈으로 본 뒤에야 반려됐다. 과차단 0건.
  · 레거시 보정 실동작: K2 후보가 `requiresReview: true`, 사유 `layout-fallback-grid`·`low-slice-confidence`로 읽힌다.
- 설계 근거 — **손실률 백분율 임계값을 쓰지 않는다.** 위 사례는 1.2% 손실인데 동작을 못 쓴다. 판정은 기하학적으로 한다(셀 밖 불투명 픽셀 수 / 안쪽 잔존 여부 / 경계 접촉).
- `force`의 의미를 확장하지 않았다. 기준선 충돌 전용으로 두고 잘림 허용은 `allowContentLoss`로 분리했다. 화면도 409를 `code`로 분기해 CONTENT_LOSS에는 force 재시도를 제안하지 않는다(제안하면 같은 오류가 반복된다 — C 착수 전 실재하던 결함).
- 커밋 — A `ea6966ce`, B `63ea12ae`, C(화면·레거시) 포함 병합 `d5261bda`(로컬 전용). 상주 서버는 재빌드 전까지 구 코드.
- **판정: PASS · 완료.** 남은 한계: 후보 표본이 1건뿐이라 차단 규칙의 오탐률을 통계로 말할 수 없다 — `maxLostPixels`를 옵션으로 열어 두었다. P1(격자 참조)은 미착수이며 생성 예산 별도 승인 대기.

#### SB WO-017 — CEO 측정 오류 정정 (2026-09-08, 상주 서버 재기동 직후)

상주 서버 재기동 후 실서버 409 응답의 잘림 수치가 CEO 오프라인 측정과 달라 원인을 추적했다.

- **원인:** CEO 검증 스크립트가 셀 사양을 `project.json`의 저장된 `frame.trim`·`frame.pivot`으로 손수 구성했다.
  그러나 실제 적용 경로의 `readOrientedCell`은 저장값을 쓰지 않고 **원본을 다시 잘라 매트를 적용한 뒤 `analyzeFrame`으로 trim·pivot을 재산출**한다.
  두 사양이 달라 배율·배치가 어긋났고 손실량이 과대 계상됐다.
- **정정 (실제 파이프라인 기준, 실서버 409 응답과 일치):**
  | 프레임 | 오보고 | 정정 |
  |---|---|---|
  | 2번 | BLOCKED 746px | **BLOCKED 355px** (우측 355) |
  | 3번 | REVIEW boundary-touch | **OK** (경계 접촉 없음) |
  | 4번 | BLOCKED 290px | **BLOCKED 8px** (우측 8) |
- **결론은 불변:** 3장 중 2장 차단, 1장 통과. 육안 확인 — 2번은 총구 화염이 경계에서 반토막이라 차단이 타당하다.
- **다만 "과차단 0건" 판정은 철회한다.** 4번의 8px은 총열 끝 얇은 조각으로 육안상 거의 온전한데 `maxLostPixels` 기본값 0에서 차단된다.
  경계선 사례이며, 요청하신 "실제 손실 차단 / 단순 경계 접촉은 검토" 구분의 중간에 놓인다.
  현재는 화면 체크박스(`잘리더라도 적용`) 한 번으로 통과시킬 수 있어 기본값 0(엄격)을 유지한다 —
  과차단은 클릭 한 번, 과소차단은 깨진 에셋이므로 비대칭이다. 실사용에서 번거로우면 `maxLostPixels`가 조정 손잡이다.
- 커밋 메시지 `ea6966ce`와 병합 전 현황판 문구에 오보고 수치가 남아 있다(사후 수정 불가). 이 절이 정본이다.
- **재발 방지:** 파이프라인 기준 측정은 `readOrientedCell`이 반환하는 셀 사양을 그대로 써야 한다. 저장된 프레임 기하로 대체하지 않는다.

### SB WO-018 — 검토 게이트 (빈 프레임 검사 · 사유 보존 · 명시적 승인 · 내보내기 차단)

- 발단: 대표 지시 4항(2026-09-08). ① `cellAligned` 후보의 빈 프레임 검사 ② 후보 검토 사유를 적용·내보내기까지 보존
  ③ 차단과 검토 필요의 정책 확정 ④ 회귀 테스트 5종.
- **CEO 사전 재현(격리 임시 디렉터리, 실제 프로젝트 무접촉)** — 지적 2건 모두 사실로 확인.
  · 투명한 48×48 `cellAligned` 후보가 적용 성공, 오버라이드 기록됨, 불투명 픽셀 0.
  · 적용된 오버라이드가 `{candidateId, mode, appliedAtIso, instruction}`만 남겨 후보의 `reviewReasons`가 소실.
    내보내기는 `override.fit.reasons`만 읽으므로 후보 사유가 닿을 경로가 없었다.
- 위임 — 3분할(A 적용 게이트 3파일 / B 보존·승인·내보내기 11파일 / C 화면 3파일). 각 왕복 1회.
  3회 모두 Maker가 키체인 크래시(exit 139)로 검증 미실행 · **INCONCLUSIVE 정직 보고**. 검증은 전부 CEO 실행.
- **결함을 지키고 있던 테스트 1건 교체** — `cell-aligned candidates keep the existing size-only apply path`가
  **투명한 후보로 적용 성공을 단언**하고 있었다. 대체 테스트는 거부·의도 허용·픽셀 동일성·부분 적용 방지를 검증한다.
- 확정된 정책:
  · **차단(승인 불가):** 실제 내용 손실(`content-loss-allowed`), 의도하지 않은 빈 프레임. 되돌리기·재생성만이 경로.
  · **승인 대상:** 손실 없는 경계 접촉 · 저신뢰 감지 · 고정 격자 폴백 · 배치 미검증 · **검증 기록 없음**.
  · `force`는 기준선 충돌 전용. 품질 검사를 우회하지 않는다.
  · '잘리더라도 적용'은 화면에서 제거. `allowContentLoss`는 API 비상구로만 남고, 그렇게 적용된 프레임은 내보내기가 막는다.
- 설계 요점:
  · `layoutValidated`를 3상태로(`true`/`false`/**`null`=기록 없음**). WO-017 B의 `sliceMode === "auto"` 유도는
    근거 없는 추정이므로 **제거**했다 — 대표 지시 "정보가 없으면 검증 완료로 추정하지 마세요".
  · 승인은 **승인 시점에 관측된 사유만 저장**한다. 이후 생긴 사유는 선승인되지 않고 다시 미결이 된다(자동 해제 불가가 구조로 보장).
  · 승인과 내보내기가 **같은 `includedFrames` 기준**으로 사유 문자열을 계산한다(어긋나면 승인이 영원히 안 먹는다 — 대조 확인).
  · 게이트가 `mkdtemp`보다 앞에 있어 차단 시 임시 파일·ZIP이 생기지 않는다(단일·세트 모두).
  · 내보내기 라우트가 **3곳**(`export`·`export-file`·`sets/export-file`)이다. 화면이 둘 다 쓰므로 전부 409로 처리했다 —
    스펙 초안에 하나만 적었다가 착수 전 보정했다.
- CEO 재실행 — 병합본 전체 **278/278** · tsc 0 · `node --check` OK · lint 0.
- **CEO 검수 누락 1건(정정)** — B·C의 수용 기준을 모션 테스트 6개 파일로 좁게 잡아 `tests/motion-set-export.test.mjs`가 빠졌다.
  병합 후 전체 스위트에서 **2건 실패**(고정 격자 픽스처가 게이트에 걸려 409)로 드러났다. 어서션을 낮추지 않고
  픽스처에 실제 승인 경로(`setReviewApproval`)를 한 번 거치게 해 통과시켰다(`5d02539d`).
  **재발 방지: 게이트를 건드리는 작업의 수용 기준은 전체 스위트로 잡는다.**
- 독립 실기(모델 호출 0) —
  · 투명 cellAligned 후보 → 거부(안내 문구의 프레임 번호 2번 / 인덱스 1 정확).
  · 저신뢰 후보 적용 → 오버라이드에 `review.reasons`·`candidateId` 보존 → 내보내기가
    `layout-not-validated, frame-3-low-slice-confidence, frame-3-layout-fallback-grid`를 사유로 거부.
  · **사유 없는 auto 프로젝트는 승인 없이 그대로 내보내진다**(`requiresReview=false, issues=[], approval=null`) — 회귀 없음.
  · K2 후보 판정 불변(2장 차단 355px·8px, 1장 통과).
- 커밋 — A `939c4c6d`, B `5245db3f`, C `5e69f8cc`, 병합 `9a95e67b`, 픽스처 정정 `5d02539d`(로컬 전용).
- **판정: PASS · 완료.** 남은 한계는 완료 보고 참조.

#### SB WO-018 — 실서버 브라우저 검증 (2026-09-08 20:45~20:50, 대표 지시)

완료 보고에서 "화면 미검증"을 한계로 남겼기에, 재빌드·재기동 후 **실제 브라우저에서 클릭으로** 확인했다.

- **내보내기 게이트 전 과정 (네트워크 로그 실측):**
  `GET .../export → 409` → `POST .../review-approval → 200` → `GET .../export → 200`.
  차단 → 승인 → 재시도 성공이 한 번의 버튼 클릭으로 이어진다.
- **검수 패널 렌더** — "내보내기 전 검수 / 배치 검증 기록이 없음 / 재생 미리보기로 동작을 확인한 뒤 승인하세요. /
  [미리보기로 확인했습니다 — 검수 승인]". 사유가 식별자가 아니라 사람이 읽는 문구로 나온다.
- **3상태 배지** — 레거시 프로젝트에 "배치 검증 기록 없음"이 뜨고 신뢰도 수치는 보이지 않는다.
- **승인이 검증 상태를 위조하지 않는다** — 승인 후에도 `layoutValidated`는 `null` 그대로이고
  `approvedReasons: ["layout-validation-unknown"]`만 기록된다. 승인은 '미상'을 인정하는 것이지 '검증됨'으로 바꾸지 않는다.
- **적용 차단** — 후보 적용이 409로 막히고 **재시도 요청이 발생하지 않는다**(force 미제안 실동작 확인).
  오버라이드 파일 0건, 프로젝트 무변경.

**발견한 결함 1건(수정 완료)** — 차단 토스트가 "손실을 감수하려면 `allowContentLoss`로 적용하세요"를 안내했다.
이 문구는 WO-017에서 체크박스가 있던 시절에 쓴 것인데 WO-018 C가 그 체크박스를 화면에서 없앴으므로,
**사용자가 도달할 수 없는 수단을 가리키는 막다른 안내**가 됐다. 실제 경로(후보 재생성)와 후보 원본 보존 사실을
알리도록 교체했다(`e9aae1ee`). `allowContentLoss`는 API 비상구로 남으므로 MCP 도구 설명에는 그대로 뒀다.
**타입 검사·린트·단위 테스트로는 잡히지 않는 종류였고, 화면을 실제로 눌러봐야만 나오는 결함이었다.**

- 테스트용으로 만든 승인 기록은 `DELETE .../review-approval`로 되돌렸다. 복원 확인 —
  `reviewApproval: null`, 오버라이드 0건, 프레임 6개·제외 0건, 내보내기 다시 409(원상태).
- 재빌드·재기동 2회(문구 수정 반영 포함). 전체 테스트 **278/278** · tsc 0.

### SB WO-019 — 실제 이미지 백엔드 계측·기록 (Images 2.5 전환 감지 대비)

- 발단: 대표가 "GPT 이미지 신모델 대응"을 지시(2026-09-09). ChatGPT Images 2.5가 2026-09-08 출시됐고 API 모델은
  `gpt-image-2.5-flare`·`gpt-image-2.5-sunburst`다.
- **CEO 조사 결론: 지금 우리 구조로는 2.5로 바꿀 수 없다.** Codex OAuth 브리지가 이미지 모델을 서버에서 고정한다.
  실측(`scratchpad/probe-echo-raw.mjs`) —
  ```
  보낸 것 : quality=high  size=1536x1024  output_format=webp  model=gpt-image-2.5-flare
  서버 에코: quality=auto  size=auto       output_format=webp  model=gpt-image-2-codex
  ```
  · `output_format`·`moderation`만 존중되고 **`model`·`quality`·`size`는 덮인다.**
  · 엉터리 모델명(`__invalid_model_name__`)도 **400이 아니라 200**으로 조용히 덮인다 — 검증조차 하지 않는다.
  · 오케스트레이터를 `gpt-6-astra`·`gpt-5.6-terra`로 바꿔도 백엔드는 동일하다.
- **부수 발견 2건.** ① 우리가 넣어온 `quality`·`size`는 **효과가 없었다**(결과가 요청보다 크게 돌아오던 현상의 원인이 `size=auto`).
  ② 사이드카가 `model`에 라우팅 모델(`gpt-5.6-sol`)을 기록해왔다 — 이미지를 만든 건 `gpt-image-2-codex`이므로
  **출처 기록이 비어 있는 게 아니라 틀려 있었다.**
- 웹 조사 — Codex 앱에 비활성 이미지 업그레이드 게이트가 9/3부터 노출(공식 일정·롤아웃 계획 없음).
  전례상 서버 측 교체다(2026-04-21 `gpt-image-2`가 `gpt-image-1.5`를 대체). **따라서 전환일에 클라이언트 변경은 불필요하다.**
  API 키로 2.5 직접 호출은 가능하나 정본 §4(별도 과금 금지)에 걸리므로 정본 개정 사안으로 보류.
- 그래서 모델 교체 대신 **계측**을 했다: 서버 에코를 기록해 전환일을 자동으로 감지하고, 틀린 출처 기록을 바로잡는다.
- 위임 — 6파일, 왕복 1회. Maker는 키체인 크래시로 검증 미실행·**INCONCLUSIVE 정직 보고**. 검증은 CEO 실행.
- **CEO 변경 시도 1건 → 철회.** 빈 에코가 이전 값을 덮지 않도록 가드를 넣었다가 테스트가 거부해 되돌렸다.
  Codex 구현이 옳다 — 관측하지 않은 값을 이번 산출물에 붙이는 것은 **출처를 바로잡으려는 이 작업의 목적과 반대**다.
- 설계 요점 — 생성 라우트는 모듈 getter가 아니라 **호출별 결과값**을 쓴다. 병렬 생성에서 귀속이 정확하고,
  테스트가 서로 다른 백엔드 두 개를 돌려주며 각 사이드카가 자기 것을 받았는지 확인한다.
  요청 페이로드·응답 본문·기존 필드 의미는 바꾸지 않았다(추가만).
- CEO 재실행 — 병합본 전체 **285/285**(278+7) · tsc 0.
- **실서버 검증(재빌드·재기동 후 실생성 1회)** —
  · 생성 전 헬스 `imageBackend: null` → 생성 후
    `{model: "gpt-image-2-codex", quality: "auto", size: "auto", moderation: "low", outputFormat: "png", background: "auto"}`
  · 사이드카: `model: "gpt-5.6-sol"`(라우팅, 하위호환 유지) + `imageBackend.model: "gpt-image-2-codex"`(실제),
    `quality: "high"`(요청) 옆에 `imageBackend.quality: "auto"`(적용) — **불일치가 이제 기록에 보인다.**
- 커밋 — `952dbaa3`, 병합 `(아래 참조)`. 상주 서버 재빌드·재기동 완료.
- **판정: PASS · 완료.** 남은 한계: 마스크 편집 경로는 모듈 getter를 쓰므로 동시 요청 시 귀속이 어긋날 수 있다
  (오늘은 모든 경로가 같은 백엔드라 무해하나, 전환일에는 오귀속 가능). 관측값은 인메모리라 재시작 시 초기화된다(지속 기록은 사이드카가 담당).

### 조사 기록 — 이미지 해상도 지정(1K/2K/4K)은 현재 불가능하다 (2026-09-09)

작업지시가 아니라 대표 질의("1k,2k,4k를 구분해서 생성할 수 없다고?")에 대한 조사 기록이다. **코드 변경 없음.**

**결론: 오늘은 지정할 수 없다.** 요청 크기와 무관하게 서버가 정한 값으로 나온다. 실측 5건 —

| 요청 | 실제 | |
|---|---|---|
| 1536×1024 (1K) | 1672×941 | |
| 2048×1152 (2K) | 1672×941 | 세 요청이 **동일 출력** |
| 3840×2160 (4K) | 1672×941 | |
| 1024×1024 (1:1) | 1254×1254 | |
| 1024×1536 (9:16) | 941×1672 | |

**비율은 반영된다(3/3 정확).** `aspectRatio`는 프롬프트에 주입되는 경로라 살아 있다. `imageSize`만 죽었다.

**그러나 6월까지는 정확히 동작했다.** 저장된 PNG 7,223장을 훑은 결과 —
- `2048×1152`(코드의 2K 규격값)이 **1245장**, `1824×1024`(1K 16:9 규격값)이 329장 존재한다.
- 2026-05-22 표본 사이드카: `imageSize: 2048x1152` → **실제 2048×1152 일치**, `model: gpt-image-2`.
- 월별 지배 해상도: 05월 `2048×1152`(623) → 06월 혼재(596 / 1672×941 230) → 07월 `1672×941`(1395).
  **전환은 6월 중이다.**

**설정 되돌리기로는 복구되지 않는다.** 당시 기록된 `gpt-image-2`를 본문 모델로 넣으면 지금은 거부된다 —
`400 "The 'gpt-image-2' model is not supported when using Codex with a ChatGPT account."`
(`gpt-image-2-codex`도 동일.) 현재 `.env.local`은 라우팅 모델이며, 그 경로에서는 도구 설정이 전부 정규화된다
(`model`·`quality`·`size` → 서버 값. `output_format`·`moderation`만 존중. SB WO-019 참조).

**원인은 단정하지 못한다.** OpenAI가 이미지 모델을 본문 모델로 받는 것을 막은 것인지, 우리 설정이 먼저 바뀐 것인지
남은 증거로 순서를 가릴 수 없다. 6월에 요청 경로를 바꾼 커밋은 없다(참조 핸들 기능 1건뿐).

**`upscale_from`은 대안이 아니다.** `--size`가 같은 `/api/generate`로 가므로 같은 벽에 막힌다 —
재생성일 뿐 해상도가 오르지 않는다(`scripts/agent-generate.mjs` 1395행 도움말로 확인).

**남은 선택지:** ① 외부 업스케일러 후처리(보간이므로 디테일이 새로 생기지는 않는다)
② API 키 직접 호출(**정본 §4 별도 과금 금지에 걸림 — 정본 개정 사안**)
③ Images 2.5의 Codex 개방 대기(2.5는 `low`~`max` 품질 등급을 명시 지원하므로 제어가 돌아올 여지가 있다).

**CEO 조언 정정:** 앞서 "`imageSize` 설정을 화면에서 라벨 변경하자"고 했으나 **철회한다.**
구조적 한계로 보고 한 조언인데, 6월까지 동작했고 2.5에서 돌아올 수 있으므로 설정은 그대로 둔다.
SB WO-019가 요청값과 실제 적용값을 나란히 기록하므로, 다시 먹기 시작하면 사이드카에서 즉시 드러난다.

**CEO 근거 부족 정정:** 최초 답변에서 "해상도는 고를 수 없습니다"라고 단정했으나, 그때 표본은 1K 등급 3건뿐이었고
2K 문턱(2048×1152) 위를 시험하지 않은 상태였다. 2K·4K를 추가 실측한 뒤에야 근거가 갖춰졌다.

### SB WO-020 — Grok 영상 생성에 마지막 프레임·참조 이미지 입력 추가 (2026-09-09)

- 발단: 대표 질의 "그록 영상 모델이 시작·끝 프레임 입력을 받게 됐는데 우리 MCP는 대응됐나" → **아니었다.** `image` 한 장만 보냈다.
  xAI 가이드: 1.5에서 `image`(첫 프레임 고정)·`last_frame`(끝 고정, 둘 다면 보간)·`reference_images`(프레임 미고정 외형 참조). 구형은 `last_frame` 거부.
- 문서 불일치: reference-to-video **가이드**는 `last_frame` 명시, REST **레퍼런스**는 누락. 가이드대로 구현하고 실생성으로 판정 → **가이드가 옳았다**(아래).
- 위임 — 7파일, 왕복 1회, Maker 키체인 크래시로 검증 미실행·INCONCLUSIVE 정직 보고. 워커는 `job.request`를 통째로 POST하므로 무변경.
  **Maker의 설계 개선 채택:** 파싱용·등록용 둘이던 MCP 스키마를 하나로 합쳤다. `superRefine` 결과(ZodEffects)엔 `.shape`가 없어
  SDK `tools/list`가 깨지므로 base shape를 붙이는 **TODO 우회**를 둔다. CEO가 "등록엔 base `.shape`"로 바꾸려다 철회 —
  그러면 SDK 검증은 통과하고 핸들러만 거부해 판정이 어긋나며, sync 테스트가 정확히 그걸 잡는다. Codex가 옳다.
- CEO 재실행 — 워크트리 291/291 · 병합본 **299/299** · tsc 0 · `node --check` ×2.
- **실생성 3편(대표 승인, 각 기능 1편):**
  | # | 입력 | 결과 | 검증 |
  |---|---|---|---|
  | 1 | 첫 프레임만(기준선) | 1264×720 5.04s, 36초 | 첫↔끝 프레임 차 9.6(실제 동작). **사이드카 `grok-imagine-video-1.5` — WO-005의 "실생성 확인 대기" 종결** |
  | 2 | 첫+끝(황혼→밤, 8s) | 1280×720 8.04s, 52초 | **영상 첫↔황혼 소스 3.9 / 끝↔밤 소스 7.1, 교차 대조 39.5 / 36.3** → `last_frame` 실제 고정됨 |
  | 3 | 참조 3장·첫 프레임 없음(6s) | 1280×720 6.04s, 41초 | 사이드카에 `sourceImageId` 없음·`referenceImageIds` 3개. 육안: 같은 등대·절벽을 배 위 새 구도로 |
  끝 프레임은 소스와 1px 높이 차(941/940)를 교란 변수로 보고 941로 리샘플한 사본을 별도 등록(`3cyx33w7p75mttmltcc`)해 썼다.
  기준선(1)은 WO-020 병합 **전** 빌드에서 생성 — `source`-only 경로는 스펙상 불변이며 회귀 테스트가 지킨다(재생성 안 함, 쿼터 절약).
- **CEO 절차 오류 2건(정정):** ① 병합·테스트·빌드·재기동을 줄 단위 체인으로 돌려 **병합 실패(Abort) 후에도 빌드·재기동이 진행** — 옛 코드 재기동(무해). ② 재시도 체인에서 `set -e`가 파이프 뒤 `;`로 무력화돼 **1건 실패 상태로 빌드·재기동**. 실패 원인은 `git apply --3way`가 실패 시 인덱스를 unmerged로 남기고 작업트리에 마커를 쓰는데, 뒤이은 `git checkout --`가 unmerged 경로에서 오류를 낸 것을 `2>/dev/null || true`로 삼킨 것. `tsc`는 `.mjs`를, Next는 `scripts/`를 보지 않아 테스트만 걸렸다. `git checkout HEAD --`로 복구, 3002는 그 파일을 로드하지 않아 재빌드 불필요. **재발 방지: 상태 변경 체인은 결과를 파일로 받아 종료 코드를 직접 검사하고, `git apply --3way` 뒤에는 `git ls-files -u`를 확인한다.**
- 메인 폴더의 6월 미커밋 `agent-video.mjs` 변경(`/[A-Za-z0-9_\-]+/`→`/[A-Za-z0-9_-]+/`, 기능 동일)은 WO-020이 그 줄을 대체해 **자연 소멸**. 손 이식하지 않았다.
- 커밋 `5f080d2a`, 병합 `f1f4b06d`(로컬 전용). 상주 서버 반영, 모델 가드 실서버 확인(구형 모델+`lastFrame` → 400 사유). 브리지 스킬 `create_video`·모델 기본값 줄 갱신.
- **판정: PASS · 완료.** 한계: `reference_images` 최대 3은 문서 미명시라 가정. 병렬 2편 동시 생성은 문제 없었으나 xAI 동시성 한도는 미측정.

### 사고 기록 — ChatGPT 구독 사용량 한도 소진, 생성 경로 전면 차단 (2026-09-09 ~ 2026-09-15 13:05 KST)

- **증상:** `chatgpt.com/backend-api/codex/responses`가 **HTTP 429 `usage_limit_reached`**(plan `pro`, `resets_in_seconds: 486400`). 이미지 생성 경로와 도구 없는 텍스트 경로 **모두** 거부. Codex CLI도 동일 한도로 exit 1("try again at Sep 15th, 1:05 PM").
- **영향:** 시온바나나의 ChatGPT 구독 경로 전부 — 이미지 생성·스토리보드/프롬프트 텍스트·마스크 편집·모션 시트·Codex 위임. **Grok 영상(xAI 프록시 18645)은 별도 쿼터라 정상**(당일 3편 생성 확인).
- **원인(당일 소비):** Codex 위임 8회(WO-017 A/B/C·018 A/B/C·019·020, 각 6~10만 토큰) + 이미지 실생성 약 12장 + 엔드포인트 프로브 다수(중단 스트림 포함). **위임·생성·프로브가 한 풀을 쓴다**는 점을 예산에 반영하지 않았다.
- **CEO 판단 오류:** 프로브를 "생성 완료 전 중단이라 비용 없음"으로 취급했으나 한도 산정에는 요청 자체가 잡힐 수 있다(미검증 추정). 하루 위임 8회는 이 플랜에서 지속 불가능한 속도였다.
- **WO-021 상태:** 스펙 작성 완료(125줄), 위임 즉시 실패(429), 워크트리 `claude/sb-wo-021-atlas-export` **clean·미착수**. CEO 독립 검증기(`verify-atlas.mjs`, Phaser JSONHash 파서 규칙 재현) 준비됨. 스펙 요지는 아래.
- **WO-021 스펙 요지(대장 보존용):** 단일·세트 내보내기에 `sprite-sheet.json`(TexturePacker JSON Hash) **항상 추가**, 플래그 없음. 프레임 키 = 인덱스 문자열, `rotated/trimmed=false`, `sourceSize/spriteSourceSize`=셀 크기, **`pivot`은 프레임 기준 0~1 정규화(소수 4자리)** — Phaser `JSONHash`가 `anchor||pivot`을 `customPivot`으로 읽고 `setOriginFromFrame`이 `originX/Y`(0~1)에 그대로 대입함을 소스로 확인. `meta`: app/version/image/format/size(실제 PNG)/scale/`frameTags`(연속 구간 애니만, loop·once→forward, pingpong→pingpong). 변경 파일 3개(`export.ts`·`set-export.ts`·`motion-export.test.mjs`), 게이트 뒤에서 생성, 기존 산출물 불변. 배경: TEF(Phaser 3)가 적군 에셋에 이미 이 포맷을 쓰고 K2만 격자 로더+보정 스크립트라, pivot 실은 atlas가 그 보정을 불필요하게 한다.
- **재개 조건:** 2026-09-15 13:05 KST 이후 위임 재시도, 또는 대표 결정(크레딧 구매 / CEO 직접 구현 — 위임 프로토콜 예외 승인 필요).
