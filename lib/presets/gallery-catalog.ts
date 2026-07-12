import {
  EXTERNAL_PRESET_GROUPS,
  type ExternalPresetGroup
} from "@/components/studio/external-preset-config";

export type GalleryCategory =
  | "ad"
  | "fashion"
  | "character"
  | "camera"
  | "product"
  | "space"
  | "story"
  | "info"
  | "edit"
  | "food";

export const GALLERY_CATEGORIES: ReadonlyArray<{
  id: GalleryCategory;
  name: string;
}> = [
  { id: "ad", name: "광고·에디토리얼" },
  { id: "fashion", name: "인물·패션" },
  { id: "character", name: "캐릭터·디자인" },
  { id: "camera", name: "카메라·연출" },
  { id: "product", name: "제품·마케팅" },
  { id: "space", name: "공간·건축" },
  { id: "story", name: "스토리·콘텐츠" },
  { id: "info", name: "정보·교육" },
  { id: "edit", name: "편집·복원" },
  { id: "food", name: "푸드" }
];

export type BatchCommandId =
  | "character-sheet"
  | "view-360"
  | "9zoom"
  | "9angle"
  | "9focal"
  | "action9"
  | "photo-dump"
  | "photo-dump-dynamic"
  | "emotion"
  | "teal-orange";

export type GalleryThumbnail = {
  kind: "curated" | "placeholder";
  src?: string;
};

export interface GalleryCard {
  id: string;
  action: "insert-prompt" | "run-batch";
  category: GalleryCategory;
  titleKo: string;
  titleEn?: string;
  description: string;
  tags: string[];
  version: string;
  modelBadge: string;
  thumbnail: GalleryThumbnail;
  prompt?: string;
  batch?: {
    commandId: BatchCommandId;
    requiresReference: boolean;
    expectedOutput: string;
  };
}

export const EXTERNAL_CATEGORY_BY_ID: Record<string, GalleryCategory> = {
  "editorial-ad-poster": "ad",
  "case-05": "fashion",
  "case-06": "fashion",
  "case-08": "fashion",
  "case-11": "fashion",
  "case-15": "fashion",
  "case-21": "fashion",
  "case-22": "fashion",
  "case-26": "fashion",
  "case-36": "fashion",
  "case-52": "fashion",
  "case-63": "fashion",
  "case-01": "character",
  "case-10": "character",
  "case-12": "character",
  "case-13": "character",
  "case-17": "character",
  "case-32": "character",
  "case-40": "character",
  "case-43": "character",
  "case-45": "character",
  "case-46": "character",
  "case-55": "character",
  "case-68": "character",
  "case-69": "character",
  "case-70": "character",
  "case-77": "character",
  "case-88": "character",
  "case-09": "camera",
  "case-23": "camera",
  "case-62": "camera",
  "case-30": "product",
  "case-41": "product",
  "case-53": "product",
  "case-60": "product",
  "case-64": "product",
  "case-65": "product",
  "case-67": "product",
  "case-82": "product",
  "case-83": "product",
  "case-89": "product",
  "case-91": "product",
  "case-02": "space",
  "case-03": "space",
  "case-04": "space",
  "case-33": "space",
  "case-38": "space",
  "case-51": "space",
  "case-54": "space",
  "case-59": "space",
  "case-61": "space",
  "case-66": "space",
  "case-71": "space",
  "case-75": "space",
  "case-85": "space",
  "case-24": "story",
  "case-31": "story",
  "case-35": "story",
  "case-39": "story",
  "case-56": "story",
  "case-57": "story",
  "case-79": "story",
  "case-81": "story",
  "case-84": "story",
  "case-86": "story",
  "case-90": "story",
  "case-14": "info",
  "case-16": "info",
  "case-19": "info",
  "case-28": "info",
  "case-29": "info",
  "case-37": "info",
  "case-47": "info",
  "case-72": "info",
  "case-76": "info",
  "case-80": "info",
  "case-87": "info",
  "case-07": "edit",
  "case-20": "edit",
  "case-25": "edit",
  "case-27": "edit",
  "case-34": "edit",
  "case-42": "edit",
  "case-44": "edit",
  "case-49": "edit",
  "case-50": "edit",
  "case-58": "edit",
  "case-74": "edit",
  "case-18": "food",
  "case-48": "food",
  "case-73": "food",
  "case-78": "food"
};

