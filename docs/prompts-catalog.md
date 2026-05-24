# 시온바나나 이미지 생성 Prompt 카탈로그 (v5.0)

> 자동 생성 — 코드 기준. prompt 메이커 참고/복붙용.

## 목차
1. 캐릭터
2. 360도 턴어라운드
3. 캐릭터 시트 (6패널)
4. 톤 (20)
5. Cinematography (19)
6. 외부 프리셋 (91)
7. 합성 로직 (continuity / reference map / storyboard)

## 1. 캐릭터

출처: `components/studio/preset-config.ts`

### Base Prompt

캐릭터 단일 이미지 기본 prompt fallback.

```
High-resolution single shot of the supplied character, maintain exact likeness, outfit, and proportions, pure white seamless studio background with even lighting.
```

### Single View Guideline

한 번에 하나의 뷰만 생성하도록 강제하는 지침.

```
Render exactly one image focused on this specified view. Do not create collages, turnarounds, sprite sheets, or multiple angles.
```

### Negative Enforcement

캐릭터 단일 뷰에서 금지할 구성/불일치 요소.

```
collage, multi view, multiple angles, turnaround sheet, reference sheet, sprite sheet, split screen, grid layout, duplicated pose, mirrored duplicates, text labels, different character, different costume, different hairstyle
```

### Character Views (6)

#### front — 프론트 뷰

```
Front-facing single shot of the reference character, matching outfit and features, facing the camera head-on, balanced pose, pure white seamless background with even lighting
```

#### three-quarter — 3/4 뷰

```
Three-quarter single shot of the reference character from the left side, consistent silhouette and costume details, clear depth in shoulders and torso, pure white seamless backdrop with even lighting
```

#### side — 사이드 뷰

```
Pure side-profile single shot of the reference character facing to the right, full silhouette visible with matching hairstyle and clothing, evenly lit against a pure white background
```

#### rear — 후면 뷰

```
Back view single shot of the reference character standing straight, outfit and hair clearly outlined, pure white background with uniform studio lighting
```

#### full-body — 전신 뷰

```
Full body single shot of the reference character in a relaxed A-pose, entire figure visible with consistent proportions, pure white seamless background with even lighting
```

#### face-closeup — 페이스 클로즈업

```
Face close-up single shot of the reference character, neutral expression, centered composition, facial details matching the reference, soft even lighting on a pure white background
```

## 2. 360도 턴어라운드

출처: `components/studio/preset-config.ts`

### Base Prompt

참조 이미지의 환경을 유지한 채 카메라만 회전시키는 턴어라운드 기본 prompt fallback.

```
Photograph the exact same subject from the reference image at multiple camera angles by rotating the camera around them. The original scene, background, environment, props, lighting, time of day, and atmosphere from the reference image must remain perfectly identical across every shot. This is on-location photography in the same environment, not a studio session. Only the camera viewpoint changes; the subject's identity, outfit, pose, expression, and surroundings stay exactly as in the reference.
```

### Negative Enforcement

캐릭터 negative에 턴어라운드용 포즈/환경 불일치 금지어를 더한 실제 값.

```
collage, multi view, multiple angles, turnaround sheet, reference sheet, sprite sheet, split screen, grid layout, duplicated pose, mirrored duplicates, text labels, different character, different costume, different hairstyle, different pose, dynamic pose, action stance, arms raised, animated motion, inconsistent lighting, mismatched angle, different camera height, different facial expression, closed eyes, blinking, motion blur, white studio backdrop, blank background, character sheet, reference sheet layout, subject removed from original scene, relocated to studio
```

### Single View Guideline

턴어라운드에서 캐릭터는 움직이지 않고 카메라만 회전하도록 하는 지침.

```
Maintain the exact same pose, expression, limb placement, and camera distance as the reference image. Only rotate the camera around the character; do not move or animate the character.
```

### Turnaround Views (12)

#### angle-000 — 0° 정면

```
Camera rotation 0 degrees relative to the supplied reference image, front view of the same character facing directly toward the camera, identical features and outfit, neutral stance
```

#### angle-030 — 30° 우측 전면

```
Camera rotation +30 degrees to the right around the reference character, front-right view showing more of the right shoulder while both eyes remain visible, identical design to the reference
```

#### angle-060 — 60° 우측

```
Camera rotation +60 degrees to the right around the reference character, right-facing view with clear overlap of the right side of the torso and face, same hairstyle and costume as the reference
```

#### angle-090 — 90° 우측 측면

```
Camera rotation +90 degrees to the right, pure right profile view of the reference character with an accurate silhouette, features and outfit identical to the reference
```

#### angle-120 — 120° 우측 후면

```
Camera rotation +120 degrees to the right, rear-right view that reveals back details and a glimpse of the right side, keeping the exact outfit and proportions from the reference
```

#### angle-150 — 150° 우측 뒤

```
Camera rotation +150 degrees to the right, back-right view primarily showing the back while hinting at the right shoulder, same character design as the reference
```

#### angle-180 — 180° 후면

```
Camera rotation +180 degrees, back view of the reference character standing straight, outfit and hair fully visible from behind, perfectly matching the reference
```

#### angle-210 — 210° 좌측 뒤

```
Camera rotation +210 degrees continuing around to the left side, back-left view mainly showing the back with a subtle glimpse of the left shoulder, identical outfit details
```

#### angle-240 — 240° 좌측 후면

```
Camera rotation +240 degrees to the left, rear-left view highlighting back details with overlapping left-side elements, matching the reference character exactly
```

