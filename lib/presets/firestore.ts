import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  QueryConstraint
} from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { PresetDocument, Preset, PresetCategory, PresetInput } from "./types";

const PRESETS_COLLECTION = "presets";

/**
 * Timestamp를 ISO 문자열로 변환
 */
function timestampToString(timestamp: Timestamp | string | undefined): string {
  if (!timestamp) return new Date().toISOString();
  if (typeof timestamp === "string") return timestamp;
  return timestamp.toDate().toISOString();
}

/**
 * Firestore 문서를 Preset으로 변환
 */
function docToPreset(doc: any): Preset {
  const data = doc.data() as PresetDocument;
  return {
    id: doc.id,
    category: data.category,
    groupId: data.groupId,
    groupLabel: data.groupLabel,
    label: data.label,
    labelKo: data.labelKo,
    prompt: data.prompt,
    note: data.note,
    order: data.order,
    active: data.active,
    metadata: data.metadata,
    createdAt: timestampToString(data.createdAt),
    updatedAt: timestampToString(data.updatedAt),
    createdBy: data.createdBy,
    updatedBy: data.updatedBy
  };
}

/**
 * 모든 프리셋 가져오기
 */
export async function getAllPresets(): Promise<Preset[]> {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");

  const presetsRef = collection(db, PRESETS_COLLECTION);
  const q = query(presetsRef, orderBy("category"), orderBy("groupId"), orderBy("order"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(docToPreset);
}

/**
 * 카테고리별 프리셋 가져오기
 */
export async function getPresetsByCategory(category: PresetCategory): Promise<Preset[]> {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");

  const presetsRef = collection(db, PRESETS_COLLECTION);
  const q = query(
    presetsRef,
    where("category", "==", category),
    orderBy("groupId"),
    orderBy("order")
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map(docToPreset);
}

/**
 * 활성화된 프리셋만 가져오기
 */
export async function getActivePresets(category?: PresetCategory): Promise<Preset[]> {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");

  const presetsRef = collection(db, PRESETS_COLLECTION);
  const constraints: QueryConstraint[] = [where("active", "==", true)];

  if (category) {
    constraints.push(where("category", "==", category));
  }

  constraints.push(orderBy("category"), orderBy("groupId"), orderBy("order"));

  const q = query(presetsRef, ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map(docToPreset);
}

/**
 * 단일 프리셋 가져오기
 */
export async function getPresetById(presetId: string): Promise<Preset | null> {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");

  const presetRef = doc(db, PRESETS_COLLECTION, presetId);
  const snapshot = await getDoc(presetRef);

  if (!snapshot.exists()) return null;

  return docToPreset(snapshot);
}

/**
 * 프리셋 생성
 */
export async function createPreset(
  presetId: string,
  input: PresetInput,
  userId: string
): Promise<Preset> {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");

  const now = Timestamp.now();
  const presetData: PresetDocument = {
    id: presetId,
    ...input,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId
  };

  const presetRef = doc(db, PRESETS_COLLECTION, presetId);
  await setDoc(presetRef, presetData);

  return docToPreset({ id: presetId, data: () => presetData });
}

/**
 * 프리셋 수정
 */
export async function updatePreset(
  presetId: string,
  input: Partial<PresetInput>,
  userId: string
): Promise<Preset> {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");

  const presetRef = doc(db, PRESETS_COLLECTION, presetId);
  const updateData = {
    ...input,
    updatedAt: Timestamp.now(),
    updatedBy: userId
  };

  await updateDoc(presetRef, updateData);

  const updated = await getDoc(presetRef);
  if (!updated.exists()) throw new Error("Preset not found after update");

  return docToPreset(updated);
}

/**
 * 프리셋 삭제
 */
export async function deletePreset(presetId: string): Promise<void> {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");

  const presetRef = doc(db, PRESETS_COLLECTION, presetId);
  await deleteDoc(presetRef);
}

/**
 * 배치 프리셋 생성 (마이그레이션용)
 */
export async function batchCreatePresets(
  presets: Array<PresetInput & { id: string }>,
  userId: string
): Promise<number> {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");

  const now = Timestamp.now();
  let count = 0;

  for (const preset of presets) {
    try {
      const presetData: PresetDocument = {
        ...preset,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId
      };

      const presetRef = doc(db, PRESETS_COLLECTION, preset.id);
      await setDoc(presetRef, presetData);
      count++;
    } catch (error) {
      console.error(`Failed to create preset ${preset.id}:`, error);
    }
  }

  return count;
}
