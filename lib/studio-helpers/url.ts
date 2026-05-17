import type { GeneratedImageDocument } from "@/lib/types";

export function getLocalImageIdFromUrl(value?: string | null): string | null {
  if (!value || !value.startsWith("/api/images/")) {
    return null;
  }
  const pathOnly = value.split(/[?#]/)[0];
  const id = pathOnly.slice("/api/images/".length);
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
}

export function getLocalImageIdForRecord(record: GeneratedImageDocument): string | null {
  return getLocalImageIdFromUrl(record.imageUrl) ?? getLocalImageIdFromUrl(record.thumbnailUrl);
}

export function getRecordGeneratedImageUrl(record: GeneratedImageDocument | null): string {
  // originalImageUrl is used as the "before/reference" image for diff records.
  // For previewing a generated history item, prefer the generated image itself.
  return record?.imageUrl ?? record?.thumbnailUrl ?? record?.originalImageUrl ?? "";
}

export function isDataUrl(value?: string | null): boolean {
  return typeof value === "string" && value.startsWith("data:");
}

export function getRecordPromptText(record: GeneratedImageDocument | null): string {
  return record?.promptMeta?.refinedPrompt || record?.promptMeta?.rawPrompt || "";
}

export function mergeReferenceGalleryUrls(urls: ReadonlyArray<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      urls.filter((url): url is string => Boolean(url && url.trim().length))
    )
  );
}
