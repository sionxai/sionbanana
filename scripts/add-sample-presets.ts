/**
 * Firestore에 샘플 프리셋 데이터 추가
 *
 * 사용법: npx tsx scripts/add-sample-presets.ts
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";

// .env.local 로드
dotenv.config({ path: ".env.local" });

// 환경변수에서 서비스 계정 키 가져오기
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountKey) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is required");
}

const serviceAccount = JSON.parse(serviceAccountKey);

// Firebase Admin 초기화
const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = getFirestore(app);

// 샘플 프리셋 데이터
const samplePresets = [
  // External 프리셋 샘플
  {
    category: "external",
    groupId: "external_default",
    groupLabel: { ko: "외부 프리셋", en: "External Presets" },
    value: "sample_cyberpunk",
    label: { ko: "사이버펑크", en: "Cyberpunk" },
    prompt: "cyberpunk style, neon lights, futuristic cityscape, high contrast",
    order: 1,
    status: "published",
    metadata: {
      description: { ko: "사이버펑크 스타일 이미지", en: "Cyberpunk style image" },
      tags: ["sci-fi", "neon", "futuristic"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: "ACHNkfU8GNT5u8AtGNP0UsszqIR2", // ADMIN_UID
  },
  {
    category: "external",
    groupId: "external_default",
    groupLabel: { ko: "외부 프리셋", en: "External Presets" },
    value: "sample_anime",
    label: { ko: "애니메이션", en: "Anime" },
    prompt: "anime style, vibrant colors, expressive eyes, detailed character design",
    order: 2,
    status: "published",
    metadata: {
      description: { ko: "애니메이션 스타일 이미지", en: "Anime style image" },
      tags: ["anime", "cartoon", "illustration"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: "ACHNkfU8GNT5u8AtGNP0UsszqIR2",
  },
  {
    category: "external",
    groupId: "external_default",
    groupLabel: { ko: "외부 프리셋", en: "External Presets" },
    value: "sample_realistic",
    label: { ko: "사실적", en: "Realistic" },
    prompt: "photorealistic, high detail, natural lighting, professional photography",
    order: 3,
    status: "published",
    metadata: {
      description: { ko: "사실적인 사진 스타일", en: "Realistic photo style" },
      tags: ["realistic", "photo", "detailed"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: "ACHNkfU8GNT5u8AtGNP0UsszqIR2",
  },

  // Lighting 프리셋 샘플
  {
    category: "lighting",
    groupId: "lighting_default",
    groupLabel: { ko: "조명", en: "Lighting" },
    value: "sample_golden_hour",
    label: { ko: "골든 아워", en: "Golden Hour" },
    prompt: "golden hour lighting, warm tones, soft shadows, sunset glow",
    order: 1,
    status: "published",
    metadata: {
      description: { ko: "따뜻한 석양 조명", en: "Warm sunset lighting" },
      tags: ["sunset", "warm", "soft"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: "ACHNkfU8GNT5u8AtGNP0UsszqIR2",
  },
  {
    category: "lighting",
    groupId: "lighting_default",
    groupLabel: { ko: "조명", en: "Lighting" },
    value: "sample_dramatic",
    label: { ko: "드라마틱", en: "Dramatic" },
    prompt: "dramatic lighting, high contrast, strong shadows, chiaroscuro",
    order: 2,
    status: "published",
    metadata: {
      description: { ko: "강렬한 명암 대비", en: "Strong light/shadow contrast" },
      tags: ["dramatic", "contrast", "shadows"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: "ACHNkfU8GNT5u8AtGNP0UsszqIR2",
  },

  // Pose 프리셋 샘플
  {
    category: "pose",
    groupId: "pose_default",
    groupLabel: { ko: "포즈", en: "Pose" },
    value: "sample_standing",
    label: { ko: "서있는 자세", en: "Standing Pose" },
    prompt: "standing pose, confident posture, full body view",
    order: 1,
    status: "published",
    metadata: {
      description: { ko: "자신감 있는 서있는 자세", en: "Confident standing pose" },
      tags: ["standing", "full body", "confident"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: "ACHNkfU8GNT5u8AtGNP0UsszqIR2",
  },
  {
    category: "pose",
    groupId: "pose_default",
    groupLabel: { ko: "포즈", en: "Pose" },
    value: "sample_sitting",
    label: { ko: "앉은 자세", en: "Sitting Pose" },
    prompt: "sitting pose, relaxed posture, casual position",
    order: 2,
    status: "published",
    metadata: {
      description: { ko: "편안한 앉은 자세", en: "Relaxed sitting pose" },
      tags: ["sitting", "relaxed", "casual"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: "ACHNkfU8GNT5u8AtGNP0UsszqIR2",
  },

  // Draft 상태 샘플 (검수 대기)
  {
    category: "external",
    groupId: "external_default",
    groupLabel: { ko: "외부 프리셋", en: "External Presets" },
    value: "sample_watercolor",
    label: { ko: "수채화", en: "Watercolor" },
    prompt: "watercolor painting style, soft edges, flowing colors, artistic",
    order: 10,
    status: "draft",
    metadata: {
      description: { ko: "수채화 스타일 (검수중)", en: "Watercolor style (in review)" },
      tags: ["watercolor", "painting", "artistic"],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: "ACHNkfU8GNT5u8AtGNP0UsszqIR2",
  },
];

async function addSamplePresets() {
  console.log("🚀 Starting to add sample presets to Firestore...");

  const presetsRef = db.collection("presets");
  let addedCount = 0;
  let skippedCount = 0;

  for (const preset of samplePresets) {
    try {
      // 중복 확인
      const existing = await presetsRef
        .where("category", "==", preset.category)
        .where("value", "==", preset.value)
        .limit(1)
        .get();

      if (!existing.empty) {
        console.log(`⏭️  Skipped (already exists): ${preset.category}/${preset.value}`);
        skippedCount++;
        continue;
      }

      // 추가
      await presetsRef.add(preset);
      console.log(`✅ Added: ${preset.category}/${preset.value} - ${preset.label.ko}`);
      addedCount++;
    } catch (error) {
      console.error(`❌ Error adding preset ${preset.value}:`, error);
    }
  }

  console.log("\n📊 Summary:");
  console.log(`  ✅ Added: ${addedCount}`);
  console.log(`  ⏭️  Skipped: ${skippedCount}`);
  console.log(`  📋 Total: ${samplePresets.length}`);
}

// 실행
addSamplePresets()
  .then(() => {
    console.log("\n✨ Sample presets added successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error:", error);
    process.exit(1);
  });
