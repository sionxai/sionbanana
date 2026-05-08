export type ToneCategory = "cinematic" | "commercial" | "documentary" | "vlog";

export type ToneOption = {
  id: string;
  category: ToneCategory;
  label: string;
  description: string;
  promptSuffix: string;
};

export const TONE_OPTIONS: ToneOption[] = [
  { id: "teal-orange", category: "cinematic", label: "틸앤오렌지", description: "차가운 그림자와 따뜻한 하이라이트의 영화색", promptSuffix: "Style: cinematic teal and orange color grading, cool shadows, warm highlights, polished contrast." },
  { id: "blockbuster", category: "cinematic", label: "블록버스터", description: "스케일감 있는 상업 영화 룩", promptSuffix: "Style: high-budget blockbuster cinema, dramatic scale, crisp lighting, dynamic depth." },
  { id: "war-grit", category: "cinematic", label: "전쟁/그릿", description: "거칠고 desaturated된 전쟁 드라마 톤", promptSuffix: "Style: gritty war drama realism, desaturated palette, harsh light, smoky atmosphere." },
  { id: "neo-noir", category: "cinematic", label: "누아르", description: "저조도와 깊은 그림자의 현대 누아르", promptSuffix: "Style: modern noir cinema, low-key lighting, deep shadows, moody contrast." },
  { id: "fantasy-epic", category: "cinematic", label: "판타지/에픽", description: "웅장하고 빛의 윤곽이 강한 판타지 영화톤", promptSuffix: "Style: epic fantasy cinema, grand atmosphere, luminous rim light, painterly realism." },
  { id: "luxury-premium", category: "commercial", label: "럭셔리", description: "고급 소재와 정제된 조명의 프리미엄 광고", promptSuffix: "Style: luxury commercial photography, refined lighting, premium materials, elegant polish." },
  { id: "minimal-product", category: "commercial", label: "미니멀 프로덕트", description: "깨끗한 구성과 스튜디오 조명", promptSuffix: "Style: minimal product campaign, clean composition, soft studio lighting, precise details." },
  { id: "fashion-editorial", category: "commercial", label: "패션 에디토리얼", description: "잡지 화보식 스타일링과 포즈", promptSuffix: "Style: fashion editorial campaign, bold styling, confident poses, magazine-grade lighting." },
  { id: "food-commercial", category: "commercial", label: "푸드 광고", description: "식감과 신선함이 잘 보이는 광고 톤", promptSuffix: "Style: appetizing food commercial, fresh texture, warm inviting light, natural color." },
  { id: "tech-modern", category: "commercial", label: "테크/모던", description: "세련된 표면감과 미래적인 절제", promptSuffix: "Style: modern tech advertising, sleek surfaces, clean highlights, futuristic restraint." },
  { id: "nature-doc", category: "documentary", label: "자연다큐", description: "자연광과 관찰자 시점의 리얼리즘", promptSuffix: "Style: nature documentary realism, natural light, patient observation, lifelike color." },
  { id: "photojournalism", category: "documentary", label: "포토저널리즘", description: "현장감 있는 캔디드 보도사진 톤", promptSuffix: "Style: photojournalistic realism, candid framing, available light, truthful detail." },
  { id: "black-white-doc", category: "documentary", label: "흑백 다큐", description: "톤 대비와 입자가 있는 흑백 기록물", promptSuffix: "Style: black and white documentary, tonal contrast, grain, honest atmosphere." },
  { id: "vintage-film-doc", category: "documentary", label: "빈티지 필름", description: "바랜 색과 필름 입자의 아카이브 느낌", promptSuffix: "Style: vintage film documentary, subtle grain, faded color, archival realism." },
  { id: "digital-realism", category: "documentary", label: "디지털 리얼리즘", description: "중립 색감과 선명한 현대 디지털 기록", promptSuffix: "Style: contemporary digital realism, neutral color, sharp detail, natural exposure." },
  { id: "daily-vlog", category: "vlog", label: "데일리", description: "편안한 일상 브이로그 톤", promptSuffix: "Style: casual daily vlog, handheld feel, soft natural light, approachable realism." },
  { id: "travel-vlog", category: "vlog", label: "트래블", description: "장소감과 활기가 살아있는 여행 영상 톤", promptSuffix: "Style: travel vlog, vivid location detail, golden-hour warmth, energetic framing." },
  { id: "lifestyle-vlog", category: "vlog", label: "라이프스타일", description: "정돈된 실내와 자연광의 생활감", promptSuffix: "Style: lifestyle vlog, cozy interiors, clean daylight, relaxed candid mood." },
  { id: "food-vlog", category: "vlog", label: "푸드 vlog", description: "테이블 근접샷과 따뜻한 자연광", promptSuffix: "Style: food vlog, close-up texture, casual tabletop framing, warm natural light." },
  { id: "nostalgic-vlog", category: "vlog", label: "노스탤직", description: "따뜻하고 부드러운 추억 영상 톤", promptSuffix: "Style: nostalgic vlog, gentle film look, warm memories, soft contrast." }
];

export const TONE_CATEGORY_LABELS: Record<ToneCategory, string> = {
  cinematic: "시네마틱",
  commercial: "광고",
  documentary: "다큐",
  vlog: "Vlog"
};