#### angle-270 — 270° 좌측 측면

```
Camera rotation +270 degrees, pure left profile view with a clean silhouette, same hairstyle, outfit, and proportions as the reference
```

#### angle-300 — 300° 좌측 전방

```
Camera rotation +300 degrees, left-front view showing more of the left shoulder while both eyes remain visible, design perfectly aligned with the reference
```

#### angle-330 — 330° 좌측 전면

```
Camera rotation +330 degrees, front-left view nearly facing forward with a slight turn toward the viewer's left side, maintaining identical character likeness
```

## 3. 캐릭터 시트 (6패널)

출처: `components/studio/preset-config.ts`

### Base Prompt

6패널 캐릭터 시트의 배경, 비율, 렌더 스타일, 조명 기준.

```
Single character sheet image, 16:9 aspect ratio, clean solid mid-grey background (#808080, no gradient or texture). Render style matching the reference image exactly (photorealistic, identical texture, color, density). 3-point lighting consistent across all panels: soft key light from front-upper 45 degrees, soft side fill to reduce shadows, subtle rim backlight for silhouette separation. Minimize hard shadows.
```

### Layout Instruction

왼쪽 전신 2패널, 오른쪽 얼굴 2x2 그리드 구성.

```
Layout (16:9 split): LEFT 50% = two full-body shots side-by-side, left panel = front view, right panel = back view, both in standard A-pose (arms about 15 degrees from torso, palms facing inward, feet shoulder-width, balanced weight, neutral expression, eye-level camera, character fills frame edge-to-edge, identical size and vertical alignment between panels). RIGHT 50% = four face close-ups in 2x2 grid: top-left = front (0 degrees), top-right = left 3/4 view (45 degrees), bottom-left = right 3/4 view (45 degrees), bottom-right = left profile (90 degrees). All face panels share identical face size (chin-to-crown = 80% of panel height), neutral expression with mouth closed naturally. Gaze: front panel toward camera, others naturally toward their angle direction. No head movement except rotation angle. Even panel spacing, precise grid alignment, no labels or text
```

### Single View Guideline

한 장 안에 6패널이 모두 들어가도록 하는 지침.

```
Render all 6 panels in one single coherent image with precise grid alignment.
```

### Negative

시트에서 금지할 정체성/표정/배경/레이아웃 오류.

```
different identity, different costume, different hairstyle, expression change, smile, mouth open, multiple separate characters, white background, gradient background, textured background, colored background, hard shadows, inconsistent lighting, text labels, panel numbers, watermarks, misaligned grid, uneven panel spacing, missing panels
```

### View

#### character-sheet-6panel — 캐릭터 시트

```
Layout (16:9 split): LEFT 50% = two full-body shots side-by-side, left panel = front view, right panel = back view, both in standard A-pose (arms about 15 degrees from torso, palms facing inward, feet shoulder-width, balanced weight, neutral expression, eye-level camera, character fills frame edge-to-edge, identical size and vertical alignment between panels). RIGHT 50% = four face close-ups in 2x2 grid: top-left = front (0 degrees), top-right = left 3/4 view (45 degrees), bottom-left = right 3/4 view (45 degrees), bottom-right = left profile (90 degrees). All face panels share identical face size (chin-to-crown = 80% of panel height), neutral expression with mouth closed naturally. Gaze: front panel toward camera, others naturally toward their angle direction. No head movement except rotation angle. Even panel spacing, precise grid alignment, no labels or text
```

## 4. 톤 (20)

출처: `lib/story-tones.ts`

### 시네마틱 (5)

#### teal-orange — 틸앤오렌지

설명: 차가운 그림자와 따뜻한 하이라이트의 영화색

```
Style: cinematic teal and orange color grading, cool shadows, warm highlights, polished contrast.
```

#### blockbuster — 블록버스터

설명: 스케일감 있는 상업 영화 룩

```
Style: high-budget blockbuster cinema, dramatic scale, crisp lighting, dynamic depth.
```

#### war-grit — 전쟁/그릿

설명: 거칠고 desaturated된 전쟁 드라마 톤

```
Style: gritty war drama realism, desaturated palette, harsh light, smoky atmosphere.
```

#### neo-noir — 누아르

설명: 저조도와 깊은 그림자의 현대 누아르

```
Style: modern noir cinema, low-key lighting, deep shadows, moody contrast.
```

#### fantasy-epic — 판타지/에픽

설명: 웅장하고 빛의 윤곽이 강한 판타지 영화톤

```
Style: epic fantasy cinema, grand atmosphere, luminous rim light, painterly realism.
```

### 광고 (5)

#### luxury-premium — 럭셔리

설명: 고급 소재와 정제된 조명의 프리미엄 광고

```
Style: luxury commercial photography, refined lighting, premium materials, elegant polish.
```

#### minimal-product — 미니멀 프로덕트

설명: 깨끗한 구성과 스튜디오 조명

```
Style: minimal product campaign, clean composition, soft studio lighting, precise details.
```

#### fashion-editorial — 패션 에디토리얼

설명: 잡지 화보식 스타일링과 포즈

```
Style: fashion editorial campaign, bold styling, confident poses, magazine-grade lighting.
```

#### food-commercial — 푸드 광고

설명: 식감과 신선함이 잘 보이는 광고 톤

```
Style: appetizing food commercial, fresh texture, warm inviting light, natural color.
```

#### tech-modern — 테크/모던

