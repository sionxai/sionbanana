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

Generate N attempts **in parallel** with `--batch N --concurrency C`. **기본 동시성은 4** (helper·runJobs·storyboard 모두 기본 4로 통일됨). 4가 Codex rate limit 안전선이다 (실측: 4 parallel = no 429).

> ⚠️ **서버/머신 부하가 높으면 2~3으로 낮춰라.** dev 서버는 이미지 생성 시 메모리를 크게 쓰므로, 다른 무거운 앱(다른 dev 서버 등)이 같이 떠 있거나 Load Average가 높으면 동시성 4에서 서버가 죽을 수 있다 (실측). 그럴 땐 spec의 `concurrency: 2` 또는 `--concurrency 2`로 낮춘다. 10 이상은 비권장 — 더 빠르지도 않고 ~20% rate-limit 실패가 난다.

```bash
node scripts/agent-generate.mjs \
  --prompt "이미지 프롬프트" \
  --category "moon-running" \
  --slug "attempt" \
  --batch 10 \
  --concurrency 4 \
  --retry 2
```

- 10개를 4개씩 동시 처리 → sequential 대비 약 2~4배 빠름 (10장 ~280초 vs ~500초)
- batch 완료 시 통합 index가 **자동 생성**됨 (`--category` 필요)
- slug는 자동 인덱싱: `attempt-01`, `attempt-02` ...
- `--retry N`은 429/502/503/504/timeout 같은 일시 오류만 재시도. 로그는 stderr로만 출력됨.

> ⚠️ **실측: 10개 batch에서 1~2개 rate limit/timeout 실패 가능** (예: 8/10). 100% 필요하면 `--retry 2` 또는 `--concurrency 3`으로 낮춤.

단건만 필요하면 `--batch` 생략:

```bash
node scripts/agent-generate.mjs --prompt "..." --category xxx --slug yyy
```

### Phase 1b: 스토리보드 (서로 다른 prompt 다건)

컷마다 prompt가 다른 경우 `--batch`가 아니라 jobs 배열을 사용. stdin은 JSON 객체(`{"jobs":[...]}`) 또는 배열을 받을 수 있음:

```bash
node scripts/agent-generate.mjs --concurrency 4 --retry 2 --port 3002 < storyboard-jobs.json
```

`storyboard-jobs.json` 예:

```json
[
  {
    "slug": "cut-01",
    "category": "storyboard-demo",
    "prompt": "첫 컷 prompt",
    "quality": "medium",
    "count": 1
  },
  {
    "slug": "cut-02",
    "category": "storyboard-demo",
    "prompt": "두 번째 컷 prompt",
    "referenceSlug": "cut-01"
  }
]
```

출력은 JSON 하나이며 `jobs[].ids`, `jobs[].imageUrls`, `jobs[].outputPaths`, `jobs[].manifestPath`를 포함. 같은 `category`의 성공 run이 있으면 마지막에 index가 생성됨.

### Phase 1c: 스토리보드 일괄 생성 (spec 기반)

시나리오별 키프레임은 임시 스크립트를 새로 만들지 않고, 사람이 작성하는 spec 파일 1개와 범용 CLI를 사용한다.

```bash
node scripts/storyboard.mjs jobs templates/storyboard.example.json
node scripts/storyboard.mjs run path/to/storyboard.spec.json --port 3002 > storyboard.summary.json
node scripts/storyboard.mjs organize path/to/storyboard.spec.json storyboard.summary.json
```

