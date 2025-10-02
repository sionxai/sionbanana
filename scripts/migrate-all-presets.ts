/**
 * 기존 프리셋 데이터를 Firestore로 마이그레이션
 *
 * 실행: npx tsx scripts/migrate-all-presets.ts
 */

import { EXTERNAL_PRESET_GROUPS } from "../components/studio/external-preset-config";
import { LIGHTING_PRESET_GROUPS } from "../components/studio/lighting-config";
import { POSE_PRESET_GROUPS } from "../components/studio/pose-config";

const ADMIN_UID = "ACHNkfU8GNT5u8AtGNP0UsszqIR2";

const CAMERA_PRESETS: Array<PresetToImport> = [];

const CAMERA_GROUPS = {
  angle: {
    id: "camera-angle",
    label: "카메라 앵글",
    options: [
      {
        id: "camera-angle-low",
        label: "Low Angle",
        labelKo: "로우앵글",
        prompt: "Position the camera low and shoot upward for a dramatic low-angle perspective."
      },
      {
        id: "camera-angle-wormseye",
        label: "Worm's Eye",
        labelKo: "웜즈아이",
        prompt: "Use an extreme worm's-eye viewpoint from ground level looking upward for heightened drama."
      },
      {
        id: "camera-angle-high",
        label: "High Angle",
        labelKo: "하이앵글",
        prompt: "Raise the camera high above the subject for a commanding high-angle overview."
      },
      {
        id: "camera-angle-birdseye",
        label: "Bird's Eye",
        labelKo: "버드아이",
        prompt: "Shoot from directly overhead to deliver a striking bird's-eye composition."
      },
      {
        id: "camera-angle-dutch",
        label: "Dutch Angle",
        labelKo: "더치앵글",
        prompt: "Tilt the camera to create a dynamic, off-kilter Dutch angle framing."
      },
      {
        id: "camera-angle-eyelevel",
        label: "Eye Level",
        labelKo: "아이레벨",
        prompt: "Keep the camera at natural eye level for a direct, grounded viewpoint."
      },
      {
        id: "camera-angle-reverse",
        label: "Reverse Angle",
        labelKo: "반대방향",
        prompt: "Position the camera behind or opposite the subject to capture a reverse angle."
      },
      {
        id: "camera-angle-over-shoulder",
        label: "Over-the-Shoulder",
        labelKo: "오버숄더",
        prompt: "Frame the scene over the subject's shoulder for an intimate, narrative viewpoint."
      }
    ]
  },
  subjectDirection: {
    id: "camera-subject-direction",
    label: "피사체 방향",
    options: [
      {
        id: "subject-front",
        label: "Faces Forward",
        labelKo: "정면",
        prompt: "Keep the subject facing forward directly toward the camera."
      },
      {
        id: "subject-left",
        label: "Faces Left",
        labelKo: "좌측면",
        prompt: "Turn the subject to reveal the left profile to the camera."
      },
      {
        id: "subject-right",
        label: "Faces Right",
        labelKo: "우측면",
        prompt: "Turn the subject to reveal the right profile to the camera."
      },
      {
        id: "subject-back",
        label: "Faces Away",
        labelKo: "후면",
        prompt: "Rotate the subject to show their back to the camera for a rear view."
      },
      {
        id: "subject-up",
        label: "Looks Up",
        labelKo: "위에서",
        prompt: "Tilt the subject's gaze upward toward the sky or ceiling."
      },
      {
        id: "subject-down",
        label: "Looks Down",
        labelKo: "아래에서",
        prompt: "Angle the subject's gaze downward toward the ground for a contemplative mood."
      }
    ]
  },
  cameraDirection: {
    id: "camera-direction",
    label: "카메라 위치",
    options: [
      {
        id: "camera-front",
        label: "Camera Front",
        labelKo: "정면",
        prompt: "Place the camera directly in front of the subject."
      },
      {
        id: "camera-left",
        label: "Camera Left",
        labelKo: "좌측면",
        prompt: "Move the camera to the subject's left side for a profile view."
      },
      {
        id: "camera-right",
        label: "Camera Right",
        labelKo: "우측면",
        prompt: "Move the camera to the subject's right side for a mirrored profile view."
      },
      {
        id: "camera-back",
        label: "Camera Back",
        labelKo: "후면",
        prompt: "Position the camera behind the subject to shoot from the rear."
      },
      {
        id: "camera-top",
        label: "Camera Overhead",
        labelKo: "위에서",
        prompt: "Raise the camera overhead and angle it downward toward the subject."
      },
      {
        id: "camera-bottom",
        label: "Camera Low",
        labelKo: "아래에서",
        prompt: "Lower the camera near the ground and angle it upward toward the subject."
      }
    ]
  },
  zoom: {
    id: "camera-zoom",
    label: "줌 연출",
    options: [
      {
        id: "zoom-in",
        label: "Zoom In",
        labelKo: "줌인",
        prompt: "Move closer for a tight framing that emphasizes intimate detail."
      },
      {
        id: "zoom-out",
        label: "Zoom Out",
        labelKo: "줌아웃",
        prompt: "Pull back for a wider framing that reveals more of the environment."
      },
      {
        id: "zoom-telephoto",
        label: "Telephoto",
        labelKo: "확대",
        prompt: "Use a telephoto lens for compressed perspective and strong subject isolation."
      }
    ]
  }
};

