# 시온 바나나 (Sion Banana)

시온 바나나는 웹 기반 AI 이미지 생성 스튜디오입니다. 프롬프트 작성, 카메라/조명 옵션, 결과 비교, 기록 관리, 실시간 1:1 상담 등 완전한 UI 워크플로우를 Next.js + Firebase + TailwindCSS 기반으로 구현했습니다.

## 주요 기술 스택

- Next.js 14 (App Router, Server Actions)
- React 18 + TypeScript
- TailwindCSS + shadcn/ui 스타일 시스템
- Firebase (Authentication, Firestore, Realtime Database, Storage)
- React Query (서버 상태 관리), Zustand (클라이언트 상태 관리)
- Google Gemini 2.0 Flash API (이미지 생성)

## 시작하기

> **사전 준비**
> - Node.js 18 이상, npm 또는 pnpm 설치
> - Firebase 프로젝트 (Authentication + Firestore + Storage 활성화)
> - Google Gemini API 키 (이미지 생성 권한)

```bash
npm install
npm run dev
```

개발 서버는 `http://localhost:3000` 에서 확인할 수 있습니다.

## 환경 변수

루트에 `.env.local` 파일을 생성하고 아래 값을 채워주세요. (예시는 `.env.example` 참고)

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
FIREBASE_SERVICE_ACCOUNT_KEY={"project_id":"","client_email":"","private_key":""}
GEMINI_API_KEY=
```

- `FIREBASE_SERVICE_ACCOUNT_KEY` 는 서버 액션/Route Handler 에서 관리자 권한이 필요할 때 사용합니다. JSON 전체를 문자열로 넣고 `\n` 을 실제 줄바꿈으로 자동 변환합니다.
- `GEMINI_API_KEY` 가 비어 있으면 `/api/generate` 가 샘플 이미지를 반환합니다.

## 현재 구현 된 기능

- [x] Firebase Auth 기반 로그인/회원가입 UI (이메일/비밀번호)
- [x] Tailwind + shadcn 스타일 시스템과 UI 컴포넌트 구축
- [x] 프롬프트 입력, 카메라/조명/포즈/스케치 등 기능 패널 레이아웃
- [x] 중앙 작업 공간: 전후 비교 슬라이더, 프롬프트/메타 정보 카드
- [x] 우측 패널: 기준 이미지 및 생성 히스토리 목록
- [x] **Gemini 2.0 Flash 이미지 생성**: Firebase Storage 자동 업로드 및 Firestore 메타데이터 동기화
- [x] **외부 프리셋 모드**: 91종의 사례 기반 프리셋을 버튼으로 제공하고, 영문/국문 레이블과 함께 프롬프트를 즉시 입력에 반영
- [x] **실시간 1:1 상담**: Firebase Realtime Database 기반 실시간 채팅 시스템으로 사용자-관리자 간 소통
- [x] **통합 UI 시스템**: 1개생성, 다수생성, 변형생성, 프리셋 페이지 간 일관된 상단 네비게이션과 하단 탭
- [x] **반응형 디자인**: 모바일과 데스크톱 환경에서 모두 최적화된 UI/UX
- [x] **사용자 플랜/크레딧 시스템**: Guest/Basic/Pro 플랜별 월간 이미지 생성 할당량 관리
- [x] **관리자 대시보드**: 사용자 검색, 플랜 변경, 임시 패스 발급, 채팅 관리

## 외부 프리셋 컬렉션

### 사용 방법

1. 스튜디오 상단 탭에서 `외부 프리셋` 모드를 선택합니다.
2. 좌측 패널에 영어 제목과 국문 번역이 함께 표시된 버튼 목록이 나타납니다. (분야별로 스크롤 가능한 그룹 구성)
3. 버튼을 클릭하면 해당 프리셋의 영문 프롬프트가 기본 입력창에 추가되고, 기존 `refinedPrompt` 는 초기화됩니다. 필요한 값만 대괄호 내에서 수정한 뒤 즉시 생성 요청을 보낼 수 있습니다.

### 구성 파일

- 프리셋 정의: `components/studio/external-preset-config.ts`
  - `label`: 버튼에 노출되는 영어 제목
  - `labelKo`: 동일 버튼 바로 밑에 표시되는 한국어 번역
  - `prompt`: 입력창에 삽입되는 영문 프롬프트 전문
  - `note`: (선택) 보조 설명이 있을 때 버튼 하단에 작은 텍스트로 표기
- UI 렌더링 및 적용 로직: `components/studio/prompt-panel.tsx`
  - 그룹별 스크롤 영역과 버튼 스타일 정의
  - `handleExternalPresetApply` 함수에서 프롬프트를 입력창에 반영하고 `refinedPrompt` 를 비웁니다.

### API 연동 변경 사항

- `/api/generate` 의 모드 검증에 `external` 값을 추가했습니다. (`app/api/generate/route.ts`)
- 외부 프리셋에서 선택된 모드는 기존과 동일하게 요청 페이로드의 `mode` 필드로 전달되므로, 백엔드에서 모드별 제어를 추가할 때 그대로 활용할 수 있습니다.

### 확장 팁

- 프리셋을 추가/수정할 때는 `EXTERNAL_PRESET_GROUPS` 내부 구조를 유지하며, 필요 시 새로운 그룹을 생성해 분류할 수 있습니다.
- 동일한 프롬프트를 변형해서 사용하고 싶다면 `note` 필드를 활용해 운영 가이드를 남길 수 있습니다.
- 버튼 스타일은 Tailwind 유틸리티 클래스로 구성되어 있으므로, 디자인이 달라지면 shadcn 컴포넌트로 래핑하거나 테마 토큰을 활용해 쉽게 커스터마이징할 수 있습니다.

## 구현 예정 / 다음 단계 제안

1. **프롬프트 리라이팅 고도화**: OpenAI GPT 모델을 호출하여 `refinedPrompt` 를 자동 생성하는 기능 강화
2. **이미지 후처리 파이프라인**: Cloud Functions 기반 썸네일 생성, 워터마크 제거, 메타데이터 추출 자동화
3. **배치 생성 최적화**: 다수 생성 시 병렬 처리 및 진행률 표시 개선
4. **히스토리 검색/필터**: 생성 모드, 날짜, 프롬프트 키워드 기반 필터링 및 페이지네이션
5. **결제 시스템 통합**: Stripe/Toss Payments 연동하여 플랜 업그레이드 자동화
6. **통합 테스트 & CI/CD**: Playwright E2E 테스트 도입 및 GitHub Actions 배포 자동화
7. **성능 모니터링**: Firebase Performance Monitoring, Sentry 에러 추적 연동

## 폴더 구조 (요약)

```
sion-banana/
  app/
    api/
      generate/route.ts     # Gemini 이미지 생성 API + Storage 업로드
      chat/send/route.ts    # 관리자 채팅 전송 API
      admin/                # 관리자 전용 API (플랜 변경, 사용자 조회 등)
      user/                 # 사용자 API (상태 조회, 플랜 전환 등)
    studio/                 # 스튜디오 페이지 (단일/다수/변형/프리셋)
    chat/                   # 사용자 채팅 페이지
    admin/                  # 관리자 대시보드
    billing/                # 플랜 요청 페이지
    account/                # 계정 정보 페이지
  components/
    auth/                   # 로그인/회원가입 폼 & 게이트
    chat/                   # 채팅 UI 컴포넌트
    studio/                 # 프롬프트/워크스페이스/히스토리 UI
    presets/                # 프리셋 전용 UI
    admin/                  # 관리자 전용 UI
    ui/                     # shadcn 스타일 UI 컴포넌트
  hooks/
    use-generate-image.ts   # 이미지 생성 뮤테이션
    use-generated-images.ts # Firestore/Storage 이미지 로딩
    use-chat.ts             # 채팅 실시간 구독 (RTDB)
  lib/
    env.ts                  # 환경 변수 파싱
    firebase/
      client.ts             # Firebase 클라이언트 초기화
      admin.ts              # Firebase Admin SDK
      realtime-messages.ts  # RTDB 메시지 로직
      firestore.ts          # Firestore 헬퍼 함수
    types.ts                # TypeScript 타입 정의
    constants.ts            # 플랜, 관리자 UID 등 상수
  public/samples/           # UI용 샘플 이미지
