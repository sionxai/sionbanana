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

// ⚠️ SECURITY WARNING: Do NOT hardcode credentials here.
// All Firebase configuration should come from environment variables (.env.local)
const defaultClientEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "",
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: "",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "",
  NEXT_PUBLIC_FIREBASE_APP_ID: "",
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: "",
  NEXT_PUBLIC_FIREBASE_USE_FIRESTORE: "true",
  NEXT_PUBLIC_FIREBASE_DATABASE_ID: "(default)"
};

// Only use environment variables if they exist and are not empty
const cleanRawClientEnv = Object.fromEntries(
  Object.entries(rawClientEnv).filter(([key, value]) => value && value.trim() !== '')
);

// Debug environment variables
console.log('[ENV] Environment Variables Debug:', {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  hasRawApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  hasRawProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  rawProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  cleanedEnvKeys: Object.keys(cleanRawClientEnv),
  defaultEnvKeys: Object.keys(defaultClientEnv)
});

export const clientEnv = {
  ...defaultClientEnv,
  ...cleanRawClientEnv
};

console.log('[ENV] Final Client Environment:', {
  apiKey: clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY ? `${clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY.substring(0, 10)}...` : 'undefined',
  projectId: clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  authDomain: clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseId: clientEnv.NEXT_PUBLIC_FIREBASE_DATABASE_ID,
  isUsingDefaults: Object.keys(cleanRawClientEnv).length === 0
});

export const isFirebaseConfigured = Boolean(
  clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY &&
  clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
  clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY !== "demo" &&
  clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "demo-project"
);
export const shouldUseFirestore = isFirebaseConfigured && clientEnv.NEXT_PUBLIC_FIREBASE_USE_FIRESTORE !== "false";


// ⚠️ SECURITY WARNING: NEVER hardcode API keys in source code
export const serverEnv = serverSchema.parse({
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  FIRESTORE_DATABASE_ID: process.env.FIRESTORE_DATABASE_ID || "(default)"
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
