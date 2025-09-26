import type { GeneratedImageDocument } from "@/lib/types";

export const REFERENCE_SYNC_STORAGE_KEY = "yesgem-reference-record";
export const REFERENCE_SYNC_EVENT = "yesgem:reference-updated";

export type ReferenceSyncPayload = {
  record: GeneratedImageDocument | null;
  source?: string;
};

export function broadcastReferenceUpdate(record: GeneratedImageDocument | null, source?: string) {
  try {
    if (typeof window !== "undefined") {
      if (record) {
        window.localStorage.setItem(REFERENCE_SYNC_STORAGE_KEY, JSON.stringify(record));
      } else {
        window.localStorage.removeItem(REFERENCE_SYNC_STORAGE_KEY);
      }
      const payload: ReferenceSyncPayload = { record, source };
      window.dispatchEvent(new CustomEvent(REFERENCE_SYNC_EVENT, { detail: payload }));
    }
  } catch (error) {
    console.warn("Failed to broadcast reference update", error);
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
