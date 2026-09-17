# video-prompt-director 참조 — 컷 간 캐릭터 일관성 · 키이미지 · 긴 클립 오디오

`SKILL.md`에서 2026-09-17에 옮겨 온 절이다(문장 그대로). 작법 규칙의 정본은 이 스킬이며 새 규칙을 다른 문서에 쌓지 않는다. 각 절의 한 줄 요약은 `SKILL.md`의 같은 제목 아래에 있다.
읽는 때 — 여러 컷에 같은 캐릭터·탈것·소품이 나올 때(앵커 8슬롯) / 키이미지를 여러 번 고쳤을 때 / 15초 클립을 대사·음악으로 채울 때 / 조연·소품 문장을 쓸 때.

### 컷 간 캐릭터 일관성 — 앵커 세트 8슬롯 (2026-09-03 확정)

`[사실]` 컷별 키이미지를 **독립 생성**하고 캐릭터 시트 크롭 2장만 물렸더니, 5개 컷의 같은 캐릭터가
털색(옅은 크림↔진한 황금)·귀(늘어짐↔솟음)·얼굴 비례까지 서로 다른 개체로 나왔다.
원인은 그 2장이 **스튜디오 정면광** 컷이라 골든아워 역광·블루아워 같은 다른 조명에서 모델이 크게 재해석한 것.

**원리: 앵커는 "정답 그림"이 아니라 "변동이 일어나는 축을 미리 덮는 표본"이다.**
엔진은 `referenceImageUrl`(primary, 첫 번째로 전달돼 가장 강함) + `referenceGallery`로 **총 8장**(`MAX_REFERENCE_IMAGES`)을 받는다. 8슬롯을 축으로 채운다.

| 슬롯 | 축 | 고정하는 것 |
|---|---|---|
| **primary** | 정면 | 얼굴 비례·눈 크기와 간격·주둥이 길이 |
| 2~4 | 각도 | 45°·측면·앉은 실루엣 → 몸통·다리 비례 |
| **5~6** | **조명** | **역광·저조도에서의 고유 털색** ← 이 둘이 빠지면 조명마다 색이 튄다 |
| 7 | 질감 | 털 굵기·웨이브·결 |
| 8 | 후면 | 등·꼬리·뒷다리 |

**생성법은 누적 체인.** 앵커끼리 달라지면 세트가 무의미하므로 앞선 앵커를 전부 물린다:
`앵커1=시드 / 앵커2=시드+1 / … / 앵커8=시드+1~7`.
시드는 **승인된 실제 장면 컷**을 쓴다 — 캐릭터 시트는 레이아웃 이미지라 스튜디오·인형 톤을 강제한다.

**앵커는 주인공만이 아니다.** 탈것·상대역·주요 소품·배경 구조물도 등록한다.
(실측: 앵커로 캐릭터는 통일됐으나 아무도 고정하지 않은 용이 마지막 컷에서 청록→갈색으로 변하고 얼굴 구조가 소실됐다.
**이미 승인된 컷의 프레임을 잘라 등록하면 되고, 새로 생성할 필요가 없다.**) 8슬롯 중 2슬롯쯤은 지속 요소에 남긴다.

#### `@핸들` — 위치 지정 바인딩
`referenceHandles`로 레퍼런스에 이름을 붙이면 프롬프트에서 `@핸들`로 직접 지목할 수 있다
(`lib/studio-helpers/reference-handles.ts`, 한글 핸들 지원 → `the Nth reference image (@핸들)`로 치환).
*"첨부한 레퍼런스와 똑같이"* 라는 막연한 지시가 *"@이루얼굴과 정확히 동일한 개체"* 라는 지목이 된다.

```
★정체성 — 이것이 최우선이다:
이 강아지는 @이루얼굴과 **정확히 동일한 개체**다. 다른 개체나 다른 견종으로 바뀌면 안 된다.
@이루얼굴의 얼굴 비례·눈 크기와 간격·주둥이 길이를 그대로 유지한다.
@이루털의 털색과 털 굵기·웨이브를 유지한다. @이루옆의 몸통·다리 길이 비례를 유지한다.
조명이 달라져도 털의 고유 색은 같다. (@이루역광·@이루야간이 조명 변화의 기준이다.)
```

