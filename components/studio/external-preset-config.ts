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
  },
  {
    id: "editorial-ad",
    title: "에디토리얼 광고",
    description: "SNS 게시물·스크린샷을 읽어 실사 모델을 기용한 고예산 에디토리얼 광고 포스터로. 사진과 한글 타이포의 충돌, 포인트 컬러 필수.",
    options: [
      {
        id: "editorial-ad-poster",
        label: "Editorial AD Poster",
        labelKo: "에디토리얼 광고 포스터",
        note: "세로 4:5 · 실사 광고 사진 · 한글 로고풍 타이포 중시 · 포인트 컬러 필수 · 어두운 실내/평범한 비즈니스 복장 금지",
        prompt: `당신은 일류 광고 크리에이티브 디렉터이자, 아트 디렉터, 패션 포토그래퍼, 에디토리얼 디자이너, 브랜드 디자이너, UX 디자이너, 마케터입니다.

또한 한국어 타이포그래피 전문 「한국 타이포그래퍼 에이전트」로서,
카피, 제목, 로고풍 타이포그래피, 문자 조판, 자간, 행간, 세로쓰기·가로쓰기, 장체·평체, 아웃라인 문자, 여백, 시선 유도까지 엄밀하게 설계하세요.

첨부된 SNS 게시물, 스크린샷, 랜딩페이지, 이미지, 일러스트를 바탕으로
내용, 말투, 온도감, 타깃, 독자의 욕망, 팔리는 이유, 브랜드의 분위기, 배색, 감정 설계를 읽어내고,
이를 바탕으로 실사 모델을 기용한 고예산 에디토리얼 광고 포스터를 생성하세요.

가장 중요한 목적은
"예쁜 광고"를 만드는 것이 아니라,
스마트폰에서 보는 순간 손이 멈추고,
"왠지 신경 쓰인다"
"세련됐다"
"이 세계관이 좋다"
"더 보고 싶다"
고 느끼게 만드는 것입니다.

목표는 다음 네 가지가 융합된 듯한, 밝고 화려하며 세련된 에디토리얼 광고 포스터입니다.

한국의 도시형 패션 광고,
감도 높은 컬처 잡지의 특집 첫 페이지,
상업시설의 시즌 캠페인 광고,
하이센스한 웹 매거진의 키 비주얼.

단, 기존 광고, 잡지, 브랜드, 작가, 디자이너의 구도나 표현을 복사해서는 안 됩니다.
참고해야 할 것은 표면적인 스타일이 아니라, 다음과 같은 본질입니다.

"사진과 문자의 충돌"
"밝고 채도 높은 공기감"
"패션성이 느껴지는 인물 연출"
"모던하고 로고 같은 한글 타이포그래피"
"색면과 장식으로 기억에 남는 화면 설계"
"한순간에 손을 멈추게 하는 광고 설계"

[입력 이미지 분석]
첨부 이미지에서 아래를 내부적으로 분석하세요: 주제, 타깃, 독자의 욕망·불안·동경, 상품·서비스·게시자의 매력, 말투의 온도감, 기존 배색 경향, 어울리는 광고 톤, 가장 강하게 드러낼 감정, 유도할 행동, 가장 먼저 읽힐 카피, 사진으로 변환 시 돋보일 인물상, 포인트 컬러, 피해야 할 저렴한 표현. 분석 결과를 설명문으로 화면에 넣지 말고 사진·배색·타이포·여백·구도·의상·빛·장식으로 변환하세요.

[반드시 피해야 할 실패]
어두운 실내 오피스, 회색 배경뿐인 화면, 코워킹 스페이스 같은 무난한 사진, 책상에 앉은 비즈니스 포트레이트, 평범한 업무복, 흰 글자를 왼쪽에 그냥 배치한 타이틀, 랜딩페이지 첫 화면 구성, 여성 창업가 프로필 분위기, 강의·정보상품·뉴스레터 광고 화면, 사진과 문자가 분리된 레이아웃, 안전한 좌우 분할, 브랜드 컬러 1색 단조로움, 기억에 안 남는 무난한 광고. 사진·색·문자·장식·여백이 충돌해 하나의 강한 비주얼 경험이 되게 하세요.

[실사 변환 규칙]
첨부가 일러스트·도해·스크린샷·Canva풍·랜딩페이지·문자 중심이라도 최종 출력은 반드시 고품질 실사 광고 사진 중심으로. 인물은 지나치게 AI처럼 보이지 않게, 자연스러운 표정·피부·머리카락·자세·의상 질감. 포즈·시선·의상·헤어·신발·소품·몸 각도까지 화면 전체의 그래픽 요소로 설계. 저렴한 스톡·양산형 인플루언서·정보상품·AI 미녀·과도한 뷰티 광고풍 금지.

[빛·밝기·공기감]
화면은 밝게. 어두운 실내·흐린 회색·무거운 그림자·가라앉은 톤 금지. 강한 야외 자연광 / 하이키 스튜디오 / 산뜻한 햇살 / 도심 반사광 / 색면 배경 강조명 / 여름 광고 고채도 중 하나를 선택. 밝음·청결감·신선함·화려함·도시적 고양감.

[패션 스타일링]
평범한 비즈니스 복장 금지. 개성 있고 현대적이며 광고에서 돋보이는 스타일링: 선명한 색 재킷·원피스·셋업, 변형 실루엣, 컬러 양말, 개성 있는 신발, 큼직한 액세서리, 인상적인 안경·선글라스, 컬러 가방·소품, 개성 있는 헤어메이크. "이 사람만의 세계관"이 한순간에 전달되게. 의상 색을 배경·타이포·장식색과 연동해 메인/포인트 컬러로 기능하게.

[배색]
첨부에서 추출하되 그대로 쓰지 말고 프로 아트 디렉터로서 광고용으로 재설계. 메인 1 + 서브 1 + 형광/고채도 액센트 1 + 작은 포인트 1 + 뉴트럴 1~2. 반드시 시선을 멈추는 포인트 컬러(선명한 블루/베이비 핑크/형광 옐로/연두/오렌지/레드/터쿼이즈/쇼킹 핑크 등)를 넣되 색 수는 정리. 고채도여도 저속하지 않게, 연해도 약하지 않게, 어른스럽지만 칙칙하지 않게. 배경·의상·타이포·색면 장식을 연동해 사진과 문자가 같은 세계에 있게.

[타이포그래피 — 최우선]
한국어 타이포그래피를 가장 중요한 요소로. 내용에서 가장 강한 문장을 추출해 짧고 강하며 기억에 남는 메인 카피로 재구성. 평범하게 입력한 듯한 배치·흰 굵은 글자 나열·기존 폰트를 그대로 얹은 문자 금지. 한글을 로고처럼 설계된 모던 타이포로, 문자 자체가 비주얼의 주인공이 되게. 기법 조합: 거대 아웃라인 문자, 초굵은 고딕 로고풍, 장체 고딕 도시형, 일부 문자만 거대화, 세로/가로쓰기 혼합, 화면 가로지르기, 인물·신체 위 겹치기, 가장자리 잘림, 색면·장식으로 일부 가리기, 자간 넓은 서브카피, 작은 영문 곁들인 잡지풍 정보 설계, 제목을 로고처럼 묶기. 문자는 사진 위에 그냥 얹지 말고 신체·시선·여백·색면·장식과 관계 맺게. 읽을 수 없는 문자·무너진 글자·의미불명 영어·조잡한 폰트·템플릿 배치 금지. "읽히지만 단순한 글자가 아니다", "문자 자체가 광고 인상으로 남는다".

[구도]
스마트폰에서 한순간에 손이 멈추는 구도. 안전한 좌우 분할·오른쪽 인물+왼쪽 문자·아래 사선 띠 랜딩페이지풍 금지. 내용에 맞게 선택: A. 거대 타이포 × 실사 인물(문자와 인물 충돌) / B. 하이키 색면 × 패션 포트레이트 / C. 도시형 캠페인(거리·역·빌딩·상업시설·푸른 하늘·옥상) / D. 잡지 특집 첫 페이지(세로·가로쓰기 조합) / E. 색면 그래픽 융합(원·띠·여백·아웃라인 문자, 장식은 소량 의미 있게) / F. 반복·분할 구도(리듬). 반드시 어딘가에 "위화감"(시선을 멈추는 어긋남·겹침·잘림·반복·여백·색 충돌)을 넣으세요.

[장식·색면]
너무 많지 않게, 그러나 허전하지 않게. 원·띠·선·말풍선·프레임·구멍난 형태·아웃라인 도형·오려낸 색면을 소량. 여백 채우기가 아니라 콘셉트 번역용. 장식·색면·타이포를 인물·배경에 얽히게 배치.

[감정 설계]
정보 설명이 아니라 감정을 움직이기 위해. 동경/안심/고양감/발견감/지적 호기심/내 일처럼 느껴지는 감각/성장 욕구/귀엽지만 달지 않음/도시적 세련됨/지금 바로 신청하고 싶음/밝지만 살짝 걸림/품격 있지만 지루하지 않음 중 어울리는 것을 중심으로. 저렴한 선동·과도한 불안 자극·정보상품식 강조·지나친 반짝임 금지.

[넣어야 할 요소]
메인 카피, 서브카피, 브랜드명/기획명, 필요 시 날짜·CTA·캠페인 정보, 작은 영문 서브카피, 세계관에 어울리는 상징적 비주얼, 아름답게 설계된 한글 타이포, 고품질 실사 인물, 세련된 배색, 1개 이상의 선명한 포인트 컬러, 개성 있는 패션. 정보를 욱여넣지 말고 첫 1초에 읽힐 문자는 1~2개로 좁히기.

[금지]
Canva 템플릿풍, 정보상품 배너풍, 랜딩페이지 첫 화면, 저렴한 스톡, 부자연스러운 AI 미녀, 얼굴·손 붕괴, 어두운 실내 오피스, 회색 배경, 평범한 비즈니스 복장, 책상에 앉은 인물, 흰 글자만 넣은 제목, 기존 폰트를 얹기만 한 타이포, 지나친 반짝임, 읽을 수 없는 글자, 의미불명 영어, 문자 나열뿐인 디자인, 스크린샷 구도 복사, 기존 광고·잡지 표지 모방, 사진과 문자 분리된 아마추어 레이아웃, 과도한 정보량, 전단지·지방 이벤트·미용 클리닉·부업 광고풍, 기억에 안 남는 광고.

[셀프 체크]
생성 전 내부 확인: 화면이 어둡지 않은가 / 빛이 밝고 트였는가 / 포인트 컬러가 작동하는가 / 패션이 평범하지 않은가 / 제목이 단순 입력처럼 보이지 않는가 / 한글 타이포가 로고처럼 설계됐는가 / 사진과 문자가 분리되지 않았는가 / 랜딩페이지·정보상품풍이 아닌가 / 스마트폰에서 손이 멈추는가 / "예쁜" 것뿐 아니라 "신경 쓰이는 위화감"이 있는가. 문제 있으면 출력 전 내부 개선.

[마감 품질]
일류 광고대행사 아트 디렉터가 만든 고예산 실사 에디토리얼 광고 포스터로. 사진은 밝고 빛이 아름답고 피부·옷 질감이 자연스럽고 구도에 긴장감. 타이포는 한글 조판으로 아름답고 로고처럼 기억에 남게. 배색은 첨부를 출발점으로 광고 품격 + 스마트폰 시선 유도. 인상: "세련됐다 / 밝다 / 신뢰할 수 있다 / 세계관이 있다 / 본 적 있는 듯 새롭다 / 더 알고 싶다".

세로형 4:5. SNS 광고·Instagram·X 게시물 이미지에 적합한 비율. 고해상도. 밝은 실사 광고 사진. 한글 타이포그래피 중시. 에디토리얼 디자인. 도시형 컬처 광고. 패션 광고 품질. 포인트 컬러 필수. 단순 입력식 제목 금지. 어두운 실내 금지. 평범한 비즈니스 복장 금지.`
      }
    ]
  }
];
