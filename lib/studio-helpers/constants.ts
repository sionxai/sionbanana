export const REFERENCE_IMAGE_DOC_ID = "reference-image";
export const LOCAL_STORAGE_KEY = "yesgem-local-records";
export const REFERENCE_GALLERY_STORAGE_KEY = "yesgem-reference-slots";
export const INITIAL_REFERENCE_SLOT_COUNT = 3;
export const MAX_REFERENCE_SLOT_COUNT = 8;
export const MAX_REFERENCE_GALLERY_COUNT = MAX_REFERENCE_SLOT_COUNT;

export interface ReferenceSlotState {
  id: string;
  imageUrl: string | null;
  handle: string;
  updatedAt: string;
  source?: "manual" | "character-mention";
  characterId?: string;
}

export function normalizeReferenceHandle(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^@+/, "") : "";
}

export function createManualReferenceHandle(index: number): string {
  return `ref${index + 1}`;
}

export function createReferenceSlot(handle?: string): ReferenceSlotState {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    imageUrl: null,
    handle: normalizeReferenceHandle(handle),
    updatedAt: new Date().toISOString()
  };
}