설명: 세련된 표면감과 미래적인 절제

```
Style: modern tech advertising, sleek surfaces, clean highlights, futuristic restraint.
```

### 다큐 (5)

#### nature-doc — 자연다큐

설명: 자연광과 관찰자 시점의 리얼리즘

```
Style: nature documentary realism, natural light, patient observation, lifelike color.
```

#### photojournalism — 포토저널리즘

설명: 현장감 있는 캔디드 보도사진 톤

```
Style: photojournalistic realism, candid framing, available light, truthful detail.
```

#### black-white-doc — 흑백 다큐

설명: 톤 대비와 입자가 있는 흑백 기록물

```
Style: black and white documentary, tonal contrast, grain, honest atmosphere.
```

#### vintage-film-doc — 빈티지 필름

설명: 바랜 색과 필름 입자의 아카이브 느낌

```
Style: vintage film documentary, subtle grain, faded color, archival realism.
```

#### digital-realism — 디지털 리얼리즘

설명: 중립 색감과 선명한 현대 디지털 기록

```
Style: contemporary digital realism, neutral color, sharp detail, natural exposure.
```

### Vlog (5)

#### daily-vlog — 데일리

설명: 편안한 일상 브이로그 톤

```
Style: casual daily vlog, handheld feel, soft natural light, approachable realism.
```

#### travel-vlog — 트래블

설명: 장소감과 활기가 살아있는 여행 영상 톤

```
Style: travel vlog, vivid location detail, golden-hour warmth, energetic framing.
```

#### lifestyle-vlog — 라이프스타일

설명: 정돈된 실내와 자연광의 생활감

```
Style: lifestyle vlog, cozy interiors, clean daylight, relaxed candid mood.
```

#### food-vlog — 푸드 vlog

설명: 테이블 근접샷과 따뜻한 자연광

```
Style: food vlog, close-up texture, casual tabletop framing, warm natural light.
```

#### nostalgic-vlog — 노스탤직

설명: 따뜻하고 부드러운 추억 영상 톤

```
Style: nostalgic vlog, gentle film look, warm memories, soft contrast.
```

## 5. Cinematography (19)

출처: `lib/story-cinematography.ts`

### Framing Options (7)

#### extreme-long-shot — 익스트림 롱샷

설명: 장소와 인물의 관계를 크게 보여주는 넓은 원경입니다. 코드: ELS

```
extreme long shot
```

#### long-shot — 롱샷

설명: 인물 전신과 주변 공간을 함께 잡는 원경입니다. 코드: LS

```
long shot
```

#### full-shot — 풀샷

설명: 인물 전신의 자세와 실루엣을 중심으로 보여줍니다. 코드: FS

```
full shot
```

#### medium-shot — 미디엄샷

설명: 상반신과 행동을 균형 있게 담는 기본 구도입니다. 코드: MS

```
medium shot
```

#### medium-close-up — 미디엄 클로즈업

설명: 표정과 몸짓을 함께 읽을 수 있는 가까운 구도입니다. 코드: MCU

```
medium close-up
```

#### close-up — 클로즈업

설명: 얼굴, 손, 핵심 오브젝트의 감정과 디테일을 강조합니다. 코드: CU

```
close-up
```

#### extreme-close-up — 익스트림 클로즈업

설명: 눈빛이나 소품 일부처럼 아주 작은 디테일을 강하게 보여줍니다. 코드: ECU

```
extreme close-up
```

### Angle Options (6)

#### eye-level — 아이레벨

설명: 피사체와 같은 높이에서 안정적이고 자연스럽게 바라봅니다.

```
eye-level angle
```

#### high-angle — 하이앵글

설명: 위에서 내려다보며 피사체를 작거나 취약하게 느끼게 합니다.

```
high-angle composition
```

#### low-angle — 로우앵글

설명: 아래에서 올려다보며 피사체의 존재감과 긴장감을 키웁니다.

```
low-angle composition
```

#### dutch-angle — 더치앵글

설명: 기울어진 프레임으로 불안, 혼란, 에너지를 더합니다.

```
dutch-angle composition
```

#### birds-eye — 버드아이

설명: 높은 수직 시점으로 배치와 동선을 한눈에 보여줍니다.

```
bird's-eye view
```

#### worms-eye — 웜아이

설명: 극단적으로 낮은 시점에서 규모감과 압도감을 만듭니다.

```
worm's-eye view
```

### Special Options (6)

#### over-the-shoulder — OTS

설명: 어깨 너머 시점으로 대화와 관계의 긴장을 보여줍니다.

```
over-the-shoulder view
```

#### point-of-view — POV

설명: 인물의 눈으로 보는 주관적 시점을 만듭니다.

```
point-of-view shot
```

#### insert-shot — 인서트

설명: 손, 편지, 열쇠 같은 핵심 디테일을 별도 컷처럼 강조합니다.

```
insert shot
```

#### reaction-shot — 리액션

설명: 사건에 반응하는 표정과 감정을 중심으로 잡습니다.

```
reaction shot
```

#### establishing-shot — 이스태블리싱

설명: 장소, 시간대, 분위기를 먼저 이해시키는 도입 컷입니다.

```
establishing shot
```

#### two-shot — 투샷

설명: 두 인물을 한 프레임에 담아 관계와 거리를 보여줍니다.

```
two-shot
```

### Cinematography Suffix Format

framing, angle, special을 최종 이미지 prompt에 붙일 때의 형식.

