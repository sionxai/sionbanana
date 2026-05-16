---
name: sionbanana-image-gen
description: Use this skill to generate images via 시온바나나 local tool when the user asks for image creation, scene generation, character sheets, or upscaling selected results. Trigger keywords: 이미지 생성, 장면 생성, 캐릭터 시트, 키비주얼, 업스케일, 시온바나나.
---

# Sion Banana Image Gen

## When to use

Use this skill when the user asks in natural language for image creation, scene generation, character sheets, key visuals, image series exploration, or upscaling selected 시온바나나 results.

Prefer the local helper workflow over editing app code. Keep `docs/agent-automation-workflow.md` as historical context; this `SKILL.md` is the source of truth for future agent work.

## Prerequisites

- Run from the 시온바나나 project directory.
- 시온바나나 dev server is already running, default port `3002`.
- Confirm `/api/health` before generation.

```bash
curl -s http://localhost:3002/api/health
```

## Workflow

### Phase 1: 탐색

Call the helper sequentially for N attempts. Use stable `--category` and attempt slugs such as `attempt-01` through `attempt-10`.

```bash
for i in $(seq -w 1 10); do
  node scripts/agent-generate.mjs \
    --prompt "이미지 프롬프트를 여기에 입력" \
    --category "moon-running" \
    --slug "attempt-$i"
done
```

### Phase 2: 정리

Build a single category index and share the generated path with the user.

```bash
node scripts/agent-generate.mjs --build-index moon-running
```

The index is written to:

```text
data/agent-runs/_moon-running-index.html
```

Users can select cards and copy a chat-ready request such as:

```text
2k로 업스케일: #02, #10
```

### Phase 3: 확정

When the user provides selected numbers, map each `#NN` to the matching run shown in the category index, then upscale from that run directory.

```bash
node scripts/agent-generate.mjs \
  --upscale-from "data/agent-runs/2026-05-16T02-38-05-879Z-attempt-02" \
  --size 2048x1152 \
  --quality high
```

Use `--slug` only when the user needs a custom output slug.

```bash
node scripts/agent-generate.mjs \
  --upscale-from "data/agent-runs/2026-05-16T02-38-05-879Z-attempt-02" \
  --size 2048x1152 \
  --quality high \
  --slug "hero-final-2k"
```

## 검수 Rubric (Medium)

- `subject`: 인물/주체가 프롬프트 의도와 일치하는지 확인.
- `background`: 배경/환경이 장면 조건과 충돌하지 않는지 확인.
- `pose`: 자세/동작이 명확하고 어색한 왜곡이 없는지 확인.
- `style`: 시각 스타일, 색감, 조명, 렌더링 톤이 요청과 맞는지 확인.
- `missing`: prompt 핵심 요소가 빠졌는지 기록.
- `notes`: 손/얼굴/텍스트/로고/프레이밍 등 특이사항 기록.

## Folder Naming

Generated runs are stored with this pattern:

```text
data/agent-runs/{ISO-timestamp}-{slug}/
```

Each run contains:

```text
manifest.json
review.html
images/
```

## Limits

- One generation call usually takes 60 to 120 seconds and should be run sequentially.
- Respect rate limits, including the user's ChatGPT Pro quota.
- A 2K upscale is not guaranteed to be pixel-identical to the 1K result; expect roughly 90%+ composition and color continuity rather than exact sameness.
