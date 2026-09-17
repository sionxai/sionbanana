---
name: sionbanana-image-gen
description: Use this skill to generate images via 시온바나나 local tool when the user asks for image creation, scene generation, character sheets, key visuals, batch/parallel exploration, upscaling selected results, or turning a document into a presentation slide deck. Trigger keywords: 이미지 생성, 장면 생성, 캐릭터 시트, 키비주얼, 업스케일, 병렬 생성, 10개 생성, 시온바나나, PPT 제작, PPT로 만들어줘, 슬라이드 제작, 발표자료, 기획안 PPT화.
---

# Sion Banana Image Gen

## When to use

Use this skill when the user asks in natural language for image creation, scene generation, character sheets, key visuals, image series exploration (e.g. "10개 만들어줘"), batch/parallel generation, character library use, or upscaling selected 시온바나나 results.

세로 웹툰 완성본(그림 안에 통합된 한글 말풍선 + 세로 이어붙이기)은 이 스킬이 아니라 **`sionbanana-webtoon`** 스킬을 쓴다. 이 스킬은 단일 키이미지·가로 스토리보드·레퍼런스 시트 중심이다.

유튜브 썸네일·영상 제목·설명란 등 **배포 단계 산출물**은 이 스킬이 아니라 **`sionbanana-thumbnail`** 스킬을 쓴다.

Prefer the local helper workflow over editing app code. `docs/agent-automation-workflow.md` is historical context; this `SKILL.md` is the source of truth.

**실측 교훈의 상세·실패 서사·예문 전문은 [`references/LESSONS.md`](references/LESSONS.md)에 있다.** 본문 곳곳의 §번호·①~⑦·진주성N이 그 원장의 절 번호다. 어려운 컷을 설계하거나 같은 결함이 반복되면 해당 절을 연다.

## 참조 문서 지도 (이 스킬 폴더 기준 · 필요한 순간에 연다)

| 파일 | 언제 읽나 | 담긴 절 |
|---|---|---|
| [references/sheets-and-anchoring.md](references/sheets-and-anchoring.md) | 시나리오·다컷 작업에서 시트를 만들거나 걸 때 · 같은 씬의 컷을 여러 장 만들 때 | Phase 1d 시트 템플릿, Phase 1e 마스터샷 앵커링, Phase 1f 커버리지 검증 |
| [references/pipeline-details.md](references/pipeline-details.md) | jobs 배열 생성 · 업스케일 확정 · 반복 502 · 다수 컷 검수 · 딜리버리 정리 · 캐릭터 라이브러리·폴더·MCP | Phase 1b·3·4·5, 안전 필터 대응, 캐릭터 라이브러리, Folder Naming, MCP |
| [references/prompt-skeleton.md](references/prompt-skeleton.md) | 컷 프롬프트 본문을 쓸 때 | 표준 골격, Prompt 카탈로그 |
| [references/ppt-slides.md](references/ppt-slides.md) | PPT·슬라이드 요청 | 스타일 카탈로그 절차, 언어 지시 문장, PPT 전용 검수 Rubric·재생성 규칙 |
| [references/LESSONS.md](references/LESSONS.md) · [references/LESSONS-prompt-sheets.md](references/LESSONS-prompt-sheets.md) · [references/LESSONS-pipeline-review.md](references/LESSONS-pipeline-review.md) | 같은 결함이 두 번 나올 때 · 규칙 인덱스의 §번호를 열 때 | 실측 교훈 원장 A·B / C·D / E·F |

## Prerequisites

- Run from the 시온바나나 project directory.
- 시온바나나 서버는 **launchd 상주**(`com.sionbanana.server` — 로그인 자동기동, kill해도 자동 재기동). 코드 변경 반영은 `npm run build && launchctl kickstart -k gui/501/com.sionbanana.server`. 앱 창은 `~/Applications/SionBanana.app`(Chrome 앱 모드), 수동 백업 런처 `SionBanana.command`. default port `3002`.
- Confirm `/api/health` (must return `"authenticated": true`) before generation.

```bash
curl -s http://localhost:3002/api/health
```

