# 저수준 설계 문서 (LLD)

## 1. 시스템 개요
- **프론트엔드**: Next.js 14(App Router) + React 18 + TypeScript. 전역 Provider(`app/providers.tsx`)에서 React Query, Firebase Auth 컨텍스트, Sonner 토스트를 래핑.
- **백엔드(BaaS)**: Firebase Auth, Firestore, Realtime Database(RTDB), Storage, Firebase Admin SDK (Route Handler에서 사용).
- **AI 연동**: Google Gemini API, 기본 모델 `gemini-2.5-flash-image-preview`, 폴백 `gemini-2.0-flash-exp-image-generation`.
- **배포 가정**: Vercel. 환경 변수는 `.env.local`/Vercel 환경 변수로 관리.

```
┌───────────────┐    fetch (Bearer token)    ┌─────────────────────┐
│ Next.js (App) │ ─────────────────────────▶ │ /api/* Route Handler │
│  - Studio UI  │                            │  - Firebase Admin    │
│  - Chat UI    │ ◀─ realtime events ─────── │  - Gemini API        │
└───────────────┘          │                 └─────────────────────┘
            localStorage   │                                     ▲
            sync events    ▼                                     │
                         Firebase (Auth / Firestore / Storage / RTDB)
```

## 2. 주요 모듈 구조
### 2.1 앱 구조
```
app/
  layout.tsx           # HTML shell, Providers 주입
  providers.tsx        # React Query + AuthProvider + Sonner
  page.tsx             # / → /studio 리다이렉트
  studio/*             # Studio, Variations, Batch 페이지 (AuthGate 래핑)
  chat/page.tsx        # 사용자 1:1 상담 화면
  admin/*              # 관리자 콘솔 및 채팅 관리
  api/*                # Route Handlers (Gemini, Admin, User, Chat 등)
components/
  studio/*             # PromptPanel, Workspace, History, Presets, Shells
  chat/*               # 채팅 UI 공유 컴포넌트
  admin/*              # Admin 전용 UI
  providers/*          # AuthProvider, Suspense helpers
hooks/
  use-generate-image.ts      # React Query mutation wrapper
  use-generated-images.ts    # Firestore/Storage 자동 선택
  use-chat*.ts               # RTDB 구독/전송/관리자
  use-resizable.ts           # 패널 리사이즈 상태 관리
lib/
  firebase/*          # Client/Admin SDK 추상화, Firestore/Storage helpers
  env.ts              # 환경 변수 파서, shouldUseFirestore 플래그
  camera/aspect/...   # 도메인 로직 (카메라 프리셋, 비율)
  types.ts            # 공용 타입 정의
```

### 2.2 상태 관리
- 전역: React Query (쿼리 기본 옵션), Firebase Auth Context (AuthProvider) → `useAuth()`로 사용자/로딩/로그인/로그아웃 제공.
- 로컬: 각 Studio Shell 내부 `useState`, `useRef`, `useEffect`로 레퍼런스 이미지, 히스토리, Variations 큐 관리.
- 브라우저 저장소: localStorage(`LOCAL_STORAGE_KEY`, `REFERENCE_GALLERY_STORAGE_KEY`, `REFERENCE_SYNC_STORAGE_KEY`).
- 동기화: `components/studio/history-sync.ts`, `reference-sync.ts`가 CustomEvent로 탭 간 상태 브로드캐스트.

## 3. Studio 영역
### 3.1 StudioShell (`components/studio/studio-shell.tsx`)
- 좌측 PromptPanel, 중앙 WorkspacePanel, 우측 HistoryPanel을 조립.
- `useGenerationCoordinator`로 생성 요청 상태, 현재 선택된 이미지, 레퍼런스, 히스토리 병합 제어.
- 레퍼런스 이미지 상태를 override/derived로 구분해 Firestore 동기화 시 사용자 업로드 이미지를 덮어쓰지 않도록 함.
- 주요 흐름:
  1. PromptPanel에서 `onGenerate` → `callGenerateApi` 호출 → 성공 시 Firestore/Storage 기록.
  2. `useGeneratedImages` (Firestore 또는 Storage) + localStorage 레코드 → `mergeHistoryRecords`로 정렬/중복 제거.
  3. HistoryPanel 이벤트(선택/레퍼런스 지정/비교/삭제)를 통해 WorkspacePanel 상태를 업데이트.

### 3.2 PromptPanel
- 프롬프트 입력, 카메라 옵션(ToggleGroup), 조리개(Slider), Aspect Ratio, 네거티브, 조명/포즈/외부 프리셋.
- Lighting/Pose 선택 시 프롬프트 자동 갱신, 외부 프리셋 클릭 → `option.prompt`를 기본 입력에 세팅하고 refinedPrompt 초기화.
- GPT 리라이팅 토글(e.g. `useGpt`) 훅은 준비 상태 (실제 모델 연동은 확장 포인트).

