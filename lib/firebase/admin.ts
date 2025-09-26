import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { Auth, getAuth } from "firebase-admin/auth";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { getStorage, Storage } from "firebase-admin/storage";
import { getFirestoreDatabaseId, getServiceAccountKey } from "@/lib/env";

class MissingServiceAccountKeyError extends Error {
  constructor() {
    super("FIREBASE_SERVICE_ACCOUNT_KEY env var is required for server-side Firebase operations.");
    this.name = "MissingServiceAccountKeyError";
  }
}

let adminApp: App | null = null;
let adminAuthInstance: Auth | null = null;
let adminDbInstance: Firestore | null = null;
let adminStorageInstance: Storage | null = null;

function ensureAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const existing = getApps()[0];
  if (existing) {
    adminApp = existing;
    return existing;
  }

  const serviceAccount = getServiceAccountKey();
  if (!serviceAccount) {
    throw new MissingServiceAccountKeyError();
  }

  adminApp = initializeApp({
    credential: cert({
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
      privateKey: serviceAccount.privateKey
    }),
    projectId: serviceAccount.projectId
  });

  return adminApp;
}

export function getAdminAuth() {
  if (!adminAuthInstance) {
    adminAuthInstance = getAuth(ensureAdminApp());
  }
  return adminAuthInstance;
}

export function getAdminDb() {
  if (!adminDbInstance) {
    adminDbInstance = getFirestore(ensureAdminApp(), getFirestoreDatabaseId());
  }
  return adminDbInstance;
}

export function getAdminStorage() {
  if (!adminStorageInstance) {
    adminStorageInstance = getStorage(ensureAdminApp());
  }
  return adminStorageInstance;
}

export { MissingServiceAccountKeyError };
