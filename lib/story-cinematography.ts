export type CinematographyFraming =
  | "extreme-long-shot"
  | "long-shot"
  | "full-shot"
  | "medium-shot"
  | "medium-close-up"
  | "close-up"
  | "extreme-close-up";

export type CinematographyAngle =
  | "eye-level"
  | "high-angle"
  | "low-angle"
  | "dutch-angle"
  | "birds-eye"
  | "worms-eye";

export type CinematographySpecial =
  | "over-the-shoulder"
  | "point-of-view"
  | "insert-shot"
  | "reaction-shot"
  | "establishing-shot"
  | "two-shot";

export type SceneCinematography = {
  framing: CinematographyFraming;
  angle: CinematographyAngle;
  special?: CinematographySpecial | null;
};

export type CinematographyOption<TId extends string> = {
  id: TId;
  label: string;
  keyword: string;
  description: string;
  code?: string;
};

export const FRAMING_OPTIONS = [
  {
    id: "extreme-long-shot",
    label: "익스트림 롱샷",
    keyword: "extreme long shot",
    description: "장소와 인물의 관계를 크게 보여주는 넓은 원경입니다.",
    code: "ELS"
  },
  {
    id: "long-shot",
    label: "롱샷",
    keyword: "long shot",
    description: "인물 전신과 주변 공간을 함께 잡는 원경입니다.",
    code: "LS"
  },
  {
    id: "full-shot",
    label: "풀샷",
    keyword: "full shot",
    description: "인물 전신의 자세와 실루엣을 중심으로 보여줍니다.",
    code: "FS"
  },
  {
    id: "medium-shot",
    label: "미디엄샷",
    keyword: "medium shot",
    description: "상반신과 행동을 균형 있게 담는 기본 구도입니다.",
    code: "MS"
  },
  {
    id: "medium-close-up",
    label: "미디엄 클로즈업",
    keyword: "medium close-up",
    description: "표정과 몸짓을 함께 읽을 수 있는 가까운 구도입니다.",
    code: "MCU"
  },
  {
    id: "close-up",
    label: "클로즈업",
    keyword: "close-up",
    description: "얼굴, 손, 핵심 오브젝트의 감정과 디테일을 강조합니다.",
    code: "CU"
  },
  {
    id: "extreme-close-up",
    label: "익스트림 클로즈업",
    keyword: "extreme close-up",
    description: "눈빛이나 소품 일부처럼 아주 작은 디테일을 강하게 보여줍니다.",
    code: "ECU"
  }
] as const satisfies ReadonlyArray<CinematographyOption<CinematographyFraming> & { code: string }>;

export const ANGLE_OPTIONS = [
  {
    id: "eye-level",
    label: "아이레벨",
    keyword: "eye-level angle",
    description: "피사체와 같은 높이에서 안정적이고 자연스럽게 바라봅니다."
  },
  {
    id: "high-angle",
    label: "하이앵글",
    keyword: "high-angle composition",
    description: "위에서 내려다보며 피사체를 작거나 취약하게 느끼게 합니다."
  },
  {
    id: "low-angle",
    label: "로우앵글",
    keyword: "low-angle composition",
    description: "아래에서 올려다보며 피사체의 존재감과 긴장감을 키웁니다."
  },
  {
    id: "dutch-angle",
    label: "더치앵글",
    keyword: "dutch-angle composition",
    description: "기울어진 프레임으로 불안, 혼란, 에너지를 더합니다."
  },
  {
    id: "birds-eye",
    label: "버드아이",
    keyword: "bird's-eye view",
    description: "높은 수직 시점으로 배치와 동선을 한눈에 보여줍니다."
  },
  {
    id: "worms-eye",
    label: "웜아이",
    keyword: "worm's-eye view",
    description: "극단적으로 낮은 시점에서 규모감과 압도감을 만듭니다."
  }
] as const satisfies ReadonlyArray<CinematographyOption<CinematographyAngle>>;

