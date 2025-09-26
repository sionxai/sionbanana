import {
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  setDoc
} from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { GenerationMode, GeneratedImageDocument } from "@/lib/types";

export function userDocRef(userId: string) {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");
  return doc(db, "users", userId);
}

export function userImagesCollection(userId: string) {
  const db = firestore();
  if (!db) {
    throw new Error("Firestore not initialized");
  }
  return collection(db, "users", userId, "images");
}

export function recentImagesQuery(userId: string) {
  return query(userImagesCollection(userId), orderBy("createdAt", "desc"));
}

export function promptHistoryCollection(userId: string) {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");
  return collection(db, "users", userId, "prompts");
}

export const serverNow = () => serverTimestamp();
export const toDateString = (timestamp: Timestamp | null | undefined) =>
  timestamp ? timestamp.toDate().toISOString() : new Date(0).toISOString();

export interface GeneratedImageFirestorePayload {
  mode: GenerationMode;
  status: "pending" | "completed" | "failed";
  promptMeta: GeneratedImageDocument["promptMeta"];
  imageUrl: string;
  thumbnailUrl?: string;
  originalImageUrl?: string;
  diff?: GeneratedImageDocument["diff"];
  metadata?: Record<string, unknown>;
  model: string;
  costCredits?: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export async function saveGeneratedImageDoc(
  userId: string,
  imageId: string,
  payload: GeneratedImageFirestorePayload
) {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");
  const docRef = doc(db, "users", userId, "images", imageId);
  const data: Record<string, unknown> = {
    ...payload,
    createdAt: serverNow(),
    updatedAt: serverNow()
  };

  Object.keys(data).forEach(key => {
    if (data[key] === undefined) {
      delete data[key];
    }
  });

  await setDoc(docRef, data);

  return docRef;
}

export async function deleteGeneratedImageDoc(userId: string, imageId: string) {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");
  const docRef = doc(db, "users", userId, "images", imageId);
  await deleteDoc(docRef);
}

export async function updateGeneratedImageDoc(
  userId: string,
  imageId: string,
  data: Record<string, unknown>
) {
  const db = firestore();
  if (!db) throw new Error("Firestore not initialized");
  const docRef = doc(db, "users", userId, "images", imageId);
  const sanitized: Record<string, unknown> = { ...data, updatedAt: serverNow() };

  Object.keys(sanitized).forEach(key => {
    if (sanitized[key] === undefined) {
      delete sanitized[key];
    }
  });

  await setDoc(docRef, sanitized, { merge: true });
}
