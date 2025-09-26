import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb, getAdminStorage } from "@/lib/firebase/admin";
import { ADMIN_UID } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;

    if (!token) {
      return NextResponse.json({ ok: false, reason: "인증 토큰이 필요합니다." }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);

    // Admin check
    const userDoc = await getAdminDb().collection("users").doc(decoded.uid).get();
    const userData = userDoc.data();
    const isAdmin = decoded.uid === ADMIN_UID || userData?.role === "admin";

    if (!isAdmin) {
      return NextResponse.json({ ok: false, reason: "관리자 권한이 필요합니다." }, { status: 403 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ ok: false, reason: "userId가 필요합니다." }, { status: 400 });
    }

    console.log(`🔄 Starting storage sync for user: ${userId}`);

    const bucket = getAdminStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: `users/${userId}/images/` });

    console.log(`📁 Found ${files.length} files in storage`);

    let syncCount = 0;
    const now = Timestamp.now();

    for (const file of files) {
      try {
        // Extract image ID from file path: users/{userId}/images/{imageId}.{ext}
        const pathParts = file.name.split('/');
        if (pathParts.length !== 4) continue;

        const fileNameWithExt = pathParts[3];
        const imageId = fileNameWithExt.split('.')[0]; // Remove extension

        if (!imageId) continue;

        // Check if Firestore doc already exists
        const docRef = getAdminDb().collection("users").doc(userId).collection("images").doc(imageId);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
          console.log(`⏭️  Skipping existing doc: ${imageId}`);
          continue;
        }

        // Get file metadata
        const [metadata] = await file.getMetadata();
        const createdTime = metadata.timeCreated ? new Date(metadata.timeCreated) : new Date();
        const createdTimestamp = Timestamp.fromDate(createdTime);

        // Get public URL
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
        });

        // Create Firestore document with minimal data
        const imageDocData = {
          mode: "create",
          status: "completed",
          promptMeta: {
            rawPrompt: "기존 생성 이미지 (Storage 동기화)",
            refinedPrompt: null,
            negativePrompt: null,
            aspectRatio: "original"
          },
          imageUrl: signedUrl,
          originalImageUrl: null,
          thumbnailUrl: null,
          diff: null,
          metadata: { migrated: true, originalPath: file.name },
          model: "gemini-nano-banana",
          costCredits: 1,
          createdAt: createdTimestamp,
          updatedAt: now,
          createdAtIso: createdTime.toISOString(),
          updatedAtIso: now.toDate().toISOString()
        };

        await docRef.set(imageDocData);
        syncCount++;

        console.log(`✅ Synced: ${imageId} (${file.name})`);

      } catch (fileError) {
        console.error(`❌ Failed to sync file ${file.name}:`, fileError);
      }
    }

    console.log(`🎉 Storage sync completed: ${syncCount}/${files.length} files synced`);

    return NextResponse.json({
      ok: true,
      message: `${syncCount}개의 이미지를 동기화했습니다.`,
      totalFiles: files.length,
      syncedFiles: syncCount
    });

  } catch (error) {
    console.error("/api/admin/sync-storage error", error);
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}