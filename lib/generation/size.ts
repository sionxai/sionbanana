const ASPECT_RATIO_SIZES = {
  "1:1": { oneK: "1024x1024", twoK: "2048x2048" },
  "16:9": { oneK: "1824x1024", twoK: "2048x1152" },
  "9:16": { oneK: "1024x1824", twoK: "1152x2048" },
  "4:3": { oneK: "1360x1024", twoK: "1360x1024" }
} as const;

export function resolveRequestedSize(imageSize: unknown, aspectRatio: unknown): string | undefined {
  if (
    typeof aspectRatio === "string" &&
    Object.prototype.hasOwnProperty.call(ASPECT_RATIO_SIZES, aspectRatio)
  ) {
    const dimensions = typeof imageSize === "string"
      ? imageSize.match(/^(\d+)x(\d+)$/)
      : null;
    const isTwoK = dimensions
      ? Number(dimensions[1]) * Number(dimensions[2]) >= 2048 * 1152
      : false;
    const sizes = ASPECT_RATIO_SIZES[aspectRatio as keyof typeof ASPECT_RATIO_SIZES];
    return isTwoK ? sizes.twoK : sizes.oneK;
  }

  if (typeof imageSize === "string") {
    return imageSize;
  }
  if (typeof aspectRatio === "string") {
    return aspectRatio;
  }
  return undefined;
}
