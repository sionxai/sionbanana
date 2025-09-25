import type { ViewSpec } from "./types";

export const CHARACTER_BASE_PROMPT_FALLBACK =
  "High-resolution single shot of the supplied character, maintain exact likeness, outfit, and proportions, pure white seamless studio background with even lighting.";

export const CHARACTER_SINGLE_VIEW_GUIDELINE =
  "Render exactly one image focused on this specified view. Do not create collages, turnarounds, sprite sheets, or multiple angles.";

export const CHARACTER_NEGATIVE_ENFORCEMENT =
  "collage, multi view, multiple angles, turnaround sheet, reference sheet, sprite sheet, split screen, grid layout, duplicated pose, mirrored duplicates, text labels, different character, different costume, different hairstyle";

export const TURNAROUND_BASE_PROMPT_FALLBACK =
  "High-resolution 360-degree turnaround sequence of the supplied reference character, maintain identical facial features, hairstyle, outfit, proportions, pose, and expression while rotating the camera around the subject, pure white seamless studio background with even lighting.";

export const TURNAROUND_NEGATIVE_ENFORCEMENT =
  `${CHARACTER_NEGATIVE_ENFORCEMENT}, different pose, dynamic pose, action stance, arms raised, animated motion, inconsistent lighting, mismatched angle, different camera height, different facial expression, closed eyes, blinking, motion blur`;

export const TURNAROUND_SINGLE_VIEW_GUIDELINE =
  "Maintain the exact same pose, expression, limb placement, and camera distance as the reference image. Only rotate the camera around the character; do not move or animate the character.";

export const CHARACTER_VIEWS: ViewSpec[] = [
  {
    id: "front",
    label: "프론트 뷰",
    instruction:
      "Front-facing single shot of the reference character, matching outfit and features, facing the camera head-on, balanced pose, pure white seamless background with even lighting"
  },
  {
    id: "three-quarter",
    label: "3/4 뷰",
    instruction:
      "Three-quarter single shot of the reference character from the left side, consistent silhouette and costume details, clear depth in shoulders and torso, pure white seamless backdrop with even lighting"
  },
  {
    id: "side",
    label: "사이드 뷰",
    instruction:
      "Pure side-profile single shot of the reference character facing to the right, full silhouette visible with matching hairstyle and clothing, evenly lit against a pure white background"
  },
  {
    id: "rear",
    label: "후면 뷰",
    instruction:
      "Back view single shot of the reference character standing straight, outfit and hair clearly outlined, pure white background with uniform studio lighting"
  },
  {
    id: "full-body",
    label: "전신 뷰",
    instruction:
      "Full body single shot of the reference character in a relaxed A-pose, entire figure visible with consistent proportions, pure white seamless background with even lighting"
  },
  {
    id: "face-closeup",
    label: "페이스 클로즈업",
    instruction:
      "Face close-up single shot of the reference character, neutral expression, centered composition, facial details matching the reference, soft even lighting on a pure white background"
  }
];

export const TURNAROUND_VIEWS: ViewSpec[] = [
  {
    id: "angle-000",
    label: "0° 정면",
    instruction:
      "Camera rotation 0 degrees relative to the supplied reference image, front view of the same character facing directly toward the camera, identical features and outfit, neutral stance"
  },
  {
    id: "angle-030",
    label: "30° 우측 전면",
    instruction:
      "Camera rotation +30 degrees to the right around the reference character, front-right view showing more of the right shoulder while both eyes remain visible, identical design to the reference"
  },
  {
    id: "angle-060",
    label: "60° 우측",
    instruction:
      "Camera rotation +60 degrees to the right around the reference character, right-facing view with clear overlap of the right side of the torso and face, same hairstyle and costume as the reference"
  },
  {
    id: "angle-090",
    label: "90° 우측 측면",
    instruction:
      "Camera rotation +90 degrees to the right, pure right profile view of the reference character with an accurate silhouette, features and outfit identical to the reference"
  },
  {
    id: "angle-120",
    label: "120° 우측 후면",
    instruction:
      "Camera rotation +120 degrees to the right, rear-right view that reveals back details and a glimpse of the right side, keeping the exact outfit and proportions from the reference"
  },
  {
    id: "angle-150",
    label: "150° 우측 뒤",
    instruction:
      "Camera rotation +150 degrees to the right, back-right view primarily showing the back while hinting at the right shoulder, same character design as the reference"
  },
  {
    id: "angle-180",
    label: "180° 후면",
    instruction:
      "Camera rotation +180 degrees, back view of the reference character standing straight, outfit and hair fully visible from behind, perfectly matching the reference"
  },
  {
    id: "angle-210",
    label: "210° 좌측 뒤",
    instruction:
      "Camera rotation +210 degrees continuing around to the left side, back-left view mainly showing the back with a subtle glimpse of the left shoulder, identical outfit details"
  },
  {
    id: "angle-240",
    label: "240° 좌측 후면",
    instruction:
      "Camera rotation +240 degrees to the left, rear-left view highlighting back details with overlapping left-side elements, matching the reference character exactly"
  },
  {
    id: "angle-270",
    label: "270° 좌측 측면",
    instruction:
      "Camera rotation +270 degrees, pure left profile view with a clean silhouette, same hairstyle, outfit, and proportions as the reference"
  },
  {
    id: "angle-300",
    label: "300° 좌측 전방",
    instruction:
      "Camera rotation +300 degrees, left-front view showing more of the left shoulder while both eyes remain visible, design perfectly aligned with the reference"
  },
  {
    id: "angle-330",
    label: "330° 좌측 전면",
    instruction:
      "Camera rotation +330 degrees, front-left view nearly facing forward with a slight turn toward the viewer's left side, maintaining identical character likeness"
  }
];