```
Camera: ${framing.keyword}, ${angle.keyword}, ${special.keyword}.
```

## 6. 외부 프리셋 (91)

출처: `components/studio/external-preset-config.ts`

### Cases 01-10

#### case-01 — #01 Character Figure Display / #01 일러스트 피규어 연출

```
Transform the uploaded subject photo into a stylized character figure display. Place a character-printed box behind the figure, show the Blender modeling process on a nearby computer screen, add a round plastic base with the figure standing on it in front, and stage the entire setup indoors.
```

#### case-02 — #02 Arrow Point-of-View / #02 지도 화살표 시점

```
Render the scene that the red arrow in the uploaded Google Maps screenshot is pointing toward. If a red circle is included, generate the perspective from that circled spot facing the arrow's direction.
```

#### case-03 — #03 AR Site Highlight / #03 AR 위치 강조

```
You are a location-based augmented reality experience generator. Highlight the [Target Location] within the uploaded photograph, add relevant annotations, and make sure the image explicitly labels the spot as [Target Location].
```

#### case-04 — #04 Isometric Building Extraction / #04 등축 건물 추출

```
Convert the uploaded scene to daytime lighting, isolate only the [building] (or specified subject), and reinterpret it as an isometric projection model.
```

#### case-05 — #05 Vintage Era Restyle / #05 시대별 스타일 변환

```
Restyle this character into a classic [1970s] [male] look. Add [long curly hair] and [long mustache], change the background to an iconic [California summer landscape], and keep the face unchanged.
```

#### case-06 — #06 Multi-Reference Fashion Shoot / #06 다중 참고 패션 촬영

```
Using the supplied references, create a photo where a model leans against a pink BMW while wearing the listed props. Include a green alien keychain attached to a pink handbag, a pink parrot on the model's shoulder, and a pug with a pink leash and gold headphones sitting nearby against a light gray background.
```

#### case-07 — #07 Vibrant Photo Edit / #07 다채로운 사진 보정

```
This photo feels too plain. Make it vibrant by boosting contrast, enriching the colors, and brightening the lighting. Feel free to crop or adjust the composition if it helps the result.
```

#### case-08 — #08 Fight Pose Reimagining / #08 격투 포즈 연출

```
Use the pose from the third reference image to stage the two characters in a fight, add an appropriate background, and ensure the final image is rendered in a 16:9 ratio.
```

#### case-09 — #09 Aerial Perspective Conversion / #09 조감도 시점 변환

```
Convert the ground-level photo into an overhead bird's-eye view and mark the photographer's original position.
```

#### case-10 — #10 Custom Character Sticker / #10 캐릭터 스티커 제작

```
Turn the character from the second image into a sticker with a white outline. Render the character in a clean web illustration style and add a short caption beneath it that describes the motif from the first image.
```

### Cases 11-20

#### case-11 — #11 Comic-Con Cosplayer / #11 애니 → 실사 코스프레

```
Transform the girl in the illustration into a cosplayer standing at Comic-Con, keeping the character design recognizable in a real-life photo.
```

#### case-12 — #12 Full Character Design Suite / #12 캐릭터 디자인 세트

```
Create a comprehensive character design package: proportion breakdowns, front/side/back views, an emotion sheet, a pose sheet with varied common poses, and multiple outfit explorations, matching the supplied references.
```

#### case-13 — #13 Palette Transfer / #13 팔레트 색상 적용

```
Recolor the character in image 1 using exactly the color palette from image 2.
```

#### case-14 — #14 Article Infographic Poster / #14 기사 인포그래픽 포스터

```
Turn the uploaded article into an infographic poster: translate it into English, extract the key information, keep the layout concise with only major headings, use English text, and add colorful cute cartoon characters and elements.
```

#### case-15 — #15 Hairstyle Grid / #15 헤어스타일 3x3

```
Generate a 3x3 grid of avatars of this person, each featuring a distinct hairstyle.
```

#### case-16 — #16 Annotated Heart Model / #16 3D 심장 모델 주석

```
Draw a highly realistic, detailed, academically annotated [3D human heart model] suited for a scholarly presentation, including notes and explanations of each [organ] function.
```

#### case-17 — #17 Marble Sculpture Portrait / #17 대리석 조각 연출

```
Create a lifelike marble sculpture of the subject, showcasing polished reflective surfaces, elegant forms, and lighting that highlights the craftsmanship.
```

#### case-18 — #18 Ingredient-to-Meal Shot / #18 재료로 요리 완성

```
Use the provided ingredient photos to cook a delicious lunch, plate it neatly, remove other dishes and ingredients from the scene, and zoom in on the plated meal.
```

#### case-19 — #19 Math Answer Overlay / #19 수학 정답 기입

```
Solve the uploaded math problem and write the correct answer in the designated blank area of the sheet.
```

#### case-20 — #20 Photo Restoration and Colorization / #20 옛 사진 복원 채색

```
Restore and colorize the old photograph, enhancing clarity while preserving authenticity.
```

### Cases 21-30

#### case-21 — #21 OOTD Style Merge / #21 OOTD 스타일 합성

```
Dress the person from photo 1 in the outfit and accessories from photo 2. Preserve their identity and pose, and capture vivid full-body OOTD shots outdoors in natural light.
```

#### case-22 — #22 Outfit Swap / #22 의상 변경

```
Replace the clothing on the person with the outfit from the target image while keeping the pose, expression, background, and realistic lighting consistent.
```

