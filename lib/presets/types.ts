import { Timestamp } from "firebase/firestore";

/**
 * 프리셋 카테고리
 */
export type PresetCategory = "camera" | "lighting" | "pose" | "external";

/**
 * Firestore에 저장되는 프리셋 문서
 */
export interface PresetDocument {
  id: string;
  category: PresetCategory;
  groupId: string;           // 그룹 식별자 (예: "cases-01-10", "natural-light")
  groupLabel: string;         // 그룹 표시명 (예: "Cases 01-10", "자연광")
  label: string;              // 영문 라벨
  labelKo: string;            // 한글 라벨
  prompt: string;             // 프롬프트 텍스트
  note?: string;              // 선택적 설명
  order: number;              // 그룹 내 정렬 순서
  active: boolean;            // 활성화 여부
  metadata?: Record<string, unknown>; // 추가 메타데이터 (예: 선택값, 태그 등)
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
  createdBy: string;          // admin UID
  updatedBy: string;          // admin UID
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
