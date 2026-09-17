# sionbanana-image-gen 참조 — 파이프라인 상세 (jobs 배열 · 업스케일 · 안전 필터 · 검수 · 딜리버리 · 캐릭터 라이브러리 · 폴더 · MCP)

`SKILL.md`에서 2026-09-17에 옮겨 온 절이다(문장 그대로). 규칙의 정본은 이 스킬이며, 각 절의 한 줄 요약은 `SKILL.md`의 같은 제목 아래에 있다.
읽는 때 — 컷마다 다른 prompt를 jobs 배열로 돌릴 때 / 고른 컷을 2K로 확정할 때 / 특정 컷만 502가 반복될 때 / 다수 컷을 검수·보충할 때 / 결과물을 씬별 폴더로 넘길 때 / 등록 캐릭터·폴더 규칙·MCP를 확인할 때.

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

### Phase 3: 확정 (업스케일)

사용자가 번호를 주면, 각 `#NN`을 카테고리 index의 run 디렉토리에 매핑 후 업스케일. `--upscale-from`이 manifest에서 revisedPrompt + reference를 자동 추출:

```bash
node scripts/agent-generate.mjs \
  --upscale-from "data/agent-runs/2026-05-16T02-38-05-879Z-attempt-02" \
  --size 2048x1152 \
  --quality high
```

여러 개면 `--batch`로 묶거나 각각 호출. 커스텀 출력명은 `--slug`.

### 안전 필터 대응 — 반복 502 (★중요)

특정 컷이 `--retry`를 줘도 **반복적으로 502 "Codex가 이미지를 반환하지 않았습니다"**로 실패하면, 서버 부하가 아니라 **콘텐츠 안전 필터가 이미지 반환을 거부**하는 신호일 수 있다. 판별 기준:

- **다른 컷은 성공하는데 특정 컷만 3회 이상 연속 502** (일시적 부하라면 재시도 시 분산되어 풀린다).
- 실패 컷의 공통 소재: **미성년자(아동) + 폭력·총기·유혈·공포·위난** 조합. (실측: 8세 아동이 총성·유혈·공포에 노출되는 3개 컷만 동시 502 → 폭력 수위 낮은 17컷은 전부 통과.)

retry로는 절대 안 풀린다. 프롬프트를 단계적으로 완화해 우회한다 (실측: 아래 순서로 3컷 전부 통과):

1. **재현 톤 명시** — 프롬프트 앞에 "역사 다큐멘터리 드라마의 재현 장면" 등을 붙여 기록·재현 맥락을 분명히 한다.
2. **직접적 폭력 표현 간접화** — "총성·피·비명·짓밟힘"을 빼고 "긴장·보호·충격의 정서"로 바꾼다.
3. **군중 패닉·위난 묘사 제거, 인물 중심으로** — 혼란 배경을 단순화하고 보호·유대 정서 중심으로 재구성한다.
4. **그래도 막히면 미성년자를 프레임에서 제외** — 주인공(성인/연장자) 단독 컷으로 재구성한다.

완화는 **정서·서사 의미를 보존**하는 선에서 최소한으로.

### Phase 4: 검수 및 맥락 보충

시나리오/스토리보드의 다수 컷 생성 후, 씬 순서대로 리뷰하며 서사 연결을 점검한다. 단일 이미지 탐색에서는 생략.

> ★ **전수 검수 원칙 (표본 금지)**: 생성된 컷은 **표본 몇 개만 보고 "좋다"고 보고하지 말 것.** 반드시 **모든 컷의 썸네일을 Read로 직접 본다.** (실측 실패: 22컷 중 6컷만 보고 통과 보고 → 안 본 17컷 중 2컷에 결함 — 사용자가 발견.) 컷이 많아 토큰이 부담되면 "전수 vs 표본"을 먼저 확인하되, 기본은 전수다.

1. **시트 일치 확인** — 각 컷의 인물·소품이 레퍼런스 시트와 같은지. Phase 1f를 통과해도 이미지가 시트와 다를 수 있으니 눈으로 재확인.
2. **검수 Rubric** 기준으로 각 컷 평가 (아래 참조)
3. **문서·간판 텍스트 확인** — 한글 문구가 스토리와 맞는지, 빈 양식이 아닌지. ★배경에 **작게** 들어간 액자·간판·판서는 썸네일 수준 검수로는 안 읽힌다 — **해당 영역을 크롭 확대해서 직접 읽는다.** 확대해 읽지 않았으면 "문제 없음"이라고 보고하지 않는다 (실측 실패: 액자 확대 안 하고 '오류 없음' 오보고 → 사용자가 발견).
4. **서사 연결 점검** — 씬 오프닝 에스터블리싱 부재 / 급격한 전환에 브릿지 컷 필요 / 주요 인물이 여러 컷 사라짐(리액션 누락) / 씬 전환 컷 부재.
5. **보충 컷 제안**: 누락을 사용자에게 보고하고 확인 후 추가 생성한다.
6. **외부 모델 교차 검증** (컷이 수십 장이면 필수에 가깝다) — 분업 원칙은 ⑦, 부재 질문은 §16, 자율 개방 질문·채택률 60% 등 상세는 LESSONS F.
7. **채택 목록과 실제 재생성 spec을 코드로 대조한다.** "채택" 판정 후 spec에 안 넣으면 그대로 누락되고 최종 보고가 틀린다 (실측).

   ```bash
   # spec에 실제로 들어간 slug
   grep -ho '"slug": *"[^"]*"' batch*.spec.json p0-fix.spec.json \
     | sed 's/.*: *"//;s/"$//' | sort -u > /tmp/regenerated.txt
   # 채택 목록(accepted.txt)과 비교 — 왼쪽에만 있으면 누락
   comm -23 <(sort -u accepted.txt) /tmp/regenerated.txt
   ```

8. **전술·지형 기하** (방어선·바리케이드·엄폐·매복·차단 컷). 축선이 맞아도 배치가 성립 안 할 수 있다: 차단물이 실제로 통로를 막는가(우회 공간이 열려 있지 않은가) / 엄폐물이 방어자와 적 **사이**인가 / 사선에 자기편 구조물이 걸리지 않는가 / 각 인물이 실제로 엄폐를 받는가. (실측: 검수자는 통과시켰고 사용자가 발견 — 체크리스트에 없었기 때문.)
9. **무기는 앞뒤를 나눠 본다.** 앞쪽(운반손잡이·총열덮개·탄창)이 정확하면 전체를 정확하다고 판정하기 쉽다. **개머리판·멜빵처럼 인물에 가려지는 뒤쪽은 별도 항목으로** (실측: 전수 검수를 하고도 개머리판 부재를 놓침).

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
│   └── ...
├── 씬2-{씬이름}/
│   └── ...
└── ...
```

규칙:
- 딜리버리 폴더는 `_{category}-delivery`로 생성한다.
- 씬 폴더명은 `씬{N}-{한글씬이름}`, 파일명은 `cut-{씬}-{번호}_{한글컷설명}.png`. 보충 컷은 `cut-{씬}-{번호}b`.
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