> **⚠ CLI도 MCP도 `referenceHandles`를 전달하지 않는다** (`scripts/storyboard.mjs`·`scripts/agent-generate.mjs` 0회, `scripts/mcp-server.mjs:224` 스키마에도 없음 — 2026-09-04 확인). `reference`/`referenceGallery`/`referenceSlug`/`referenceGallerySlugs`만 받는다.
> 핸들을 쓰려면 **`/api/generate`를 직접 호출**한다. `referenceHandles` 배열은 `[primary, ...gallery]` 순서와 1:1 정렬해야 한다.
> ```python
> opts = {"imageSize":"2k-9:16","quality":"high","count":1,"idempotencyKey":uuid4().hex,
>         "referenceImageUrl": f"/api/images/{primary}",
>         "referenceGallery": [{"url": f"/api/images/{g}"} for g in gallery7],
>         "referenceHandles": ["이루얼굴","이루45","이루옆","이루앉음","이루역광","이루야간","이루털","이루뒤"]}
> POST http://localhost:3002/api/generate  {"prompt":..., "mode":"create", "options":opts}
> ```

**한계(정직하게)**: 이건 파인튜닝(LoRA)이 아니다. 이 스택은 xAI 프록시 패스스루라 파인튜닝 경로가 없다.
앵커 세트는 그 없이 가는 최선이고, **조명에 따른 미세한 색온도 차이는 남는다**(실촬영에서도 생기므로 오히려 자연스럽다).

### 키이미지 수정은 누적된다 — 가장 깨끗한 원본에서 한 번에 다시 만든다 (2026-09-14 실측)

`[사실]` `iru-sauna-sikhye`에서 대표 지시를 하나씩 반영하느라 키이미지를 **remix로 5–6회 연달아** 고쳤다(양머리 수건 → 표정·젖은 털 → 30% 축소 → 빨대 → 엎드림). 영상을 본 대표가 **"픽셀이 뭉개졌다"**고 지적했다.
같은 위치를 첫 생성본과 대조하니 **천 질감이 도드라진 꽃무늬 문양으로 바뀌고, 흐린 배경에 자글자글한 잡티가 생기고, 색이 붉게 틀어졌다**(벽 평균색 (163,89,36) → (166,80,32)).
라플라시안 고주파 수치는 오히려 4–10% **올랐다** — 늘어난 건 디테일이 아니라 노이즈다. **선명도 수치가 올랐다고 화질이 좋아졌다고 판정하지 않는다** — 같은 위치 확대 크롭을 눈으로 대조한다.

**원리: remix는 바꾸라는 부분만 고치지 않는다. 매번 그림 전체를 다시 그리고, 그 결과가 다음 remix의 입력이 되어 결함이 복리로 쌓인다.**

- **remix 깊이는 2회까지.** 더 쌓였으면 **가장 깨끗한 원본(첫 생성본)에서 누적 변경을 한 번에 지시해** 다시 만든다. 재구성본에서 파생 컷(끝 프레임 등)을 만들 때도 1회만 remix한다 → 원본에서 2단계.
- 여러 변경을 글로만 한꺼번에 쓰면 수치 변경이 덜 먹는다(30% 축소가 덜 되어 목표보다 약 1.2배, 1표본).
- **기존 수정본을 배치 참고 전용 핸들로 함께 넣는다** — *"@완성안에서는 크기·위치·자세·소품 모양만 참고한다. @완성안의 질감·색·잡티·무늬는 절대 따르지 않는다 — 질감과 색은 @장면을 따른다."* 크기(머리띠 폭 248px, 목표 240px)와 소품 모양은 따르고 노이즈는 옮기지 않았다(2/2 — 앉은 컷·엎드린 컷). 블록아웃 `@구도`의 배제 문구와 같은 원리다.
- 화질 지시를 글로 함께 준다: *"천은 자연스러운 올 결이며 도드라진 문양이 없다. 흐린 배경은 매끈한 보케이며 잡티가 없다. 색은 @장면과 같다."*
- **크기는 %로 지시하지 않는다** — 화면 속 물체 대비 배율로 쓴다(*"양머리를 포함한 전체 키가 컵 높이의 약 1.3배, 양머리 폭은 컵 입구 폭의 약 1.2배"*). 결과는 색이 뚜렷한 요소(분홍 머리띠)의 픽셀 폭으로 잰다.

### 15초 풀필 · 오디오 레이어 — 실측 확정 (2026-08-21 E1~E3 계측 + 외부 가이드 교차)

"채울 게 없으면 표류"는 맞지만, **아래 구성이면 15초가 음성·음악·모션으로 꽉 찬다** (초당 에너지 실측: 죽은 구간 0):

1. **대사 풀필 공식 — 15초 ≈ 한국어 5문장** (문장당 ~2.5–3초). ①블록에 "speaks warmly and almost continuously for the entire clip", 문장 사이는 "a short natural breath, then:"으로 잇는다 — **휴지도 오디오 이벤트로 지시 가능**하다. 마지막 문장엔 클로징 액션(미소 등)을 묶는다. 립싱크는 정면·입 또렷한 키프레임에서 프레임 단위로 동기화된다(실측).
2. **BGM 깔개는 무음 보험.** Audio 블록에 "a soft ... BGM plays quietly and continuously from start to finish and never stops"를 깐다. 대사만 넣고 음악을 금지하면 대사 소진 후 통무음이 된다 (실측: 2문장+no music → 뒤 10초 무음 / 5문장+BGM 깔개 → 무음 0). 오디오를 아예 안 쓰면 모델이 임의 BGM을 넣으므로(외부 가이드), **무음이 필요할 때만** "no background music" — 이 금지는 확실히 이행된다.
3. **오디오 3레이어 문법 작동.** `Audio layers:` 뒤에 base(연속 BGM) / top(내레이션·대사) / accent(이벤트 SFX)를 명시하면 공존한다(실측). **화면 밖 내레이터 VO도 된다** — 단 내레이션은 앞쪽 1~5초에 몰리는 경향, 이후는 base가 이어받는다. 이벤트 SFX는 "a soft pop sparkle each time a panel lights up"처럼 화면 이벤트에 건다.
4. **타임라인은 First / Then / Finally 3비트.** 액션·카메라·오디오 아크가 전부 이 순차 구문을 따라간다 (실측: 3단 동작, hold→tilt-down→push-in, soft→build→chime 모두 착지). 초 수치("0–5s")보다 순차 접속사가 신뢰된다.
5. **카메라 고정 문구는 "camera not moving"** (또는 "absolutely locked static ... on a tripod, no push-in, no pan"). "stable camera"/"steady shot"은 부드러운 무빙 묘사로 오해된다(외부 가이드).
   단 **①로 만든 10초 원테이크는 "no zoom, no push-in … the camera never moves closer"를 써도 1.11배 푸시인이 났다**(2026-09-14, 2/2). 고정이 서사면 **② 시작=끝 같은 키이미지**로 잠근다(§영상 변환 3모드).
6. **VFX 입자 어휘**: golden light particles drift / dust particles swirl / volumetric haze / heat shimmer / rain in the foreground / thin smoke. **스택은 2~3개까지만.**

### 조연·소품 문장 — 실측 (2026-09-14 `iru-sauna-sikhye`, 원테이크 9테이크)

- **조연을 "가만히 앉아 있다"로 쓰면 마네킹이 된다**(대표 지적). 얼굴 노출 방지는 *"seen only from the shoulders down … her face is never shown"*만으로 9테이크 모두 지켜졌다 — 컵을 화면 위로 들어 올려 마시는 동작 중에도.
- **조연 동작은 초 단위 시점과 몸의 구체 동작으로 쓴다.** *"twice during the video she … takes a sip"*는 긴 주인공 묘사 뒤에 묻혀 **0회**였다. *"At about 1 second she slowly lifts her cup with both hands up to her upper chest, her straw reaching her mouth just above the top edge of the frame … lowers the cup back to her lap by about 4 seconds; at about 6 seconds she lifts it the same way …"*는 **두 번 모두 이행**했다. 5초 클립의 *"at the very beginning"*도 이행했다.
- **조연이 움직이면 주인공이 반응한다.** 여성이 마시기 시작하자 강아지가 뒷발로 서서 여성 허벅지에 앞발을 올리고 컵 쪽으로 몸을 뻗었다 — 몸통·다리가 늘어나 비례가 무너졌다(대표는 귀엽다고 수용). 주인공 문장에 *"it never stands up"*이 이미 있었는데도 무시됐다. 주인공이 제자리여야 하면 **조연 행동에 묶어** 쓴다: *"even while she drinks, it stays seated and only looks at her with its eyes; it never puts its paws on her or reaches toward her cup."* `[미검증]`
- **소품 이름에 동물 단어를 쓰지 않는다.** *"sheep-head towel"(양머리 수건)*은 3테이크 중 2번 눈·귀 달린 동물 모자로 변했다. *"a plain terry-cloth towel wrapped around its head like a headband, its two ends rolled into small round buns — just folded fabric with no face, no eyes, no animal ears and no pattern"*으로 바꾼 뒤 6/6 유지.