#### case-23 — #23 Multi-Angle Reference Sheet / #23 다각도 자료 시트

```
Create uniformly spaced front, back, left, right, top, and bottom views of the subject on a white background, including both isometric and perspective versions.
```

#### case-24 — #24 Noir Detective Storyboard / #24 느와르 탐정 콘티

```
Using the two reference characters, craft a 12-panel black-and-white noir detective storyboard about a thrilling treasure hunt, conveying the entire story through imagery without any text.
```

#### case-25 — #25 Face Forward Adjustment / #25 정면 바라보기 수정

```
Modify the person so they turn to face forward while staying true to their appearance.
```

#### case-26 — #26 Studio Pose Transfer / #26 포즈 전환 스튜디오샷

```
Apply the pose from photo 2 to the subject in photo 1 and render it as a professional studio photograph.
```

#### case-27 — #27 Trump Watermark / #27 'TRUMP' 워터마크

```
Fill the entire image with a repeating watermark that says "TRUMP."
```

#### case-28 — #28 Tallest Buildings Infographic / #28 정보 인포그래픽

```
Design a colorful infographic covering the five tallest buildings in the world or, alternatively, the sweetest things in the world, using playful data visualization.
```

#### case-29 — #29 Red Pen Critique / #29 빨간펜 피드백

```
Analyze the image and add red-pen annotations pointing out areas that need improvement.
```

#### case-30 — #30 Exploding Ingredients Shot / #30 폭발하는 음식 연출

```
Shoot a dynamic modern product photo where the product's fresh ingredients burst outward, showcasing freshness and nutrition against the brand's signature background color with no text.
```

### Cases 31-40

#### case-31 — #31 Superhero Comic Book / #31 슈퍼히어로 만화책

```
Based on the uploaded images, create a comic book with text that tells an exciting superhero story.
```

#### case-32 — #32 Custom Action Figure / #32 맞춤 액션 피규어

```
Design an action figure titled "AI Evangelist - Chris" using the subject as the base and highlighting [coffee, turtle, laptop, phone, headphones] as featured accessories.
```

#### case-33 — #33 Isometric Landmark Park / #33 지도 등축 건물

```
Transform the landmark at the provided map location into an isometric game-style amusement park scene focused on the buildings.
```

#### case-34 — #34 Expression Swap / #34 표정 변경

```
Apply the facial expression from image 2 to the character in image 1 while maintaining the original art style.
```

#### case-35 — #35 Four-Stage Illustration / #35 4컷 제작 과정

```
Create a four-panel sequence of the illustration process: 1) line art, 2) flat colors, 3) shadows, 4) final polish, with no text.
```

#### case-36 — #36 Makeup Transfer / #36 메이크업 이식

```
Apply the makeup from photo 2 to the person in photo 1 while preserving their pose and features.
```

#### case-37 — #37 Red Pen Improvement Marks / #37 빨간펜 개선 표시

```
Review the character image and mark improvement points using red pen annotations.
```

#### case-38 — #38 Middle-earth Street View / #38 중간계 스트리트 뷰

```
Generate a dashcam-style Google Street View image of [Hobbiton Street] with hobbits performing daily tasks like gardening and smoking pipes on a clear day.
```

#### case-39 — #39 Typographic Bicycle Illustration / #39 타이포 자전거 일러스트

```
Create a minimal black-and-white typographic illustration of "riding a bicycle" using only the letters of the phrase to form the rider, bike, and motion while keeping the text legible.
```

#### case-40 — #40 Pose Sheet / #40 포즈 표 제작

```
Use the reference drawing to build a pose sheet that shows the character in a variety of stances.
```

### Cases 41-50

#### case-41 — #41 Packaging Render / #41 제품 패키징 연출

```
Wrap the can from photo 2 in the design from photo 1 and present it as a minimalist professional product photograph.
```

#### case-42 — #42 Material Overlay / #42 재질 오버레이

```
Apply the [glass] effect from image 2 onto image 1.
```

#### case-43 — #43 Chibi Face Shape Match / #43 SD 얼굴형 변환

```
Redesign the character from image 1 as a chibi version that follows the face shape from image 2.
```

#### case-44 — #44 Lighting Match / #44 조명 매칭

```
Change the lighting on the character from image 1 to match the lighting reference in image 2, using shadows for the dark regions.
```

#### case-45 — #45 LEGO Minifigure Box / #45 레고 미니피규어 박스

```
Turn the subject into a LEGO minifigure packaging shot titled "ZHOGUE," including the boxed figure with accessories and an additional out-of-box minifigure rendered realistically from a slightly elevated angle.
```

#### case-46 — #46 Mecha Model Box / #46 건담 프라모델 박스

```
Convert the subject into a Gundam-style model kit box titled "ZHOGUE," with a mech interpretation, futuristic accessories, technical illustrations, sci-fi typography, and a realistically rendered out-of-box figure.
```

#### case-47 — #47 DSLR Exploded Diagram / #47 DSLR 분해도

```
Create an exploded view of a DSLR that reveals every accessory and internal component—lens, filters, internals, sensor, screws, buttons, viewfinder, housing, and circuit boards—while retaining the camera's red accents.
```

#### case-48 — #48 Calorie Labeling / #48 칼로리 표기

```
Label the food with its name, calorie density, and approximate total calories.
```

#### case-49 — #49 Subject Cutout / #49 대상 추출

```
Extract the [samurai] or specified subject from the image and place it on a transparent background.
```

