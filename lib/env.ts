import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_USE_FIRESTORE: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_DATABASE_ID: z.string().optional()
});

const serverSchema = z.object({
  GEMINI_API_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  FIRESTORE_DATABASE_ID: z.string().optional()
});

const rawClientEnv = clientSchema.parse({
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  NEXT_PUBLIC_FIREBASE_USE_FIRESTORE: process.env.NEXT_PUBLIC_FIREBASE_USE_FIRESTORE,
  NEXT_PUBLIC_FIREBASE_DATABASE_ID: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID
});

const defaultClientEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyCO8jsRaN0KAk4hZ1qVO4YLzChtf3A4zek",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "sionbanana.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "sionbanana",
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: "https://sionbanana-default-rtdb.firebaseio.com/",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "sionbanana.firebasestorage.app",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "309643440962",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:309643440962:web:285958c6382c94761a0edb",
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: "G-7PJLWZR0EH",
  NEXT_PUBLIC_FIREBASE_USE_FIRESTORE: "true",
  NEXT_PUBLIC_FIREBASE_DATABASE_ID: "sionbanana1"
};

// Only use environment variables if they exist and are not empty
const cleanRawClientEnv = Object.fromEntries(
  Object.entries(rawClientEnv).filter(([key, value]) => value && value.trim() !== '')
);

export const clientEnv = {
  ...defaultClientEnv,
  ...cleanRawClientEnv
};

export const isFirebaseConfigured = Boolean(
  clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY &&
  clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
  clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY !== "demo" &&
  clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "demo-project"
);
export const shouldUseFirestore = isFirebaseConfigured && clientEnv.NEXT_PUBLIC_FIREBASE_USE_FIRESTORE !== "false";


export const serverEnv = serverSchema.parse({
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "AIzaSyBehU6k3-mudHkJV1xQiSgMVUgZ-tBKHw4",
  FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  FIRESTORE_DATABASE_ID: process.env.FIRESTORE_DATABASE_ID || "sionbanana1"
});

export function getServiceAccountKey(): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} | null {
  const { FIREBASE_SERVICE_ACCOUNT_KEY } = serverEnv;

  if (!FIREBASE_SERVICE_ACCOUNT_KEY) {
    return null;
  }

  try {
    const parsed = JSON.parse(FIREBASE_SERVICE_ACCOUNT_KEY);
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key?.replace(/\\n/g, "\n") ?? ""
    };
  } catch (error) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY", error);
    return null;
  }
}

export function getFirestoreDatabaseId(): string {
  const id = serverEnv.FIRESTORE_DATABASE_ID;
  return id && id.trim().length > 0 ? id : "(default)";
}