interface PresetToImport {
  id: string;
  category: "camera" | "lighting" | "pose" | "external";
  groupId: string;
  groupLabel: string;
  label: string;
  labelKo: string;
  prompt: string;
  note?: string;
  order: number;
  active: boolean;
  metadata?: Record<string, unknown>;
}

async function main() {
  console.log("🚀 프리셋 마이그레이션 시작...\n");

  const allPresets: PresetToImport[] = [];

  // External 프리셋
  console.log("📦 External 프리셋 처리 중...");
  EXTERNAL_PRESET_GROUPS.forEach((group) => {
    group.options.forEach((option, index) => {
      allPresets.push({
        id: `ext-${option.id}`,
        category: "external",
        groupId: group.id,
        groupLabel: group.title,
        label: option.label,
        labelKo: option.labelKo,
        prompt: option.prompt,
        note: option.note,
        order: index + 1,
        active: true,
        metadata: {
          value: option.id
        }
      });
    });
  });
  const externalCount = allPresets.length;
  console.log(`✅ External: ${externalCount}개 수집\n`);

  // Lighting 프리셋
  console.log("💡 Lighting 프리셋 처리 중...");
  LIGHTING_PRESET_GROUPS.forEach((group) => {
    group.options.forEach((option, index) => {
      allPresets.push({
        id: `light-${option.value}`,
        category: "lighting",
        groupId: group.key,
        groupLabel: group.title,
        label: option.label,
        labelKo: option.label,
        prompt: option.prompt,
        order: index + 1,
        active: true,
        metadata: {
          value: option.value
        }
      });
    });
  });
  const lightingCount = allPresets.length - externalCount;
  console.log(`✅ Lighting: ${lightingCount}개 수집\n`);

  // Pose 프리셋
  console.log("🧍 Pose 프리셋 처리 중...");
  POSE_PRESET_GROUPS.forEach((group) => {
    group.options.forEach((option, index) => {
      // Skip "default" options with empty prompts (these are UI placeholders)
      if (option.value === "default" && !option.prompt) {
        return;
      }

      allPresets.push({
        id: `pose-${option.value}`,
        category: "pose",
        groupId: group.key,
        groupLabel: group.title,
        label: option.label,
        labelKo: option.label,
        prompt: option.prompt,
        order: index + 1,
        active: true,
        metadata: {
          value: option.value
        }
      });
    });
  });
  const poseCount = allPresets.length - externalCount - lightingCount;
  console.log(`✅ Pose: ${poseCount}개 수집 (기본값 제외)\n`);

  console.log("🎥 Camera 프리셋 처리 중...");
  const beforeCamera = allPresets.length;
  Object.values(CAMERA_GROUPS).forEach(group => {
    group.options.forEach((option, index) => {
      CAMERA_PRESETS.push({
        id: option.id,
        category: "camera",
        groupId: group.id,
        groupLabel: group.label,
        label: option.label,
        labelKo: option.labelKo,
        prompt: option.prompt,
        order: index + 1,
        active: true
      });
    });
  });
  CAMERA_PRESETS.forEach(preset => allPresets.push(preset));
  const cameraCount = allPresets.length - beforeCamera;
  console.log(`✅ Camera: ${cameraCount}개 수집\n`);

  console.log("============================================================");
  console.log(`📊 총 수집된 프리셋: ${allPresets.length}개`);
  console.log(`  - External: ${externalCount}개`);
  console.log(`  - Lighting: ${lightingCount}개`);
  console.log(`  - Pose: ${poseCount}개`);
  console.log(`  - Camera: ${cameraCount}개`);
  console.log("============================================================");
  console.log();

  // JSON 파일로 저장
  const fs = await import("fs");
  const path = await import("path");
  const outputPath = path.join(process.cwd(), "presets-migration-data.json");
  fs.writeFileSync(outputPath, JSON.stringify({ presets: allPresets }, null, 2));
  console.log(`📄 저장 완료: ${outputPath}\n`);

  console.log("🎉 마이그레이션 데이터 생성 완료!");
  console.log("\n다음 단계: 관리자 콘솔에서 '파일 가져오기' 버튼으로 JSON 파일을 업로드하세요.");
}

main().catch(console.error);
