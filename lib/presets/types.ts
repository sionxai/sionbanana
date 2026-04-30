/**
 * 프리셋 카테고리
 */
export type PresetCategory = "camera" | "lighting" | "pose" | "external";

/**
 * Firestore 시절 호환을 위해 두던 Timestamp shape의 최소 형태.
 * 더 이상 firebase 패키지에 의존하지 않는다.
 */
export type FirestoreTimestampLike =
  | string
  | number
  | { seconds: number; nanoseconds?: number; toDate?: () => Date }
  | { _seconds: number; _nanoseconds?: number };

/**
 * 저장된 프리셋 문서 형태 (옛 Firestore 형 호환).
 */
export interface PresetDocument {
  id: string;
  category: PresetCategory;
  groupId: string;
  groupLabel: string;
  label: string;
  labelKo: string;
  prompt: string;
  note?: string;
  order: number;
  active: boolean;
  metadata?: Record<string, unknown>;
  createdAt: FirestoreTimestampLike;
  updatedAt: FirestoreTimestampLike;
  createdBy: string;
  updatedBy: string;
}

/**
 * 클라이언트에서 사용하는 프리셋 (Timestamp → string 변환)
 */
export interface Preset {
  id: string;
  category: PresetCategory;
  groupId: string;
  groupLabel: string;
  label: string;
  labelKo: string;
  prompt: string;
  note?: string;
  order: number;
  active: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * 프리셋 그룹 (UI 표시용)
 */
export interface PresetGroup {
  id: string;
  category: PresetCategory;
  label: string;
  presets: Preset[];
}

/**
 * 프리셋 생성/수정 요청
 */
export interface PresetInput {
  category: PresetCategory;
  groupId: string;
  groupLabel: string;
  label: string;
  labelKo: string;
  prompt: string;
  note?: string;
  order: number;
  active: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * CSV/JSON 가져오기용 포맷
 */
export interface PresetImportRow {
  id: string;
  category: string;
  groupId: string;
  groupLabel: string;
  label: string;
  labelKo: string;
  prompt: string;
  note?: string;
  order: number;
  active: boolean | string;
  metadata?: Record<string, unknown> | string;
}

/**
 * CSV/JSON 내보내기용 포맷
 */
export interface PresetExportRow {
  id: string;
  category: string;
  groupId: string;
  groupLabel: string;
  label: string;
  labelKo: string;
  prompt: string;
  note: string;
  order: number;
  active: string;
  createdAt: string;
  updatedAt: string;
  metadata?: string;
}
