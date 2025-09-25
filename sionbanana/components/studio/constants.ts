export const REFERENCE_IMAGE_DOC_ID = "reference-image";
export const LOCAL_STORAGE_KEY = "yesgem-local-records";
export const REFERENCE_GALLERY_STORAGE_KEY = "yesgem-reference-slots";
export const INITIAL_REFERENCE_SLOT_COUNT = 3;
export const MAX_REFERENCE_SLOT_COUNT = 9;

export interface ReferenceSlotState {
  id: string;
  imageUrl: string | null;
  updatedAt: string;
}

export function createReferenceSlot(): ReferenceSlotState {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, imageUrl: null, updatedAt: new Date().toISOString() };
}