#### case-50 — #50 Transparency Fix / #50 체크무늬 복원

```
Fill in the transparent checkerboard regions of the image to restore a complete, consistent photograph.
```

### Cases 51-60

#### case-51 — #51 New Amsterdam 1660 / #51 1660 뉴암스테르담 재현

```
Recreate 1660 New Amsterdam as a full-color modern photograph captured today.
```

#### case-52 — #52 Fashion Mood Board / #52 패션 무드보드

```
Make a fashion mood board collage featuring cutouts of the outfit items around the portrait, playful marker-style handwritten notes, brand and source labels in English, and a cute creative vibe.
```

#### case-53 — #53 Miniature Product Photo / #53 미니어처 제품 사진

```
Shoot a high-resolution advertising photo of a realistic miniature [product] held delicately between thumb and index finger against a clean white background with soft studio lighting and shallow depth of field.
```

#### case-54 — #54 Giant Statue Installation / #54 거대 동상 설치

```
Create a realistic photo of a massive statue of the subject installed in a central Tokyo plaza with people gazing up at it.
```

#### case-55 — #55 Anime Itasha / #55 애니 랩핑카

```
Produce a photo of an anime-themed Itasha sports car decorated with the provided character art, showcased at a famous scenic tourist landmark under flattering natural light.
```

#### case-56 — #56 Manga Layout / #56 만화 컷 구성

```
Using the character and layout references, design a manga panel composition for the scene.
```

#### case-57 — #57 Manga Line Conversion / #57 흑백 만화 스타일

```
Convert the input photo into a black-and-white manga-style line drawing.
```

#### case-58 — #58 Holographic Wireframe / #58 홀로그래픽 와이어프레임

```
Transform the provided wireframe drawing into a holographic-style image.
```

#### case-59 — #59 HD-2D Minecraft Landmark / #59 HD-2D 마인크래프트

```
Generate an HD-2D Minecraft-style isometric rendering of the landmark buildings at the given location.
```

#### case-60 — #60 Materialized Logo / #60 로고 재질 적용

```
Apply the material from image 2 to the logo in image 1, render it as a 3D object in a Cinema4D-like style, and place it on a solid-color background.
```

### Cases 61-70

#### case-61 — #61 Floor Plan to 3D / #61 평면도 3D 렌더링

```
Transform the uploaded floor plan into a realistic 3D rendering of the home.
```

#### case-62 — #62 Camera Settings Overlay / #62 카메라 세팅 표기

```
Render the scene with camera settings RAW, ISO [100], aperture [F2.8], shutter 1/200, focal length 24mm, or substitute the provided values.
```

#### case-63 — #63 Passport Photo / #63 증명사진 만들기

```
Crop the head to create a 2-inch passport photo with a blue background, professional business attire, face forward, and a slight smile.
```

#### case-64 — #64 Pop-Up Card / #64 A6 팝업 카드

```
Design an A6 folding card that opens to reveal a 3D miniature globe house, paper garden, and bonsai tree.
```

#### case-65 — #65 Chess Set Concept / #65 체스 디자인

```
Design a chessboard and 3D-printable chess pieces inspired by the provided reference photo.
```

#### case-66 — #66 Split-Era Room / #66 양분된 시대 방

```
Illustrate the bedroom split down the middle, with the left side as 2018 and the right side as 1964, showing the same room in both eras.
```

#### case-67 — #67 Jewelry Collection / #67 쥬얼리 컬렉션

```
Convert the subject into five distinct jewelry collectibles.
```

#### case-68 — #68 Character Merchandise / #68 캐릭터 굿즈 디자인

```
Create merchandise concepts featuring the provided character image.
```

#### case-69 — #69 Hologram Desk Display / #69 홀로그램 데스크

```
Produce a surreal product photo with a virtual hologram character [CHARACTER] floating above a 120mm circular projector on a modern desk. Follow the rules: add a desktop 3D scanner if the reference object is 3D, or a monitor showing the reference if it is 2D; render the hologram as a translucent volume with natural anatomy, expressive face, no beams or particles, no copyrighted IP, camera 85-100mm at eye level, f/11-f/16, ISO100, studio lighting, black seamless background with subtle reflections, 4:5 ratio at 2048x2560px, negative prompt forbidding text, logos, IP, resin, PVC, solid surfaces, rays, scanlines, dots, distortion, extra numbers; deterministic sampling, Seed=12345, Temperature=0.
```

#### case-70 — #70 Giant Selfie Scaffolding / #70 거대 인물 비계

```
Create a surreal 3D rendering of the person taking a selfie while surrounded by massive scaffolding with countless tiny construction workers, set in a bustling city square with modern buildings, traffic, pedestrians, a bright blue sky, rich detail, and cinematic lighting.
```

### Cases 71-80

#### case-71 — #71 Remote Sensing Extraction / #71 원격탐사 건물 추출

```
Remove everything in the remote-sensing image except the buildings.
```

#### case-72 — #72 Component Cut Sheet / #72 부품 추출 시트

```
Cut each part of the model out to build a hologram-preserving component sheet.
```

#### case-73 — #73 Bun-Only Burger / #73 빵만 남긴 버거

```
Remove all fillings from the hamburger, leaving only the top and bottom buns separated slightly so it still appears filled.
```

#### case-74 — #74 High-Res Restoration / #74 이미지 고해상도 복원

```
Enhance the resolution of the old image, adding appropriate texture detail while reinterpreting it with modern animation techniques.
```

