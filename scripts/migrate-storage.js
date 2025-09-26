const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');

if (!serviceAccount.project_id) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key?.replace(/\\n/g, '\n') || ''
  }),
  storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function migrateUserImages(userId) {
  console.log(`🔄 Starting migration for user: ${userId}`);

  try {
    const [files] = await bucket.getFiles({ prefix: `users/${userId}/images/` });
    console.log(`📁 Found ${files.length} files in storage`);

    let syncCount = 0;
    const now = admin.firestore.Timestamp.now();

    for (const file of files) {
      try {
        // Extract image ID from file path
        const pathParts = file.name.split('/');
        if (pathParts.length !== 4) continue;

        const fileNameWithExt = pathParts[3];
        const imageId = fileNameWithExt.split('.')[0];

        if (!imageId) continue;

        // Check if Firestore doc already exists
        const docRef = db.collection('users').doc(userId).collection('images').doc(imageId);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
          console.log(`⏭️  Skipping existing doc: ${imageId}`);
          continue;
        }

        // Get file metadata
        const [metadata] = await file.getMetadata();
        const createdTime = metadata.timeCreated ? new Date(metadata.timeCreated) : new Date();
        const createdTimestamp = admin.firestore.Timestamp.fromDate(createdTime);

        // Make file publicly readable
        await file.makePublic();

        // Get public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;

        // Create Firestore document
        const imageDocData = {
          mode: 'create',
          status: 'completed',
          promptMeta: {
            rawPrompt: '기존 생성 이미지 (Storage 동기화)',
            refinedPrompt: null,
            negativePrompt: null,
            aspectRatio: 'original'
          },
          imageUrl: publicUrl,
          originalImageUrl: null,
          thumbnailUrl: null,
          diff: null,
          metadata: { migrated: true, originalPath: file.name },
          model: 'gemini-nano-banana',
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

    console.log(`🎉 Migration completed: ${syncCount}/${files.length} files synced`);
    return { totalFiles: files.length, syncedFiles: syncCount };

  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

// Run migration
const userId = process.argv[2] || 'ACHNkfU8GNT5u8AtGNP0UsszqIR2';

migrateUserImages(userId)
  .then(result => {
    console.log('\n✨ Migration successful!');
    console.log(`Total files: ${result.totalFiles}`);
    console.log(`Synced files: ${result.syncedFiles}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });