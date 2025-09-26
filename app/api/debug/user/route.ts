import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export async function GET() {
  try {
    const db = getAdminDb();
    const userId = "ACHNkfU8GNT5u8AtGNP0UsszqIR2";

    // 프로덕션에서 실제 사용자 데이터 확인
    const collection = db.collection(`users/${userId}/images`);
    const snapshot = await collection.limit(10).get();

    const docs = snapshot.docs.map(doc => ({
      id: doc.id,
      createdAt: doc.data().createdAt,
      status: doc.data().status,
      imageUrl: doc.data().imageUrl ? "present" : "missing"
    }));

    return NextResponse.json({
      userId,
      totalDocs: snapshot.docs.length,
      docs,
      databaseType: "default"
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      userId: "ACHNkfU8GNT5u8AtGNP0UsszqIR2"
    });
  }
}