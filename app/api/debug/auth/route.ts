import { NextResponse } from "next/server";
import { firebaseAuth } from "@/lib/firebase/client";

export async function GET() {
  try {
    const auth = firebaseAuth();

    return NextResponse.json({
      authInitialized: !!auth,
      currentUser: auth?.currentUser ? {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        isAnonymous: auth.currentUser.isAnonymous
      } : null,
      authReady: !!auth?.currentUser
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message || "Unknown error",
      authInitialized: false
    });
  }
}