import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { clientEnv } from "@/lib/env";

let app: FirebaseApp | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length
      ? getApp()
      : initializeApp({
          apiKey: clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          databaseURL: clientEnv.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
          storageBucket: clientEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: clientEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: clientEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
          measurementId: clientEnv.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
        });
  }

  return app;
}

export const firebaseAuth = () => getAuth(getFirebaseApp());
export const firestore = () =>
  getFirestore(getFirebaseApp(), clientEnv.NEXT_PUBLIC_FIREBASE_DATABASE_ID || undefined);
export const storage = () => getStorage(getFirebaseApp());

export function enableFirebaseEmulators() {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== "true") {
    return;
  }

  const auth = firebaseAuth();
  const db = firestore();
  const bucket = storage();

  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "localhost", 8080);
  connectStorageEmulator(bucket, "localhost", 9199);
}
