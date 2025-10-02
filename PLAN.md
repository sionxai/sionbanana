# 프로젝트 로드맵 (PLAN.md)

## 1. 제품 비전
- 시온 바나나는 "프롬프트 작성 → 생성 → 비교 → 고객 지원"까지 이어지는 AI 이미지 제작 풀스택 워크플로우를 한 화면에서 제공하는 스튜디오입니다.
- Next.js 14(App Router) + Firebase + Google Gemini 조합으로 **즉시 반응하는 실시간 UI**와 **운영 자동화**를 동시에 달성합니다.
- 핵심 가치는 ① 안정적인 이미지 파이프라인, ② 레퍼런스/프리셋을 활용한 반복 작업 가속, ③ 운영자-사용자 간 실시간 소통입니다.

## 2. 릴리스 테마
| 시기 | 테마 | 설명 |
| --- | --- | --- |
| 2025 Q1 | Alpha 운영 안정화 | Gemini 연동, Firebase Auth, RTDB 채팅, Firestore/Storage 메타데이터 정비. 실사용자 온보딩 가능 상태 확보 |
| 2025 Q2 | Studio 생산성 향상 | 배치 생성·뷰 변형(Variations), 외부 프리셋, Reference Slot 강화로 대량 반복 작업 속도 향상 |
| 2025 Q3 | 운영 자동화 & 품질 | 플랜/크레딧 정책 관리, 테스트 & 모니터링, 감사 로그, 버전 관리 자동화 |

## 3. 마일스톤 진행 현황
| 단계 | 주요 범위 | 산출물/지표 | 상태 |
| --- | --- | --- | --- |
| M0. 기반 구축 | Next.js 14(App Router), Tailwind(shadcn), 글로벌 Provider, Auth 게이트, 공통 네비게이션 | 레이아웃/테마 통합, 로그인/회원가입 UI 완성 | ✅ 완료 |
| M1. 이미지 생성 파이프라인 | `/api/generate` Gemini 연동, Firebase Storage 업로드, Firestore 기록, React Query 훅 | 정상 생성 성공률 ≥95%, 샘플/실제 모델 전환 토글 | ✅ 완료 |
| M2. Studio 워크플로우 | Prompt/Workspace/History 모듈, Reference Slot & Sync, Variations/Batch Shell, External Preset 91종 | 탭별 일관 UI, 로컬+원격 히스토리 병합, 레퍼런스 드래그 앤 드랍 | ✅ 완료 |
| M3. 실시간 상담 | RTDB 기반 채팅, 사용자/관리자 UI, `/api/chat/send` 관리자 API, 읽음/미응답 카운터 | 메시지 전달 지연 ≤1초, 누락 0건 | ✅ 완료 |
| M4. 운영 콘솔 | 관리자 플랜 승인/변경, 크레딧 조정, Temp Pass, 사용자 검색, 채팅 통합 관리 | Admin 페이지, REST + RTDB 하이브리드 데이터 | ✅ 완료 |
| M5. 관측성 & 품질 | 자동 테스트, 오류 로깅, 알림, 배포 전 점검, 보안 감사 | Playwright/Smoke, Firebase Monitoring, Admin 감사 로그 | 🚧 진행 중 |
| M6. 문서 & 프로세스 | PRD/LLD/PLAN 일원화, 온보딩 가이드, 배포 체크리스트, 변경 로그 자동화 | 문서 최신화, 체크리스트, GitHub Actions 알림 | 🔜 예정 |

## 4. 단기 스프린트 백로그 (Next)
1. **관측성**: Firebase Functions/Route Handler 로그 표준화, Sentry 또는 Cloud Logging 연동.
2. **테스트**: Studio 핵심 흐름(생성 → 히스토리 반영), RTDB 채팅, Admin 플랜 변경에 대한 Playwright 스모크.
3. **데이터 정합성**: Firestore ↔ Storage 이중 저장 시 중복 제거 및 자동 백필 스크립트 준비.
4. **성능**: Variations 대량 요청 시 Gemini 호출 큐 제어(동시성 제한 + 진행률 표시).
5. **보안**: 관리자 API 라우트에 역할 기반(ROLE_CLAIM) 검증 추가, Service Account 회전 절차 수립.

## 5. 의존성 & 준비물
- Firebase 프로젝트: Auth, Firestore(사용자/이미지/플랜), Storage, Realtime Database, Cloud Functions(Optional 로그용).
- Google AI Studio: Gemini 이미지 모델 키, quota 모니터링.
- Vercel(가정) 환경변수 세트: `.env.example` 기반, 서비스 계정 JSON 문자열, Realtime DB URL.
- 디자인 시스템: shadcn/ui 적용 컴포넌트 + Tailwind 토큰명 정리.

## 6. 리스크 및 대응
| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| Gemini API 속도/쿼터 변동 | 이미지 생성 지연, 실패율 상승 | 재시도 전략, 모델 폴백(FALLBACK_IMAGE_MODEL), 호출 큐 제어, 실패 시 샘플 자산 제공 |
| Firebase 권한 세팅 미흡 | 데이터 누락/권한 오류 | 배포 체크리스트, Firestore/Storage/RTDB 규칙 문서화, Staging 환경 별도 구성 |
| RTDB/Firestore 불일치 | 히스토리/채팅 데이터 불일치 | 주기적 정합성 스크립트, mergeHistoryRecords 유지, Admin 수습 도구 제공 |
| 테스트 부재 | 회귀 버그 | 스모크 자동화, 기능별 QA 체크리스트, PR 전 테스트 필수화 |

## 7. 변경 이력
- 2025-09-30: TypeScript 타입 안정성 개선, 빌드 에러 해결, README/PLAN/PRD/LLD 문서 업데이트.
- 2025-02-15: 전체 코드베이스 리뷰 후 Alpha 현황 반영, 관측성/테스트 관련 Next backlog 갱신.
- 2025-02-14: 초기 로드맵 작성, RTDB 전환·Studio 통합 완료 상태 기록.

---
> 문서 업데이트 규칙: 기능 설계 변경 또는 마일스톤 완료/착수 시 즉시 본 문서를 수정하고 Git 로그에 근거를 남깁니다.