- spec은 `title`, `outDir`, `defaults`, `scenes[].cuts[]` 구조를 사용한다. 각 cut은 `slug`, `prompt`가 필수이고 `size`, `quality`, `count`, `category`는 cut 값이 없으면 `defaults`에서 채운다.
- ★ **콘티 메타(index에 자동 표시) — 시나리오 작업 시 반드시 채운다.** `organize`가 만드는 `index.html`은 단순 썸네일 갤러리가 아니라 **콘티(스토리보드 문서)**다. 아래 필드를 spec에 채우면 index에 그대로 렌더된다(안 채우면 그 줄이 비어 콘티 구실을 못 한다):
  - spec 최상위 `logline`(한 줄 줄거리) + `synopsis`(씬 흐름 문자열 배열) → index 상단 **📖 스토리라인** 블록.
  - 각 cut의 `sec`(예: `"0–4초"`) → 카드 라벨에 시간.
  - 각 cut의 `story`(상황 + **인물 액션**) → 카드 본문.
  - 각 cut의 `dialogue`(예: `"이완 원장: 말로 안 되면… 수기로"`, 여러 줄은 `\n`) → 카드에 대사(화자 자동 굵게). 대사 없는 컷은 생략.
  - 각 cut의 `camera`(예: `"미디엄 투샷 / 50mm / 슬로모 더치틸트"` = **카메라 액션·앵글·렌즈·샷타입**) → 카드에 🎬 줄.
  - 말풍선 없는 순수 키이미지라도 `dialogue`/`camera`는 **콘티 문서용 메타**이므로 채운다(이미지에 글자로 그려 넣으라는 뜻이 아니라, index 콘티에 그 컷의 대사·카메라를 명시하는 것).
- **해상도 기본값은 2K(`"size": "2k-16:9"` = `2048x1152`)로 한다.** 세로물은 `2k-9:16`, 정사각은 `2k-1:1`. 예전 `1824x1024`(1.9K)는 빠른 탐색용이며, 최종 딜리버리 스토리보드는 처음부터 2K로 생성한다. (별도 업스케일 단계 없이 바로 2K 결과를 얻기 위함.)
- 레퍼런스 이미지를 `data/images/<bucket>/<id>.png`에 두면 `/api/images/<id>`로 접근할 수 있으므로 `reference` 또는 `referenceGallery`에 직접 넣는다.
- 이전 `agent-generate` 결과처럼 `data/agent-runs/.../manifest.json`에 slug가 남아 있는 이미지는 `referenceSlug`, `referenceGallerySlugs`로 참조한다. 같은 `category` 안에서 최신 run의 첫 `/api/images/<id>`가 사용된다.
- `run`은 spec을 jobs로 평탄화하고, slug reference를 URL로 해석한 뒤 `runJobs`로 생성하고, `outDir/scene-<n>/<slug>_v1.png` 형태로 복사한 다음 `outDir/index.html`을 만든다.
- 검수 후 실패하거나 어색한 컷만 별도 spec으로 부분 재생성한다. 이후 기존 summary의 해당 slug 항목을 새 결과로 교체하거나, 같은 slug 항목이 뒤에 오도록 summary를 합친 뒤 `organize`를 다시 실행한다.
- 전경에 큰 신체부위(다리/발/손)가 들어가는 prompt는 원근 왜곡 위험이 높다. 주인공 중심 구도를 명확히 쓰고 negative prompt에 `giant oversized leg, distorted limbs, foot in foreground, extra limbs, deformed hands`를 넣는 편이 안전하다.
- 시나리오 헤더의 컷 수와 실제 컷 번호가 불일치할 수 있으니, 자동화는 문서 헤더보다 실제 cut 번호와 slug 기준으로 진행한다.

### Phase 1d: 레퍼런스 시트 자동 생성

시나리오/스토리보드 작업 시, 사용자가 캐릭터·장소·오브젝트 레퍼런스 시트를 첨부하지 않은 경우 키프레임 생성 전에 먼저 생성한다. 첨부된 경우 이 단계를 건너뛴다.

**판단 기준**: 시나리오 텍스트에 연속성 바이블(인물/공간/오브젝트 비주얼 상세)이 있으나 참조 이미지 첨부가 없으면 자동 생성 대상.

