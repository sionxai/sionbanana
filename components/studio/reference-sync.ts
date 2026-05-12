import type { GeneratedImageDocument } from "@/lib/types";

export const REFERENCE_SYNC_STORAGE_KEY = "yesgem-reference-record";
export const REFERENCE_SYNC_EVENT = "yesgem:reference-updated";

export type ReferenceSyncPayload = {
  record: GeneratedImageDocument | null;
  source?: string;
};

function isDataUrl(value?: string | null): boolean {
  return typeof value === "string" && value.startsWith("data:");
}

function compactReferenceRecord(record: GeneratedImageDocument): GeneratedImageDocument {
  const compact: GeneratedImageDocument = { ...record, metadata: record.metadata ? { ...record.metadata } : undefined };

  if (isDataUrl(compact.imageUrl)) {
    delete compact.imageUrl;
  }
  if (isDataUrl(compact.thumbnailUrl)) {
    delete compact.thumbnailUrl;
  }
  if (isDataUrl(compact.originalImageUrl)) {
    delete compact.originalImageUrl;
  }
  if (compact.diff) {
    compact.diff = { ...compact.diff };
    if (isDataUrl(compact.diff.beforeUrl)) {
      delete compact.diff.beforeUrl;
    }
    if (isDataUrl(compact.diff.afterUrl)) {
      delete compact.diff.afterUrl;
    }
  }

  return compact;
}

export function broadcastReferenceUpdate(record: GeneratedImageDocument | null, source?: string) {
  if (typeof window === "undefined") {
    return;
  }

  const compactRecord = record ? compactReferenceRecord(record) : null;

  try {
    if (compactRecord) {
      window.localStorage.setItem(REFERENCE_SYNC_STORAGE_KEY, JSON.stringify(compactRecord));
    } else {
      window.localStorage.removeItem(REFERENCE_SYNC_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist reference update", error);
  }

  try {
    const payload: ReferenceSyncPayload = { record: compactRecord, source };
    window.dispatchEvent(new CustomEvent(REFERENCE_SYNC_EVENT, { detail: payload }));
  } catch (error) {
    console.warn("Failed to dispatch reference update", error);
  }
}

export function readStoredReference(): GeneratedImageDocument | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(REFERENCE_SYNC_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as GeneratedImageDocument;
    }
  } catch (error) {
    console.warn("Failed to read reference record", error);
  }
  return null;
}
