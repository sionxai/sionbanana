import type { GeneratedImageDocument } from "@/lib/types";

function uniqueTrimmedTags(values: unknown[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  values.forEach(value => {
    if (typeof value !== "string") {
      return;
    }
    const tag = value.trim().replace(/^#+/, "");
    if (!tag || seen.has(tag)) {
      return;
    }
    seen.add(tag);
    tags.push(tag);
  });

  return tags;
}

export function parseHistoryTags(value: string): string[] {
  return uniqueTrimmedTags(value.split(/[,\n]/));
}

export function getHistoryRecordTags(record: GeneratedImageDocument): string[] {
  const metadataTags = record.metadata?.tags;
  const rawTags = [
    ...(Array.isArray(record.tags) ? record.tags : []),
    ...(Array.isArray(metadataTags) ? metadataTags : [])
  ];

  return uniqueTrimmedTags(rawTags);
}

export function isHistoryRecordFavorite(record: GeneratedImageDocument): boolean {
  return record.favorite === true || record.metadata?.favorite === true;
}

export function setHistoryRecordFavorite(
  record: GeneratedImageDocument,
  favorite: boolean
): GeneratedImageDocument {
  return {
    ...record,
    favorite,
    metadata: {
      ...(record.metadata ?? {}),
      favorite
    },
    updatedAt: new Date().toISOString()
  };
}

export function setHistoryRecordTags(
  record: GeneratedImageDocument,
  tags: string[] | string
): GeneratedImageDocument {
  const normalizedTags = Array.isArray(tags) ? uniqueTrimmedTags(tags) : parseHistoryTags(tags);

  return {
    ...record,
    tags: normalizedTags,
    metadata: {
      ...(record.metadata ?? {}),
      tags: normalizedTags
    },
    updatedAt: new Date().toISOString()
  };
}

export function getHistoryTagOptions(records: GeneratedImageDocument[]): string[] {
  return uniqueTrimmedTags(records.flatMap(record => getHistoryRecordTags(record))).sort((a, b) =>
    a.localeCompare(b, "ko-KR")
  );
}
