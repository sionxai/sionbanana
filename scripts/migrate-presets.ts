/**
 * 기존 프리셋 데이터를 Firestore로 마이그레이션하는 스크립트
 *
 * 실행 방법:
 * npx tsx scripts/migrate-presets.ts
 */

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { batchCreatePresets } from "../lib/presets/firestore";
import type { PresetInput } from "../lib/presets/types";

// Firebase 설정 (환경 변수에서 로드)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 기존 External 프리셋 데이터 (components/studio/external-preset-config.ts에서 복사)
const externalPresets: Array<PresetInput & { id: string }> = [
  // Case 01-10
  {
    id: "ext-case-01",
    category: "external",
    groupId: "cases-01-10",
    groupLabel: "Cases 01-10",
    label: "Case 01",
    labelKo: "케이스 01",
    prompt: "white iPhone 15 case, product image with floating around very small autumn color bokeh,",
    order: 1,
    active: true
  },
  {
    id: "ext-case-02",
    category: "external",
    groupId: "cases-01-10",
    groupLabel: "Cases 01-10",
    label: "Case 02",
    labelKo: "케이스 02",
    prompt: "white iPhone 15 case, white soft organic shapes with floating around very small colorful glossy balls, product image,",
    order: 2,
    active: true
  },
  {
    id: "ext-case-03",
    category: "external",
    groupId: "cases-01-10",
    groupLabel: "Cases 01-10",
    label: "Case 03",
    labelKo: "케이스 03",
    prompt: "white iPhone 15 case, dynamic composition with floating around very small glossy candies, product image,",
    order: 3,
    active: true
  },
  {
    id: "ext-case-04",
    category: "external",
    groupId: "cases-01-10",
    groupLabel: "Cases 01-10",
    label: "Case 04",
    labelKo: "케이스 04",
    prompt: "white iPhone 15 case, product image with floating around very small neon color glossy abstract shapes,",
    order: 4,
    active: true
  },
  {
    id: "ext-case-05",
    category: "external",
    groupId: "cases-01-10",
    groupLabel: "Cases 01-10",
    label: "Case 05",
    labelKo: "케이스 05",
    prompt: "white iPhone 15 case, 3d rendering with floating around very small matte beige simple shapes, product image,",
    order: 5,
    active: true
  },
  {
    id: "ext-case-06",
    category: "external",
    groupId: "cases-01-10",
    groupLabel: "Cases 01-10",
    label: "Case 06",
    labelKo: "케이스 06",
    prompt: "white iPhone 15 case, floating around very small simple organic colorful translucent plastic shapes, product image,",
    order: 6,
    active: true
  },
  {
    id: "ext-case-07",
    category: "external",
    groupId: "cases-01-10",
    groupLabel: "Cases 01-10",
    label: "Case 07",
    labelKo: "케이스 07",
    prompt: "white iPhone 15 case, with floating around very small holographic gradient bubbles, product image,",
    order: 7,
    active: true
  },
  {
    id: "ext-case-08",
    category: "external",
    groupId: "cases-01-10",
    groupLabel: "Cases 01-10",
    label: "Case 08",
    labelKo: "케이스 08",
    prompt: "white iPhone 15 case, Scandinavian minimalism with floating around very small wooden geometric shapes, product image,",
    order: 8,
    active: true
  },
  {
    id: "ext-case-09",
    category: "external",
    groupId: "cases-01-10",
    groupLabel: "Cases 01-10",
    label: "Case 09",
    labelKo: "케이스 09",
    prompt: "white iPhone 15 case, with floating around very small matte white fluid structures, product image,",
    order: 9,
    active: true
  },
  {
    id: "ext-case-10",
    category: "external",
    groupId: "cases-01-10",
    groupLabel: "Cases 01-10",
    label: "Case 10",
    labelKo: "케이스 10",
    prompt: "white iPhone 15 case, with floating around very small golden metallic twisted ribbon, product image,",
    order: 10,
    active: true
  }
  // TODO: 나머지 91개 프리셋 데이터 추가
  // components/studio/external-preset-config.ts 파일을 참조하여 모든 프리셋을 추가하세요
];

// Lighting 프리셋 예시 (실제로는 lighting-config.ts에서 가져와야 함)
const lightingPresets: Array<PresetInput & { id: string }> = [
  {
    id: "light-natural-01",
    category: "lighting",
    groupId: "natural-light",
    groupLabel: "자연광",
    label: "Natural Light",
    labelKo: "자연광",
    prompt: "natural daylight, soft ambient lighting",
    order: 1,
    active: true
  },
  {
    id: "light-golden-hour",
    category: "lighting",
    groupId: "natural-light",
    groupLabel: "자연광",
    label: "Golden Hour",
    labelKo: "골든 아워",
    prompt: "golden hour lighting, warm sunset glow",
    order: 2,
    active: true
  }
  // TODO: 나머지 조명 프리셋 추가
];

// Pose 프리셋 예시
const posePresets: Array<PresetInput & { id: string }> = [
  {
    id: "pose-standing-01",
    category: "pose",
    groupId: "standing",
    groupLabel: "서 있는 자세",
    label: "Standing Straight",
    labelKo: "똑바로 서기",
    prompt: "standing upright, neutral pose",
    order: 1,
    active: true
  },
  {
    id: "pose-sitting-01",
    category: "pose",
    groupId: "sitting",
    groupLabel: "앉은 자세",
    label: "Sitting",
    labelKo: "앉기",
    prompt: "sitting casually, relaxed posture",
    order: 1,
    active: true
  }
  // TODO: 나머지 포즈 프리셋 추가
];

async function migrate() {
  console.log("🚀 프리셋 마이그레이션 시작...\n");

  const ADMIN_UID = "YOUR_ADMIN_UID"; // 실제 관리자 UID로 변경하세요

  try {
    // External 프리셋 마이그레이션
    console.log("📦 External 프리셋 마이그레이션 중...");
    const extCount = await batchCreatePresets(externalPresets, ADMIN_UID);
    console.log(`✅ External: ${extCount}/${externalPresets.length}개 성공\n`);

    // Lighting 프리셋 마이그레이션
    console.log("💡 Lighting 프리셋 마이그레이션 중...");
    const lightCount = await batchCreatePresets(lightingPresets, ADMIN_UID);
    console.log(`✅ Lighting: ${lightCount}/${lightingPresets.length}개 성공\n`);

    // Pose 프리셋 마이그레이션
    console.log("🧍 Pose 프리셋 마이그레이션 중...");
    const poseCount = await batchCreatePresets(posePresets, ADMIN_UID);
    console.log(`✅ Pose: ${poseCount}/${posePresets.length}개 성공\n`);

    const totalMigrated = extCount + lightCount + poseCount;
    const totalPresets = externalPresets.length + lightingPresets.length + posePresets.length;

    console.log("=" . repeat(50));
    console.log(`🎉 마이그레이션 완료: ${totalMigrated}/${totalPresets}개 성공`);
    console.log("=" . repeat(50));
  } catch (error) {
    console.error("❌ 마이그레이션 실패:", error);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

export { migrate };