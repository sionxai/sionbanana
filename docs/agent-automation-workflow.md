# Agent Automation Workflow PoC

이 문서는 Claude 같은 외부 에이전트가 시온바나나의 기존 API를 건드리지 않고 이미지 생성 결과를 자동 정리하고 HTML로 검수하기 위한 Phase 1 PoC 절차입니다. 앱 코드는 수정하지 않고 `docs/`, `scripts/`, `data/agent-runs/` 레이어만 사용합니다.

## 1. Health Check

작업 전 로컬 Next.js 서버가 살아 있는지 확인합니다.

```bash
curl -sS http://localhost:3002/api/health | jq .
```

기대값:

```json
{
  "ok": true,
  "version": "0.0.0",
  "codex": {
    "authenticated": true
  }
}
```

- `ok: true`이면 API 서버는 응답 중입니다.
- `codex.authenticated: false`이거나 `codex.error`가 있으면 `/api/generate`가 인증 오류로 실패할 수 있습니다.
- helper는 기본적으로 `3002`를 먼저 확인하고, 포트를 명시하지 않은 경우 `3000`, `3001`, `3003`, `3004`, `3005`도 순차 탐색합니다.

## 2. Generate API Curl Recipe

최소 요청:

```bash
curl -sS http://localhost:3002/api/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "A cinematic banana character arriving at a quiet cafe, warm morning light.",
    "mode": "create",
    "options": {
      "idempotencyKey": "agent-cafe-arrival-20260516T010000Z",
      "count": 1,
      "quality": "medium",
      "imageSize": "1024x1024"
    }
  }'
```

참조 이미지 1장:

```bash
curl -sS http://localhost:3002/api/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "Use the reference character, place them at a cafe entrance.",
    "mode": "create",
    "options": {
      "idempotencyKey": "agent-cafe-reference-20260516T010000Z",
      "referenceImageUrl": "/api/images/REFERENCE_ID",
      "count": 2,
      "quality": "medium",
      "imageSize": "1024x1024"
    }
  }'
```

참조 갤러리:

```bash
curl -sS http://localhost:3002/api/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "Keep the character identity from the primary reference and match the lighting mood from the gallery.",
    "mode": "create",
    "options": {
      "idempotencyKey": "agent-gallery-cafe-20260516T010000Z",
      "referenceImageUrl": "/api/images/PRIMARY_ID",
      "referenceGallery": [
        "/api/images/GALLERY_ID_1",
        "/api/images/GALLERY_ID_2"
      ],
      "count": 4,
      "quality": "medium",
      "imageSize": "1024x1024"
    }
  }'
```

필드 규칙:

- `idempotencyKey`: 같은 요청의 중복 생성을 막기 위해 helper가 자동 생성합니다. 수동 호출 시 slug와 timestamp를 포함합니다.
- `referenceImageUrl`: 같은 앱 origin의 `/api/images/<id>` 또는 절대 URL만 사용합니다.
- `referenceGallery`: 보조 참조 이미지 배열입니다. API 제한상 최대 8장입니다.
- `count`: `1`, `2`, `4` 중 하나입니다.
- `quality`: `low`, `medium`, `high`, `auto` 중 하나입니다. PoC 기본값은 `medium`입니다.
- `imageSize`: 예: `1024x1024`, `1536x1024`, `1024x1536`, `1824x1024`, `1024x1824`.

## 3. storagePath to Absolute Path

`/api/generate` 성공 응답은 첫 이미지의 `storagePath`와 전체 이미지의 `images[].storagePath`를 제공합니다.

```json
{
  "ok": true,
  "storagePath": "2026-05/abc123.png",
  "images": [
    {
      "id": "abc123",
      "imageUrl": "/api/images/abc123",
      "storagePath": "2026-05/abc123.png"
    }
  ]
}
```

절대 경로 변환 규칙:

1. `SIONBANANA_DATA_DIR`이 설정되어 있으면 그 값을 data root로 사용합니다.
2. 없으면 현재 worktree 기준 `./data`를 data root로 사용합니다.
3. 응답 `storagePath`가 상대 경로이면 `data root/images/{storagePath}`로 변환합니다.
4. 응답 `storagePath`가 이미 절대 경로이면 그대로 사용합니다.

예:

```text
SIONBANANA_DATA_DIR=/Volumes/assets/sionbanana-data
storagePath=2026-05/abc123.png
absolute=/Volumes/assets/sionbanana-data/images/2026-05/abc123.png
```

## 4. Agent Run Folder Naming

각 자동화 실행은 앱의 원본 저장소를 건드리지 않고 별도 검수 폴더에 정리합니다.

```text
data/agent-runs/{ISO-timestamp}-{slug}/
```

예:

```text
data/agent-runs/2026-05-16T01-00-00-000Z-cafe-arrival/
  images/
    abc123.png
  manifest.json
  review.html
```

timestamp는 ISO 문자열을 파일시스템에 안전하게 쓰기 위해 `:`와 `.`을 `-`로 치환합니다. `slug`는 소문자 영문, 숫자, `-`, `_` 중심으로 정리합니다.

## 5. HTML Review Page

`review.html`은 정적 HTML이어야 하며 외부 의존성을 갖지 않습니다.