## PPT·슬라이드 요청 시 — 스타일을 먼저 확정한다 ★
PPT 요청은 즉흥 스타일이 아니라 등록된 스타일 카탈로그로 시작한다 — 운영 스펙의 정본은 `data/styles/PPT-STYLES.md`. 스타일 2~3개 추천 → 갤러리를 열어 실제 샘플 보여주기 → 스타일+분량 승인 → 6단계 파이프라인 → 5블록 고정 프롬프트(`styleBlock`만 붙이면 규격·negative가 빠진다). 산출물은 PNG 슬라이드 + HTML 인덱스이며 `.pptx`를 만들지 않는다. 절차·언어 지시 문장·Phase 라우팅·PPT 전용 검수 Rubric·재생성 규칙: [references/ppt-slides.md](references/ppt-slides.md).

## Workflow

### Phase 1: 탐색 (병렬 batch — 권장)

Generate N attempts **in parallel** with `--batch N --concurrency C`. **기본 동시성 4는 "레퍼런스 없는" 프롬프트-only 생성 기준**이다 (실측: 4 parallel = no 429).

> 🚨 **referenceGallery/referenceSlug를 거는 컷은 `--concurrency 2` 이하로.** 레퍼런스 이미지는 `input-images per min` 조직 쿼터(4000)를 따로 소모해서, 동시성 3~4로 돌리면 다수 컷이 502 `"Rate limit reached ... on input-images per min"`으로 실패한다 (실측: 웹툰·반장선거 세션 공통). **한 세션에서 이미지를 많이 생성하면 이 분당 한도가 누적 포화**되어 `--retry`의 짧은 백오프로는 절대 안 풀린다 → 이미지 생성을 **수 분간 완전히 멈춰 window를 비운 뒤** 재개한다. (안전필터 502와 구분: rate limit은 reason에 "Rate limit reached"가 명시됨.)

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
컷마다 prompt가 다르면 `--batch` 대신 jobs 배열(stdin JSON)로 생성한다. 예시 JSON·출력 형식: [references/pipeline-details.md](references/pipeline-details.md) §Phase 1b.

### Phase 1c: 스토리보드 일괄 생성 (spec 기반)

시나리오별 키프레임은 임시 스크립트를 새로 만들지 않고, 사람이 작성하는 spec 파일 1개와 범용 CLI를 사용한다.

```bash
node scripts/storyboard.mjs jobs templates/storyboard.example.json
node scripts/storyboard.mjs run data/storyboard/<project>.spec.json --port 3002 > data/storyboard/<project>.summary.json
node scripts/storyboard.mjs organize data/storyboard/<project>.spec.json data/storyboard/<project>.summary.json
```

- **spec·summary는 루트가 아니라 `data/storyboard/<project>.spec.json` / `<project>.summary.json`에 둔다** — 루트에 쓰면 git status를 어지럽혀 세션 간 "이거 커밋해야 하나?" 혼란을 만든다 (실측: 루트에 부산물 33개 누적).
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
- `scenes[].n`은 **1 이상의 정수만** 허용된다 (`n=0` 거부, 실측). 프롤로그·에필로그는 scene 1(또는 마지막 scene)로 넣고 `title`을 "프롤로그 · …"로 적어 구분한다 — cut slug(`cut-0-1` 등)는 자유.
- 컷 프롬프트 본문은 [references/prompt-skeleton.md](references/prompt-skeleton.md)의 표준 골격(배경/장면 · 주체 · 핵심 디테일 · 제약)을 복사해 채운다.

### 프레임 규격 — 화면비는 `size`가 아니라 프롬프트가 지배한다 ★중요

`size: "2k-16:9"`를 줘도 **프롬프트에 쓴 렌즈·포맷 용어가 화면비를 끌어간다.** (실측: 92컷 스토리보드에서 "아나모픽 렌즈"라고 썼더니 `size` 지정과 무관하게 전 컷이 2.35~2.39:1 시네마스코프로 나왔다 — 상하 레터박스까지 붙어서.)

1. **렌즈·포맷 용어를 룩 지시로 착각하지 마라.** `아나모픽`, `시네마스코프`, `와이드스크린 필름`, `70mm` 같은 단어는 질감 지시가 아니라 **비율 지시로 작동**한다. 16:9가 필요하면 이 단어들을 프롬프트에서 뺀다.
2. **원하는 비율을 문장으로 못 박는다.** 실측으로 통한 문구:

   > `★[프레임] 정확히 16:9 와이드스크린 비율(1.78:1). 시네마스코프나 극단적 와이드, 상하 레터박스 금지.`

   이 문구로 교체한 뒤 92컷 전부 1672×941(=1.777)로 통일됐다.