> ★ **시트 ↔ 시나리오 정합성 검증 (시트 첨부 시 필수)**
> 사용자가 시트를 첨부한 경우, **키프레임 생성 전에 시트의 실제 외형과 시나리오 연속성 바이블의 외형(특히 의상·헤어·소품)이 일치하는지 반드시 대조**한다. 불일치하면(예: 바이블은 "후드집업+데님재킷"인데 시트는 "원피스") **컷 생성을 시작하기 전에 둘 중 하나로 통일**한다:
> - (A) 시나리오 바이블을 시트에 맞게 수정, 또는
> - (B) 시트를 바이블에 맞게 재생성(권장 — 서사 의도 보존).
>
> 이 단계를 건너뛰고 "프롬프트마다 의상을 글로 강제"하는 식으로 땜질하면, 의상 문구가 빠진 컷에서 시트 원본 외형이 튀어나와 **컷마다 옷이 바뀐다**(실측: 데님재킷 명시한 컷은 유지, 빠진 컷은 시트의 원피스로 회귀). 근본 해결은 시트와 시나리오를 처음부터 일치시키는 것이다. 불일치 발견 시 사용자에게 보고하고 (A)/(B)를 확인받는다.

#### 캐릭터 시트

인물마다 1장. 프롬프트 구조:

```
Character reference sheet for {인물명}. 
Left half: full-body front view and full-body back view standing on a neutral gray background.
Right half: 4-panel face grid (front, 3/4 left, 3/4 right, profile).
{나이, 성별, 체형, 신장 등 신체 특징}
{헤어스타일, 색상}
{의상 상세: 색상, 소재, 질감, 특이사항(찢어짐, 얼룩 등)}
{소품: 모자, 신발, 액세서리}
Hyperrealistic photography, studio lighting, consistent identity across all views.
```

- `--slug "ref-char-{인물명}"`, `--quality high`, `--aspect "16:9"`

#### 장소 시트

주요 공간마다 1장. 프롬프트 구조:

```
Location reference sheet for {장소명}, 4-panel grid labeled 정면/후면/좌측/우측.
{시대, 지역, 건축 양식}
{주요 구조물: 지붕, 벽, 바닥 재질}
{주변 환경: 식생, 지형, 돌담 등}
{조명 조건: 시간대, 계절, 날씨}
Hyperrealistic photography, architectural reference style.
```

- `--slug "ref-loc-{장소명}"`, `--quality high`, `--aspect "16:9"`

#### 오브젝트 시트 ★중요

서사적으로 반복 등장하는 소품(카메라, 무기, 탈것, 휴대폰, 상징 물건 등)은 **반드시 오브젝트 시트로 외형을 고정**한다. 시트 없이 `"futuristic vlog camera"`, `"미래형 카메라"` 같은 **추상 표현만 쓰면 컷마다 완전히 다른 물건**이 나온다 (실측: 같은 카메라가 짐벌캠·태블릿·고프로로 제각각 생성됨). 캐릭터를 시트로 고정하듯 핵심 소품도 똑같이 고정해야 한다.

권장 절차:
1. **구체적 실물 모델로 지정** — `"미래형 카메라"`(X) → `"compact mirrorless camera modeled on a Sony a7c, silver-and-black body, short retractable lens, flip-out LCD"`(O).
2. 그 묘사로 오브젝트 시트 1장 생성 → `data/images/<bucket>/<id>.png`로 등록.
3. 소품이 **프레임에 보이는 컷**에만 그 시트를 `referenceGallery`(또는 `--reference-gallery-slugs`)에 추가하고, 프롬프트에 `"keep this exact same {소품} design as the reference sheet"`를 명시한다.
4. 소품이 안 보이는 컷(POV·화면 overlay·떡밥 컷 등)은 시트를 넣지 않는다.

프롬프트 구조:

```
Prop reference sheet for {오브젝트명}.
Left half: front view and side view on white background.
Right half: close-up detail panels with annotation callouts showing {질감, 마모, 색상 변화 등}.
{소재, 크기, 시대, 용도}
{특이사항: 벗겨진 칠, 금, 얼룩 등}
Product photography style, hyperrealistic, studio lighting.
```

- `--slug "ref-obj-{오브젝트명}"`, `--quality high`, `--aspect "16:9"`

생성된 시트는 이후 키프레임 생성 시 `--reference-slug` 또는 `--reference-gallery-slugs`로 연결하거나, 프롬프트 앞에 `[연속성 바이블]` 텍스트 블록으로 주입한다.

