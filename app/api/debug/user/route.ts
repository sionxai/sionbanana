import { NextResponse } from "next/server";
import { query, orderBy, limit, getDocs } from "firebase/firestore";
import { userImagesCollection } from "@/lib/firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { shouldUseFirestore } from "@/lib/env";

export async function GET() {
  try {
    const result = {
      shouldUseFirestore,
      firestoreInitialized: false,
      testQuery: false,
      error: null as string | null
    };

    const db = firestore();
    result.firestoreInitialized = !!db;

    if (!db || !shouldUseFirestore) {
      return NextResponse.json(result);
    }

    // 테스트용 더미 사용자 ID로 쿼리 시도
    const testUserId = "test-user-123";
    const q = query(userImagesCollection(testUserId), orderBy("createdAt", "desc"), limit(1));

    try {
      await getDocs(q);
      result.testQuery = true;
    } catch (error: any) {
      result.error = error.message;
    }

    return NextResponse.json(result);

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      shouldUseFirestore,
      firestoreInitialized: false,
      testQuery: false
    });
  }
}