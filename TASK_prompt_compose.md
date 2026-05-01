# 작업 지시서: 프롬프트 합성 일원화 (Prompt Composition Unification)

> 대상 AI 에이전트: 이 문서만 읽고도 cold start로 작업 가능합니다.
> 통합 검토자: Claude (별도 세션)

---

## 1. 환경 정보

| 항목 | 값 |
|------|------|
| worktree 경로 | `/Users/nohshinhee/Documents/2. coding/sionbanana/.claude/worktrees/gallant-robinson-873eaa` |
| 브랜치 | `claude/gallant-robinson-873eaa` |
| 기준 commit | 작업 시작 시점의 `HEAD` |
| dev server | `http://localhost:3000` (이미 떠있음 — 새로 띄우지 마세요) |
| node_modules | 설치 완료 (`npm install` 다시 X) |

---

## 2. 현재 문제

### 2.1 프롬프트 합성이 3곳에 분산

`studio-shell.tsx` 안에서 동일한 빌더 호출 + 합성 로직이 **3곳**에 중복:

| 경로 | 위치 (line) | 역할 |
|------|-------------|------|
| Single-generate | ~1096-1101 | 단건 생성 시 camera + lighting + pose guidance 합성 |
| Batch-generate | ~1776-1800 | 일괄 생성 시 동일 합성 |
| GPT refinement | ~2699-2710 | GPT 프롬프트 보정 시 동일 합성 |

각 경로가 독립적으로 `buildLightingInstruction`, `buildPoseInstruction`, `buildCameraAdjustmentInstruction`을 호출하고 `combinePromptWithGuidance`로 합친다. 로직이 동일하지만 복사-붙여넣기 수준으로 반복되어, 하나만 수정하면 나머지 2곳이 어긋나는 구조.

### 2.2 Pose가 single 선택으로 평탄화

`prompt-panel.tsx:452-455`:
```tsx
<ToggleGroup
  type="single"   // ← 문제: multi 필요
  value={selected[0] || "default"}
  onValueChange={value => handlePoseSelectionsChange(group.key, [value || "default"])}
```

- 데이터 타입 `PoseSelections = Record<PosePresetCategory, string[]>`은 배열을 지원
- `buildPoseInstruction`도 배열을 순회하며 합성
- **그런데 UI가 `type="single"`이라 한 번에 하나만 선택 가능**
- posture 카테고리에서 "앉기 + 팔짱" 같은 복합 포즈를 표현할 수 없음

### 2.3 Style 프리셋이 카테고리 시스템을 우회

`prompt-panel.tsx:262-274` — `handleStylePresetApply`:
```tsx
appendPromptText(promptText);   // onPromptChange로 base prompt에 직접 텍스트 추가
```

- 스타일 프리셋이 조명/포즈 관련 문구를 포함할 수 있음
- 이때 카테고리 빌더(`buildLightingInstruction`)가 별도로 같은 조명 문구를 다시 붙임
- 결과: 프롬프트에 조명 지시가 **이중으로** 들어갈 수 있음

### 2.4 카메라 카테고리도 동일 패턴

카메라 설정(angle, direction, zoom)은 개별 `string` state → `buildCameraAdjustmentInstruction`으로 합성. 이 흐름 자체는 정상이지만, 위의 3곳 분산 문제와 동일하게 각 generate 경로에서 독립적으로 재합성.

---

## 3. 목표

### 3.1 핵심: 합성 로직 일원화

**studio-shell.tsx에 하나의 `useMemo` 또는 derived state**로 "composed guidance" 를 계산하고, 3개 generate 경로 모두 이 값을 참조.

```tsx
// 예시 구조
const composedGuidance = useMemo(() => {
  const camera = buildCameraAdjustmentInstruction(normalizedCameraSettings);
  const lighting = buildLightingInstruction(lightingSelections);
  const pose = buildPoseInstruction(poseSelections);
  return { camera, lighting, pose };
}, [normalizedCameraSettings, lightingSelections, poseSelections, ...deps]);

// 각 generate 경로에서:
function applyAllGuidance(basePrompt: string): string {
  let result = applyCameraPromptDirectives(basePrompt, composedGuidance.camera);
  result = combinePromptWithGuidance(result, composedGuidance.lighting);
  result = combinePromptWithGuidance(result, composedGuidance.pose);
  return result;
}
```

### 3.2 Pose 멀티 선택 지원

`prompt-panel.tsx`의 pose ToggleGroup을 `type="multiple"`로 변경:

```tsx
// 변경 전
<ToggleGroup type="single" value={selected[0] || "default"} ...>

// 변경 후
<ToggleGroup type="multiple" value={selected} ...>
```

- `onValueChange` 핸들러: `values => handlePoseSelectionsChange(group.key, values.length ? values : ["default"])`
- 빈 선택 시 `["default"]` fallback 유지
- `buildPoseInstruction`은 이미 배열을 순회하므로 변경 불필요

