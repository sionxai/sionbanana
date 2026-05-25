---
name: sionbanana-image-gen
description: Use this skill to generate images via 시온바나나 local tool when the user asks for image creation, scene generation, character sheets, key visuals, batch/parallel exploration, or upscaling selected results. Trigger keywords: 이미지 생성, 장면 생성, 캐릭터 시트, 키비주얼, 업스케일, 병렬 생성, 10개 생성, 시온바나나.
---

# Sion Banana Image Gen

## When to use

Use this skill when the user asks in natural language for image creation, scene generation, character sheets, key visuals, image series exploration (e.g. "10개 만들어줘"), batch/parallel generation, character library use, or upscaling selected 시온바나나 results.

Prefer the local helper workflow over editing app code. `docs/agent-automation-workflow.md` is historical context; this `SKILL.md` is the source of truth.

## Prerequisites

- Run from the 시온바나나 project directory.
- 시온바나나 dev server running, default port `3002`.
- Confirm `/api/health` (must return `"authenticated": true`) before generation.

```bash
curl -s http://localhost:3002/api/health
```

## Workflow

### Phase 1: 탐색 (병렬 batch — 권장)

Generate N attempts **in parallel** with `--batch N --concurrency C`. Default concurrency 4 is the safe line for Codex rate limits (verified: 4 parallel = no 429).

```bash
node scripts/agent-generate.mjs \
  --prompt "이미지 프롬프트" \
  --category "moon-running" \
  --slug "attempt" \
  --batch 10 \
  --concurrency 4
```

- 10개를 4개씩 동시 처리 → sequential 대비 약 2~4배 빠름 (10장 ~280초 vs ~500초)
- batch 완료 시 통합 index가 **자동 생성**됨 (`--category` 필요)
- slug는 자동 인덱싱: `attempt-01`, `attempt-02` ...

> ⚠️ **실측: 10개 batch에서 1~2개 rate limit/timeout 실패 가능** (예: 8/10). 100% 필요하면 실패분 재실행 또는 `--concurrency 3`으로 낮춤. (helper에 `--retry`가 추가되면 그것 사용.)

단건만 필요하면 `--batch` 생략:

```bash
node scripts/agent-generate.mjs --prompt "..." --category xxx --slug yyy
```

### Phase 2: 정리 (index)

batch가 자동 생성하지만, 수동 재생성도 가능:

```bash
node scripts/agent-generate.mjs --build-index moon-running
# → data/agent-runs/_moon-running-index.html
```

index에는 체크박스 + "선택 복사" 버튼이 있어, 사용자가 고른 번호를 채팅에 붙여넣기 가능:

```text
2k로 업스케일: #02, #10
```

### Phase 3: 확정 (업스케일)

사용자가 번호를 주면, 각 `#NN`을 카테고리 index의 run 디렉토리에 매핑 후 업스케일. `--upscale-from`이 manifest에서 revisedPrompt + reference를 자동 추출:

```bash
node scripts/agent-generate.mjs \
  --upscale-from "data/agent-runs/2026-05-16T02-38-05-879Z-attempt-02" \
  --size 2048x1152 \
  --quality high
```

여러 개면 `--batch`로 묶거나 각각 호출. 커스텀 출력명은 `--slug`.

## 캐릭터 라이브러리 (재사용 캐릭터)

웹 UI `/studio/characters`에서 캐릭터를 등록(name + handle)하면, 단일 생성 prompt에서 `@handle`로 호출 가능:

- **등록**: 프리셋 시트 결과 / 히스토리 / 단일 생성 결과의 "캐릭터로 등록" 버튼 (copy-on-import로 원본 보호)
- **사용**: 단일 생성 prompt에 `@민수가 카페에 들어선다` → 매칭된 캐릭터 이미지가 참조 슬롯에 자동 첨부 + Reference map prompt 자동 합성
- **picker**: "캐릭터 라이브러리에서" 버튼 → 검색/태그 필터 모달

helper(CLI)에서 캐릭터를 쓰려면 해당 이미지 URL(`/api/images/<id>`)을 `--reference`로 전달.

## Prompt 카탈로그

`docs/prompts-catalog.md`에 **434개** 이미지 prompt가 카테고리별로 정리돼 있음 (prompt 메이커/참고용):

- 캐릭터 / 360도 턴어라운드 / 캐릭터 시트
- 톤 20 / Cinematography 19 (framing·angle·special)
- 조명 66 / 포즈 42 / 카메라 34 / 방향 14 / Aspect Ratio 5
- 날씨·대기·시간·톤앤매너 57 / 외부 프리셋 91 / 프리셋 배치 뷰 93

prompt 작성 시 이 카탈로그에서 키워드를 가져와 조합.

## 검수 Rubric (Medium)

생성 후 `Read` tool로 이미지를 직접 보고 평가:

- `subject`: 인물/주체가 프롬프트 의도와 일치
- `background`: 배경/환경이 장면 조건과 충돌 없음
- `pose`: 자세/동작 명확, 왜곡 없음
- `style`: 시각 스타일·색감·조명·렌더링 톤 일치
- `missing`: prompt 핵심 요소 누락 여부
- `notes`: 손/얼굴/텍스트/로고/프레이밍 특이사항

명백한 누락이면 최대 1회 자동 재생성 후 사용자에게 비교 보고 (semi-auto).

## Folder Naming

```text
data/agent-runs/{ISO-timestamp}-{slug}/
  manifest.json   (prompt, reference, params, revisedPrompt)
  review.html
  images/
```

## MCP (다른 세션에서 사용)

`scripts/mcp-server.mjs`를 Claude Desktop/Claude.ai에 등록하면 다른 세션에서도 도구로 사용 가능 (`docs/mcp-server-setup.md`). `generate` tool은 `batch`/`concurrency`를 지원 → 다른 세션에서도 병렬 생성 가능.

## Limits

- 단건 생성 60~120초. **`--batch --concurrency`로 병렬 가능** (concurrency 4 권장 안전선).
- Codex rate limit (사용자 ChatGPT Pro 쿼터) — 동시 과다 시 일부 429 실패 가능.
- 2K 업스케일은 1K와 픽셀 동일하지 않음. 구도·색감 90%+ 유지 수준.
- 이미지는 로컬 디스크 저장. 생성 시 prompt 사이드카(`{id}.json`)도 저장돼 디스크에서 복원해도 prompt 유지.
