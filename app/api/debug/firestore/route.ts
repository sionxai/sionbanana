import { NextResponse } from "next/server";
import { query, orderBy, limit, getDocs } from "firebase/firestore";
import { userImagesCollection } from "@/lib/firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { shouldUseFirestore } from "@/lib/env";

export async function GET() {
  try {
    const db = firestore();

    if (!shouldUseFirestore) {
      return NextResponse.json({
        error: "Firestore is disabled",
        shouldUseFirestore: false
      });
    }

    if (!db) {
      return NextResponse.json({
        error: "Firestore client not initialized",
        shouldUseFirestore,
        db: null
      });
    }

    // Test with a dummy user ID to see if we can query the collection
    const testUserId = "ACHNkfU8GNT5u8AtGNP0UsszqIR2";
    const q = query(userImagesCollection(testUserId), orderBy("createdAt", "desc"), limit(5));

    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data()
    }));

    return NextResponse.json({
      shouldUseFirestore,
      firestoreInitialized: !!db,
      testUserId,
      docsCount: docs.length,
      docs: docs.slice(0, 2) // Only return first 2 for debugging
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message || "Unknown error",
      shouldUseFirestore,
      firestoreInitialized: !!firestore()
    });
  }
}