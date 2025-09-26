import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export async function GET() {
  try {
    const db = getAdminDb(); // This should use "sionbanana1" database
    const userId = "ACHNkfU8GNT5u8AtGNP0UsszqIR2";

    // Check the collection
    const collection = db.collection(`users/${userId}/images`);
    const snapshot = await collection.limit(5).get();

    const docs = snapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data()
    }));

    return NextResponse.json({
      database: "sionbanana1",
      userId,
      docsCount: snapshot.docs.length,
      docs: docs.slice(0, 2), // Only return first 2 for debugging
      collectionPath: `users/${userId}/images`
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message || "Unknown error",
      database: "sionbanana1"
    });
  }
}