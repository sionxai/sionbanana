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
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-project",
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: "https://demo-project.firebaseio.com",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "111111111111",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:111111111111:web:demo",
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: undefined as string | undefined,
  NEXT_PUBLIC_FIREBASE_USE_FIRESTORE: "true",
  NEXT_PUBLIC_FIREBASE_DATABASE_ID: undefined as string | undefined
};

export const clientEnv = {
  ...defaultClientEnv,
  ...rawClientEnv
};

export const isFirebaseConfigured = Boolean(
  rawClientEnv.NEXT_PUBLIC_FIREBASE_API_KEY && rawClientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID
);
export const shouldUseFirestore = isFirebaseConfigured && clientEnv.NEXT_PUBLIC_FIREBASE_USE_FIRESTORE !== "false";

export const serverEnv = serverSchema.parse({
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  FIRESTORE_DATABASE_ID: process.env.FIRESTORE_DATABASE_ID
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
