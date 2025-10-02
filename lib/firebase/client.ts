import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, enableNetwork, disableNetwork, terminate, clearIndexedDbPersistence, initializeFirestore, CACHE_SIZE_UNLIMITED } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { clientEnv } from "@/lib/env";

// 환경변수 export (디버깅용)
export { clientEnv };

let app: FirebaseApp | undefined;
let isForceOfflineModeEnabled = false;

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
        storageBucket: clientEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        hasValidConfig: !(!apiKey || !projectId || apiKey === "demo" || projectId === "demo-project"),
        isDemoMode: apiKey === "demo" || projectId === "demo-project",
        environment: process.env.NODE_ENV,
        isVercel: process.env.VERCEL ? 'true' : 'false'
      });

      if (!apiKey || !projectId) {
        throw new Error(`Firebase 환경변수가 설정되지 않았습니다. API_KEY: ${!!apiKey}, PROJECT_ID: ${!!projectId}`);
      }

      if (apiKey === "demo" || projectId === "demo-project") {
        throw new Error("Firebase가 데모 모드로 설정되어 있습니다. 실제 Firebase 설정을 확인해주세요.");
      }

      try {
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
        console.log('[Firebase] App initialized successfully');
      } catch (error: any) {
        console.error('[Firebase] App initialization failed:', error);
        throw new Error(`Firebase 앱 초기화 실패: ${error.message}`);
      }
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

let firestoreInstance: any = null;
let initializationPromise: Promise<any> | null = null;

// Firestore 인스턴스 - 다른 기능들을 위해 유지
export const firestore = () => {

  if (firestoreInstance) {
    return firestoreInstance;
  }

  try {
    const app = getFirebaseApp();
    const databaseId = clientEnv.NEXT_PUBLIC_FIREBASE_DATABASE_ID;

    console.log('[Firestore] Creating instance with database ID:', databaseId);

    let db;

    try {
      const settings: any = {
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        ignoreUndefinedProperties: true
      };

      if (databaseId && databaseId !== '(default)') {
        settings.databaseId = databaseId;
      }

      db = initializeFirestore(app, settings);
      console.log('[Firestore] initializeFirestore successful');
    } catch (initError) {
      console.warn('[Firestore] initializeFirestore failed, falling back to getFirestore:', initError);

      if (databaseId && databaseId !== '(default)') {
        db = getFirestore(app, databaseId);
      } else {
        db = getFirestore(app);
      }
    }

    firestoreInstance = db;
    return db;
  } catch (error) {
    console.error("Firebase Firestore 초기화 실패:", error);
    return null;
  }
};

export const db = firestore;

export const storage = () => {
  try {
    return getStorage(getFirebaseApp());
  } catch (error) {
    console.warn("Firebase Storage를 초기화할 수 없습니다:", error);
    return null;
  }
};

// Realtime Database 인스턴스
export const realtimeDatabase = () => {
  try {
    const app = getFirebaseApp();
    const databaseURL = clientEnv.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

    console.log('[Realtime Database] Initializing with URL:', databaseURL);
    console.log('[Realtime Database] Environment check:', {
      isVercel: process.env.VERCEL,
      nodeEnv: process.env.NODE_ENV,
      rawURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
    });

    if (!databaseURL) {
      throw new Error("NEXT_PUBLIC_FIREBASE_DATABASE_URL이 설정되지 않았습니다.");
    }

    const database = getDatabase(app, databaseURL);
    console.log('[Realtime Database] ✅ Successfully initialized');
    return database;
  } catch (error) {
    console.error("Firebase Realtime Database 초기화 실패:", error);
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
  const rtdb = realtimeDatabase();

  if (auth) connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  if (db) connectFirestoreEmulator(db, "localhost", 8080);
  if (bucket) connectStorageEmulator(bucket, "localhost", 9199);
  if (rtdb) connectDatabaseEmulator(rtdb, "localhost", 9000);
}

// Firestore 연결 복구 함수 - Firestore 비활성화로 인해 항상 true 반환
export async function ensureFirebaseConnection(): Promise<boolean> {
  console.log("[ensureFirebaseConnection] Firestore is disabled, using Realtime Database only");
  return true;
}

// 재시도 함수 - Firestore 비활성화로 인해 단순화
export async function retryFirebaseOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        const waitTime = Math.min(delay * Math.pow(2, attempt - 2), 5000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const result = await operation();
      return result;
    } catch (error: any) {
      lastError = error;

      if (attempt === maxRetries) {
        throw error;
      }
    }
  }

  throw lastError;
}
