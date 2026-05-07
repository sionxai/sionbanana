# 작업 지시서: 워크스페이스 비교 패널의 Zoom UX 개선

> 대상 AI 에이전트: 이 문서만 읽고도 cold start로 작업 가능합니다.
> 작업자: 시온 (사용자) / 통합 검토자: Claude (별도 세션)

---

## 1. 환경 정보

| 항목 | 값 |
|------|------|
| worktree 경로 | `/Users/nohshinhee/Documents/2. coding/sionbanana/.claude/worktrees/gallant-robinson-873eaa` |
| 브랜치 | `claude/gallant-robinson-873eaa` |
| 기준 commit | `94fbd4b8` (이 commit 이후의 변경만 만들어주세요) |
| dev server | `http://localhost:3000` (이미 떠있음 — 새로 띄우지 마세요) |
| node_modules | 설치 완료 (`npm install` 다시 X) |
| Codex 인증 | `~/.codex/auth.json`에서 자동 로드 (수정 불필요) |

검증 페이지: <http://localhost:3000/studio> 열고 워크스페이스 가운데 패널을 사용.

---

## 2. 목표

`/studio` 페이지 가운데의 **비교(diff) 패널**(기준이미지 ↔ 생성결과 비교 창)에서:

- 사용자가 **이미지만** 확대/축소/이동할 수 있어야 함
- 패널의 **프레임(컨테이너) 크기는 변하지 않음** — 주변 UI(상단 헤더, 하단 컨트롤, 좌우 패널)가 절대 깨지지 않아야 함
- 다음 인터랙션을 지원:
  - **Ctrl/Cmd + 휠** → 줌 in/out (커서 위치를 anchor로)
  - **드래그(클릭+이동)** → pan(이동)
  - **더블클릭** → 리셋 (scale=1, panX=0, panY=0)
  - 보조: 휠만 단독으로 돌릴 때는 페이지 스크롤 (preventDefault X)
- 기존의 "축소 / 100% (원래대로) / 확대" 버튼은 **유지하되 동작을 새 zoom state와 동기화** (UI에서 보조용으로 남김)

---

## 3. 현재 문제 (변경 전 동작)

`components/studio/workspace-panel.tsx`의 zoom UI는 컨테이너 자체에 `transform: scale(...)` 또는 `width/height`를 적용해, 확대 시 패널 전체가 부풀어 좌우 패널을 밀거나 하단 컨트롤을 가립니다.

특히 `DiffSlider`(`components/studio/diff-slider.tsx`)와 함께 동작할 때:
- 슬라이더 핸들의 위치가 zoom 좌표와 어긋남
- 100% 초과 zoom 시 비교 라벨이 화면 밖으로 빠짐

---

## 4. 변경 대상 파일

| 파일 | 변경 종류 |
|------|------|
| `components/studio/diff-slider.tsx` | 🔧 핵심 변경 — 새 zoom/pan state + transform 분리 |
| `components/studio/workspace-panel.tsx` | 🔧 zoom 버튼 핸들러를 새 state와 연결 (또는 DiffSlider에 prop으로 위임) |
| (선택) `components/studio/use-image-pan-zoom.ts` | 🆕 zoom/pan 로직 분리용 custom hook (재사용성을 위해 권장) |

위 외 파일은 건드리지 마세요. 특히:
- API 라우트, codex-fetch, codex-oauth, 인증 관련 파일 X
- studio-shell.tsx의 다른 영역 X
- 다른 페이지 (`/studio/batch`, `/studio/variations`, `/studio/presets`, `/studio/history`) X

---

## 5. 변경 후 기대 동작 (인터랙션 명세)

### 5.1 컨테이너 구조

```jsx
// 외부 (프레임): overflow:hidden, 사이즈 고정
<div className="relative aspect-... overflow-hidden">
  {/* zoom/pan 적용되는 inner wrapper */}
  <div
    onWheel={...}
    onPointerDown={...} onPointerMove={...} onPointerUp={...}
    onDoubleClick={...}
    style={{ transform: `translate(${panX}px, ${panY}px) scale(${scale})`, transformOrigin: '0 0' }}
  >
    {/* before(reference) 이미지 + after 이미지 + diff 핸들 */}
  </div>
  {/* 컨트롤(축소/100%/확대 버튼)은 inner wrapper 밖에 둬서 zoom 영향 X */}
</div>
```

