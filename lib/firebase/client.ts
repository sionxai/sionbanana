import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, enableNetwork, disableNetwork, terminate, clearIndexedDbPersistence } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
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

// Vercel 호환 Firestore 초기화 방식
export const firestore = () => {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  try {
    const app = getFirebaseApp();
    const databaseId = clientEnv.NEXT_PUBLIC_FIREBASE_DATABASE_ID;

    console.log('[Firestore] Initializing with database ID:', databaseId);
    console.log('[Firestore] Environment:', process.env.NODE_ENV);

    // 기본 getFirestore 사용 (Vercel 호환성을 위해)
    if (databaseId && databaseId !== '(default)') {
      firestoreInstance = getFirestore(app, databaseId);
    } else {
      firestoreInstance = getFirestore(app);
    }

    console.log('[Firestore] Instance created, forcing online mode...');

    // 즉시 온라인 모드 강제 활성화
    enableNetwork(firestoreInstance)
      .then(() => {
        console.log('[Firestore] Network enabled successfully');
        isForceOfflineModeEnabled = false;
      })
      .catch(error => {
        console.warn("[Firestore] Failed to enable network:", error);
        // 네트워크 활성화가 실패해도 계속 진행
      });

    return firestoreInstance;
  } catch (error) {
    console.error("Firebase Firestore 초기화 완전 실패:", error);
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

// 더 강력한 Firebase 연결 복구 함수
export async function ensureFirebaseConnection(): Promise<boolean> {
  console.log("[ensureFirebaseConnection] Starting connection recovery...");

  try {
    const db = firestore();
    if (!db) {
      console.error("[ensureFirebaseConnection] Firestore instance is null");
      return false;
    }

    // 1단계: 강제 재연결 시도
    console.log("[ensureFirebaseConnection] Step 1: Force reconnect");
    try {
      await disableNetwork(db);
      console.log("[ensureFirebaseConnection] Network disabled");

      // 짧은 대기 후 재연결
      await new Promise(resolve => setTimeout(resolve, 100));
      await enableNetwork(db);
      console.log("[ensureFirebaseConnection] Network re-enabled");
      return true;
    } catch (e) {
      console.warn("[ensureFirebaseConnection] Step 1 failed:", e);
    }

    // 2단계: 인스턴스 완전 재생성
    console.log("[ensureFirebaseConnection] Step 2: Full instance recreation");
    try {
      await terminate(db);
      console.log("[ensureFirebaseConnection] Old instance terminated");

      // 인스턴스 초기화
      firestoreInstance = null;
      initializationPromise = null;

      // 캐시 클리어 시도
      try {
        await clearIndexedDbPersistence(db);
        console.log("[ensureFirebaseConnection] IndexedDB cleared");
      } catch (clearError) {
        console.warn("[ensureFirebaseConnection] IndexedDB clear failed (expected):", clearError);
      }

      // 새 인스턴스 생성
      const newDb = firestore();
      if (newDb) {
        await enableNetwork(newDb);
        console.log("[ensureFirebaseConnection] New instance created and connected");
        return true;
      }
    } catch (terminateError) {
      console.error("[ensureFirebaseConnection] Step 2 failed:", terminateError);
    }

    // 3단계: 완전 리셋 (앱 레벨)
    console.log("[ensureFirebaseConnection] Step 3: Complete reset");
    try {
      // 앱 인스턴스까지 리셋
      app = undefined;
      firestoreInstance = null;
      initializationPromise = null;

      // 새로 초기화
      const newApp = getFirebaseApp();
      const newDb = firestore();
      if (newDb) {
        await enableNetwork(newDb);
        console.log("[ensureFirebaseConnection] Complete reset successful");
        return true;
      }
    } catch (resetError) {
      console.error("[ensureFirebaseConnection] Complete reset failed:", resetError);
    }

    console.error("[ensureFirebaseConnection] All recovery attempts failed");
    return false;
  } catch (error) {
    console.error("[ensureFirebaseConnection] Unexpected error:", error);
    return false;
  }
}

// 강화된 오프라인 에러 재시도 함수
export async function retryFirebaseOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5, // 재시도 횟수 증가
  delay: number = 1000
): Promise<T> {
  let lastError: unknown;

  console.log(`[retryFirebaseOperation] Starting operation with ${maxRetries} max retries`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[retryFirebaseOperation] Attempt ${attempt}/${maxRetries}`);

      // 재시도 시 더 강화된 복구 프로세스
      if (attempt > 1) {
        console.log(`[retryFirebaseOperation] Enhanced recovery for attempt ${attempt}...`);

        // 지수적 백오프
        const waitTime = Math.min(delay * Math.pow(2, attempt - 2), 10000);
        console.log(`[retryFirebaseOperation] Waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // 강화된 연결 복구
        const connectionSuccess = await ensureFirebaseConnection();
        console.log(`[retryFirebaseOperation] Connection recovery result: ${connectionSuccess}`);

        // 연결 복구에 실패해도 계속 시도
        if (!connectionSuccess) {
          console.warn(`[retryFirebaseOperation] Connection recovery failed, but continuing with attempt ${attempt}`);
        }
      }

      console.log(`[retryFirebaseOperation] Executing operation...`);
      const result = await operation();
      console.log(`[retryFirebaseOperation] ✅ Operation successful on attempt ${attempt}`);
      return result;
    } catch (error: any) {
      lastError = error;
      console.error(`[retryFirebaseOperation] ❌ Attempt ${attempt} failed:`, error.message);

      // 다양한 오프라인 관련 에러 패턴 체크
      const isOfflineError = error?.message?.includes("offline") ||
                           error?.message?.includes("network") ||
                           error?.message?.includes("connection") ||
                           error?.code === "unavailable";

      // 마지막 시도거나 오프라인 에러가 아니면 바로 에러 던지기
      if (attempt === maxRetries) {
        console.error(`[retryFirebaseOperation] 🚫 Giving up after ${attempt} attempts. Final error:`, error);
        throw error;
      }

      if (!isOfflineError) {
        console.error(`[retryFirebaseOperation] 🚫 Non-offline error detected, giving up:`, error);
        throw error;
      }

      console.warn(`[retryFirebaseOperation] 🔄 Will retry (offline-related error detected)`);
    }
  }

  throw lastError;
}
