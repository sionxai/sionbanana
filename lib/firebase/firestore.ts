// Firestore 의존이 제거되었지만 호출처가 점진적으로 정리되는 동안 stub만 유지.

export interface GeneratedImageFirestorePayload {
  mode?: string;
  status?: string;
  promptMeta?: any;
  imageUrl?: string | null;
  originalImageUrl?: string | null;
  thumbnailUrl?: string | null;
  diff?: Record<string, unknown> | null;
  metadata?: any;
  model?: string | null;
  costCredits?: number | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdAtIso?: string | null;
  updatedAtIso?: string | null;
  [key: string]: unknown;
}

export async function saveGeneratedImageDoc(
  _userId: string,
  _imageId: string,
  _payload: GeneratedImageFirestorePayload
): Promise<void> {
  // noop
}

export async function deleteGeneratedImageDoc(
  _userId: string,
  _imageId: string
): Promise<void> {
  // noop
}

export async function updateGeneratedImageDoc(
  _userId: string,
  _imageId: string,
  _patch: Partial<GeneratedImageFirestorePayload>
): Promise<void> {
  // noop
}

export const serverNow = () => new Date();

export function toDateString(timestamp: unknown): string {
  if (typeof timestamp === "string") return timestamp;
  if (timestamp instanceof Date) return timestamp.toISOString();
  return new Date().toISOString();
}

export function userDocRef(_userId: string): null {
  return null;
}

export function userImagesCollection(_userId: string): null {
  return null;
}

export function recentImagesQuery(_userId: string): null {
  return null;
}

export function promptHistoryCollection(_userId: string): null {
  return null;
}
