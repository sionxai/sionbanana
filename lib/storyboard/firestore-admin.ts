import { getAdminDb } from "@/lib/firebase/admin";
import type { StoryboardStyle, StoryboardStyleDocument, StoryboardStyleInput } from "@/lib/storyboard/types";

const COLLECTION = "storyboardStyles";

function timestampToString(timestamp: any): string | undefined {
  if (!timestamp) return undefined;
  if (typeof timestamp === "string") return timestamp;
  if (timestamp._seconds) {
    return new Date(timestamp._seconds * 1000).toISOString();
  }
  if (timestamp.toDate) {
    return timestamp.toDate().toISOString();
  }
  return undefined;
}

function docToStyle(doc: any): StoryboardStyle {
  const data = doc.data();
  return {
    id: doc.id,
    label: data.label,
    description: data.description,
    grading: data.grading,
    bgm: data.bgm,
    sfx: Array.isArray(data.sfx) ? data.sfx : [],
    voTone: data.voTone,
    previewGradient: data.previewGradient,
    referenceImageUrl: data.referenceImageUrl,
    prompt: data.prompt,
    order: typeof data.order === "number" ? data.order : 0,
    active: data.active !== false,
    createdAt: timestampToString(data.createdAt),
    updatedAt: timestampToString(data.updatedAt),
    createdBy: data.createdBy,
    updatedBy: data.updatedBy
  };
}

function sortStyles(styles: StoryboardStyle[]): StoryboardStyle[] {
  return styles.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.label.localeCompare(b.label);
  });
}

export async function getAllStoryboardStylesAdmin(): Promise<StoryboardStyle[]> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  const snapshot = await db.collection(COLLECTION).get();
  const styles = snapshot.docs.map(docToStyle);
  return sortStyles(styles);
}

export async function getActiveStoryboardStylesAdmin(): Promise<StoryboardStyle[]> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  const snapshot = await db.collection(COLLECTION).where("active", "==", true).get();
  const styles = snapshot.docs.map(docToStyle);
  return sortStyles(styles);
}

export async function getStoryboardStyleByIdAdmin(id: string): Promise<StoryboardStyle | null> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  const docRef = db.collection(COLLECTION).doc(id);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    return null;
  }
  return docToStyle(docSnap);
}

export async function createStoryboardStyleAdmin(
  id: string,
  input: StoryboardStyleInput,
  userId: string
): Promise<StoryboardStyle> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  const now = new Date().toISOString();
  const docRef = db.collection(COLLECTION).doc(id);
  const doc: StoryboardStyleDocument & { createdAt: string; updatedAt: string; createdBy: string; updatedBy: string } = {
    ...input,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId
  };

  await docRef.set(doc);
  const created = await docRef.get();
  return docToStyle(created);
}

export async function updateStoryboardStyleAdmin(
  id: string,
  input: Partial<StoryboardStyleInput>,
  userId: string
): Promise<StoryboardStyle> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  const docRef = db.collection(COLLECTION).doc(id);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    throw new Error("스타일을 찾을 수 없습니다.");
  }

  await docRef.update({
    ...input,
    updatedAt: new Date().toISOString(),
    updatedBy: userId
  });

  const updated = await docRef.get();
  return docToStyle(updated);
}

export async function deleteStoryboardStyleAdmin(id: string): Promise<void> {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firestore Admin이 초기화되지 않았습니다.");
  }

  await db.collection(COLLECTION).doc(id).delete();
}

