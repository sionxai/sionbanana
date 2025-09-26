import type { PosePresetCategory } from "@/components/studio/types";

export interface PosePresetOption {
  value: string;
  label: string;
  prompt: string;
}

export interface PosePresetGroup {
  key: PosePresetCategory;
  title: string;
  options: PosePresetOption[];
}

export const POSE_MODE_BASE_PROMPT =
  "High fidelity portrait of the supplied reference subject. Maintain the same identity, outfit, camera framing, and scene while adjusting only the body pose and facial expression as instructed.";

export const POSE_PRESET_GROUPS: PosePresetGroup[] = [
  {
    key: "expression",
    title: "표정 · 감정",
    options: [
      {
        value: "default",
        label: "기본값",
        prompt: ""
      },
      {
        value: "smile-bright",
        label: "웃음",
        prompt: "Lift the cheeks into a bright smile with sparkling eyes and joyful energy."
      },
      {
        value: "serious",
        label: "진지한 표정",
        prompt: "Relax the mouth and focus the gaze for a composed, serious expression."
      },
      {
        value: "laughing",
        label: "웃음 (활짝)",
        prompt: "Open the mouth slightly with visible teeth and laughing eyes for an exuberant laugh."
      },
      {
        value: "surprised",
        label: "놀란",
        prompt: "Widen the eyes and part the lips to convey a natural look of surprise."
      },
      {
        value: "confident",
        label: "자신감",
        prompt: "Add a subtle confident smirk with lifted chin and steady gaze."
      },
      {
        value: "shy",
        label: "수줍음",
        prompt: "Soften the eyes, tilt the head slightly, and show a gentle closed-lip smile for a shy mood."
      },
      {
        value: "thoughtful",
        label: "사색적인",
        prompt: "Relax facial muscles into a contemplative, introspective expression."
      },
      {
        value: "peaceful",
        label: "평화로운",
        prompt: "Present a serene, calm face with relaxed eyelids and a faint content smile."
      },
      {
        value: "sorrow",
        label: "서러움",
        prompt: "Lower the eyebrows slightly and soften the lips to suggest quiet sorrow."
      },
      {
        value: "crying",
        label: "엉엉 우는",
        prompt: "Add teary eyes, trembling lips, and expressive brows for open crying."
      },
      {
        value: "subtle-smile",
        label: "미묘한 미소",
        prompt: "Create a delicate, barely-there smile with gentle warmth in the eyes."
      },
      {
        value: "blank",
        label: "멍한 표정",
        prompt: "Loosen the facial muscles into an absent-minded, spaced-out stare."
      },
      {
        value: "playful",
        label: "장난스러운",
        prompt: "Raise one eyebrow and form a mischievous grin for a playful expression."
      },
      {
        value: "angry",
        label: "화난",
        prompt: "Knit the brows, narrow the eyes, and tighten the jaw for a controlled anger."
      },
      {
        value: "afraid",
        label: "두려워하는",
        prompt: "Widen the eyes and tense the lips to communicate fear or anxiety."
      },
      {
        value: "ecstatic",
        label: "황홀한",
        prompt: "Brighten the face with awe-struck eyes and radiant excitement."
      },
      {
        value: "meditative",
        label: "명상적인",
        prompt: "Show a meditative calm with closed or half-lidded eyes and peaceful breathing."
      },
      {
        value: "resolute",
        label: "결연한",
        prompt: "Set the jaw and fix the gaze forward with determined resolve."
      }
    ]
  },
  {
    key: "posture",
    title: "포즈 · 자세",
    options: [
      {
        value: "default",
        label: "기본값",
        prompt: ""
      },
      {
        value: "standing",
        label: "서있는 자세",
        prompt: "Keep the character standing upright with balanced weight and relaxed shoulders."
      },
      {
        value: "sitting",
        label: "앉은 자세",
        prompt: "Seat the subject comfortably with natural posture and aligned spine."
      },
      {
        value: "walking",
        label: "걷는 중",
        prompt: "Pose the body mid-step with gentle arm swing to show natural walking motion."
      },
      {
        value: "running",
        label: "뛰는 중",
        prompt: "Capture an energetic running stride with dynamic arm and leg extension."
      },
      {
        value: "jumping",
        label: "점프하는 중",
        prompt: "Freeze the subject mid-jump with expressive limbs and sense of lift."
      },
      {
        value: "leaning",
        label: "기댄 자세",
        prompt: "Lean the character against a surface with relaxed weight support."
      },
      {
        value: "hands-hips",
        label: "허리에 손",
        prompt: "Place both hands on the hips to show confident emphasis in posture."
      },
      {
        value: "arms-crossed",
        label: "팔짱",
        prompt: "Cross the arms across the chest for a guarded, composed stance."
      },
      {
        value: "dynamic-action",
        label: "역동적 액션포즈",
        prompt: "Create a full-body action pose with dramatic motion and strong silhouette."
      },
      {
        value: "s-curve",
        label: "S커브 포즈",
        prompt: "Shape the body with an elegant S-curve and graceful weight shift."
      },
      {
        value: "power",
        label: "파워포즈",
        prompt: "Adopt a heroic power pose with squared shoulders and stable stance."
      },
      {
        value: "resting",
        label: "휴식포즈",
        prompt: "Relax the limbs and posture to suggest a comfortable resting position."
      },
      {
        value: "lying",
        label: "누워있는",
        prompt: "Lay the subject down with natural limb placement and relaxed expression."
      },
      {
        value: "crouched",
        label: "웅크린",
        prompt: "Pose the character crouching low with tucked limbs and balanced center."
      },
      {
        value: "falling",
        label: "넘어짐",
        prompt: "Depict the body mid-fall with dynamic motion and surprised balance."
      },
      {
        value: "prone",
        label: "업드림",
        prompt: "Place the subject prone on the ground with forearms supporting."
      },
      {
        value: "waving",
        label: "손 흔들기",
        prompt: "Raise one arm in a friendly wave with open hand gesture."
      },
      {
        value: "jumping-joy",
        label: "기쁨에 뛰기",
        prompt: "Show joyful jumping with arms lifted and knees bent mid-air."
      },
      {
        value: "thinking",
        label: "생각하는 포즈",
        prompt: "Pose the subject in a reflective stance with hand near chin."
      },
      {
        value: "reach-out",
        label: "손 내밀기",
        prompt: "Extend one hand forward invitingly while keeping posture balanced."
      },
      {
        value: "dancing",
        label: "춤추는 동작",
        prompt: "Capture a dance motion with fluid limbs and rhythmic movement."
      }
    ]
  }
];

export const POSE_PROMPT_LOOKUP: Record<PosePresetCategory, Record<string, string>> = POSE_PRESET_GROUPS.reduce(
  (acc, group) => {
    acc[group.key] = group.options.reduce<Record<string, string>>((map, option) => {
      map[option.value] = option.prompt;
      return map;
    }, {});
    return acc;
  },
  {
    expression: {},
    posture: {}
  }
);

export const generateCombinedPosePrompt = (selections: {
  expression?: string;
  posture?: string;
}): string => {
  const prompts: string[] = [];

  // Add expression prompt if selected and not default
  if (selections.expression && selections.expression !== 'default') {
    const expressionPrompt = POSE_PROMPT_LOOKUP.expression[selections.expression];
    if (expressionPrompt) {
      prompts.push(expressionPrompt);
    }
  }

  // Add posture prompt if selected and not default
  if (selections.posture && selections.posture !== 'default') {
    const posturePrompt = POSE_PROMPT_LOOKUP.posture[selections.posture];
    if (posturePrompt) {
      prompts.push(posturePrompt);
    }
  }

  return prompts.join(' ');
};