3. **눈으로 판정하지 말고 실측한다.** "와이드해 보인다"는 2.39와 1.78을 구분 못 한다.

   ```bash
   sips -g pixelWidth -g pixelHeight *.png \
     | awk '/pixelWidth/{w=$2} /pixelHeight/{printf "%.2f\n", w/$2}' | sort | uniq -c
   ```
4. 그래도 비율이 안 잡히는 컷은 후처리 크롭(`sips -c 864 1536`)을 폴백으로 쓴다. 단 `organize`가 canonical 원본을 다시 복사하므로 **크롭은 organize 이후 마지막 단계**로 한다.

### Phase 1d: 레퍼런스 시트 자동 생성
시트가 첨부되지 않은 시나리오 작업은 키프레임 전에 캐릭터·장소·오브젝트 시트를 먼저 만든다(첨부됐으면 시트↔시나리오 바이블의 외형 일치를 먼저 대조하고, 불일치는 컷 생성 전에 통일). 반복 등장 소품은 **오브젝트 시트로 외형을 고정**한다 — 추상 표현만 쓰면 컷마다 다른 물건이 나온다. 시트 프롬프트 템플릿 3종·슬러그·연결 방법: [references/sheets-and-anchoring.md](references/sheets-and-anchoring.md) §Phase 1d.

### Phase 1e: 씬 마스터샷 앵커링 (블로킹·공간 일관성) ★중요
씬마다 마스터샷(인물 외형과 배치가 함께 읽히는 **미디엄 와이드**) 1컷을 먼저 확정하고 후속 컷의 reference 1순위로 건다. 레퍼런스 슬롯은 4개가 상한이고, cross-category `referenceSlug`는 조용히 무시되며, 두 인물의 좌우 배치(화면축)는 어떤 컷에서도 반전하지 않는다. 절차·블로킹 고정 문구·한계: [references/sheets-and-anchoring.md](references/sheets-and-anchoring.md) §Phase 1e.

### 배경 텍스트 고정 (칠판·현판·간판·게시물) ★중요

gpt-image-2는 **글자가 들어갈 표면(칠판·액자·현판·간판·배너·게시물)이 프롬프트에 지정돼 있지 않으면 그럴듯한 한글을 지어내 채운다.** (실측: 지시하지 않은 칠판 판서 '오늘의 반장'+임의 후보명 생성, 국가명 액자('고려민국')가 '고려고등학교'로 둔갑 — 사용자가 발견.) 생성 단계 규칙:

1. **글자 표면이 보이는 컷은 정확한 문구를 한글 그대로 프롬프트에 명시**한다. 쓸 글자가 없으면 "빈 칠판"처럼 비어 있음을 명시한다. 헷갈리기 쉬운 표면은 금지 문구도 함께 명시한다(예: "이 액자는 국가 상징 '고려민국'이다. '○○고등학교' 같은 학교명을 넣지 마라"). gpt-image는 지정한 한글을 정확히 렌더링한다 (실측: 8글자 현판 '황립국민고등학교' 정확).
2. **마스터샷 앵커링은 텍스트 오류도 전파한다.** 어떤 컷을 마스터로 걸기 전에 그 컷의 배경 텍스트부터 검증한다 (실측: 액자가 잘못된 컷을 마스터로 참조한 후속 컷에 같은 오류가 그대로 전이).
3. **고유명은 생성 전에 확정.** 국가명·학교명·기관명이 소스 자료마다 다르면 컷 생성 전에 사용자에게 하나로 확정받고 spec에 못 박는다.

### 프롬프트 원리 — 금지보다 조건 ★중요

**"~하지 마라"는 잘 안 듣고 "~인 상태다"는 잘 듣는다.** 성격이 다른 결함 셋(군중 복제·간판 한글·견착)이 전부 같은 전환으로 풀렸다 — 실측 표와 예문 전문은 LESSONS C.

1. **금지어를 쓸 거면 관측된 오답을 실명으로.** 추상적 금지("틀리게 쓰지 마라")는 무효. 단 실명 나열은 **문자 표기 오답**에만 유효하고, **형태·구조의 오답은 이름을 부르는 것 자체가 역효과**다(§29).
2. **결과 대신, 그 결과가 나올 수밖에 없는 조건(자세·구도·카메라)을 지시한다.**
3. **같은 지시로 3회 실패하면 강화하지 말고 조건으로 바꿔라.** 강화는 통하지 않는다.
4. **가려질 수 있는 부품은 존재·가시성·금지의 3단으로.** 형태만 서술하면 모델이 생략을 선택한다 (실측: 개머리판이 13컷에서 통째로 사라짐).
5. **공간 관계는 "가로/세로"가 아니라 "어느 면이 어디를 향하는가" + 화면 좌표로.** 차단·엄폐는 "걸어서 통과할 열린 통로가 화면 어디에도 없다"를 덧붙인다.

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
사용자가 고른 `#NN`을 카테고리 index의 run 디렉토리에 매핑해 `--upscale-from`으로 2K(`--size 2048x1152 --quality high`) 확정한다. 커맨드: [references/pipeline-details.md](references/pipeline-details.md) §Phase 3.