### 3.3 WorkspacePanel
- 기준/결과 비교: DiffSlider(`components/studio/diff-slider.tsx`).
- `applyCacheBust`로 `_cb` 쿼리 파라미터 추가하여 Storage URL 캐시 무효화.
- PromptDetails 표시 (`promptDetails.summary`, `promptDetails.cameraNotes`), 성공 토스트.
- 비교 모드: `comparisonRecord` 존재 시 비교 카드 렌더링.

### 3.4 HistoryPanel
- 최근 3개/이후 목록, 즐겨찾기 뷰, 레퍼런스 슬롯(추가/삭제/업로드), 드래그 앤 드랍으로 레퍼런스 지정.
- `onReferenceSlotUpload`에서 `uploadUserImage` 호출하여 Storage 저장, 슬롯 로컬 상태 업데이트.
- 히스토리 레코드 클릭 시 `onSelect` → StudioShell에서 Workspace 선택 상태 갱신.

### 3.5 Variations & Batch Shells
- Variations: 카메라/조명/포즈/외부 프리셋 배열을 조합해 VariationItem 생성(최대 30개). 각 항목은 상태(`pending`/`generating`/`completed`/`error`)와 이미지 URL을 갖는다.
- BatchShell: CHARACTER_VIEWS, TURNAROUND_VIEWS 기반 회전/다각도 생성. 공통 `selectImageAuto` 흐름으로 Workspace 자동 업데이트.

## 4. 이미지 생성 파이프라인
### 4.1 클라이언트 (`hooks/use-generate-image.ts`)
- `callGenerateApi`는 Firebase ID Token을 헤더에 포함해 `/api/generate` POST 요청.
- 30초 타임아웃, 실패 시 에러 메시지 반환.
- React Query mutation으로 성공/실패 토스트 처리.

### 4.2 서버 (`app/api/generate/route.ts`)
1. Authorization 헤더 → Firebase Admin Auth 검증.
2. `canGenerateAndConsume`에서 Firestore 사용자 문서를 트랜잭션으로 읽어 남은 이미지 수 감소 또는 관리자/Temp Pass 처리.
3. Gemini API 호출: `callModel(modelId, payload, apiKey)` → 레퍼런스 이미지 inlineData, 폴백 모델 처리.
4. 성공 시 base64 → Buffer 변환 → Storage 업로드(`users/{uid}/images/{imageId}.png`) → `file.makePublic()` → 퍼블릭 URL 확보.
5. Firestore `users/{uid}/images/{imageId}` 문서에 메타데이터/타임스탬프 저장 (Timestamp).
6. 실패 시 사유와 샘플 이미지 URL 반환.

### 4.3 데이터 스키마 (Firestore)
```ts
// users/{uid}
{
  email: string,
  displayName: string,
  role: 'user' | 'admin',
  plan: { id: PlanId, activated: boolean, requestedId?: PlanId, requestedAt?: Timestamp },
  quota: { imagesRemaining: number, resetsAt: Timestamp },
  tempPass: { kind: string | null, expiresAt: Timestamp | null, issuedBy?: string | null },
  usage: { generatedImages: number, lastGeneratedAt: Timestamp | null },
  createdAt: Timestamp,
  updatedAt: Timestamp
}

// users/{uid}/images/{imageId}
{
  mode: GenerationMode,
  status: 'pending' | 'completed' | 'failed',
  promptMeta: {
    rawPrompt: string,
    refinedPrompt?: string,
    negativePrompt?: string,
    aspectRatio?: AspectRatioPreset,
    camera?: {...},
    lighting?: {...},
    pose?: {...},
    referenceGallery?: string[]
  },
  imageUrl: string,
  thumbnailUrl?: string,
  originalImageUrl?: string,
  diff?: { beforeUrl?: string, afterUrl?: string },
  metadata?: Record<string, unknown>,
  model: string,
  costCredits?: number,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdAtIso: string,
  updatedAtIso: string
}
```

### 4.4 Storage 경로
- `users/{uid}/images/{imageId}.png`
- 업로드 후 `uploadUserImage` 또는 Gemini API 결과 저장에서 공통 경로 사용.

## 5. 채팅 시스템 (RTDB)
### 5.1 데이터 구조
```
chats/{chatId}
  participants: { [uid]: displayName }
  unreadCount: { [uid]: number }
  lastMessage: string | null
  lastMessageAt: number | null
  createdAt: number
  updatedAt: number

messages/{chatId}/{messageUid}
  id: string
  chatId: string
  senderId: string
  senderName: string
  content: string
  timestamp: number (ms)
  readBy: { [uid]: number }
```
- `chatId`는 `generateChatId(userId) = "{userId}_{ADMIN_UID}"`.

### 5.2 클라이언트 흐름
- `useChat(chatId)` → `subscribeToMessagesRTDB`로 onValue 구독 → 상태 업데이트.
- `sendMessageRTDB` → `push(messagesRef)` → `update(chats/{chatId}.unreadCount)` (상대방 카운트 증가).
- `markChatAsReadRTDB` → `update(chats/{chatId}/unreadCount/{userId} = 0)`.
- Admin: `useAdminChatsRTDB` + `/app/admin/chat` 목록, `[chatId]/page.tsx` 상세 (realtimeDatabase().ref() 직접 호출).