```

## Firebase Storage CORS 설정

⚠️ **중요: CORS 에러가 발생하면 아래 절차를 따라주세요**

### 방법 1: Firebase Console (권장)
1. [Firebase Console](https://console.firebase.google.com/) → 프로젝트 선택
2. Storage → Rules 탭에서 CORS 설정 확인
3. Storage → Files 탭에서 버킷 이름 확인 (`sionbanana.firebasestorage.app`)

### 방법 2: Google Cloud Console
1. [Google Cloud Console](https://console.cloud.google.com/) → Storage → Browser
2. 버킷 선택 (`sionbanana.firebasestorage.app`) → Configuration → CORS
3. **Edit CORS** 버튼 클릭하여 아래 JSON 추가:

```json
[
  {
    "origin": ["https://sionbanana.vercel.app", "http://localhost:3000"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization", "Content-Length", "X-Requested-With"]
  }
]
```

### 방법 3: gsutil CLI (로컬에서)
```bash
# Google Cloud SDK 설치 필요
gsutil cors set cors.json gs://sionbanana.firebasestorage.app
```

### Storage 버킷 URL
- **실제 버킷**: `sionbanana.firebasestorage.app`
- **Admin SDK & Client SDK**: 동일한 버킷 사용
- 환경변수: `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=sionbanana.firebasestorage.app`

---

## 안전한 API 키 관리

⚠️ **보안 중요 사항**

1. **절대 소스코드에 API 키를 하드코딩하지 마세요**
   - 이전에 하드코딩된 키가 Git 히스토리에 남아있을 수 있습니다
   - Firebase 콘솔에서 기존 키를 즉시 삭제하고 새 키를 발급받으세요
   - Google AI Studio에서 Gemini API 키도 재발급하세요

2. **환경 변수 관리**
   - `.env.local` 파일은 절대 Git에 커밋하지 마세요 (`.gitignore`에 이미 포함됨)
   - `.env.example`을 복사하여 `.env.local`을 생성하고 실제 값을 입력하세요
   - Production 환경에서는 Vercel 환경 변수 또는 Firebase Functions Config로 관리하세요

3. **Git 히스토리 정리 (권장)**
   ```bash
   # 이전에 커밋된 민감정보를 Git 히스토리에서 제거
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch lib/env.ts" \
     --prune-empty --tag-name-filter cat -- --all

   # 또는 BFG Repo-Cleaner 사용 (더 빠름)
   # https://rtyley.github.io/bfg-repo-cleaner/
   ```

## 라이선스

프로젝트 리포에 명시된 라이선스가 없다면, 배포 전 라이선스 정책을 결정해 주세요.

## 아키텍처 개요

- **StudioShell (`components/studio/studio-shell.tsx`)**: 프롬프트 패널, WorkspacePanel, HistoryPanel 세 영역을 조립하고 Firebase/로컬 상태를 통합 관리합니다. 기준 이미지 상태(`ReferenceImageState`), 선택 흐름(`selectImage`/`selectImageAuto`), 히스토리 동기화가 모두 여기서 orchestrate 됩니다.
- **WorkspacePanel (`components/studio/workspace-panel.tsx`)**: 중앙 작업 영역입니다. `DiffSlider`를 통해 기준 이미지(왼쪽)와 생성 이미지(오른쪽)를 비교합니다. 캐시 무효화를 위한 `referenceImageKey`를 props로 받아 `_cb` 쿼리를 붙입니다.
- **HistoryPanel (`components/studio/history-panel.tsx`)**: 기준 이미지 카드, 참조 슬롯, 생성 기록 목록을 렌더링합니다. 카드 클릭 시 `onSelect` → `selectImage`가 호출되어 WorkspacePanel이 즉시 갱신됩니다.
- **ReferenceImageState**: `{ url, signature, source }` 구조의 상태로, 업로드/선택 시 override를 즉시 반영하고 Firestore에서 파생된 값과 병합합니다. signature는 이미지를 다시 요청하도록 만드는 캐시 무효화 키로 쓰입니다.
- **History Sync (`components/studio/history-sync.ts`)**: 여러 탭 간 히스토리를 브로드캐스트하고 병합합니다.
- **PresetsShell (`components/presets/presets-shell.tsx`)**: Studio와 같은 패턴으로 기준 이미지/히스토리를 관리하면서 프리셋 전용 UI를 제공합니다.

### 상태/데이터 흐름 요약

1. **기준 이미지 업로드**
   - 업로드 즉시 `setReferenceImageOverride(url)` → ReferenceImageState 변경 → Workspace/History가 즉시 새로운 기준 이미지를 사용합니다.
   - Firestore 동기화가 완료되면 동일 URL이 derived로 들어와도 override를 덮지 않습니다.
2. **새 이미지 생성/리믹스**
   - `selectImageAuto(id, record)`로 자동 선택 상태를 기록합니다. 히스토리 목록에 해당 레코드가 나타나면 즉시 정식 선택으로 전환되어 WorkspacePanel이 새 이미지를 표시합니다.
   - `referenceImageForRequest`는 override URL을 우선 사용해 리믹스 시 “기준 이미지를 업로드하세요” 경고가 발생하지 않습니다.
3. **배치 생성(캐릭터셋·360°)**
   - 각 생성 결과마다 `selectImageAuto`를 호출하여 WorkspacePanel이 진행 상황을 바로 보여 줍니다.

## 수정 시 주의사항

1. **기준 이미지 상태 유지**: `ReferenceImageState`(override/derived) 흐름을 깨뜨리지 마세요. override를 덮기 전에 Firestore에서 내려온 값인지, 사용자가 방금 올린 값인지 구분해야 합니다.
2. **선택 로직 재사용**: 새 이미지/배치 결과는 반드시 `selectImageAuto`로 선택하세요. 사용자 조작에는 `selectImage`를 사용합니다.
3. **캐시 무효화**: `_cb` 쿼리를 붙여 이미지 캐시를 무효화하되 data URI는 그대로 사용합니다.
4. **Firestore 병합**: `mergeHistoryRecords`로 정렬과 중복 제거를 수행하고, 기준 문서(`REFERENCE_IMAGE_DOC_ID`)는 히스토리 목록에서 제외한다는 점을 기억하세요.
5. **리믹스/배치 기준 판단**: `referenceImageForRequest` 계산에 override URL이 포함돼야 합니다.

## 변경 이력 (스냅샷)

- **2025-01-XX**: 기준 이미지 override/derived 통합, WorkspacePanel 자동 선택 로직 도입 (생성 직후 바로 표시)
- **2025-01-XX**: History/Workspace 캐시 무효화 및 즐겨찾기/삭제 시 선택 유지 로직 정리
- **2025-01-XX**: 리믹스/배치 기준 이미지 누락 경고 수정 (`referenceImageState.url` 우선 사용)
- **2025-02-14**: Realtime Database 기반 채팅 시스템 전환 완료
- **2025-02-14**: Firestore 이미지 메타데이터 저장 및 `useGeneratedImages` 훅 통합
- **2025-02-14**: 사용자 플랜/크레딧 시스템 및 관리자 대시보드 구현
- **2025-09-30**: TypeScript 타입 안정성 개선 (`GeneratedImageFirestorePayload.imageUrl` optional)

필요 시 자세한 흐름은 `components/studio/studio-shell.tsx` 주석과 이 README를 함께 참고하고, 반복되는 버그가 발견되면 이 섹션을 업데이트해 주세요.