### 5.2 상태

```ts
type Transform = { scale: number; panX: number; panY: number };
const [transform, setTransform] = useState<Transform>({ scale: 1, panX: 0, panY: 0 });
```

- `scale`: 0.25 ~ 8 (clamp)
- `panX, panY`: px 단위. 단위는 inner wrapper의 transform 기준

### 5.3 휠 줌 (cursor anchor)

```ts
function handleWheel(e: React.WheelEvent) {
  if (!(e.ctrlKey || e.metaKey)) return;        // 일반 휠은 페이지 스크롤 유지
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0015);  // 부드러운 지수 줌
  const nextScale = clamp(transform.scale * factor, 0.25, 8);

  // 커서가 가리키는 콘텐츠 좌표를 그대로 유지하도록 panX/panY 보정
  const rect = containerRef.current!.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const k = nextScale / transform.scale;
  const nextPanX = cx - k * (cx - transform.panX);
  const nextPanY = cy - k * (cy - transform.panY);

  setTransform({ scale: nextScale, panX: nextPanX, panY: nextPanY });
}
```

### 5.4 드래그 pan

- `onPointerDown` → `setCapture`, drag 시작 좌표/현재 panX,panY 기록
- `onPointerMove` → `panX = startPanX + (e.clientX - startX)`, `panY = startPanY + (e.clientY - startY)`
- `onPointerUp` / `onPointerCancel` → release
- pan 중에는 cursor를 `grabbing` 으로

### 5.5 더블클릭 리셋

```ts
function handleDoubleClick() {
  setTransform({ scale: 1, panX: 0, panY: 0 });
}
```

### 5.6 버튼 동기화

`workspace-panel.tsx`의 축소/100%/확대 버튼은:
- 축소: `scale = max(0.25, scale / 1.25)`
- 100%: `setTransform({ scale: 1, panX: 0, panY: 0 })`
- 확대: `scale = min(8, scale * 1.25)`

버튼 줌도 **컨테이너 중심을 anchor**로 panX/panY 보정 (휠 줌 로직 재사용).

---

## 6. DiffSlider 핸들과의 충돌 회피 (중요)

DiffSlider는 좌우 비교 핸들(가운데 세로선)을 마우스 드래그로 움직입니다. 새로 추가하는 pan과 충돌하지 않도록:

**전략 A (권장)**: 핸들에 `onPointerDown` 시 `e.stopPropagation()` + 전용 `data-diff-handle` 속성 부여. 외부 wrapper의 pan 핸들러는 `e.target`이 핸들이면 무시.

**전략 B**: 모드 토글 — "비교" 모드 / "줌·이동" 모드 두 가지를 명시적 버튼으로 전환. 단순하지만 UX 한 단계 늘어남. 권장하지 않음.

전략 A로 가되, 핸들 영역의 hit-area를 충분히 (좌우 12~16px) 확보해서 사용자가 핸들을 못 잡는 일이 없게 해주세요.

---

## 7. 두 이미지(before/after) 변환 공유

DiffSlider는 같은 위치에 두 이미지를 겹쳐 그리고 clip-path로 좌/우 영역을 자릅니다. 새 zoom/pan transform은 **두 이미지가 하나의 inner wrapper 안에 있도록** 묶어 동일 transform이 동시 적용되어야 합니다 — 따로 적용하면 줌 시 두 이미지가 어긋납니다.

clip-path 자체는 inner wrapper의 자식 요소에 적용되므로 transform과 독립적으로 잘 동작합니다.

---

## 8. 라이브러리 추가 금지

`react-zoom-pan-pinch` 등 외부 라이브러리는 **추가하지 말고** 자체 구현해주세요. 이유:
1. 의존성 0으로 유지하는 게 프로젝트 정책
2. DiffSlider 핸들 이벤트와 충돌 가능성
3. 100~200줄 자체 구현으로 충분