#### case-75 — #75 Isometric Miniature / #75 미니어처 아이소메트릭

```
Convert the scene into an isometric miniature diorama.
```

#### case-76 — #76 Future Doodle Cards / #76 미래 과학 카드

```
Generate multiple 16:9 doodle-style illustrations that explain the concept of "future" to middle-schoolers, using uniform bold colored-pencil styling, informative English text, solid backgrounds with outlined cards, unified titles, resembling a PowerPoint deck.
```

#### case-77 — #77 Custom Emoticons / #77 커스텀 이모티콘

```
Create [x] custom emoticons of the character from image 2 using the pose variations from image 1.
```

#### case-78 — #78 Food Restoration / #78 먹힌 음식 복원

```
Restore the half-eaten [food item] to its untouched state before it was eaten.
```

#### case-79 — #79 Fighting Game Interface / #79 격투 게임 UI

```
Design a modern fighting game scene: two sharply focused characters in 3/4 view amid purple alien ruins at sunrise, no center divider, HUD with health bars labeled Morton vs Death Seed, character thumbnails inside the bars, powerful special effects, and cinematic energy.
```

#### case-80 — #80 Car Cutaway Diagram / #80 자동차 절단도

```
Produce a cutaway illustration of the car with one half showing the full exterior and the other half revealing the interior engine and seats, maintaining accurate proportions and realistic detail.
```

### Cases 81-91

#### case-81 — #81 Pirate Wanted Poster / #81 해적 수배서

```
Redraw the original image as a pirate wanted poster on aged parchment. Keep the character design, enlarge the face close-up, add a pirate hat, assign a fictional bounty in a made-up currency, and list the crimes in a fictional lowercase language.
```

#### case-82 — #82 Convenience Store Shelf / #82 굿즈 편의점 선반

```
Remove the background and turn the illustration into merchandise displayed on a dreamy Japanese convenience-store shelf. Feature two prominent 50cm statues, acrylic stands, chibi figures, cushions, puzzles, stationery, paper panels, and plushies arranged neatly in a cute trendy 4K (4000x3000) render.
```

#### case-83 — #83 Convention Booth / #83 만화 전시 부스

```
Replace the background with a bustling comic market booth where a cosplayer holds a doll amid comprehensive character merchandise—including a 100cm doll, 80-inch display, acrylic stands, chibi mini figures, large cushions, puzzles, stationery, desk mats, and plushies—captured in a lively 4K photorealistic scene.
```

#### case-84 — #84 Childlike Storybook / #84 유아 낙서화

```
Make the uploaded picture book look as if it were drawn by a five-year-old child.
```

#### case-85 — #85 Avant-Garde Exhibition / #85 현대 미술 전시

```
Create an avant-garde modern art exhibition space based on the reference image, following the detailed requirements: integrated architecture, lighting, floor, walls, ceiling, a 20x20x8m hall with a central feature wall, abstract poetic title plate, granite floor with tactile guidance, visitor flow toward the right exit, one staff member, anonymized faces, stable perspective, precise reflections, synchronized lighting, and overall SSIM fidelity.
```

#### case-86 — #86 Gothic Tarot Card / #86 다크 고딕 타로

```
Design a dark gothic tarot card featuring “AI Artist - Shira” with symbols [coffee, white chubby cat with pink ribbon, laptop, phone, headphones], moody shadows, ornate gothic borders, and a mysterious dark fantasy atmosphere.
```

#### case-87 — #87 Evolution Parade / #87 흑백 진화도

```
Illustrate a minimalist black-and-white evolution march that progresses from early apes to humans and finally to a banana.
```

#### case-88 — #88 Glass Bottle Diorama / #88 유리병 디오라마

```
Craft a 1/7 scale collectible figure of the subject displayed inside a transparent souvenir glass bottle with a detailed beach environment, realistic lighting, and convincing miniature shadows.
```

#### case-89 — #89 Miniature Brand Store / #89 미니 브랜드 상점

```
Build a miniature 3D store for [brand] with a roof shaped like a giant [product], an oversized [brand] logo above the windows, the shopkeeper handing a [product] to a customer, and many [product] scattered on the floor, rendered as handmade soft-clay macro photography in portrait 3:4 format.
```

#### case-90 — #90 VTuber Broadcast / #90 Vtuber 방송 화면

```
Use the original image to create a VTuber and streaming layout: the VTuber keeps the same hairstyle and outfit, appears in the bottom-right corner holding a game controller, the main gameplay feed fills the center, chat appears on the left, platform/browser UI overlays the frame, and proportions feel authentic.
```

#### case-91 — #91 Station Poster / #91 역사 영화 포스터

```
Design a realistic movie poster based on the original image, matching the implied genre while preserving the character style. Place the poster in a Japanese station underground corridor with passersby and realistic reflections.
```

## 7. 합성 로직 (continuity / reference map / storyboard)

### `/api/generate` buildPrompt segment 순서

출처: `app/api/generate/route.ts`

최종 prompt는 아래 segment를 순서대로 배열에 넣고 줄바꿈으로 합칩니다.

```
${payload.refinedPrompt || payload.prompt}
Negative prompt: ${payload.negativePrompt}
Camera guidance - angle: ${payload.camera.angle}, aperture: ${payload.camera.aperture}, subject orientation: ${payload.camera.subjectDirection}, camera facing: ${payload.camera.cameraDirection}, zoom: ${payload.camera.zoom}.
Additional reference gallery provided: ${galleryCount} image(s).
Aspect ratio guidance: ${ratioLabel}.
Generation mode: ${payload.mode}
Use the provided reference image as the visual foundation while applying the requested changes.
```