export const SPECIAL_OPTIONS = [
  {
    id: "over-the-shoulder",
    label: "OTS",
    keyword: "over-the-shoulder view",
    description: "어깨 너머 시점으로 대화와 관계의 긴장을 보여줍니다."
  },
  {
    id: "point-of-view",
    label: "POV",
    keyword: "point-of-view shot",
    description: "인물의 눈으로 보는 주관적 시점을 만듭니다."
  },
  {
    id: "insert-shot",
    label: "인서트",
    keyword: "insert shot",
    description: "손, 편지, 열쇠 같은 핵심 디테일을 별도 컷처럼 강조합니다."
  },
  {
    id: "reaction-shot",
    label: "리액션",
    keyword: "reaction shot",
    description: "사건에 반응하는 표정과 감정을 중심으로 잡습니다."
  },
  {
    id: "establishing-shot",
    label: "이스태블리싱",
    keyword: "establishing shot",
    description: "장소, 시간대, 분위기를 먼저 이해시키는 도입 컷입니다."
  },
  {
    id: "two-shot",
    label: "투샷",
    keyword: "two-shot",
    description: "두 인물을 한 프레임에 담아 관계와 거리를 보여줍니다."
  }
] as const satisfies ReadonlyArray<CinematographyOption<CinematographySpecial>>;

const FALLBACK_SEQUENCE: SceneCinematography[] = [
  { framing: "extreme-long-shot", angle: "eye-level", special: "establishing-shot" },
  { framing: "medium-shot", angle: "low-angle", special: null },
  { framing: "close-up", angle: "eye-level", special: "reaction-shot" },
  { framing: "medium-close-up", angle: "high-angle", special: null },
  { framing: "long-shot", angle: "high-angle", special: "two-shot" },
  { framing: "full-shot", angle: "low-angle", special: null },
  { framing: "extreme-close-up", angle: "eye-level", special: "insert-shot" },
  { framing: "medium-shot", angle: "dutch-angle", special: null },
  { framing: "long-shot", angle: "birds-eye", special: "establishing-shot" },
  { framing: "medium-close-up", angle: "worms-eye", special: null }
];

const FRAMING_IDS = new Set<CinematographyFraming>(FRAMING_OPTIONS.map(option => option.id));
const ANGLE_IDS = new Set<CinematographyAngle>(ANGLE_OPTIONS.map(option => option.id));
const SPECIAL_IDS = new Set<CinematographySpecial>(SPECIAL_OPTIONS.map(option => option.id));

function getFallback(sceneIndex: number): SceneCinematography {
  const safeIndex = Number.isFinite(sceneIndex) ? Math.max(0, Math.trunc(sceneIndex)) : 0;
  return FALLBACK_SEQUENCE[safeIndex % FALLBACK_SEQUENCE.length];
}

function isCinematographyFraming(value: unknown): value is CinematographyFraming {
  return typeof value === "string" && FRAMING_IDS.has(value as CinematographyFraming);
}

function isCinematographyAngle(value: unknown): value is CinematographyAngle {
  return typeof value === "string" && ANGLE_IDS.has(value as CinematographyAngle);
}

function isCinematographySpecial(value: unknown): value is CinematographySpecial {
  return typeof value === "string" && SPECIAL_IDS.has(value as CinematographySpecial);
}

export function getCinematographyFramingOption(id: CinematographyFraming) {
  return FRAMING_OPTIONS.find(option => option.id === id) ?? FRAMING_OPTIONS[0];
}

export function getCinematographyAngleOption(id: CinematographyAngle) {
  return ANGLE_OPTIONS.find(option => option.id === id) ?? ANGLE_OPTIONS[0];
}

export function getCinematographySpecialOption(id: CinematographySpecial) {
  return SPECIAL_OPTIONS.find(option => option.id === id) ?? SPECIAL_OPTIONS[0];
}

export function normalizeCinematography(raw: unknown, sceneIndex: number): SceneCinematography {
  const fallback = getFallback(sceneIndex);
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawSpecial = record.special;

  return {
    framing: isCinematographyFraming(record.framing) ? record.framing : fallback.framing,
    angle: isCinematographyAngle(record.angle) ? record.angle : fallback.angle,
    special:
      rawSpecial === null
        ? null
        : isCinematographySpecial(rawSpecial)
          ? rawSpecial
          : fallback.special ?? null
  };
}

export function buildCinematographySuffix(cinematography: SceneCinematography): string {
  const framing = getCinematographyFramingOption(cinematography.framing);
  const angle = getCinematographyAngleOption(cinematography.angle);
  const special = cinematography.special ? getCinematographySpecialOption(cinematography.special) : null;

  return [
    `Camera: ${framing.keyword}`,
    angle.keyword,
    special?.keyword
  ].filter(Boolean).join(", ") + ".";
}