### 3.3 Style 프리셋 충돌 방지

스타일 프리셋 적용 시 기존 카테고리 선택을 리셋하거나, 사용자에게 충돌을 알리는 UX 추가:

**Option A (권장)**: 스타일 적용 시 lighting/pose 선택 초기화
```tsx
const handleStylePresetApply = useCallback((style: StoryboardStyle) => {
  appendPromptText(style.prompt);
  // 카테고리 충돌 방지: 기존 조명/포즈 선택 초기화
  onResetLightingSelections?.();
  onResetPoseSelections?.();
}, [...]);
```

**Option B**: 카테고리 빌더가 base prompt 내 중복을 감지하여 skip (이미 `combinePromptWithGuidance`의 `.includes()` 로직이 부분적으로 처리하지만, phrase 단위 중복은 못 잡음)

→ Option A가 단순하고 확실.

---

## 4. 수정 대상 파일

| 파일 | 변경 내용 |
|------|-----------|
| `components/studio/studio-shell.tsx` | (1) `composedGuidance` useMemo 추가, (2) `applyAllGuidance` 헬퍼 추출, (3) 3곳의 인라인 합성을 헬퍼 호출로 교체 |
| `components/studio/prompt-panel.tsx` | (1) Pose ToggleGroup `type="single"` → `type="multiple"`, (2) 스타일 프리셋 적용 시 카테고리 리셋 콜백 추가 |
| `components/studio/types.ts` | 변경 없음 (이미 배열 타입) — 확인만 |
| `components/studio/preset-library-context.tsx` | 변경 없음 — 빌더가 이미 배열 순회 확인만 |

---

## 5. 상세 명세

### 5.1 composedGuidance (studio-shell.tsx)

```tsx
const normalizedCameraSettings = useMemo(
  () => normalizeCameraSettings(cameraAngle, subjectDirection, cameraDirection, zoomLevel),
  [cameraAngle, subjectDirection, cameraDirection, zoomLevel]
);

const composedGuidance = useMemo(() => ({
  camera: buildCameraAdjustmentInstruction(normalizedCameraSettings),
  lighting: buildLightingInstruction(lightingSelections),
  pose: buildPoseInstruction(poseSelections),
}), [normalizedCameraSettings, lightingSelections, poseSelections, buildLightingInstruction, buildPoseInstruction]);
```

**주의**: `normalizedCameraSettings`는 현재 inline으로 각 경로에서 계산됨. 이것도 useMemo로 올려야 함.

### 5.2 applyAllGuidance 헬퍼

```tsx
function applyAllGuidance(
  basePrompt: string,
  guidance: typeof composedGuidance,
  isCameraMode: boolean
): string {
  const effectiveCamera = isCameraMode
    ? guidance.camera ?? CAMERA_MODE_DEFAULT_DIRECTIVE
    : guidance.camera;
  let result = applyCameraPromptDirectives(basePrompt, effectiveCamera);
  result = combinePromptWithGuidance(result, guidance.lighting);
  result = combinePromptWithGuidance(result, guidance.pose);
  return result;
}
```

### 5.3 교체 대상 (3곳)

#### 경로 1: Single-generate (~1096-1101)
```tsx
// 변경 전
const lightingGuidance = buildLightingInstruction(lightingSelections);
const poseGuidance = buildPoseInstruction(poseSelections);
const applyLightingGuidanceTo = ...
const applyPoseGuidanceTo = ...

// 변경 후 — composedGuidance 직접 사용
// applyLightingGuidanceTo / applyPoseGuidanceTo 인라인 헬퍼 제거
// 최종 프롬프트 빌드 시 applyAllGuidance(promptToSend, composedGuidance, isCameraMode) 호출
```

#### 경로 2: Batch-generate (~1776-1800)
```tsx
// 변경 전
const batchLightingGuidance = buildLightingInstruction(lightingSelections);
const batchPoseGuidance = buildPoseInstruction(poseSelections);
...

// 변경 후 — composedGuidance 재사용
```

#### 경로 3: GPT refinement (~2699-2710)
```tsx
// 변경 전
const lightingGuidanceForPrompt = buildLightingInstruction(lightingSelections);
const poseGuidanceForPrompt = buildPoseInstruction(poseSelections);
...

// 변경 후 — composedGuidance 재사용
```

### 5.4 Pose ToggleGroup 변경 (prompt-panel.tsx)

```tsx
// ~line 452
<ToggleGroup
  type="multiple"
  value={selected.filter(v => v !== "default")}
  onValueChange={values =>
    handlePoseSelectionsChange(group.key, values.length ? values : ["default"])
  }
  className="flex flex-wrap gap-2"
  disabled={generating}
>
```

- `selected.filter(v => v !== "default")`: "default" 값이 선택 표시되지 않도록
- 아무것도 선택하지 않으면 `["default"]` 복원

### 5.5 Style 프리셋 충돌 방지 (prompt-panel.tsx)