### Phase 1e: 씬 마스터샷 앵커링 (블로킹·공간 일관성) ★중요

캐릭터·공간 시트는 **인물 외형과 사무실 생김새**는 고정하지만, **같은 씬 안에서 "누가 어느 자리에 앉아 어느 방향을 보는가(블로킹)"와 "카메라가 어느 쪽에 있나(앵글·축선)"는 고정하지 못한다.** 그래서 시트만 걸면 같은 씬인데도 컷마다 책상 구조·좌석 배치·시선 방향이 새로 그려진다 (실측: 4인 상담 씬에서 컷마다 좌우 배치·카메라 위치가 제각각).

해결: **씬마다 마스터샷 1컷을 먼저 확정하고, 그 이미지를 후속 컷의 reference 1순위로 건다.**

절차:
1. 씬의 **첫 와이드/설정 샷**(인물 배치가 다 보이는 컷)을 먼저 생성하고 베스트 1장을 확정한다 → 이게 그 씬의 "마스터샷".
2. 같은 씬의 후속 컷은 reference를 **`[마스터샷 URL, (그 컷 주연 캐릭터 시트), ...]`** 순서로 구성한다. 마스터샷이 배치·공간·축선을 담당하고, 캐릭터 시트가 클로즈업 시 얼굴 디테일을 보강한다.
   - storyboard spec에서는 후속 cut의 `referenceSlug`/`referenceGallerySlugs`에 마스터 컷 slug를 넣거나, 마스터샷의 `/api/images/<id>`를 `referenceGallery` 맨 앞에 직접 넣는다.
3. 후속 컷 프롬프트 앞에 **블로킹 고정 문구**를 명시한다:
   > "첫 번째 참조 이미지는 이 씬의 마스터 와이드샷이다. 그 마스터샷과 동일한 좌석 배치·책상 구조·공간 레이아웃·카메라 축선을 그대로 유지하라: {좌측 인물}은 왼쪽, {우측 인물}은 오른쪽. 이 배치를 유지한 채 {이 컷의 동작}을 그린다."
4. 클로즈업 컷은 "마스터샷의 {특정 좌석} 인물에게 카메라가 다가간 클로즈업"으로 지시해 좌우 방향(180도 축선)을 깨지 않는다.
5. ★ **좌우 배치(화면축) 규약을 못 박고, 어떤 컷에서도 반전하지 않는다.** 같은 시퀀스에 반복 등장하는 두 인물은 **화면 좌/우 위치를 규약으로 고정**한다(예: "원장 = 항상 화면 왼쪽, 고객 = 항상 오른쪽"). 카메라가 특정 인물을 favor하거나 **리액션·발끈·돌격 같은 동작 컷이어도 좌우를 절대 반전하지 않는다.** 좌우가 뒤집히면 컷 사이에서 인물이 순간이동한 듯 **튀어 보인다**(실측 실패: 평온 투샷은 "원장 왼쪽/고객 오른쪽"인데 바로 다음 발끈 컷에서 "고객 왼쪽/원장 오른쪽"으로 반전돼 축선이 깨짐 → 사용자가 지적). 각 컷 프롬프트에 한국어로 "A는 화면 '왼쪽', B는 화면 '오른쪽', 절대 좌우 반전 금지"를 명시하고, **그 시퀀스의 첫 투샷(또는 마스터샷)을 reference 1순위로** 건다. favor 인물은 샷 크기로 표현하되(예: 오른쪽 인물 미디엄) 좌우 위치 자체는 유지한다.

한계 (정직히): gpt-image 계열은 seed·카메라 좌표 정밀 제어가 없어 **완벽히 동일하진 않다(체감 80~90%)**. 픽셀 단위 동일 배치가 필요하면 동일 베이스 이미지 인페인트나 3D 레이아웃이 필요하며 이 도구 범위를 넘는다. 그래도 마스터샷 앵커링만으로 "같은 씬으로 보이는" 수준은 안정적으로 확보된다 (실측 검증됨).

