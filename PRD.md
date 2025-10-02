# 제품 요구사항 명세서 (PRD)

## 1. 개요
- **제품명**: 시온 바나나 AI Studio
- **목표**: 생성형 AI 이미지 제작, 반복 작업 가속, 운영자 상담을 하나의 웹 경험으로 통합해 사용자가 끊김 없이 작업을 끝낼 수 있도록 한다.
- **플랫폼**: 웹 (Next.js 14 App Router), 데스크톱/모바일 반응형 지원.

## 2. 배경 & 문제 정의
- 생성형 이미지 도구는 프롬프트 작성, 결과 비교, 고객 지원이 서로 다른 툴에 흩어져 있어 속도와 일관성이 떨어진다.
- 기존 프로젝트는 Firestore/Storage/Realtime Database가 혼재되어 데이터 정합성 이슈가 있었고, UI 또한 페이지마다 패턴이 달랐다.
- 운영자는 사용자의 플랜, 크레딧, 긴급 패스, 상담 이력 등을 한 화면에서 확인하기 어렵다.

## 3. 목표 & KPI
| 분류 | 목표 | 측정 지표 |
| --- | --- | --- |
| 생성 성공률 | Gemini 연동 기반 이미지 생성 성공률 95% 이상 | `/api/generate` 성공/실패 로그, Storage 업로드 성공률 |
| 작업 속도 | 히스토리/레퍼런스 반영까지 3초 이내, Variations 배치 완료까지 60초 내 (30개 기준) | 클라이언트 측 로딩 시간, Firebase RTT |
| 상담 안정성 | 메시지 전송 → UI 반영 1초 이내, 메시지 누락 0건 | RTDB write/read 로그, onSnapshot delay |
| 운영 효율 | 관리자 플랜 변경/크레딧 조정 응답 2초 이내, 감사 로그 100% 기록 | Admin API 응답 시간, Firestore 기록 수 |

## 4. 사용자 & 페르소나
- **크리에이터 (일반 사용자)**
  - 빠르게 프롬프트를 수정하며 여러 버전을 만들어 비교.
  - 이미지 히스토리를 저장/다운로드하고 필요 시 운영자에게 문의.
- **운영자 (관리자)**
  - 상담 메시지를 실시간으로 응대.
  - 사용자의 플랜, 크레딧, 임시 패스 발급 관리.
  - Gemini 호출 및 Firebase 사용량을 모니터링.
- **스튜디오 운영 책임자 (내부 팀)**
  - 플로우 전반 QA, 로그 분석, 문서 유지보수.

## 5. 핵심 사용자 시나리오
1. **이미지 생성 플로우**: 사용자가 프롬프트와 카메라/조명 옵션을 지정 → `/api/generate` 호출 → Gemini 결과가 Storage에 저장되고 Firestore 기록이 히스토리/워크스페이스에 즉시 반영 → 비교/레퍼런스 설정.
2. **Variations 배치**: 기준 이미지를 선택 후 카메라/조명/포즈/외부 프리셋을 조합 → 30개 이하 배치 요청 → 진행 상태 표시 → 성공 결과는 히스토리에 누적.
3. **Reference 관리**: 드래그 앤 드랍/업로드로 기준 이미지 슬롯 관리, 탭 간 `history-sync`, `reference-sync` 이벤트로 동기화.
4. **1:1 상담**: 사용자가 채팅을 시작하면 RTDB에 채널 생성 → 관리자 목록에 즉시 등장 → 양측 UI에서 메시지 실시간 갱신, 읽음 처리.
5. **운영자 콘솔**: Pending 플랜 요청 확인 → 승인/거절 → 크레딧 조정 또는 임시 패스 발급 → 관련 기록이 Firestore에 저장되고 사용자 UI에 반영.

## 6. 기능 요구사항
### 6.1 Studio (단일 생성)
- PromptPanel: 프롬프트/리파인드 프롬프트/네거티브/카메라/Aspect Ratio/조명/포즈/외부 프리셋 컨트롤 제공.
- WorkspacePanel: 기준/결과 Diff Slider, 성공 상태 알림, 프롬프트 상세(요약, 카메라 노트), 비교 모드.
- HistoryPanel: 최근/오래된 이미지, 즐겨찾기, 레퍼런스/다운로드/삭제, 드래그 앤 드랍 레퍼런스 지정, Reference Slots (최대 9개).
- GenerationCoordinator: `callGenerateApi` 래핑, 로컬/원격 히스토리 병합, 로딩 상태 전파.

### 6.2 Variations & Batch
- VariationsStudioShell: 카메라/조명/포즈/외부 프리셋 다중 선택 → VariationItem 리스트 → 진행률 관리 → 결과 히스토리에 저장.
- BatchStudioShell: 회전/시점(CHARACTER_VIEWS, TURNAROUND_VIEWS) 기반 다각도 생성, 생성 큐 관리, 자동 선택 로직 재사용.

### 6.3 Preset & Reference 관리
- `components/studio/external-preset-config.ts`: 91개 프리셋 그룹, 영문/국문 라벨, 주석(note) 옵션.
- Reference Slots: localStorage(REFERENCE_GALLERY_STORAGE_KEY)에 저장, 브로드캐스트 이벤트로 탭 동기화.
- Reference Sync: `broadcastReferenceUpdate`, override/derived 상태 구분.