### 5.3 관리자 API (`app/api/chat/send/route.ts`)
- 관리자 토큰 검증 후 메시지 삽입, 채팅방이 없으면 생성.
- `unreadCount`를 참여자별로 갱신, 관리자 발송 시 사용자 카운터 증가.

## 6. 운영자 기능
- `/app/admin/page.tsx`: 사용자 검색(UserSearchSelect), PendingRequestsList(플랜 신청), ChatManagement(상담 현황), 크레딧/플랜/패스 조정.
- `/api/admin/*`: Firestore 문서 업데이트(`getAdminDb()`), Storage 스캔(sync-storage), Temp Pass TTL 설정.
- UserMenu: `/api/user/bootstrap`, `/api/user/status`, `/api/user/switch-plan` 호출로 사용자 상태 유지.

## 7. Firebase & 환경 변수 관리
- `lib/env.ts`에서 client/server schema를 Zod로 정의, 빈 값은 기본값으로 채움.
- `shouldUseFirestore`는 `NEXT_PUBLIC_FIREBASE_USE_FIRESTORE`가 "false"가 아닌 경우 true.
- Admin SDK는 `getServiceAccountKey()`로 JSON 문자열을 파싱해 private key 개행 문자 복원.
- Emulator: `NEXT_PUBLIC_USE_FIREBASE_EMULATOR`가 true면 Auth/Firestore/Storage/RTDB 에뮬레이터 연결.

## 8. 에러 처리 & 로깅
- 클라이언트: `console.warn/error` + Sonner 토스트 (생성 실패, Storage 오류 등).
- 서버: Route Handler에서 try/catch → `NextResponse.json({ ok: false, reason: ... })` 반환.
- Gemini 오류 시 본문 파싱(`parseErrorBody`) → 메시지에 포함.
- TODO: 관측성을 위해 Sentry/Cloud Logging 연동 예정 (PLAN.md M5 참고).

## 9. 시퀀스 다이어그램
### 9.1 이미지 생성
```
User → PromptPanel:onGenerate → useGenerationCoordinator
  → callGenerateApi → /api/generate
    → getAdminAuth.verifyIdToken
    → canGenerateAndConsume (Firestore txn)
    → callModel (Gemini)
    → Storage.save(imageBuffer)
    → Firestore.set(imageDoc)
    → respond { ok, base64Image, id }
  ← WorkspacePanel/HistoryPanel update via useGeneratedImages & local merge
```

### 9.2 채팅 메시지 전송
```
User → useChat.sendMessage
  → sendMessageRTDB(chatId)
    → RTDB push(messages/{chatId})
    → RTDB update(chats/{chatId}.unreadCount)
  ← onValue(messages/{chatId}) → useChat → ChatInterface rerender
Admin ← subscribeToAdminChatRoomsRTDB(chats)
```

### 9.3 레퍼런스 동기화
```
HistoryPanel:onSetReference(record)
  → broadcastReferenceUpdate(record)
    → localStorage.setItem(REFERENCE_SYNC_STORAGE_KEY)
    → window.dispatchEvent(CustomEvent)
  → StudioShell listener → setReferenceImageOverride
```

## 10. 테스트 전략
- **유닛**: 카메라/포즈/라이팅 prompt 조합 함수, mergeHistoryRecords, Firebase helper 모듈(Mock SDK).
- **통합(E2E)**: Playwright 스모크 (생성 → 히스토리 → 레퍼런스, Variations 큐, 채팅 메시지 송수신, Admin 플랜 변경).
- **수동 QA**: Gemini API Key 유효성, Storage 공개 URL 접근, Temp Pass 만료, 다중 탭 히스토리 동기화.

## 11. 확장 포인트 & TODO
- 관리자 UID를 하드코딩 대신 Firebase Custom Claims 기반으로 확장.
- Storage 퍼블릭 URL 대신 서명 URL/Cloud CDN 캐시 제어 검토.
- Prompt 리라이팅(GPT) 자동화, 프롬프트 디버거 UI.
- Variations 진행률 실시간 업데이트(Progress bar) 및 취소 기능.
- Firestore/Storage 중복 데이터 동기화 검증 및 백필 스크립트.

## 12. 최근 해결된 이슈
- **TypeScript 타입 안정성** (2025-09-30): `GeneratedImageFirestorePayload.imageUrl`을 optional로 변경하여 빌드 에러 해결
- **환경 변수 설정** (2025-02-14): `.env.local` 기반 Firebase/Gemini API 키 관리 완료
- **채팅 시스템 안정화** (2025-02-14): Realtime Database 단일 백엔드로 통합, 메시지 누락 방지

## 13. 변경 이력
- **2025-09-30**: TypeScript 타입 안정성 개선, 문서 업데이트 (README/PLAN/PRD/LLD)
- **2025-02-15**: Alpha 운영 안정화 단계 완료, 관측성/테스트 전략 명시
- **2025-02-14**: 초기 LLD 작성, 주요 모듈 및 데이터 흐름 정의

---
> 본 문서는 코드 변경 시 유지되어야 하며, 주요 모듈/데이터 흐름이 수정되면 다이어그램과 설명을 업데이트합니다.