### 배경 텍스트 고정 (칠판·현판·간판·게시물) ★중요

gpt-image-2는 **글자가 들어갈 표면(칠판·액자·현판·간판·배너·게시물)이 프롬프트에 지정돼 있지 않으면 그럴듯한 한글을 지어내 채운다.** (실측: 반장 선거 씬에서 지시하지 않은 칠판 판서 '오늘의 반장'+임의 후보명이 생성됐고, 칠판 위 국가명 액자('고려민국')가 '고려고등학교'로 둔갑 — 사용자가 발견.) 생성 단계 규칙:

1. **글자 표면이 보이는 컷은 정확한 문구를 한글 그대로 프롬프트에 명시**한다. 쓸 글자가 없으면 "빈 칠판"처럼 비어 있음을 명시한다. 헷갈리기 쉬운 표면은 금지 문구도 함께 명시한다(예: "이 액자는 국가 상징 '고려민국'이다. '○○고등학교' 같은 학교명을 넣지 마라"). gpt-image는 지정한 한글을 정확히 렌더링한다 (실측: 8글자 현판 '황립국민고등학교' 정확).
2. **마스터샷 앵커링은 텍스트 오류도 전파한다.** 어떤 컷을 마스터로 걸기 전에 그 컷의 배경 텍스트부터 검증한다 (실측: 액자가 잘못된 컷을 마스터로 참조한 후속 컷에 같은 오류가 그대로 전이).
3. **고유명은 생성 전에 확정.** 국가명·학교명·기관명이 소스 자료마다 다르면(실측: 설정집 '황제고등학교' vs 시나리오 '황립국민고등학교') 컷 생성 전에 사용자에게 하나로 확정받고 spec에 못 박는다.

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

### Phase 1f: 시트 커버리지 정적 검증 (생성 전 필수, 토큰 0) ★중요

키프레임 생성을 시작하기 **전에**, 각 컷이 등장 요소(인물·소품)의 레퍼런스 시트를 빠짐없이 걸었는지 코드로 전수 점검한다. 시트를 만들어도 **그게 보이는 컷에 reference로 안 걸리면 그 컷만 엉뚱한 물건이 나온다** (실측: 가방 시트가 있는데 cut-1-4에만 안 걸어서 갈색 켈리백이 나옴 — 나머지 컷은 정상).

```bash
node scripts/check-coverage.mjs path/to/storyboard.spec.json path/to/coverage-rules.json
```

- `coverage-rules.json`은 `{ "rules": [ { "slug": "pa-obj-bag", "any": ["handbag on the counter", "holding the black beaded handbag", ...], "label": "가방" } ] }` 형태. 각 rule은 "프롬프트/스토리에 any 키워드가 있으면 그 컷은 slug 시트를 reference에 가져야 한다"는 뜻.
- 키워드는 **근접/클로즈업 신호**(들고 있음·카운터 위·핀셋이 닿음 등)로 좁혀라. 단순히 "bag"/"bead"만 쓰면 전경 멀리 있는 컷까지 과탐지된다.
- `ok:false`로 나온 MISS 컷은 생성 전에 spec의 `referenceGallery`에 해당 시트를 추가한다. **이미지가 아니라 spec을 고쳐야** 재생성·재현 시에도 유지된다.

### 안전 필터 대응 — 반복 502 (★중요)

특정 컷이 `--retry`를 줘도 **반복적으로 502 "Codex가 이미지를 반환하지 않았습니다"**로 실패하면, 서버 부하가 아니라 **콘텐츠 안전 필터가 이미지 반환을 거부**하는 신호일 수 있다. 판별 기준:

- **다른 컷은 성공하는데 특정 컷만 3회 이상 연속 502** (일시적 부하라면 재시도 시 분산되어 풀린다).
- 실패 컷의 공통 소재: **미성년자(아동) + 폭력·총기·유혈·공포·위난** 조합. (실측: 제주 4·3 시나리오에서 8세 여동생이 총성·피 흘리는 군중·공포에 노출되는 3개 컷이 동시 502 → 폭력 수위 낮은 17컷은 전부 통과.)

