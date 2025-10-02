import { getAdminDb } from "@/lib/firebase/admin";
import type { PresetDocument, Preset, PresetCategory, PresetInput } from "./types";

const PRESETS_COLLECTION = "presets";

function timestampToString(timestamp: any): string {
  if (!timestamp) return new Date().toISOString();
  if (typeof timestamp === "string") return timestamp;
  if (timestamp._seconds) {
    return new Date(timestamp._seconds * 1000).toISOString();
  }
  if (timestamp.toDate) {
    return timestamp.toDate().toISOString();
  }
  return new Date().toISOString();
}

function docToPreset(doc: any): Preset {
  const data = doc.data();
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

export async function getAllPresetsAdmin(): Promise<Preset[]> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  const snapshot = await db.collection(PRESETS_COLLECTION).get();
  const presets = snapshot.docs.map(docToPreset);

  return presets.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.groupId !== b.groupId) return a.groupId.localeCompare(b.groupId);
    return a.order - b.order;
  });
}

export async function getPresetsByCategoryAdmin(
  category: PresetCategory
): Promise<Preset[]> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  const snapshot = await db
    .collection(PRESETS_COLLECTION)
    .where("category", "==", category)
    .get();

  const presets = snapshot.docs.map(docToPreset);

  return presets.sort((a, b) => {
    if (a.groupId !== b.groupId) return a.groupId.localeCompare(b.groupId);
    return a.order - b.order;
  });
}

export async function getActivePresetsAdmin(
  category?: PresetCategory
): Promise<Preset[]> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  let queryRef = db.collection(PRESETS_COLLECTION).where("active", "==", true);

  if (category) {
    queryRef = queryRef.where("category", "==", category);
  }

  const snapshot = await queryRef.get();
  const presets = snapshot.docs.map(docToPreset);

  return presets.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.groupId !== b.groupId) return a.groupId.localeCompare(b.groupId);
    return a.order - b.order;
  });
}

export async function getPresetByIdAdmin(presetId: string): Promise<Preset | null> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  const docRef = db.collection(PRESETS_COLLECTION).doc(presetId);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return null;
  }

  return docToPreset(docSnap);
}

export async function createPresetAdmin(
  presetId: string,
  input: PresetInput,
  userId: string
): Promise<Preset> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  const now = new Date();
  const presetDoc: PresetDocument = {
    id: presetId,
    ...input,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy: userId,
    updatedBy: userId
  };

  const docRef = db.collection(PRESETS_COLLECTION).doc(presetId);
  await docRef.set(presetDoc);

  const created = await docRef.get();
  return docToPreset(created);
}

export async function updatePresetAdmin(
  presetId: string,
  input: Partial<PresetInput>,
  userId: string
): Promise<Preset> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  const docRef = db.collection(PRESETS_COLLECTION).doc(presetId);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    throw new Error(`프리셋을 찾을 수 없습니다: ${presetId}`);
  }

  await docRef.update({
    ...input,
    updatedAt: new Date().toISOString(),
    updatedBy: userId
  });

  const updated = await docRef.get();
  return docToPreset(updated);
}

export async function deletePresetAdmin(presetId: string): Promise<void> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  const docRef = db.collection(PRESETS_COLLECTION).doc(presetId);
  await docRef.delete();
}

export async function batchCreatePresetsAdmin(
  presets: Array<PresetInput & { id: string }>,
  userId: string
): Promise<number> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  const now = new Date().toISOString();
  const CHUNK_SIZE = 400; // Firestore batch limit is 500

  for (let i = 0; i < presets.length; i += CHUNK_SIZE) {
    const chunk = presets.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();

    chunk.forEach((preset) => {
      const { id, ...input } = preset;
      const docRef = db.collection(PRESETS_COLLECTION).doc(id);

      const presetDoc: PresetDocument = {
        id,
        ...input,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId
      };

      batch.set(docRef, presetDoc, { merge: true });
    });

    await batch.commit();
  }

  return presets.length;
}
