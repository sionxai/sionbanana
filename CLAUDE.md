# Sion Banana — 세션 공통 지침

시온바나나는 **1인 제작자를 위한 로컬 AI 프리프로덕션 스튜디오**다. 본인 ChatGPT 구독
(Codex OAuth)으로 Responses 경로를 호출해, 캐릭터·장소·소품의 일관성을 유지한 다중 컷
시각 콘텐츠를 레퍼런스 → 스토리보드 → 검수 → 내보내기 흐름으로 완성한다. 현재 코드의
텍스트·이미지 기본 모델은 모두 `gpt-5.5`이며 이미지 모드는 `image_generation` 도구를
요청한다. 환경변수로 모델을 재정의할 수 있으므로 문서에서 다른 모델을 고정해 단정하지 않는다.
웹툰·모션은 별도 제품이 아니라 같은 자산의 후속 출력 형식이다. 현재는 수익화 이전의
제품 검증 단계다.

- **기획·전략·우선순위 판단이 필요한 작업은 `docs/COMPANY.md`(정본)를 먼저 읽어라.**
  다른 문서·코드와 충돌하면 정본이 우선한다.
- 작업지시는 `docs/WORK_ORDERS.md` 대장으로 관리한다. 지시는 `SB WO-###`로 부른다.
- 코드 변경은 작업지시 ID·완료 기준·검수 결과와 연결한다 (COMPANY.md §7).
- COMPANY.md §4 "하지 않는 것"(SaaS·결제·공개 배포 등)에 오른 항목은 재검토 조건
  충족 전 다시 제안하지 않는다.
- 토큰·비밀값은 서버 경계 밖과 로그에 노출하지 않는다.
- **현재 정본 상태:** `SB WO-003` 후보 `bfea5938`이 독립 Checker PASS와 CEO 재검증을
  거쳐 `0.1.3` 활성 정본으로 승인됐다. 코드 통합 기준은 `main`이다(2026-09-17 DEC-011 복원, 그전은
  `feature/webtoon-studio`의 `f90b8751`). 2026-08-17 R3 Checker 승인 범위에서 병합 브랜치 2개만 비강제 삭제해
  저장소를 `CANONICAL_CONFIRMED`로 마감했다. 추가 worktree·
  branch 삭제와 push·deploy는 별도 승인 전까지 계속 금지한다.
- **실제 저장 경계:** 생성 이미지·영상과 메타데이터는 로컬 파일시스템(`data/images`,
  `data/videos`)에 저장하고, 일부 캐릭터·스토리 편집 상태는 아직 `localStorage`다.
  SQLite 통합은 결정된 후속 구현이며 현재 구현으로 표현하지 않는다.
- **Webtoon 경계:** Webtoon Studio 관련 route/page/component/storage/test 16파일은 로컬
  untracked WIP다. clean checkout 기능이나 완료 산출물로 간주하지 않는다.
- **승인 경계:** T-01 미션 확장은 `UNAPPROVED — implement 금지`다. 대표의 별도 승인
  전에는 이미지·영상·영화·CF·PPT 전반 확장 제안을 구현 계약으로 사용하지 않는다.