const CATEGORY_NAME_BY_ID = new Map(
  GALLERY_CATEGORIES.map(({ id, name }) => [id, name])
);

function buildExternalTags(
  category: GalleryCategory,
  note?: string
): string[] {
  const categoryName = CATEGORY_NAME_BY_ID.get(category);
  if (!categoryName) {
    return [];
  }

  const noteTags = note?.split(/[\s·]+/).filter(Boolean) ?? [];
  return Array.from(new Set([categoryName, ...noteTags])).slice(0, 5);
}

export function buildExternalGalleryCards(
  groups: ExternalPresetGroup[] = EXTERNAL_PRESET_GROUPS
): GalleryCard[] {
  return groups.flatMap((group) =>
    group.options.map((option) => {
      const category = EXTERNAL_CATEGORY_BY_ID[option.id] ?? "story";
      const isEditorialAdPoster = option.id === "editorial-ad-poster";

      return {
        id: `external:${option.id}`,
        action: "insert-prompt",
        category,
        titleKo: option.labelKo,
        titleEn: option.label,
        description: option.note ?? option.label,
        tags: isEditorialAdPoster
          ? ["광고", "실사", "포스터", "한글타이포", "인물"]
          : buildExternalTags(category, option.note),
        version: "v1.0",
        modelBadge: "이미지 프롬프트",
        thumbnail: isEditorialAdPoster
          ? {
              kind: "curated",
              src: "/presets/thumbnails/editorial-ad-poster.webp"
            }
          : { kind: "placeholder" },
        prompt: option.prompt
      };
    })
  );
}