retry로는 절대 안 풀린다. 프롬프트를 단계적으로 완화해 우회한다 (실측: 아래 순서로 3컷 전부 통과):

1. **재현 톤 명시** — 프롬프트 앞에 "역사 다큐멘터리 드라마의 재현 장면" 등을 붙여 기록·재현 맥락을 분명히 한다.
2. **직접적 폭력 표현 간접화** — "총성·피·비명·짓밟힘" 같은 직접 묘사를 빼고 "긴장·보호·충격의 정서"로 바꾼다. (예: "피 흘리는 인파 속 비명" → "황급한 사람들 사이의 긴박한 순간")
3. **군중 패닉·위난 묘사 제거, 인물 중심으로** — 혼란스러운 배경을 단순화하고 보호·유대 같은 정서 중심 구도로 재구성한다. (예: 바닥에 깔려 감싸지는 → 끌어안고 웅크리는)
4. **그래도 막히면 미성년자를 프레임에서 제외** — 주인공(성인/연장자) 단독 컷으로 재구성한다. (예: 트라우마 회상을 "여동생+군중" 대신 "소년 단독 얼굴 클로즈업"으로 → 서사 의미 유지하며 통과.)

완화는 **정서·서사 의미를 보존**하는 선에서 최소한으로. 폭력의 직접 묘사가 빠져도 보호·각성·상실의 감정선은 오히려 더 또렷해지는 경우가 많다.

### Phase 4: 검수 및 맥락 보충

시나리오/스토리보드의 다수 컷 생성 후, 씬 순서대로 리뷰하며 서사 연결을 점검한다. 단일 이미지 탐색에서는 생략.

> ★ **전수 검수 원칙 (표본 금지)**: 생성된 컷은 **표본 몇 개만 보고 "좋다"고 보고하지 말 것.** 반드시 **모든 컷의 썸네일을 Read로 직접 본다.** (실측 실패: 22컷 중 6컷만 보고 통과 보고 → 안 본 17컷 중 2컷에 결함(가방·문서)이 있었고 사용자가 직접 발견함.) 컷이 많아 토큰이 부담되면 사용자에게 "전수 vs 표본"을 먼저 확인하되, 기본은 전수다.

1. **시트 일치 확인** — 각 컷의 인물·소품이 레퍼런스 시트와 같은지 (특히 핵심 소품: 가방·시계·카메라 등). Phase 1f를 통과해도 이미지가 시트와 다를 수 있으니 눈으로 재확인.
2. **검수 Rubric** 기준으로 각 컷 평가 (아래 참조)
3. **문서·간판 텍스트 확인** — 서류/간판이 나오는 컷은 한글 문구가 스토리와 맞는지, 빈 양식이 아닌지 본다 (생성 단계 규칙은 "배경 텍스트 고정" 섹션 참조). ★배경에 **작게** 들어간 액자·간판·판서는 썸네일 수준 검수로는 안 읽힌다 — **해당 영역을 크롭 확대해서 직접 읽는다.** 확대해 읽지 않았으면 "문제 없음"이라고 보고하지 않는다 (실측 실패: 교사 뒤 액자를 확대 안 하고 '학교명 오류 없음'으로 오보고 → 사용자가 '고려고등학교' 오기를 발견).
4. **서사 연결 점검** — 다음 유형의 누락을 찾는다:
   - 씬 오프닝에 에스터블리싱/와이드 샷이 없는 경우
   - 컷 간 감정·시각 전환이 급격해 브릿지 컷이 필요한 구간
   - 주요 인물이 여러 컷 동안 사라지는 구간 (리액션 컷 누락)
   - 씬 전환 시 시간 경과·공간 이동을 시각적으로 보여주는 전환 컷 부재
5. **보충 컷 제안**: 누락을 사용자에게 보고하고 확인 후 추가 생성한다.

보충 컷의 slug는 `cut-{씬}-{번호}b`로 구분한다.

### Phase 5: 딜리버리 정리