### Phase 1f: 시트 커버리지 정적 검증 (생성 전 필수, 토큰 0) ★중요
키프레임 생성 전에 `scripts/check-coverage.mjs`로 각 컷이 등장 요소(인물·소품)의 시트를 reference에 걸었는지 코드로 전수 점검한다. MISS는 이미지가 아니라 spec의 `referenceGallery`를 고친다. 규칙 파일 형식·키워드 잡는 법: [references/sheets-and-anchoring.md](references/sheets-and-anchoring.md) §Phase 1f.

### 안전 필터 대응 — 반복 502 (★중요)
다른 컷은 되는데 특정 컷만 3회 이상 연속 502이면 부하가 아니라 콘텐츠 안전 필터다(미성년자 + 폭력·총기·유혈·공포·위난 조합). retry로는 안 풀린다 — 재현 톤 명시 → 직접 폭력 간접화 → 군중 위난 제거 → 미성년자 프레임 제외 순으로 최소 완화. 상세: [references/pipeline-details.md](references/pipeline-details.md) §안전 필터 대응.

### Phase 4: 검수 및 맥락 보충
다수 컷은 씬 순서대로 **전수** 검수한다(표본 금지) — 시트 일치, Rubric, 배경 글자는 크롭 확대해 읽기, 서사 연결(에스터블리싱·브릿지·리액션·전환), 보충 컷 제안, 외부 모델 교차 검증, 채택 목록↔재생성 spec 코드 대조, 전술·지형 기하, 무기는 앞뒤를 나눠 보기. 항목별 기준·커맨드: [references/pipeline-details.md](references/pipeline-details.md) §Phase 4.

### Phase 5: 딜리버리 정리
2씬 이상이면 `data/agent-runs/_{category}-delivery/` 아래 레퍼런스·씬별 폴더로 `cp`(원본 삭제 금지)하고 `open -R`로 연다. `storyboard.mjs organize`를 썼으면 생략. 폴더·파일명 규칙: [references/pipeline-details.md](references/pipeline-details.md) §Phase 5.

## 캐릭터 라이브러리 (재사용 캐릭터)
웹 UI `/studio/characters`에 등록한 캐릭터는 단일 생성 prompt에서 `@handle`로 호출된다. CLI에서는 `--reference`(URL)·`--reference-slug`·`--reference-gallery-slugs`로 같은 category의 최신 run을 연결한다. 상세: [references/pipeline-details.md](references/pipeline-details.md) §캐릭터 라이브러리.

## Prompt 카탈로그
`docs/prompts-catalog.md`의 이미지 prompt 434개(캐릭터·톤·조명·포즈·카메라·날씨 등)에서 키워드를 가져와 조합한다. 분류표: [references/prompt-skeleton.md](references/prompt-skeleton.md) §Prompt 카탈로그.

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
`data/agent-runs/{ISO-timestamp}-{slug}/`에 manifest.json·review.html·images/. [references/pipeline-details.md](references/pipeline-details.md) §Folder Naming.

## MCP (다른 세션에서 사용)
`scripts/mcp-server.mjs`의 `generate`·`generate_many`(`docs/mcp-server-setup.md`). 외부 세션의 사용법은 전역 `sionbanana-remote` 스킬이 압축해 두었다. 상세: [references/pipeline-details.md](references/pipeline-details.md) §MCP.

## Limits