PromptPanelProps에 콜백 추가:
```tsx
onResetLightingSelections?: () => void;
onResetPoseSelections?: () => void;
```

`handleStylePresetApply`에서 호출:
```tsx
const handleStylePresetApply = useCallback((style: StoryboardStyle) => {
  const promptText = style.prompt?.trim();
  if (!promptText) { toast.error(...); return; }
  appendPromptText(promptText);
  onRefinedPromptChange("");
  onResetLightingSelections?.();
  onResetPoseSelections?.();
  toast.success(`${style.label} 스타일 프리셋을 적용했습니다.`);
}, [appendPromptText, onRefinedPromptChange, onResetLightingSelections, onResetPoseSelections]);
```

studio-shell.tsx에서 리셋 핸들러 전달:
```tsx
const handleResetLightingSelections = useCallback(() => {
  setLightingSelections({
    illumination: [], atmosphere: [], time: [],
    cinematic: [], artistic: [], harmony: [], mood: []
  });
}, []);

const handleResetPoseSelections = useCallback(() => {
  setPoseSelections({ expression: ["default"], posture: ["default"] });
}, []);
```

---

## 6. 검증 절차

### 6.1 Typecheck

```bash
npx tsc --noEmit
# 통과 확인
```

### 6.2 조명 멀티 선택 (기존 동작 유지 확인)

1. Studio → 조명 모드 진입
2. illumination에서 2개 이상 선택
3. 이미지 생성 → 프롬프트에 선택한 조명 문구 모두 포함 확인
4. GPT 보정 ON 상태에서도 동일

### 6.3 포즈 멀티 선택 (신규)

1. Studio → 포즈 모드 진입
2. posture에서 2개 선택 (예: "앉기" + "팔짱")
3. 이미지 생성 → 프롬프트에 두 포즈 문구 모두 포함 확인
4. 모두 해제 → "default"로 복귀 확인

### 6.4 스타일 프리셋 충돌 방지

1. 조명 모드에서 illumination 2개 선택
2. 스타일 모드 전환 → 스타일 프리셋 적용
3. 조명 모드로 복귀 → 조명 선택이 초기화되었는지 확인
4. 이미지 생성 → 스타일 프롬프트만 포함, 조명 문구 이중 없음

### 6.5 일괄 생성 경로 확인

1. Batch 모드 진입
2. 조명 + 포즈 선택 후 일괄 생성
3. 생성된 각 이미지의 metadata에 lighting/pose 선택이 기록되었는지 확인

### 6.6 회귀 방지

- 카메라 모드: 기존 단일 선택 동작 그대로
- 외부 프리셋 모드: 영향 없음 확인
- 프리셋 리셋 버튼: 모든 카테고리 초기화 확인

---

## 7. 빌더 함수 검증 결과 (사전 확인 완료)

| 함수 | 위치 | 멀티 값 지원 |
|------|------|-------------|
| `buildLightingInstruction` | `preset-library-context.tsx:600-619` | ✓ `values.forEach` 순회 + `lines.push` |
| `buildPoseInstruction` | `preset-library-context.tsx:621-640` | ✓ 동일 구조 |
| `buildCameraAdjustmentInstruction` | `studio-shell.tsx:239-261` | N/A (카메라는 단일 값, 배열 아님) |
| `combinePromptWithGuidance` | `studio-shell.tsx:263-281` | N/A (string 합성, `.includes()` 중복 방지) |

---

## 8. 비-범위 (out of scope)

- 카메라 설정을 멀티 선택으로 변경 X (카메라는 물리적으로 하나의 앵글/줌만 가능)
- `combinePromptWithGuidance`의 phrase-level 중복 감지 고도화 X (§3.3 Option A로 충분)
- 프리셋 라이브러리 JSON 구조 변경 X
- GPT 프롬프트 보정 API (`/api/prompt`) 변경 X
- batch-studio-shell.tsx, variations-studio-shell.tsx 별도 확인 필요 시 범위 추가

---

## 9. 결과 보고 양식

```
## 변경 파일
- components/studio/studio-shell.tsx (+N -M)
- components/studio/prompt-panel.tsx (+N -M)
- (그 외)

## 핵심 결정
- composedGuidance 계산: useMemo / derived state
- applyAllGuidance 위치: studio-shell.tsx 모듈 레벨 함수
- pose multi-select: ToggleGroup type="multiple"
- style 충돌 방지: Option A (카테고리 리셋)

## 검증 결과
- 6.1 typecheck: 통과
- 6.2 조명 멀티 선택: 통과
- 6.3 포즈 멀티 선택: 통과
- 6.4 스타일 충돌 방지: 통과
- 6.5 일괄 생성: 통과
- 6.6 회귀: 통과

## 알려진 한계
- (있으면)
```

commit하지 말고 working tree에 두세요. 메인 Claude가 typecheck + 통합 검토 후 commit합니다.