### 6.4 이미지 생성 API (`/api/generate`)
- Bearer ID Token 인증 → `canGenerateAndConsume`로 플랜/쿼터 체크 → Gemini API 호출 (모델 폴백, 레퍼런스 이미지 인라인 지원).
- 성공 시 Storage 업로드(`users/{uid}/images/{imageId}.png`), 퍼블릭 URL 발급, Firestore 문서에 메타데이터 기록.
- 실패 시 이유를 반환하고 샘플 이미지 URL 제공.

### 6.5 채팅 (Realtime Database)
- `sendMessageRTDB`, `subscribeToMessagesRTDB`, `markChatAsReadRTDB`로 메시지 CRUD.
- ChatInterface/MessageBubble UI 재사용, 읽음 카운트, 자동 스크롤.
- Admin: `useAdminChatsRTDB`, `/app/admin/chat` 목록 & 상세, fallback 데이터 메시지.

### 6.6 운영자 콘솔 및 API
- `/api/admin/*`: 사용자 조회, 플랜 승인/변경, 크레딧 조정, Temp Pass 발급/회수, Storage 동기화.
- `components/admin/*`: PendingRequestsList, UserSearchSelect, ChatManagement UI.
- 사용자 메뉴(UserMenu): `/api/user/status` 폴링, 플랜 스위칭, 크레딧/패스/리셋 카운트다운.

### 6.7 계정 & 인증
- Firebase Auth (이메일/비밀번호, 익명 로그인 자동 부여), AuthProvider에서 `enableFirebaseEmulators` 지원.
- AuthGate: 로그인/회원가입 폼, 로그인 후 헤더(UserMenu + AccountMenu) 제공.

## 7. 비기능 요구사항
- **성능**: 주요 화면 FCP 2s 이내, 이미지 썸네일 지연 로딩, Variations 동시 호출 제한.
- **신뢰성**: Gemini 호출 실패 시 백오프 및 폴백 모델 사용, Firestore/Storage 오류 시 사용자 알림 및 재시도 버튼.
- **보안**: 서비스 계정 키 환경 변수 관리, 관리자 API 역할 검증, Storage 퍼블릭 URL 접근 제한(서명 URL 고려).
- **관측성**: Server Action/Route Handler 로그 표준화, admin 작업 감사 로그, Firebase Monitoring/Sentry 연동.
- **테스트**: Playwright 스모크(Studio, Variations, Chat, Admin), 훅 단위 테스트(Mock Firebase SDK) 우선순위.

## 8. 데이터 & 통합 포인트
| 시스템 | 용도 | 주요 경로 |
| --- | --- | --- |
| Firebase Auth | 사용자 인증, 관리자 권한 식별 | `AuthProvider`, `UserMenu`, API 토큰 검증 |
| Firestore | 이미지 메타데이터, 사용자 플랜/쿼터, 히스토리, 관리자 작업 기록 | `lib/firebase/firestore.ts`, `/api/admin/*`, `/api/generate` |
| Firebase Storage | 생성 이미지 파일 저장 | `lib/firebase/storage.ts`, `/api/generate` |
| Realtime Database | 채팅 메시지/채팅방, 읽음 카운트 | `lib/firebase/realtime-*`, `hooks/use-chat*` |
| Google Gemini | 이미지 생성 API | `/api/generate` (모델 폴백, 레퍼런스 포함) |

## 9. 범위 정의
- **포함**: Studio/Variations/Batch UI, Gemini 기반 이미지 생성, 히스토리/레퍼런스 관리, 채팅, 관리자 콘솔, 플랜/크레딧 정책, 문서화.
- **제외(향후)**: 결제 연동, 멀티 조직, 다국어 번역 자동화, 모바일 전용 앱, 고급 편집기, 모델 파인튜닝.

## 10. 릴리스 체크리스트
1. `.env.local` 구성(서비스 계정 JSON, Gemini 키, RTDB URL) 및 Vercel 환경 변수 적용.
2. Firebase 보안 규칙 검증(Firestore, Storage, RTDB) 및 관리자 Claim 설정.
3. Gemini API 한도 확인, 모델 사용권 계약 확인.
4. Playwright 스모크 & 수동 QA(Studio 기본 플로우, Variations, Chat, Admin 작업).
5. 모니터링/알림 설정(오류, quota, 채팅 지연).

## 11. 리스크 & 가정
- Gemini 정책 혹은 모델 변경으로 인한 품질 저하 → 폴백 모델/타 모델 옵션 확보 필요.
- Storage 퍼블릭 URL 정책 변경 → 서명 URL/Cloud CDN 고려.
- Firebase 정합성(오프라인, 부분 실패) → 병합 로직(mergeHistoryRecords) 유지, 주기적 백업.
- 관리자 권한이 고정 UID로 하드코딩되어 있음 → Custom Claims 기반 다중 관리자 확장을 추후 수행.

## 12. 문서 유지보수
- 기능 스펙 또는 KPI 변경 시 본 문서를 즉시 갱신하고 변경일과 책임자를 기록한다.
- PLAN.md, LLD.md와 함께 Pull Request 템플릿 체크리스트에 포함한다.

## 13. 변경 이력
- **2025-09-30**: 현재 구현 상태 반영, TypeScript 타입 안정성 개선 완료
- **2025-02-15**: Alpha 운영 안정화 단계 완료 확인, 관측성 및 테스트 요구사항 명시
- **2025-02-14**: PRD 초안 작성, 핵심 기능 범위 정의