- 단건 생성 60~120초. **`--batch --concurrency`로 병렬 가능** (concurrency 4 권장 안전선).
- **장시간 배치는 `SIONBANANA_GEN_TIMEOUT_MS=480000`** — 2K+다중 레퍼는 기본 180초로 부족하다. 서버는 독립 호스팅으로 (진주성 8, LESSONS E).
- Codex rate limit (사용자 ChatGPT Pro 쿼터) — 동시 과다 시 일부 429 실패 가능.
- **딜리버리 스토리보드는 2K(`2048x1152`) 기본.** 빠른 탐색은 `1824x1024`로 싸게 뽑고 베스트만 `--upscale-from`으로 2K 확정하는 흐름도 가능. 단, 사용자가 최종본을 기대하면 처음부터 2K로 생성한다.
- 2K 업스케일은 1K와 픽셀 동일하지 않음. 구도·색감 90%+ 유지 수준.
- 반복 등장 소품은 오브젝트 시트로 외형 고정 (Phase 1d). 추상 표현만 쓰면 컷마다 다른 물건이 나옴.
- 검수용 이미지는 1장당 ≤2000px. 세션에 이미지가 과다 누적되면 더 못 본다 — 분할하거나 새 세션으로 (진주성 9).
- 이미지는 로컬 디스크 저장. 생성 시 prompt 사이드카(`{id}.json`)도 저장돼 디스크에서 복원해도 prompt 유지.

---

## 규칙 인덱스 — 실측 교훈 (상세·실패 서사·예문: [references/LESSONS.md](references/LESSONS.md))

한 줄 요약이다. 번호는 원장과 동일하며 불변이다. **같은 결함이 두 번 나오면 해당 절을 열어 예문까지 읽어라.**

원장은 세 파일이다 — A·B: [references/LESSONS.md](references/LESSONS.md) · C·D: [references/LESSONS-prompt-sheets.md](references/LESSONS-prompt-sheets.md) · E·F: [references/LESSONS-pipeline-review.md](references/LESSONS-pipeline-review.md). 번호는 파일이 달라도 같다. 본문의 "LESSONS C/E/F" 표기는 이 파일들을 뜻한다.

**파이프라인 순서 (씬 단위 다컷 작업의 기본 궤도):**

```
① 자산 대장 → ② 교차검증(시트 이미지 첨부) → ③ 키프레임 게이트
→ ④ 파일럿 1컷 → ⑤ 복잡도 예산 → ⑥ 슬롯 배정 → 배치 → ⑦ 자율 검수 → 지적분만 재생성
```

**A. 프레임 설계**
- §20 ★★같은 결함 3회 반복 = 요소가 아니라 구조(구도·시점)를 의심하라. 그 구도는 내가 정했나, 물려받았나
- §32 ★★정면 얼굴 + 등 착용물 + 연결부를 한 시점에 다 보여달라면 모델이 물체를 옮긴다 — 3/4 각도로 풀거나, 노출 포기(「가려진다」)를 명시
- §34 ★★소품 시리즈는 「물건」이 아니라 「행동」으로 — 「~하고 있다」 + 반작용 명시. 정합성 통과 ≠ 목적(귀여움) 통과
- §12 인서트 다양성은 앵글이 아니라 피사체 축으로 (도구·신체·기계·대상·규모)
- §11 3회 실패하면 프레임에서 빼라 — 단 뺄 수 있는 건 장식·조연이지 신체가 아니다
- §14 뺄 것은 장식이지 전제가 아니다 — 전제를 빼면 순간이동이 된다

**B. 물리·신체·크기**
- §10 ★결과(「붙어 있다」)가 아니라 물리를 — 화면상 배치 / 접촉의 흔적 / 기하 구속 3종으로
- §18 물리 서술도 그 화각에서 화면상 커야 잡힌다 — 화각을 정한 뒤 판별 가능한 지표를 골라라
- §22 ★★물리적으로 결합된 것(크기↔자세↔소품, 연결물 양 끝)은 한 지시에 비례로 묶는다
- §23·§31 ★크기는 불변이면서 **크기가 자명한** 기준물(손가락·엄지·열쇠)로 + 절대 치수 병기 + 기준물이 피사체와 **닿아야** 작동
- §24 ★같은 면 위의 두 피사체는 「화면상 하나의 선」으로 + 원근 방향까지
- §30 ★★「안 보인다」는 가릴 외부 물체가 있어야 성립 — 없으면 신체가 소실된다. 다리는 개수 제약이 아니라 접은 자세로 통제
- §35 ★착용물은 수평·고정 조항 + 착용 통합 3조항(몸과 같은 각도 / 털·천에 파묻힘 / 안쪽 절반 가림 허용) — 시트만 걸면 빌보드가 된다

