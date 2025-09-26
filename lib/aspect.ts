import type { AspectRatioPreset } from "@/lib/types";

export const DEFAULT_ASPECT_RATIO: AspectRatioPreset = "original";

export const ASPECT_RATIO_PRESETS: Array<{ value: AspectRatioPreset; label: string }> = [
  { value: "original", label: "원본 그대로" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" }
];

export function getAspectRatioLabel(value: AspectRatioPreset | null | undefined): string {
  if (!value || value === DEFAULT_ASPECT_RATIO) {
    return "원본 그대로";
  }
  const preset = ASPECT_RATIO_PRESETS.find(item => item.value === value);
  return preset?.label ?? value;
}

const ASPECT_RATIO_PROMPT_DESCRIPTIONS: Record<AspectRatioPreset, string> = {
  original: "original framing",
  "16:9": "wide cinematic 16:9 composition",
  "9:16": "vertical 9:16 poster composition",
  "1:1": "balanced square 1:1 composition",
  "4:3": "classic 4:3 photographic composition"
};

export function describeAspectRatioForPrompt(value: AspectRatioPreset | string | null | undefined): string | null {
  if (!value || value === DEFAULT_ASPECT_RATIO) {
    return null;
  }
  const preset = ASPECT_RATIO_PROMPT_DESCRIPTIONS[value as AspectRatioPreset];
  if (preset) {
    return preset;
  }
  return `${value} composition`;
}

export function getAspectRatioDimensions(
  value: AspectRatioPreset | string | null | undefined,
  {
    targetLongSide = 1536
  }: {
    targetLongSide?: number;
  } = {}
): { width: number; height: number } | null {
  if (!value || value === DEFAULT_ASPECT_RATIO) {
    return null;
  }

  const preset = value as AspectRatioPreset;
  const ratioMap: Record<AspectRatioPreset, [number, number]> = {
    original: [1, 1],
    "16:9": [16, 9],
    "9:16": [9, 16],
    "1:1": [1, 1],
    "4:3": [4, 3]
  };

  const normalized = ratioMap[preset] ?? (() => {
    const parts = value.split(":").map(part => Number(part.trim()));
    if (parts.length === 2 && parts.every(num => Number.isFinite(num) && num > 0)) {
      return [parts[0], parts[1]] as [number, number];
    }
    return null;
  })();

  if (!normalized) {
    return null;
  }

  const [wRatio, hRatio] = normalized;
  const longest = Math.max(wRatio, hRatio);
  const scale = targetLongSide / longest;
  const width = Math.round(wRatio * scale);
  const height = Math.round(hRatio * scale);
  return { width, height };
}