필수 구성:

- Thumbnail grid: 생성 이미지 썸네일과 파일명
- Prompt: 전체 prompt 원문
- Metadata: timestamp, category, slug, count, quality, imageSize/aspectRatio, reference, idempotencyKey
- Review notes placeholder: Claude나 사람이 후처리로 채울 수 있는 영역

검수 메모 영역은 다음 rubric을 그대로 포함합니다.

```text
subject:
background:
pose:
style:
missing:
notes:
```

## 6. Medium Review Rubric

PoC 기본 검수 기준은 Medium입니다. 자동 판정이 아니라 사람이 빠르게 확인할 수 있는 항목을 고정합니다.

| Field | 기준 |
| --- | --- |
| subject | 주 피사체가 prompt와 맞고, 정체성이 유지되는가 |
| background | 장소, 시간대, 분위기가 prompt와 맞는가 |
| pose | 포즈, 시선, 동작이 요청과 충돌하지 않는가 |
| style | 화풍, 렌더링 품질, 색감이 요청한 스타일과 맞는가 |
| missing | 누락된 핵심 요소가 있는가 |
| notes | 재시도에 반영할 짧은 수정 지시 |

Medium 통과 기준:

- 핵심 subject와 background가 모두 식별 가능해야 합니다.
- prompt의 필수 요소가 1개 이상 빠지면 retry 후보입니다.
- reference 사용 요청이 있었는데 정체성이 크게 어긋나면 retry 후보입니다.
- 작은 디테일 누락이나 미세한 스타일 차이는 notes에 남기고 통과할 수 있습니다.

## 7. Retry Policy

1. 첫 생성 결과를 `review.html`로 검수합니다.
2. Medium 기준에서 실패하면 1회만 자동 retry합니다.
3. retry prompt는 기존 prompt 뒤에 짧은 corrective note를 추가합니다.
4. retry도 실패하면 추가 생성을 반복하지 않고 사용자에게 보고합니다.

보고 형식:

```text
status: needs-user-review
reason: Medium rubric failed after one retry
failedFields: subject, background
notes: Character identity drifted and cafe entrance was missing.
firstRun: data/agent-runs/...
retryRun: data/agent-runs/...
```

## 8. Helper Usage

CLI:

```bash
node scripts/agent-generate.mjs \
  --prompt "A cinematic banana character arriving at a quiet cafe, warm morning light." \
  --category character-locations \
  --slug cafe-arrival \
  --count 1 \
  --quality medium \
  --size 1024x1024 \
  --port 3002
```

병렬 batch 생성:

```bash
node scripts/agent-generate.mjs \
  --prompt "A cinematic banana character arriving at a quiet cafe, warm morning light." \
  --category character-locations \
  --slug cafe-arrival \
  --count 1 \
  --quality medium \
  --size 1024x1024 \
  --batch 10 \
  --concurrency 4
```

- `--batch N`: 같은 prompt로 N개의 독립 run을 만듭니다. 기본값은 `1`이며, 미지정 시 기존 단건 출력 형식을 유지합니다.
- `--concurrency C`: batch 실행 시 동시에 처리할 run 수입니다. 기본값은 `4`입니다.
- batch run의 slug는 `cafe-arrival-01`, `cafe-arrival-02`처럼 자동 인덱싱됩니다.
- `category`가 있으면 batch 완료 후 같은 `--build-index` 로직으로 `data/agent-runs/_{category}-index.html`을 갱신하고 `indexPath`를 반환합니다.

stdin JSON:

```bash
printf '%s\n' '{
  "prompt": "A cinematic banana character arriving at a quiet cafe, warm morning light.",
  "category": "character-locations",
  "slug": "cafe-arrival",
  "count": 1,
  "quality": "medium",
  "size": "1024x1024",
  "port": 3002
}' | node scripts/agent-generate.mjs
```

성공 출력:

```json
{
  "ok": true,
  "outputDir": "/absolute/path/data/agent-runs/2026-05-16T01-00-00-000Z-cafe-arrival",
  "imagePaths": [
    "/absolute/path/data/agent-runs/2026-05-16T01-00-00-000Z-cafe-arrival/images/abc123.png"
  ],
  "reviewHtmlPath": "/absolute/path/data/agent-runs/2026-05-16T01-00-00-000Z-cafe-arrival/review.html",
  "manifestPath": "/absolute/path/data/agent-runs/2026-05-16T01-00-00-000Z-cafe-arrival/manifest.json"
}
```

batch 성공 출력:

```json
{
  "ok": true,
  "total": 10,
  "succeeded": 10,
  "failed": 0,
  "runs": [
    {
      "ok": true,
      "batchIndex": 1,
      "slug": "cafe-arrival-01",
      "outputDir": "/absolute/path/data/agent-runs/2026-05-16T01-00-00-000Z-cafe-arrival-01",
      "imagePaths": ["/absolute/path/data/agent-runs/.../images/abc123.png"],
      "reviewHtmlPath": "/absolute/path/data/agent-runs/.../review.html",
      "manifestPath": "/absolute/path/data/agent-runs/.../manifest.json"
    }
  ],
  "indexPath": "/absolute/path/data/agent-runs/_character-locations-index.html"
}
```