**C. 프롬프트 문장론**
- 금지보다 조건 (Workflow ★중요 절) — 부정형 대신 조건·자세로. 3회 실패 시 강화 금지. 가려지는 부품은 존재·가시성·금지 3단
- §29 ★★부정문은 그 개념을 활성화한다 — 형태·구조의 결함 명사를 프롬프트에 쓰지 마라. 스펙 빌드에 금지어 grep
- §36 ★한글 타이틀·로고는 줄마다 정확한 문자열 + 크기 역할 + 문자 보존 조건(조판 가이드 참조도 유효). 판정은 확대 + 언어 교정 끈 OCR(오타 시험 먼저) + 최종 프레임 재확인

**D. 참조·시트**
- ① 시트가 정본 — 산문 재작성 금지 (지어낸 「검은 가죽 점퍼」가 오판 14건을 만들었다). 시트가 안 정한 것은 씬이 결정해 문서화
- §19 참조 이미지의 상태가 프롬프트 문장을 이긴다 — 베이스와 「달라야 하는 점」을 명시적으로 대비
- §33 ★프롬프트 4회 실패 요소는 시트로 승격 — 단 시트는 「무엇」만 고정하고 위치·각도는 못 고정. 다패널은 목적 패널만 크롭. 시트를 산문화할 때 시트를 다시 열어 대조
- §13·§15·⑥ 슬롯 — 글로 대체 안 되는 것에만 / 그 컷의 최대 피사체는 무조건 슬롯 / 대체 가능 여부는 화각마다 재판정
- 진주성1 에셋 폴더는 하위까지 전수 조사 / 진주성3 시트도 실사 시네마틱 톤으로 (턴테이블 톤 전이)

**E. 파이프라인 운용**
- ② 교차검증엔 시트를 **이미지로** 첨부 — codex `-i`는 프롬프트를 삼키니 stdin으로, 이미지는 3장씩
- ③ ★마스터는 열어보고 쓴다 — 예외 없다. 마스터는 인물·차량 없는 공간 마스터로 (박힌 상태가 15컷에 전파됐다)
- ④ 파일럿 1컷을 확정한 뒤 골격을 복제 — 없으면 재작업 1.8배
- ⑤ 프레임이 저글링하는 항목 ≤3 — 밀도·결함 상관 r=0.17, ★를 늘리지 말고 요소를 빼라
- §17 방향은 화면 좌표가 아니라 프레임 안의 표적으로 — 공간 마스터엔 적의 방향이 없다
- §21 ★★편집은 1~2회, 이후 신규 리셋 — 12회차에 전면 붕괴. 편집 체인은 매 회차를 첫 회차와 나란히 비교
- 진주성4 대군은 부감 방진 패턴으로 그려진다 / 진주성6 전장 지리는 좌표 규약으로 / 진주성8 장시간 배치 4수칙 / 진주성9 검수 이미지 한도
- §37 ★투명 PNG는 균일한 크로마 초록으로 생성 → 색차 키·배경색 분리·번짐 억제 → 여러 바탕 확인 → 편집에 해시 고정 (투명 배경 옵션 없음, `2k-16:9` 결과 1672×941)

**F. 검수**
- ⑦ ★검수 분업 — 체크리스트를 주지 말고 자율로 열어라 (40건 vs 274건). 지적 채택률 ~60%, 근거 대조 후 채택/기각 명시. 내 전수 육안은 판정에만
- §16 ★「부재」를 별도 질문으로 — 쓰인 것만 보면 부재는 영원히 안 보인다. 입력 전체(슬롯 목록·마스터)를 주고, 내 산문 요약은 주지 마라
- §25 ★프롬프트 작성자는 1차 검수자 금지 — 검수 항목이 지시에서 나오면 지시에 없는 축은 영원히 검사 안 된다
- §26 ★검수자는 브리프를 의심하지 않는다 — 설계 오류는 검수 전에 브리프를 재독해서 잡아라
- §27 ★★긍정 판정(「통과」)도 부정 판정과 똑같이 검증하라
- §28 ★비율은 선을 그어 픽셀로, 개수는 부위 전체가 든 크롭으로, 축소본 합격은 확대로 재검
- 진주성7 검수는 적대적으로 — 흠을 먼저 찾는다. 확증편향이 가장 큰 적

---

## 표준 골격 (복사해서 쓸 것)
컷 프롬프트는 배경/장면 · 주체 · 핵심 디테일(6개 안팎, 넘으면 컷을 쪼갠다) · 제약의 네 덩어리 골격을 복사해 쓴다. 골격 전문과 작업 순서(구도·시점 확정 → 금지어 grep → 신규 생성 → 확대 검증 → 편집 1~2회): [references/prompt-skeleton.md](references/prompt-skeleton.md).