custom hook으로 분리(권장):

```ts
// components/studio/use-image-pan-zoom.ts
export function useImagePanZoom(opts?: { min?: number; max?: number }) {
  // ... 위 5.x 로직 캡슐
  return {
    transform,
    bind: { onWheel, onPointerDown, onPointerMove, onPointerUp, onDoubleClick },
    setScale, setPan, reset,
    containerRef,
  };
}
```

---

## 9. 검증 절차 (작업 후 직접 확인)

dev server는 이미 떠있습니다. 다음을 수동 확인:

1. `http://localhost:3000/studio` 진입
2. history-panel에서 record 하나를 **"기준이미지로 사용"** 클릭 → 가운데 비교 패널에 before/after 표시
3. **Ctrl/Cmd + 휠** 위/아래 → 이미지가 커서 위치 기준으로 줌 in/out. **상단 헤더, 좌측 prompt-panel, 우측 history-panel 위치 절대 안 변함** ✅
4. 패널 위에서 **클릭 + 드래그** → 이미지가 따라 이동. 컨테이너 밖으로는 안 넘침 (`overflow:hidden`이라 자연스럽게 잘림)
5. **더블클릭** → 1배율 + 중앙으로 리셋
6. **DiffSlider 핸들** (가운데 세로선)을 좌우로 드래그 → 비교 영역 변경. 이때 pan과 섞이지 않음 ✅
7. 일반 휠(Ctrl 없이) → 페이지가 스크롤됨 (preventDefault 없음) ✅
8. 축소/100%/확대 버튼 클릭 → 새 zoom state와 동기화 ✅
9. 화면 폭을 줄여 좁은 viewport (예: 960×600)에서도 동작 정상

또 다음 콘솔 검사:
- 줌/팬 도중 React 경고/에러 0건
- `Maximum update depth` 같은 무한 루프 없음

---

## 10. 비-범위 (out of scope, 건드리지 말 것)

- 모바일 핀치 줌(터치 두 손가락) — 지금은 우선순위 낮음. 단, 기본 마우스/트랙패드 인터랙션은 데스크톱에서 완전히 동작해야 함
- 회전/플립
- 이미지 자체의 crop 저장
- 다른 페이지의 비슷한 비교 UI (없을 수도)
- 새 라이브러리 도입
- 백엔드 변경 (`/api/*` 어떤 것도 수정 X)
- localStorage / record 데이터 모델 변경 X

---

## 11. 결과 보고 양식

작업 끝나면 다음 형식으로 보고해주세요 (메인 Claude가 통합 검토):

```
## 변경 파일
- components/studio/diff-slider.tsx (+N -M)
- components/studio/workspace-panel.tsx (+N -M)
- (신규) components/studio/use-image-pan-zoom.ts (+N)

## 핵심 결정
- (예: pan 보정에서 scale 변경 시 anchor를 유지하도록 ... )

## 검증 결과
- 9번 시나리오 1~9 모두 통과 / 통과 안 한 항목 명시

## 알려진 한계
- (있으면)
```

그리고 commit하지 말고 working tree에 두세요. 메인 Claude가 typecheck/build 검증 후 통합 commit합니다.

---

## 12. 빠른 체크리스트

- [ ] inner wrapper만 transform, outer 컨테이너는 `overflow:hidden`로 고정
- [ ] Ctrl/Cmd + 휠 zoom (cursor anchor)
- [ ] 클릭 드래그 pan
- [ ] 더블클릭 리셋
- [ ] DiffSlider 핸들 stopPropagation 처리
- [ ] before/after 두 이미지가 같은 inner wrapper 공유
- [ ] 축소/100%/확대 버튼이 새 state와 동기화
- [ ] scale clamp [0.25, 8]
- [ ] 일반 휠은 페이지 스크롤 유지
- [ ] 라이브러리 추가 X
- [ ] 검증 9개 시나리오 모두 통과
- [ ] 다른 페이지/파일 건드리지 않음