### `/api/generate` system instruction

출처: `app/api/generate/route.ts`

이미지 생성 호출의 system message.

```
You generate images for the user using the image_generation tool. Use the supplied prompt and any reference images. Do not narrate; just produce the image.
```

### Reference map 형식 — 일반 캐릭터 helper

출처: `lib/studio-helpers/prompt.ts`

일반 character mention prompt는 이미 같은 형식이면 다시 감싸지 않습니다.

```
Reference map: Image ${index + 1} = Character @${handle} (name: ${character.name}). Detailed prompt: ${basePrompt}
```

### Reference map 형식 — 스토리 키비주얼

출처: `components/studio/story-studio-shell.tsx`

스토리 키비주얼은 첫 참조 이미지를 `referenceImageUrl`로 보내고, 나머지는 `referenceGallery`로 보냅니다.

```
Image ${index + 1} = ${ref.role === "character" ? "Character" : "Location"} reference for @${ref.handle}
```

### Story continuity lock

출처: `components/studio/story-studio-shell.tsx`

스토리 키비주얼 최종 prompt에 붙는 연속성 고정 문장.

```
Series continuity: keep recurring @handles visually consistent across scenes; preserve established identity, scale, wardrobe cues, and location character unless this scene explicitly changes them.
```

### Story final prompt 구조

출처: `components/studio/story-studio-shell.tsx`

스토리 키비주얼 생성 시 `prompt`와 `refinedPrompt`에 동일하게 들어가는 최종 구조.

```
Reference map: ${refMap}. Detailed scene image prompt: ${scenePrompt} ${buildCinematographySuffix(cinematography)} ${STORY_CONTINUITY_LOCK} ${toneSuffix}
```

### Storyboard LLM system instruction

출처: `app/api/story/storyboard/route.ts`

스토리를 컷별 이미지 생성 prompt로 분할하는 LLM system instruction. cinematography id 목록은 코드의 옵션 배열에서 확장한 실제 값입니다.

```
당신은 키비주얼 시리즈 스토리보드 작가. 사용자의 스토리를 컷별 이미지 생성 프롬프트로 재구성한다. 각 컷의 prompt는 요약문이 아니라 바로 이미지 생성에 사용할 수 있는 상세 키프레임 설명이어야 한다. 각 prompt는 한국어 2~4문장, 약 160~420자로 작성하고, 장면의 행동, 표정/감정, 공간, 구도, 조명, 분위기, 핵심 소품을 자연스럽게 포함한다. 스토리의 의도와 디테일을 해석해 장면마다 충분히 구체화하되, 한 컷에 보이지 않는 사건 설명이나 메타 해설은 쓰지 않는다. 등록된 핸들만 mention 가능하다. 예: @민수, @카페. 각 prompt에는 등장하는 @핸들을 포함하고, mentions에는 @를 제외한 핸들명을 넣는다. 각 컷에 cinematography 객체를 포함한다. framing은 다음 id 중 하나: extreme-long-shot, long-shot, full-shot, medium-shot, medium-close-up, close-up, extreme-close-up. angle은 다음 id 중 하나: eye-level, high-angle, low-angle, dutch-angle, birds-eye, worms-eye. special은 다음 id 중 하나 또는 null: over-the-shoulder, point-of-view, insert-shot, reaction-shot, establishing-shot, two-shot. 전체 컷에서 같은 framing/angle 조합을 기계적으로 반복하지 않는다. 응답은 JSON 배열만 반환한다. 마크다운, 설명, 코드펜스는 금지한다.
```

### Storyboard LLM user message 구조

출처: `app/api/story/storyboard/route.ts`

스토리, 컷 수, 등록 핸들, 출력 형식 예시를 합쳐 user message로 보냅니다.

```
스토리:
${story.trim()}

컷 수: ${sceneCount}

등록된 핸들:
${handleList || "- 없음"}

출력 형식:
[{"prompt":"비 내리는 저녁의 @카페 입구 앞, 젖은 유리문 너머 따뜻한 조명이 번지고 @민수가 문고리를 잡은 채 잠시 멈춰 선다. @민수의 표정은 기대와 두려움이 섞여 있고, 손에는 여러 번 접힌 종이가 구겨져 있다. 카메라는 문 앞의 좁은 처마 아래에서 인물을 살짝 올려다보며, 빗방울과 반사광이 장면의 긴장감을 만든다.","mentions":["민수","카페"],"cinematography":{"framing":"medium-shot","angle":"low-angle","special":"over-the-shoulder"}}]

반드시 ${sceneCount}개 배열 항목을 목표로 작성하고, 각 prompt는 상세한 이미지 생성 프롬프트로 쓴다. prompt에는 위 등록 핸들만 사용하고, 원문을 단순 요약하지 말고 컷마다 시각적으로 충분히 구체화한다. cinematography는 각 컷의 시각적 기능에 맞게 달리 선택한다.
```

### Storyboard retry instruction

출처: `app/api/story/storyboard/route.ts`

LLM 응답 컷 수가 부족할 때 추가되는 retry user message.

```
이전 응답의 컷 수가 요청한 ${body.sceneCount}개보다 적었습니다. 반드시 ${body.sceneCount}개 JSON 배열 항목만 반환하고 각 항목에 cinematography를 포함하세요.
```
