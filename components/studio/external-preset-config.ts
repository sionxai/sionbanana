export interface ExternalPresetOption {
  id: string;
  label: string;
  labelKo: string;
  prompt: string;
  note?: string;
}

export interface ExternalPresetGroup {
  id: string;
  title: string;
  description?: string;
  options: ExternalPresetOption[];
}

export const EXTERNAL_PRESET_GROUPS: ExternalPresetGroup[] = [
  {
    id: "cases-01-10",
    title: "Cases 01-10",
    options: [
      {
        id: "case-01",
        label: "#01 Character Figure Display",
        labelKo: "#01 일러스트 피규어 연출",
        prompt: `Transform the uploaded subject photo into a stylized character figure display. Place a character-printed box behind the figure, show the Blender modeling process on a nearby computer screen, add a round plastic base with the figure standing on it in front, and stage the entire setup indoors.`
      },
      {
        id: "case-02",
        label: "#02 Arrow Point-of-View",
        labelKo: "#02 지도 화살표 시점",
        prompt: `Render the scene that the red arrow in the uploaded Google Maps screenshot is pointing toward. If a red circle is included, generate the perspective from that circled spot facing the arrow's direction.`
      },
      {
        id: "case-03",
        label: "#03 AR Site Highlight",
        labelKo: "#03 AR 위치 강조",
        prompt: `You are a location-based augmented reality experience generator. Highlight the [Target Location] within the uploaded photograph, add relevant annotations, and make sure the image explicitly labels the spot as [Target Location].`
      },
      {
        id: "case-04",
        label: "#04 Isometric Building Extraction",
        labelKo: "#04 등축 건물 추출",
        prompt: `Convert the uploaded scene to daytime lighting, isolate only the [building] (or specified subject), and reinterpret it as an isometric projection model.`
      },
      {
        id: "case-05",
        label: "#05 Vintage Era Restyle",
        labelKo: "#05 시대별 스타일 변환",
        prompt: `Restyle this character into a classic [1970s] [male] look. Add [long curly hair] and [long mustache], change the background to an iconic [California summer landscape], and keep the face unchanged.`
      },
      {
        id: "case-06",
        label: "#06 Multi-Reference Fashion Shoot",
        labelKo: "#06 다중 참고 패션 촬영",
        prompt: `Using the supplied references, create a photo where a model leans against a pink BMW while wearing the listed props. Include a green alien keychain attached to a pink handbag, a pink parrot on the model's shoulder, and a pug with a pink leash and gold headphones sitting nearby against a light gray background.`
      },
      {
        id: "case-07",
        label: "#07 Vibrant Photo Edit",
        labelKo: "#07 다채로운 사진 보정",
        prompt: `This photo feels too plain. Make it vibrant by boosting contrast, enriching the colors, and brightening the lighting. Feel free to crop or adjust the composition if it helps the result.`
      },
      {
        id: "case-08",
        label: "#08 Fight Pose Reimagining",
        labelKo: "#08 격투 포즈 연출",
        prompt: `Use the pose from the third reference image to stage the two characters in a fight, add an appropriate background, and ensure the final image is rendered in a 16:9 ratio.`
      },
      {
        id: "case-09",
        label: "#09 Aerial Perspective Conversion",
        labelKo: "#09 조감도 시점 변환",
        prompt: `Convert the ground-level photo into an overhead bird's-eye view and mark the photographer's original position.`
      },
      {
        id: "case-10",
        label: "#10 Custom Character Sticker",
        labelKo: "#10 캐릭터 스티커 제작",
        prompt: `Turn the character from the second image into a sticker with a white outline. Render the character in a clean web illustration style and add a short caption beneath it that describes the motif from the first image.`
      }
    ]
  },
  {
    id: "cases-11-20",
    title: "Cases 11-20",
    options: [
      {
        id: "case-11",
        label: "#11 Comic-Con Cosplayer",
        labelKo: "#11 애니 → 실사 코스프레",
        prompt: `Transform the girl in the illustration into a cosplayer standing at Comic-Con, keeping the character design recognizable in a real-life photo.`
      },
      {
        id: "case-12",
        label: "#12 Full Character Design Suite",
        labelKo: "#12 캐릭터 디자인 세트",
        prompt: `Create a comprehensive character design package: proportion breakdowns, front/side/back views, an emotion sheet, a pose sheet with varied common poses, and multiple outfit explorations, matching the supplied references.`
      },
      {
        id: "case-13",
        label: "#13 Palette Transfer",
        labelKo: "#13 팔레트 색상 적용",
        prompt: `Recolor the character in image 1 using exactly the color palette from image 2.`
      },
      {
        id: "case-14",
        label: "#14 Article Infographic Poster",
        labelKo: "#14 기사 인포그래픽 포스터",
        prompt: `Turn the uploaded article into an infographic poster: translate it into English, extract the key information, keep the layout concise with only major headings, use English text, and add colorful cute cartoon characters and elements.`
      },
      {
        id: "case-15",
        label: "#15 Hairstyle Grid",
        labelKo: "#15 헤어스타일 3x3",
        prompt: `Generate a 3x3 grid of avatars of this person, each featuring a distinct hairstyle.`
      },
      {
        id: "case-16",
        label: "#16 Annotated Heart Model",
        labelKo: "#16 3D 심장 모델 주석",
        prompt: `Draw a highly realistic, detailed, academically annotated [3D human heart model] suited for a scholarly presentation, including notes and explanations of each [organ] function.`
      },
      {
        id: "case-17",
        label: "#17 Marble Sculpture Portrait",
        labelKo: "#17 대리석 조각 연출",
        prompt: `Create a lifelike marble sculpture of the subject, showcasing polished reflective surfaces, elegant forms, and lighting that highlights the craftsmanship.`
      },
      {
        id: "case-18",
        label: "#18 Ingredient-to-Meal Shot",
        labelKo: "#18 재료로 요리 완성",
        prompt: `Use the provided ingredient photos to cook a delicious lunch, plate it neatly, remove other dishes and ingredients from the scene, and zoom in on the plated meal.`
      },
      {
        id: "case-19",
        label: "#19 Math Answer Overlay",
        labelKo: "#19 수학 정답 기입",
        prompt: `Solve the uploaded math problem and write the correct answer in the designated blank area of the sheet.`
      },
      {
        id: "case-20",
        label: "#20 Photo Restoration and Colorization",
        labelKo: "#20 옛 사진 복원 채색",
        prompt: `Restore and colorize the old photograph, enhancing clarity while preserving authenticity.`
      }
    ]
  },
  {
    id: "cases-21-30",
    title: "Cases 21-30",
    options: [
      {
        id: "case-21",
        label: "#21 OOTD Style Merge",
        labelKo: "#21 OOTD 스타일 합성",
        prompt: `Dress the person from photo 1 in the outfit and accessories from photo 2. Preserve their identity and pose, and capture vivid full-body OOTD shots outdoors in natural light.`
      },
      {
        id: "case-22",
        label: "#22 Outfit Swap",
        labelKo: "#22 의상 변경",
        prompt: `Replace the clothing on the person with the outfit from the target image while keeping the pose, expression, background, and realistic lighting consistent.`
      },
      {
        id: "case-23",
        label: "#23 Multi-Angle Reference Sheet",
        labelKo: "#23 다각도 자료 시트",
        prompt: `Create uniformly spaced front, back, left, right, top, and bottom views of the subject on a white background, including both isometric and perspective versions.`
      },
      {
        id: "case-24",
        label: "#24 Noir Detective Storyboard",
        labelKo: "#24 느와르 탐정 콘티",
        prompt: `Using the two reference characters, craft a 12-panel black-and-white noir detective storyboard about a thrilling treasure hunt, conveying the entire story through imagery without any text.`
      },
      {
        id: "case-25",
        label: "#25 Face Forward Adjustment",
        labelKo: "#25 정면 바라보기 수정",
        prompt: `Modify the person so they turn to face forward while staying true to their appearance.`
      },
      {
        id: "case-26",
        label: "#26 Studio Pose Transfer",
        labelKo: "#26 포즈 전환 스튜디오샷",
        prompt: `Apply the pose from photo 2 to the subject in photo 1 and render it as a professional studio photograph.`
      },
      {
        id: "case-27",
        label: "#27 Trump Watermark",
        labelKo: "#27 'TRUMP' 워터마크",
        prompt: `Fill the entire image with a repeating watermark that says "TRUMP."`
      },
      {
        id: "case-28",
        label: "#28 Tallest Buildings Infographic",
        labelKo: "#28 정보 인포그래픽",
        prompt: `Design a colorful infographic covering the five tallest buildings in the world or, alternatively, the sweetest things in the world, using playful data visualization.`
      },
      {
        id: "case-29",
        label: "#29 Red Pen Critique",
        labelKo: "#29 빨간펜 피드백",
        prompt: `Analyze the image and add red-pen annotations pointing out areas that need improvement.`
      },
      {
        id: "case-30",
        label: "#30 Exploding Ingredients Shot",
        labelKo: "#30 폭발하는 음식 연출",
        prompt: `Shoot a dynamic modern product photo where the product's fresh ingredients burst outward, showcasing freshness and nutrition against the brand's signature background color with no text.`
      }
    ]
  },
  {
    id: "cases-31-40",
    title: "Cases 31-40",
    options: [
      {
        id: "case-31",
        label: "#31 Superhero Comic Book",
        labelKo: "#31 슈퍼히어로 만화책",
        prompt: `Based on the uploaded images, create a comic book with text that tells an exciting superhero story.`
      },
      {
        id: "case-32",
        label: "#32 Custom Action Figure",
        labelKo: "#32 맞춤 액션 피규어",
        prompt: `Design an action figure titled "AI Evangelist - Chris" using the subject as the base and highlighting [coffee, turtle, laptop, phone, headphones] as featured accessories.`
      },
      {
        id: "case-33",
        label: "#33 Isometric Landmark Park",
        labelKo: "#33 지도 등축 건물",
        prompt: `Transform the landmark at the provided map location into an isometric game-style amusement park scene focused on the buildings.`
      },
      {
        id: "case-34",
        label: "#34 Expression Swap",
        labelKo: "#34 표정 변경",
        prompt: `Apply the facial expression from image 2 to the character in image 1 while maintaining the original art style.`
      },
      {
        id: "case-35",
        label: "#35 Four-Stage Illustration",
        labelKo: "#35 4컷 제작 과정",
        prompt: `Create a four-panel sequence of the illustration process: 1) line art, 2) flat colors, 3) shadows, 4) final polish, with no text.`
      },
      {
        id: "case-36",
        label: "#36 Makeup Transfer",
        labelKo: "#36 메이크업 이식",
        prompt: `Apply the makeup from photo 2 to the person in photo 1 while preserving their pose and features.`
      },
      {
        id: "case-37",
        label: "#37 Red Pen Improvement Marks",
        labelKo: "#37 빨간펜 개선 표시",
        prompt: `Review the character image and mark improvement points using red pen annotations.`
      },
      {
        id: "case-38",
        label: "#38 Middle-earth Street View",
        labelKo: "#38 중간계 스트리트 뷰",
        prompt: `Generate a dashcam-style Google Street View image of [Hobbiton Street] with hobbits performing daily tasks like gardening and smoking pipes on a clear day.`
      },
      {
        id: "case-39",
        label: "#39 Typographic Bicycle Illustration",
        labelKo: "#39 타이포 자전거 일러스트",
        prompt: `Create a minimal black-and-white typographic illustration of "riding a bicycle" using only the letters of the phrase to form the rider, bike, and motion while keeping the text legible.`
      },
      {
        id: "case-40",
        label: "#40 Pose Sheet",
        labelKo: "#40 포즈 표 제작",
        prompt: `Use the reference drawing to build a pose sheet that shows the character in a variety of stances.`
      }
    ]
  },
  {
    id: "cases-41-50",
    title: "Cases 41-50",
    options: [
      {
        id: "case-41",
        label: "#41 Packaging Render",
        labelKo: "#41 제품 패키징 연출",
        prompt: `Wrap the can from photo 2 in the design from photo 1 and present it as a minimalist professional product photograph.`
      },
      {
        id: "case-42",
        label: "#42 Material Overlay",
        labelKo: "#42 재질 오버레이",
        prompt: `Apply the [glass] effect from image 2 onto image 1.`
      },
      {
        id: "case-43",
        label: "#43 Chibi Face Shape Match",
        labelKo: "#43 SD 얼굴형 변환",
        prompt: `Redesign the character from image 1 as a chibi version that follows the face shape from image 2.`
      },
      {
        id: "case-44",
        label: "#44 Lighting Match",
        labelKo: "#44 조명 매칭",
        prompt: `Change the lighting on the character from image 1 to match the lighting reference in image 2, using shadows for the dark regions.`
      },
      {
        id: "case-45",
        label: "#45 LEGO Minifigure Box",
        labelKo: "#45 레고 미니피규어 박스",
        prompt: `Turn the subject into a LEGO minifigure packaging shot titled "ZHOGUE," including the boxed figure with accessories and an additional out-of-box minifigure rendered realistically from a slightly elevated angle.`
      },
      {
        id: "case-46",
        label: "#46 Mecha Model Box",
        labelKo: "#46 건담 프라모델 박스",
        prompt: `Convert the subject into a Gundam-style model kit box titled "ZHOGUE," with a mech interpretation, futuristic accessories, technical illustrations, sci-fi typography, and a realistically rendered out-of-box figure.`
      },
      {
        id: "case-47",
        label: "#47 DSLR Exploded Diagram",
        labelKo: "#47 DSLR 분해도",
        prompt: `Create an exploded view of a DSLR that reveals every accessory and internal component—lens, filters, internals, sensor, screws, buttons, viewfinder, housing, and circuit boards—while retaining the camera's red accents.`
      },
      {
        id: "case-48",
        label: "#48 Calorie Labeling",
        labelKo: "#48 칼로리 표기",
        prompt: `Label the food with its name, calorie density, and approximate total calories.`
      },
      {
        id: "case-49",
        label: "#49 Subject Cutout",
        labelKo: "#49 대상 추출",
        prompt: `Extract the [samurai] or specified subject from the image and place it on a transparent background.`
      },
      {
        id: "case-50",
        label: "#50 Transparency Fix",
        labelKo: "#50 체크무늬 복원",
        prompt: `Fill in the transparent checkerboard regions of the image to restore a complete, consistent photograph.`
      }
    ]
  },
  {
    id: "cases-51-60",
    title: "Cases 51-60",
    options: [
      {
        id: "case-51",
        label: "#51 New Amsterdam 1660",
        labelKo: "#51 1660 뉴암스테르담 재현",
        prompt: `Recreate 1660 New Amsterdam as a full-color modern photograph captured today.`
      },
      {
        id: "case-52",
        label: "#52 Fashion Mood Board",
        labelKo: "#52 패션 무드보드",
        prompt: `Make a fashion mood board collage featuring cutouts of the outfit items around the portrait, playful marker-style handwritten notes, brand and source labels in English, and a cute creative vibe.`
      },
      {
        id: "case-53",
        label: "#53 Miniature Product Photo",
        labelKo: "#53 미니어처 제품 사진",
        prompt: `Shoot a high-resolution advertising photo of a realistic miniature [product] held delicately between thumb and index finger against a clean white background with soft studio lighting and shallow depth of field.`
      },
      {
        id: "case-54",
        label: "#54 Giant Statue Installation",
        labelKo: "#54 거대 동상 설치",
        prompt: `Create a realistic photo of a massive statue of the subject installed in a central Tokyo plaza with people gazing up at it.`
      },
      {
        id: "case-55",
        label: "#55 Anime Itasha",
        labelKo: "#55 애니 랩핑카",
        prompt: `Produce a photo of an anime-themed Itasha sports car decorated with the provided character art, showcased at a famous scenic tourist landmark under flattering natural light.`
      },
      {
        id: "case-56",
        label: "#56 Manga Layout",
        labelKo: "#56 만화 컷 구성",
        prompt: `Using the character and layout references, design a manga panel composition for the scene.`
      },
      {
        id: "case-57",
        label: "#57 Manga Line Conversion",
        labelKo: "#57 흑백 만화 스타일",
        prompt: `Convert the input photo into a black-and-white manga-style line drawing.`
      },
      {
        id: "case-58",
        label: "#58 Holographic Wireframe",
        labelKo: "#58 홀로그래픽 와이어프레임",
        prompt: `Transform the provided wireframe drawing into a holographic-style image.`
      },
      {
        id: "case-59",
        label: "#59 HD-2D Minecraft Landmark",
        labelKo: "#59 HD-2D 마인크래프트",
        prompt: `Generate an HD-2D Minecraft-style isometric rendering of the landmark buildings at the given location.`
      },
      {
        id: "case-60",
        label: "#60 Materialized Logo",
        labelKo: "#60 로고 재질 적용",
        prompt: `Apply the material from image 2 to the logo in image 1, render it as a 3D object in a Cinema4D-like style, and place it on a solid-color background.`
      }
    ]
  },
  {
    id: "cases-61-70",
    title: "Cases 61-70",
    options: [
      {
        id: "case-61",
        label: "#61 Floor Plan to 3D",
        labelKo: "#61 평면도 3D 렌더링",
        prompt: `Transform the uploaded floor plan into a realistic 3D rendering of the home.`
      },
      {
        id: "case-62",
        label: "#62 Camera Settings Overlay",
        labelKo: "#62 카메라 세팅 표기",
        prompt: `Render the scene with camera settings RAW, ISO [100], aperture [F2.8], shutter 1/200, focal length 24mm, or substitute the provided values.`
      },
      {
        id: "case-63",
        label: "#63 Passport Photo",
        labelKo: "#63 증명사진 만들기",
        prompt: `Crop the head to create a 2-inch passport photo with a blue background, professional business attire, face forward, and a slight smile.`
      },
      {
        id: "case-64",
        label: "#64 Pop-Up Card",
        labelKo: "#64 A6 팝업 카드",
        prompt: `Design an A6 folding card that opens to reveal a 3D miniature globe house, paper garden, and bonsai tree.`
      },
      {
        id: "case-65",
        label: "#65 Chess Set Concept",
        labelKo: "#65 체스 디자인",
        prompt: `Design a chessboard and 3D-printable chess pieces inspired by the provided reference photo.`
      },
      {
        id: "case-66",
        label: "#66 Split-Era Room",
        labelKo: "#66 양분된 시대 방",
        prompt: `Illustrate the bedroom split down the middle, with the left side as 2018 and the right side as 1964, showing the same room in both eras.`
      },
      {
        id: "case-67",
        label: "#67 Jewelry Collection",
        labelKo: "#67 쥬얼리 컬렉션",
        prompt: `Convert the subject into five distinct jewelry collectibles.`
      },
      {
        id: "case-68",
        label: "#68 Character Merchandise",
        labelKo: "#68 캐릭터 굿즈 디자인",
        prompt: `Create merchandise concepts featuring the provided character image.`
      },
      {
        id: "case-69",
        label: "#69 Hologram Desk Display",
        labelKo: "#69 홀로그램 데스크",
        prompt: `Produce a surreal product photo with a virtual hologram character [CHARACTER] floating above a 120mm circular projector on a modern desk. Follow the rules: add a desktop 3D scanner if the reference object is 3D, or a monitor showing the reference if it is 2D; render the hologram as a translucent volume with natural anatomy, expressive face, no beams or particles, no copyrighted IP, camera 85-100mm at eye level, f/11-f/16, ISO100, studio lighting, black seamless background with subtle reflections, 4:5 ratio at 2048x2560px, negative prompt forbidding text, logos, IP, resin, PVC, solid surfaces, rays, scanlines, dots, distortion, extra numbers; deterministic sampling, Seed=12345, Temperature=0.`
      },
      {
        id: "case-70",
        label: "#70 Giant Selfie Scaffolding",
        labelKo: "#70 거대 인물 비계",
        prompt: `Create a surreal 3D rendering of the person taking a selfie while surrounded by massive scaffolding with countless tiny construction workers, set in a bustling city square with modern buildings, traffic, pedestrians, a bright blue sky, rich detail, and cinematic lighting.`
      }
    ]
  },
  {
    id: "cases-71-80",
    title: "Cases 71-80",
    options: [
      {
        id: "case-71",
        label: "#71 Remote Sensing Extraction",
        labelKo: "#71 원격탐사 건물 추출",
        prompt: `Remove everything in the remote-sensing image except the buildings.`
      },
      {
        id: "case-72",
        label: "#72 Component Cut Sheet",
        labelKo: "#72 부품 추출 시트",
        prompt: `Cut each part of the model out to build a hologram-preserving component sheet.`
      },
      {
        id: "case-73",
        label: "#73 Bun-Only Burger",
        labelKo: "#73 빵만 남긴 버거",
        prompt: `Remove all fillings from the hamburger, leaving only the top and bottom buns separated slightly so it still appears filled.`
      },
      {
        id: "case-74",
        label: "#74 High-Res Restoration",
        labelKo: "#74 이미지 고해상도 복원",
        prompt: `Enhance the resolution of the old image, adding appropriate texture detail while reinterpreting it with modern animation techniques.`
      },
      {
        id: "case-75",
        label: "#75 Isometric Miniature",
        labelKo: "#75 미니어처 아이소메트릭",
        prompt: `Convert the scene into an isometric miniature diorama.`
      },
      {
        id: "case-76",
        label: "#76 Future Doodle Cards",
        labelKo: "#76 미래 과학 카드",
        prompt: `Generate multiple 16:9 doodle-style illustrations that explain the concept of "future" to middle-schoolers, using uniform bold colored-pencil styling, informative English text, solid backgrounds with outlined cards, unified titles, resembling a PowerPoint deck.`
      },
      {
        id: "case-77",
        label: "#77 Custom Emoticons",
        labelKo: "#77 커스텀 이모티콘",
        prompt: `Create [x] custom emoticons of the character from image 2 using the pose variations from image 1.`
      },
      {
        id: "case-78",
        label: "#78 Food Restoration",
        labelKo: "#78 먹힌 음식 복원",
        prompt: `Restore the half-eaten [food item] to its untouched state before it was eaten.`
      },
      {
        id: "case-79",
        label: "#79 Fighting Game Interface",
        labelKo: "#79 격투 게임 UI",
        prompt: `Design a modern fighting game scene: two sharply focused characters in 3/4 view amid purple alien ruins at sunrise, no center divider, HUD with health bars labeled Morton vs Death Seed, character thumbnails inside the bars, powerful special effects, and cinematic energy.`
      },
      {
        id: "case-80",
        label: "#80 Car Cutaway Diagram",
        labelKo: "#80 자동차 절단도",
        prompt: `Produce a cutaway illustration of the car with one half showing the full exterior and the other half revealing the interior engine and seats, maintaining accurate proportions and realistic detail.`
      }
    ]
  },
  {
    id: "cases-81-91",
    title: "Cases 81-91",
    options: [
      {
        id: "case-81",
        label: "#81 Pirate Wanted Poster",
        labelKo: "#81 해적 수배서",
        prompt: `Redraw the original image as a pirate wanted poster on aged parchment. Keep the character design, enlarge the face close-up, add a pirate hat, assign a fictional bounty in a made-up currency, and list the crimes in a fictional lowercase language.`
      },
      {
        id: "case-82",
        label: "#82 Convenience Store Shelf",
        labelKo: "#82 굿즈 편의점 선반",
        prompt: `Remove the background and turn the illustration into merchandise displayed on a dreamy Japanese convenience-store shelf. Feature two prominent 50cm statues, acrylic stands, chibi figures, cushions, puzzles, stationery, paper panels, and plushies arranged neatly in a cute trendy 4K (4000x3000) render.`
      },
      {
        id: "case-83",
        label: "#83 Convention Booth",
        labelKo: "#83 만화 전시 부스",
        prompt: `Replace the background with a bustling comic market booth where a cosplayer holds a doll amid comprehensive character merchandise—including a 100cm doll, 80-inch display, acrylic stands, chibi mini figures, large cushions, puzzles, stationery, desk mats, and plushies—captured in a lively 4K photorealistic scene.`
      },
      {
        id: "case-84",
        label: "#84 Childlike Storybook",
        labelKo: "#84 유아 낙서화",
        prompt: `Make the uploaded picture book look as if it were drawn by a five-year-old child.`
      },
      {
        id: "case-85",
        label: "#85 Avant-Garde Exhibition",
        labelKo: "#85 현대 미술 전시",
        prompt: `Create an avant-garde modern art exhibition space based on the reference image, following the detailed requirements: integrated architecture, lighting, floor, walls, ceiling, a 20x20x8m hall with a central feature wall, abstract poetic title plate, granite floor with tactile guidance, visitor flow toward the right exit, one staff member, anonymized faces, stable perspective, precise reflections, synchronized lighting, and overall SSIM fidelity.`
      },
      {
        id: "case-86",
        label: "#86 Gothic Tarot Card",
        labelKo: "#86 다크 고딕 타로",
        prompt: `Design a dark gothic tarot card featuring “AI Artist - Shira” with symbols [coffee, white chubby cat with pink ribbon, laptop, phone, headphones], moody shadows, ornate gothic borders, and a mysterious dark fantasy atmosphere.`
      },
      {
        id: "case-87",
        label: "#87 Evolution Parade",
        labelKo: "#87 흑백 진화도",
        prompt: `Illustrate a minimalist black-and-white evolution march that progresses from early apes to humans and finally to a banana.`
      },
      {
        id: "case-88",
        label: "#88 Glass Bottle Diorama",
        labelKo: "#88 유리병 디오라마",
        prompt: `Craft a 1/7 scale collectible figure of the subject displayed inside a transparent souvenir glass bottle with a detailed beach environment, realistic lighting, and convincing miniature shadows.`
      },
      {
        id: "case-89",
        label: "#89 Miniature Brand Store",
        labelKo: "#89 미니 브랜드 상점",
        prompt: `Build a miniature 3D store for [brand] with a roof shaped like a giant [product], an oversized [brand] logo above the windows, the shopkeeper handing a [product] to a customer, and many [product] scattered on the floor, rendered as handmade soft-clay macro photography in portrait 3:4 format.`
      },
      {
        id: "case-90",
        label: "#90 VTuber Broadcast",
        labelKo: "#90 Vtuber 방송 화면",
        prompt: `Use the original image to create a VTuber and streaming layout: the VTuber keeps the same hairstyle and outfit, appears in the bottom-right corner holding a game controller, the main gameplay feed fills the center, chat appears on the left, platform/browser UI overlays the frame, and proportions feel authentic.`
      },
      {
        id: "case-91",
        label: "#91 Station Poster",
        labelKo: "#91 역사 영화 포스터",
        prompt: `Design a realistic movie poster based on the original image, matching the implied genre while preserving the character style. Place the poster in a Japanese station underground corridor with passersby and realistic reflections.`
      }
    ]
  }
];
