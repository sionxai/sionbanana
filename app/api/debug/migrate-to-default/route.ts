import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { clientEnv } from "@/lib/env";

export async function POST() {
  try {
    // Get both databases
    const sourceDb = getAdminDb(); // This uses "sionbanana1" database

    // Import admin SDK functions for default database
    const { initializeApp, getApps } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");

    let defaultApp;
    const existingApps = getApps();
    const defaultAppName = "default-db-app";

    // Check if app already exists
    const existingApp = existingApps.find(app => app.name === defaultAppName);
    if (existingApp) {
      defaultApp = existingApp;
    } else {
      const { getServiceAccountKey } = await import("@/lib/env");
      const serviceAccount = getServiceAccountKey();

      if (!serviceAccount) {
        return NextResponse.json({ error: "Service account not configured" });
      }

      const { cert } = await import("firebase-admin/app");
      defaultApp = initializeApp({
        credential: cert({
          projectId: serviceAccount.projectId,
          clientEmail: serviceAccount.clientEmail,
          privateKey: serviceAccount.privateKey
        }),
        projectId: serviceAccount.projectId
      }, defaultAppName);
    }

    const defaultDb = getFirestore(defaultApp); // This uses default database

    const userId = "ACHNkfU8GNT5u8AtGNP0UsszqIR2";

    // Get all documents from source database
    const sourceCollection = sourceDb.collection(`users/${userId}/images`);
    const sourceSnapshot = await sourceCollection.get();

    console.log(`Found ${sourceSnapshot.docs.length} documents in source database`);

    // Copy each document to default database
    let migratedCount = 0;
    const batch = defaultDb.batch();

    for (const sourceDoc of sourceSnapshot.docs) {
      const targetDoc = defaultDb.collection(`users/${userId}/images`).doc(sourceDoc.id);
      batch.set(targetDoc, sourceDoc.data());
      migratedCount++;
    }

    // Commit the batch
    await batch.commit();

    console.log(`Successfully migrated ${migratedCount} documents to default database`);

    return NextResponse.json({
      success: true,
      migratedCount,
      message: `Successfully migrated ${migratedCount} documents from sionbanana1 to default database`
    });

  } catch (error: any) {
    console.error("Migration error:", error);
    return NextResponse.json({
      error: error.message || "Unknown error",
      success: false
    });
  }
}