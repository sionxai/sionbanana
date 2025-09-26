import { NextResponse } from "next/server";
import { clientEnv, isFirebaseConfigured, shouldUseFirestore } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    isFirebaseConfigured,
    shouldUseFirestore,
    clientEnv: {
      NEXT_PUBLIC_FIREBASE_API_KEY: clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY ? `${clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY.substring(0, 10)}...` : 'undefined',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      NEXT_PUBLIC_FIREBASE_USE_FIRESTORE: clientEnv.NEXT_PUBLIC_FIREBASE_USE_FIRESTORE,
      NEXT_PUBLIC_FIREBASE_DATABASE_ID: clientEnv.NEXT_PUBLIC_FIREBASE_DATABASE_ID
    }
  });
}