다수 컷(2씬 이상)을 생성한 경우, 최종 결과물을 씬별 폴더로 정리한다.

```text
data/agent-runs/_{category}-delivery/
├── 레퍼런스/                        ← Phase 1d에서 생성한 경우
│   ├── ref-char-{인물명}.png
│   ├── ref-loc-{장소명}.png
│   └── ref-obj-{오브젝트명}.png
├── 씬1-{씬이름}/
│   ├── cut-1-0_{컷설명}.png
│   ├── cut-1-1_{컷설명}.png
│   └── ...
├── 씬2-{씬이름}/
│   └── ...
└── ...
```

규칙:
- 딜리버리 폴더는 `_{category}-delivery`로 생성한다.
- 씬 폴더명은 `씬{N}-{한글씬이름}` 형식이다.
- 파일명은 `cut-{씬}-{번호}_{한글컷설명}.png` 형식이다. 보충 컷은 `cut-{씬}-{번호}b`로 구분한다.
- 원본 `agent-runs/` 타임스탬프 디렉토리에서 `cp`(복사)한다. 원본은 삭제하지 않는다.
- 정리 후 `open -R`로 파인더에서 딜리버리 폴더를 연다.
- Phase 1c(`storyboard.mjs organize`)를 사용한 경우 `outDir`이 이미 정리되므로 이 단계는 생략한다.

단일 이미지 탐색이나 씬이 1개뿐인 경우 생략.

## 캐릭터 라이브러리 (재사용 캐릭터)

웹 UI `/studio/characters`에서 캐릭터를 등록(name + handle)하면, 단일 생성 prompt에서 `@handle`로 호출 가능:

- **등록**: 프리셋 시트 결과 / 히스토리 / 단일 생성 결과의 "캐릭터로 등록" 버튼 (copy-on-import로 원본 보호)
- **사용**: 단일 생성 prompt에 `@민수가 카페에 들어선다` → 매칭된 캐릭터 이미지가 참조 슬롯에 자동 첨부 + Reference map prompt 자동 합성
- **picker**: "캐릭터 라이브러리에서" 버튼 → 검색/태그 필터 모달

helper(CLI)에서 캐릭터를 쓰려면 해당 이미지 URL(`/api/images/<id>`)을 `--reference`로 전달.
이전 helper run을 참조할 때는 URL을 직접 복사하지 않고 slug로도 지정 가능:

```bash
node scripts/agent-generate.mjs \
  --prompt "cut-03 prompt" \
  --category "storyboard-demo" \
  --slug "cut-03" \
  --reference-slug "cut-02" \
  --reference-gallery-slugs "character-base,prop-base"
```

`--reference-slug`는 같은 category 안에서 `manifest.slug`와 run 디렉토리 suffix가 일치하는 최신 run의 첫 `/api/images/<id>`를 사용. `--reference`를 직접 주면 직접 URL이 우선.

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

`scripts/mcp-server.mjs`를 Claude Desktop/Claude.ai에 등록하면 다른 세션에서도 도구로 사용 가능 (`docs/mcp-server-setup.md`).

- `generate`: 단건 또는 같은 prompt batch. `batch`/`concurrency`/`retry`/`referenceSlug` 지원.
- `generate_many`: 서로 다른 prompt jobs 배열. `concurrency` 기본 3, `retry` 지원.

## Limits

- 단건 생성 60~120초. **`--batch --concurrency`로 병렬 가능** (concurrency 4 권장 안전선).
- Codex rate limit (사용자 ChatGPT Pro 쿼터) — 동시 과다 시 일부 429 실패 가능.
- **딜리버리 스토리보드는 2K(`2048x1152`) 기본.** 빠른 탐색은 `1824x1024`로 싸게 뽑고 베스트만 `--upscale-from`으로 2K 확정하는 흐름도 가능. 단, 사용자가 최종본을 기대하면 처음부터 2K로 생성한다.
- 2K 업스케일은 1K와 픽셀 동일하지 않음. 구도·색감 90%+ 유지 수준.
- 반복 등장 소품은 오브젝트 시트로 외형 고정 (Phase 1d 참조). 추상 표현만 쓰면 컷마다 다른 물건이 나옴.
- 이미지는 로컬 디스크 저장. 생성 시 prompt 사이드카(`{id}.json`)도 저장돼 디스크에서 복원해도 prompt 유지.