export const BATCH_GALLERY_CARDS: GalleryCard[] = [
  {
    id: "batch:character-sheet",
    action: "run-batch",
    category: "character",
    titleKo: "캐릭터 시트",
    titleEn: "Character Sheet",
    description:
      "기준 인물로 표정·앵글이 정리된 캐릭터 레퍼런스 시트 1장(내부 6패널).",
    tags: ["캐릭터", "시트", "기준이미지"],
    version: "6패널",
    modelBadge: "현재 이미지 모델",
    thumbnail: { kind: "placeholder" },
    batch: {
      commandId: "character-sheet",
      requiresReference: true,
      expectedOutput: "1장 고정"
    }
  },
  {
    id: "batch:view-360",
    action: "run-batch",
    category: "camera",
    titleKo: "360도 뷰",
    titleEn: "360° Turnaround",
    description: "기준 이미지를 회전시켜 여러 방향의 360도 뷰를 생성합니다.",
    tags: ["카메라", "회전", "멀티컷", "기준이미지"],
    version: "멀티컷",
    modelBadge: "현재 이미지 모델",
    thumbnail: { kind: "placeholder" },
    batch: {
      commandId: "view-360",
      requiresReference: true,
      expectedOutput: "12 × Count"
    }
  },
  {
    id: "batch:9zoom",
    action: "run-batch",
    category: "camera",
    titleKo: "9ZOOM",
    titleEn: "9-Shot Zoom",
    description: "기준 이미지를 서로 다른 줌과 심도로 구성한 9컷을 생성합니다.",
    tags: ["카메라", "렌즈", "심도", "9컷", "기준이미지"],
    version: "9컷",
    modelBadge: "현재 이미지 모델",
    thumbnail: { kind: "placeholder" },
    batch: {
      commandId: "9zoom",
      requiresReference: true,
      expectedOutput: "9장 고정"
    }
  },
  {
    id: "batch:9angle",
    action: "run-batch",
    category: "camera",
    titleKo: "9앵글",
    titleEn: "9-Angle",
    description: "기준 이미지를 아홉 가지 카메라 앵글로 변주한 9컷을 생성합니다.",
    tags: ["카메라", "앵글", "9컷", "기준이미지"],
    version: "9컷",
    modelBadge: "현재 이미지 모델",
    thumbnail: { kind: "placeholder" },
    batch: {
      commandId: "9angle",
      requiresReference: true,
      expectedOutput: "9장 고정"
    }
  },
  {
    id: "batch:9focal",
    action: "run-batch",
    category: "camera",
    titleKo: "9화각",
    titleEn: "9-Focal",
    description: "기준 이미지를 아홉 가지 화각으로 재구성한 9컷을 생성합니다.",
    tags: ["카메라", "화각", "9컷", "기준이미지"],
    version: "9컷",
    modelBadge: "현재 이미지 모델",
    thumbnail: { kind: "placeholder" },
    batch: {
      commandId: "9focal",
      requiresReference: true,
      expectedOutput: "9장 고정"
    }
  },
  {
    id: "batch:action9",
    action: "run-batch",
    category: "story",
    titleKo: "액션9",
    titleEn: "Action 9",
    description: "기준 인물의 역동적인 액션을 연속 장면처럼 구성한 9컷을 생성합니다.",
    tags: ["스토리", "액션", "멀티컷", "기준이미지"],
    version: "9컷",
    modelBadge: "현재 이미지 모델",
    thumbnail: { kind: "placeholder" },
    batch: {
      commandId: "action9",
      requiresReference: true,
      expectedOutput: "9장 고정"
    }
  },
  {
    id: "batch:photo-dump",
    action: "run-batch",
    category: "fashion",
    titleKo: "포토 덤프 26컷",
    titleEn: "Photo Dump",
    description: "기준 인물로 SNS 포토 덤프 스타일의 다양한 장면 26컷을 생성합니다.",
    tags: ["인물", "멀티컷", "SNS", "기준이미지"],
    version: "26컷",
    modelBadge: "현재 이미지 모델",
    thumbnail: { kind: "placeholder" },
    batch: {
      commandId: "photo-dump",
      requiresReference: true,
      expectedOutput: "26 × Count"
    }
  },
  {
    id: "batch:photo-dump-dynamic",
    action: "run-batch",
    category: "fashion",
    titleKo: "포토 덤프 12컷",
    titleEn: "Photo Dump Style",
    description: "기준 인물을 역동적인 포토 덤프 스타일로 변주한 12컷을 생성합니다.",
    tags: ["인물", "멀티컷", "스타일", "기준이미지"],
    version: "12컷",
    modelBadge: "현재 이미지 모델",
    thumbnail: { kind: "placeholder" },
    batch: {
      commandId: "photo-dump-dynamic",
      requiresReference: true,
      expectedOutput: "12 × Count"
    }
  },
  {
    id: "batch:emotion",
    action: "run-batch",
    category: "fashion",
    titleKo: "감정 프리셋 12컷",
    titleEn: "Emotion Study",
    description: "기준 인물의 다양한 감정과 표정을 탐구한 12컷을 생성합니다.",
    tags: ["인물", "감정", "멀티컷", "기준이미지"],
    version: "12컷",
    modelBadge: "현재 이미지 모델",
    thumbnail: { kind: "placeholder" },
    batch: {
      commandId: "emotion",
      requiresReference: true,
      expectedOutput: "12 × Count"
    }
  },
  {
    id: "batch:teal-orange",
    action: "run-batch",
    category: "edit",
    titleKo: "틸 & 오렌지 그레이딩",
    titleEn: "Teal & Orange",
    description: "기준 이미지에 시네마틱한 틸 & 오렌지 컬러 그레이딩을 적용합니다.",
    tags: ["편집", "컬러그레이딩", "시네마틱", "기준이미지"],
    version: "1컷",
    modelBadge: "현재 이미지 모델",
    thumbnail: { kind: "placeholder" },
    batch: {
      commandId: "teal-orange",
      requiresReference: true,
      expectedOutput: "1 × Count"
    }
  }
];

export function getGalleryCards(
  action: "insert-prompt" | "run-batch"
): GalleryCard[] {
  return action === "insert-prompt"
    ? buildExternalGalleryCards()
    : BATCH_GALLERY_CARDS;
}
