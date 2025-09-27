import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, enableNetwork, disableNetwork } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { clientEnv } from "@/lib/env";

let app: FirebaseApp | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    const existingApp = getApps().length ? getApp() : null;
    if (existingApp) {
      app = existingApp;
    } else {
      // Firebase 설정이 유효하지 않으면 에러를 던짐
      const apiKey = clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY;
      const projectId = clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

      console.log('Firebase Config Debug:', {
        apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined',
        projectId,
        authDomain: clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        hasValidConfig: !(!apiKey || !projectId || apiKey === "demo" || projectId === "demo-project")
      });

      if (!apiKey || !projectId || apiKey === "demo" || projectId === "demo-project") {
        throw new Error("Firebase가 설정되지 않았습니다. 로컬 모드로 작동합니다.");
      }

      app = initializeApp({
        apiKey,
        authDomain: clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId,
        databaseURL: clientEnv.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
        storageBucket: clientEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: clientEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: clientEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
        measurementId: clientEnv.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
      });
    }
  }

  return app;
}

export const firebaseAuth = () => {
  try {
    return getAuth(getFirebaseApp());
  } catch (error) {
    console.warn("Firebase Auth를 초기화할 수 없습니다:", error);
    return null;
  }
};

export const firestore = () => {
  try {
    return getFirestore(getFirebaseApp());
  } catch (error) {
    console.warn("Firebase Firestore를 초기화할 수 없습니다:", error);
    return null;
  }
};

export const storage = () => {
  try {
    return getStorage(getFirebaseApp());
  } catch (error) {
    console.warn("Firebase Storage를 초기화할 수 없습니다:", error);
    return null;
  }
};

export function enableFirebaseEmulators() {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== "true") {
    return;
  }

  const auth = firebaseAuth();
  const db = firestore();
  const bucket = storage();

  if (auth) connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  if (db) connectFirestoreEmulator(db, "localhost", 8080);
  if (bucket) connectStorageEmulator(bucket, "localhost", 9199);
}

// Firebase 연결 상태 확인 및 재시도 유틸리티
export async function ensureFirebaseConnection(): Promise<boolean> {
  try {
    const db = firestore();
    if (!db) return false;

    // 네트워크 연결 재시도
    await enableNetwork(db);
    return true;
  } catch (error) {
    console.warn("Firebase network enable failed:", error);
    return false;
  }
}

// 오프라인 에러 재시도 함수
export async function retryFirebaseOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 첫 번째 시도가 아니면 연결 상태 확인
      if (attempt > 1) {
        await ensureFirebaseConnection();
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      return await operation();
    } catch (error: any) {
      lastError = error;

      // 오프라인 에러가 아니거나 마지막 시도면 바로 에러 던지기
      if (!error?.message?.includes("offline") || attempt === maxRetries) {
        throw error;
      }

      console.warn(`Firebase operation failed (attempt ${attempt}/${maxRetries}):`, error.message);
    }
  }

  throw lastError;
}