---

## 실전 교훈 — 대규모 사극 전투 스토리보드 (진주성 세션, 반드시 적용)

이 9가지는 실제로 큰 손실(전면 재작업·전량 폐기)을 낸 함정들이다. 새 작업 시작 전에 점검한다.

1. **에셋 폴더는 하위까지 전수 조사 후 시작.** 최상위만 보고 시작하면 안 됨. (병종별 군복이 든 하위 폴더를 놓쳐 군복을 임의로 잡았다가 조선군 전 컷 재작업.) 빈 폴더(배경/오브젝트 시트)면 앵커를 직접 생성해야 함을 즉시 인지.

2. **사용자 시트가 정본. 시나리오 바이블 텍스트와 충돌하면 시트 우선** (또는 어느 쪽 따를지 사용자에게 1회 확인). 참조하는 **모든 시트를 시작 전 육안 확인** — 안 보고 텍스트만 믿으면 황진(적금 vs 흑갈색)·김천일(검은수염 vs 흰수염) 같은 충돌을 놓친다.

3. **앵커 시트도 실사 시네마틱 톤으로.** "균일 조명·중립 회색 배경"으로 뽑으면 게임 에셋 턴테이블 톤이 되고 그게 컷에 전이됨. "실사 영화 의상 레퍼런스, 자연 시네마틱 측광, 35mm 필름, 3D 게임 렌더·CGI 아님"을 명시. 가능하면 사용자 실사 시트를 직접 등록해 쓴다.

4. **대군은 그릴 수 있다 (gpt-image-2).** "못 그린다" 단정 금지. 패턴: **항공 부감 익스트림 와이드 + 사각 방진(블록) 단위 편성 + 지평선까지 원근 축소 + 수백 깃발 + 층층 먼지.** 수만 규모 체감 가능.

5. **공간 일관성 = 마스터-샷 앵커 (Phase 1e를 같은 장소 다컷 씬 전체에 적용).** 같은 장소의 establishing 1컷을 먼저 확정 → 나머지 컷을 그 **생성된 이미지 id**를 `referenceGallery` 1순위로 걸어 생성. 컷마다 독립 생성하면 같은 장소가 매번 다른 곳이 된다.

6. **전장 지리 규약을 좌표로 못 박는다.** (예: 들판/밖=화면 왼쪽, 성벽=오른쪽/전방, 공격은 좌→우.) 각 컷 프롬프트에 화면상 위치(좌하/중하/우상 등)와 시선·진격 방향을 명시해야 컷 간 방향·블로킹이 일관됨.

7. **검수는 적대적으로.** "완벽/압권" 같은 자기확신 금지. 흠을 먼저 찾는다: 모든 재등장 인물을 전 컷 교차 비교, 규모·진격방향·공간일관성·화풍·개연성(예: 지휘관 옆 호위 유무, 저격수 은폐 여부)까지. 확증편향이 가장 큰 적.

8. **장시간 배치 운용.** ① 생성 타임아웃은 2K+다중레퍼 기준 **180초로 부족 → 480초**(`SIONBANANA_GEN_TIMEOUT_MS`). ② 서버는 **독립 호스팅**(런처 Terminal)으로 — 에이전트 백그라운드 자식으로 띄우면 작업 리핑 시 같이 죽음. ③ **타임아웃돼도 서버는 이미지를 저장**함 → 재실행 전 기존본을 프롬프트 매칭으로 재사용(중복 생성 방지). ④ 청크 run이 `index.html`을 덮으므로 통합 index는 별도 1회 생성.

9. **이미지 검수 한도.** 1장당 ≤2000px. 한 세션에 이미지가 과다 누적되면 더 이상 못 봄 → 검수는 핵심만 분할해서, 필요하면 새 세션으로 리셋.
