import type { LightingPresetCategory } from "@/components/studio/types";

export interface LightingPresetOption {
  value: string;
  label: string;
  prompt: string;
}

export interface LightingPresetGroup {
  key: LightingPresetCategory;
  title: string;
  description?: string;
  options: LightingPresetOption[];
}

export const LIGHTING_MODE_BASE_PROMPT =
  "High fidelity portrait of the supplied reference character. Maintain identical pose, styling, and composition while adjusting only the lighting mood, atmosphere, and time-of-day as instructed.";

export const LIGHTING_PRESET_GROUPS: LightingPresetGroup[] = [
  {
    key: "illumination",
    title: "조명 · 광원",
    options: [
      {
        value: "soft-studio",
        label: "부드러운 스튜디오 조명",
        prompt: "Light the subject with soft, diffused studio key and fill for even highlights and gentle shadows."
      },
      {
        value: "rim-light",
        label: "림 라이트",
        prompt: "Add a focused rim light from behind to carve out the subject's silhouette with a crisp luminous edge."
      },
      {
        value: "volumetric-glow",
        label: "불륨메트릭 글로우",
        prompt: "Introduce atmospheric volumetric beams that glow through the air, emphasizing depth around the subject."
      },
      {
        value: "morning-sun",
        label: "자연광 아침햇살",
        prompt: "Simulate gentle morning sunlight entering at a low angle with warm highlights and soft bounce fill."
      },
      {
        value: "dramatic-spot",
        label: "드라마틱 스포트 라이트",
        prompt: "Spotlight the subject with a dramatic focused beam, letting surrounding areas fall into deeper shadow."
      },
      {
        value: "neon",
        label: "네온 조명",
        prompt: "Flood the scene with vibrant neon signage colors—electric magenta, cyan, and violet reflections."
      },
      {
        value: "candle",
        label: "촛불",
        prompt: "Illuminate with flickering candlelight for intimate, warm contrast and dancing highlights."
      },
      {
        value: "moonlight",
        label: "달빛",
        prompt: "Cast cool moonlight with silver-blue tones and long, soft-edged shadows."
      },
      {
        value: "golden-sunset",
        label: "황금 빛 석양",
        prompt: "Wrap the subject in golden hour sunset hues with radiant rim highlights and warm gradients."
      },
      {
        value: "harsh-noon",
        label: "강한 정오의 태양",
        prompt: "Blast strong overhead noon sunlight that creates crisp, high-contrast shadows."
      },
      {
        value: "backlit-silhouette",
        label: "역광 실루엣",
        prompt: "Position a bright backlight to create a dramatic silhouette with a halo glow around the subject."
      },
      {
        value: "gentle-natural",
        label: "은은한 자연광",
        prompt: "Use gentle natural window light with subtle bounce fill for a calm, airy ambience."
      }
    ]
  },
  {
    key: "atmosphere",
    title: "날씨 · 대기",
    options: [
      {
        value: "clear-sky",
        label: "맑은 하늘",
        prompt: "Place the subject under a crystal clear sky with bright, clean ambient illumination."
      },
      {
        value: "overcast",
        label: "흐린",
        prompt: "Diffuse the lighting with an overcast sky for soft, shadowless tonality."
      },
      {
        value: "rainy",
        label: "비오는",
        prompt: "Add rainy weather with damp reflections, raindrops, and subtle motion streaks."
      },
      {
        value: "foggy",
        label: "안개낀",
        prompt: "Fill the scene with low-lying fog that softens depth and desaturates distant elements."
      },
      {
        value: "bright-sunny",
        label: "화창한",
        prompt: "Create a radiant sunny atmosphere with cheerful, luminous ambient light."
      },
      {
        value: "snowy",
        label: "눈오는",
        prompt: "Introduce falling snowflakes, frosty air, and cool-white reflections."
      },
      {
        value: "sunshower",
        label: "연우",
        prompt: "Blend gentle rainfall with passing sunlight for sparkling droplets in the air."
      },
      {
        value: "storm",
        label: "폭풍우",
        prompt: "Surround the scene with heavy storm clouds, wind, and distant lightning flashes."
      },
      {
        value: "dusty",
        label: "먼지날리는",
        prompt: "Add drifting dust motes and warm haze that catch the light."
      },
      {
        value: "smog",
        label: "스모그",
        prompt: "Layer dense smog that mutes colors and blurs distant shapes."
      },
      {
        value: "aurora",
        label: "오로라",
        prompt: "Paint the sky with a vibrant aurora curtain casting ethereal colored light."
      },
      {
        value: "dense-fog",
        label: "안개자욱한",
        prompt: "Envelop the subject in thick fog that obscures the background and softens silhouettes."
      },
      {
        value: "sandstorm",
        label: "모래폭풍",
        prompt: "Whip up a desert sandstorm with swirling grit and golden, diffused light."
      },
      {
        value: "hazy",
        label: "흐릿한",
        prompt: "Introduce a gentle atmospheric haze that slightly blurs and desaturates the scene."
      }
    ]
  },
  {
    key: "time",
    title: "시간대",
    options: [
      {
        value: "golden-hour",
        label: "골든아워",
        prompt: "Set the lighting to golden hour with low sun and rich amber highlights."
      },
      {
        value: "blue-hour",
        label: "블루아워",
        prompt: "Shift into blue hour twilight with cool, cinematic tones."
      },
      {
        value: "sunrise",
        label: "일출",
        prompt: "Capture the moment of sunrise with glowing horizon light and fresh warmth."
      },
      {
        value: "sunset",
        label: "일몰",
        prompt: "Paint the sky with saturated sunset gradients and lingering warmth."
      },
      {
        value: "noon",
        label: "정오",
        prompt: "Illuminate the scene with bright, neutral midday sunlight."
      },
      {
        value: "night",
        label: "야간",
        prompt: "Set a night-time mood with deep shadows and selective highlights."
      },
      {
        value: "dawn",
        label: "새벽",
        prompt: "Use pre-dawn light with cool, pastel tones and gentle contrast."
      },
      {
        value: "early-morning",
        label: "이른 아침",
        prompt: "Depict early morning freshness with crisp air and tender light."
      },
      {
        value: "late-afternoon",
        label: "늦은 오후",
        prompt: "Use late afternoon sun with elongated shadows and mellow warmth."
      },
      {
        value: "dusk",
        label: "황혼",
        prompt: "Transition into dusk with fading light and muted color saturation."
      },
      {
        value: "midnight",
        label: "자정",
        prompt: "Shift to midnight darkness with subtle ambient spill and star-lit accents."
      },
      {
        value: "magic-hour",
        label: "매직아워",
        prompt: "Blend warm and cool tones for a cinematic magic-hour glow."
      },
      {
        value: "witching-hour",
        label: "마녀의 시간",
        prompt: "Evoke the witching hour with mysterious moonlit contrast and long shadows."
      },
      {
        value: "sundown",
        label: "해질녘",
        prompt: "Capture the quiet of sundown with fading light and tranquil atmosphere."
      }
    ]
  },
  {
    key: "cinematic",
    title: "영화적 색감",
    description: "블록버스터와 영화 스타일의 컬러그레이딩",
    options: [
      {
        value: "teal-orange",
        label: "틸 & 오렌지",
        prompt: "[기준이미지], cinematic teal & orange grade, warm skin tones vs cool background, modern blockbuster LUT style"
      },
      {
        value: "bleach-bypass",
        label: "블리치 바이패스",
        prompt: "[기준이미지], bleach bypass look, desaturated colors, high contrast, metallic rough texture, war thriller documentary realism"
      },
      {
        value: "golden-hour-grade",
        label: "골든아워 그레이딩",
        prompt: "[기준이미지], golden-hour warm grade, romantic sunset mood, amber orange highlights, soft bloom"
      },
      {
        value: "day-for-night",
        label: "낮을 밤처럼",
        prompt: "[기준이미지], day-for-night blue cast, cool shift blue tint, desaturated moonlight simulation"
      },
      {
        value: "technicolor",
        label: "테크니컬러",
        prompt: "[기준이미지], technicolor 3-strip emulation, vivid primary colors, classic theater cinema feel"
      }
    ]
  },
  {
    key: "artistic",
    title: "예술적 색감",
    description: "독창적이고 예술적인 컬러 스타일",
    options: [
      {
        value: "pastel-tone",
        label: "파스텔 톤",
        prompt: "[기준이미지], soft pastel grade, gentle dreamy colors, low contrast, romantic drama tone"
      },
      {
        value: "monochromatic-red",
        label: "모노크롬 (레드)",
        prompt: "[기준이미지], monochromatic grade in red, single color scheme, artistic minimal look"
      },
      {
        value: "sepia-vintage",
        label: "세피아 / 빈티지",
        prompt: "[기준이미지], vintage sepia film look, nostalgic brown tint, film grain, classic period drama"
      },
      {
        value: "cross-processing",
        label: "크로스 프로세싱",
        prompt: "[기준이미지], cross-processed film look, unusual color shifts, green cyan cast, fashion art style"
      }
    ]
  },
  {
    key: "harmony",
    title: "색조 조화",
    description: "색상 이론 기반의 조화로운 배색",
    options: [
      {
        value: "complementary",
        label: "보색 조화",
        prompt: "[기준이미지], complementary scheme, dramatic color contrast, strong visual impact, action thriller"
      },
      {
        value: "analogous",
        label: "유사색 조화",
        prompt: "[기준이미지], analogous harmony using adjacent colors, natural soft mood, pastoral serene feeling"
      },
      {
        value: "triadic",
        label: "삼색 조화",
        prompt: "[기준이미지], triadic harmony with 120° spaced colors, vibrant lively world, fantasy family film"
      },
      {
        value: "split-complementary",
        label: "분할 보색",
        prompt: "[기준이미지], split-complementary scheme, balanced tension with soft contrast, mystery comedy balance"
      },
      {
        value: "tetradic",
        label: "테트라딕 (사각)",
        prompt: "[기준이미지], tetradic scheme with double complementary pairs, rich complex color spectrum, musical blockbuster"
      },
      {
        value: "duotone",
        label: "듀오톤",
        prompt: "[기준이미지], duotone style, graphic music video aesthetic, two-color mapping, art promotional look"
      }
    ]
  },
  {
    key: "mood",
    title: "무드 연출",
    description: "분위기와 감정을 강조하는 톤",
    options: [
      {
        value: "high-key",
        label: "하이키",
        prompt: "[기준이미지], high-key bright airy grade, cheerful uplifting mood, romantic advertising style"
      },
      {
        value: "low-key",
        label: "로우키",
        prompt: "[기준이미지], low-key moody grade, dark dense atmosphere, thriller noir tension"
      },
      {
        value: "cyberpunk-neon",
        label: "사이버펑크 네온",
        prompt: "[기준이미지], neon magenta–cyan cyberpunk grade, futuristic city mood, high saturation neon reflections"
      }
    ]
  }
];

export const LIGHTING_PROMPT_LOOKUP: Record<LightingPresetCategory, Record<string, string>> = LIGHTING_PRESET_GROUPS.reduce(
  (acc, group) => {
    acc[group.key] = group.options.reduce<Record<string, string>>((map, option) => {
      map[option.value] = option.prompt;
      return map;
    }, {});
    return acc;
  },
  {
    illumination: {},
    atmosphere: {},
    time: {},
    cinematic: {},
    artistic: {},
    harmony: {},
    mood: {}
  }
);
