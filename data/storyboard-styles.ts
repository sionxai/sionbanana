import type { StoryboardStyle } from "@/lib/storyboard/types";

export const FALLBACK_STORYBOARD_STYLES: StoryboardStyle[] = [
  {
    id: "noir",
    label: "Noir",
    description: "비 내리는 도시의 고대비 흑백 필름 스타일",
    grading: "차콜톤, 고대비, 필름그레인, 깊은 그림자 강조",
    bgm: "저음의 재즈와 느린 드럼 비트",
    sfx: ["rain drops", "neon buzzing", "leather footsteps"],
    voTone: "저음이며 거칠고 숨 섞인 톤",
    previewGradient: "from-zinc-900 via-zinc-700 to-black",
    referenceImageUrl: "https://images.unsplash.com/photo-1526481280695-3c469c3eb69d",
    prompt:
      "A rain-soaked noir alleyway with neon reflections and a lone figure in silhouette, cinematic lighting",
    order: 1,
    active: true
  },
  {
    id: "sci-fi",
    label: "Sci-Fi",
    description: "네온과 홀로그램이 가득한 미래 도시",
    grading: "차가운 블루/사이언 톤, 렌즈 플레어와 홀로그램",
    bgm: "신디사이저 기반 앰비언트, 전자음 루프",
    sfx: ["spaceship hum", "laser pulse", "digital chime"],
    voTone: "기계적이고 침착한 톤",
    previewGradient: "from-cyan-600 via-blue-700 to-slate-900",
    referenceImageUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e",
    prompt:
      "Futuristic neon-lit city skyline with hovering vehicles and holographic billboards, cinematic scale",
    order: 2,
    active: true
  },
  {
    id: "fantasy",
    label: "Fantasy",
    description: "빛나는 숲과 마법이 가득한 신비로운 분위기",
    grading: "따뜻한 골드톤과 신비로운 빛줄기",
    bgm: "오케스트라 스트링과 합창이 어우러진 장엄한 음악",
    sfx: ["forest breeze", "magical sparkle", "deep drum"],
    voTone: "따뜻하고 서사적인 나레이션 톤",
    previewGradient: "from-amber-300 via-rose-400 to-violet-600",
    referenceImageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
    prompt:
      "Enchanted glowing forest with floating particles and ancient ruins, high fantasy illustration",
    order: 3,
    active: true
  },
  {
    id: "comic",
    label: "Comic",
    description: "팝아트 스타일의 경쾌하고 유머러스한 연출",
    grading: "채도 높은 컬러, 굵은 라인과 말풍선",
    bgm: "빠른 템포의 펑크/스카 밴드 사운드",
    sfx: ["whistle pop", "comic impact", "slapstick hit"],
    voTone: "밝고 과장된 만화 스타일 톤",
    previewGradient: "from-yellow-300 via-pink-500 to-purple-600",
    referenceImageUrl: "https://images.unsplash.com/photo-1511578314322-379afb476865",
    prompt:
      "Vibrant comic-book panel with bold outlines, dynamic action pose, halftone textures",
    order: 4,
    active: true
  }
];

export const DEFAULT_STORYBOARD_STYLE_ID = "noir";

