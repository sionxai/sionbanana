import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export async function GET() {
  try {
    const userId = "ACHNkfU8GNT5u8AtGNP0UsszqIR2";
    const results = [];

    // 기본 데이터베이스 확인
    try {
      const defaultDb = getAdminDb();
      const defaultCollection = defaultDb.collection(`users/${userId}/images`);
      const defaultSnapshot = await defaultCollection.get();

      results.push({
        database: "default (via getAdminDb)",
        count: defaultSnapshot.docs.length,
        sampleDocs: defaultSnapshot.docs.slice(0, 3).map(doc => ({
          id: doc.id,
          createdAt: doc.data().createdAt,
          status: doc.data().status
        }))
      });
    } catch (error) {
      results.push({
        database: "default (via getAdminDb)",
        error: (error as Error).message
      });
    }

    // sionbanana1 데이터베이스 확인
    try {
      // Import admin SDK functions for sionbanana1 database
      const { initializeApp, getApps } = await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");

      let sionbananaApp;
      const existingApps = getApps();
      const sionbananaAppName = "sionbanana1-app";

      // Check if app already exists
      const existingApp = existingApps.find(app => app.name === sionbananaAppName);
      if (existingApp) {
        sionbananaApp = existingApp;
      } else {
        const { getServiceAccountKey } = await import("@/lib/env");
        const serviceAccount = getServiceAccountKey();

        if (serviceAccount) {
          const { cert } = await import("firebase-admin/app");
          sionbananaApp = initializeApp({
            credential: cert({
              projectId: serviceAccount.projectId,
              clientEmail: serviceAccount.clientEmail,
              privateKey: serviceAccount.privateKey
            }),
            projectId: serviceAccount.projectId
          }, sionbananaAppName);
        }
      }

      if (sionbananaApp) {
        const sionbananaDb = getFirestore(sionbananaApp, "sionbanana1");
        const sionbananaCollection = sionbananaDb.collection(`users/${userId}/images`);
        const sionbananaSnapshot = await sionbananaCollection.get();

        results.push({
          database: "sionbanana1",
          count: sionbananaSnapshot.docs.length,
          sampleDocs: sionbananaSnapshot.docs.slice(0, 3).map(doc => ({
            id: doc.id,
            createdAt: doc.data().createdAt,
            status: doc.data().status
          }))
        });
      } else {
        results.push({
          database: "sionbanana1",
          error: "Could not initialize app"
        });
      }
    } catch (error) {
      results.push({
        database: "sionbanana1",
        error: (error as Error).message
      });
    }

    return NextResponse.json({
      userId,
      results,
      totalResults: results.length
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      userId: "ACHNkfU8GNT5u8AtGNP0UsszqIR2"
    });
  }
}