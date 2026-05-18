"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MutableRefObject } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_GENERATION_OPTIONS,
  GenerationOptionsPanel,
  type GenerationOptionsValue
} from "@/components/studio/generation-options-panel";
import { MAX_IMAGE_ZOOM, MIN_IMAGE_ZOOM, useImagePanZoom } from "@/components/studio/use-image-pan-zoom";
const LOCAL_AUTH = { user: { uid: "local" } } as const;
const useLocalUser = () => LOCAL_AUTH;
import { useGeneratedImages } from "@/hooks/use-generated-images";
import { callGenerateApi } from "@/hooks/use-generate-image";
import type { AspectRatioPreset, GeneratedImageDocument, GenerationMode } from "@/lib/types";
import { DEFAULT_ASPECT_RATIO, getAspectRatioDimensions, getAspectRatioLabel } from "@/lib/aspect";
import { isHistoryRecordFavorite, setHistoryRecordFavorite } from "@/lib/history-records";
import { APERTURE_DEFAULT, formatAperture } from "@/lib/camera";
import {
  CHARACTER_NEGATIVE_ENFORCEMENT,
  CHARACTER_SHEET_BASE_PROMPT,
  CHARACTER_SHEET_NEGATIVE,
  CHARACTER_SHEET_SINGLE_VIEW_GUIDELINE,
  CHARACTER_SHEET_VIEWS,
  TURNAROUND_BASE_PROMPT_FALLBACK,
  TURNAROUND_NEGATIVE_ENFORCEMENT,
  TURNAROUND_SINGLE_VIEW_GUIDELINE,
  TURNAROUND_VIEWS
} from "@/components/studio/preset-config";
import {
  INITIAL_REFERENCE_SLOT_COUNT,
  LOCAL_STORAGE_KEY,
  MAX_REFERENCE_SLOT_COUNT,
  REFERENCE_GALLERY_STORAGE_KEY,
  REFERENCE_IMAGE_DOC_ID,
  ReferenceSlotState,
  createReferenceSlot
} from "@/components/studio/constants";
import type { ViewSpec } from "@/components/studio/types";
import {
  REFERENCE_SYNC_EVENT,
  REFERENCE_SYNC_STORAGE_KEY,
  broadcastReferenceUpdate,
  readStoredReference,
  type ReferenceSyncPayload
} from "@/components/studio/reference-sync";
import {
  HISTORY_SYNC_EVENT,
  broadcastHistoryUpdate,
  mergeHistoryRecords,
  persistRecordsMerge,
  removeRecordFromLocalStorage,
  type HistorySyncPayload
} from "@/components/studio/history-sync";
import { copyCharacterImageToStorage } from "@/components/studio/character-image-storage";
import { cn } from "@/lib/utils";
import { saveCharacter } from "@/lib/characters";
import { Download, Image as ImageIcon, Plus, Sparkles, Stars, Zap, ZoomIn } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsList } from "@/components/ui/tabs";

const PRESET_MODES = [
  { id: "create", label: "1개 생성", description: "기본 프롬프트 기반 이미지 생성", href: "/studio" },
  { id: "batch", label: "다수 생성", description: "여러 이미지를 한번에 생성", href: "/studio/batch" },
  { id: "presets", label: "프리셋", description: "자주 쓰는 시나리오 모음" }
];

const PHOTO_DUMP_VIEWS: ViewSpec[] = [
  { id: "style-film", label: "필름 감성", instruction: "Apply warm film photography look with subtle grain and soft highlights" },
  { id: "style-vintage", label: "빈티지", instruction: "Vintage portrait with muted colors and gentle vignetting" },
  { id: "style-anime", label: "애니메", instruction: "High-quality anime illustration style, cel shading" },
  { id: "style-comic", label: "코믹", instruction: "Bold comic-book ink lines with halftone shading" },
  { id: "style-oil", label: "유화", instruction: "Oil painting on canvas, expressive brush strokes" },
  { id: "style-watercolor", label: "수채화", instruction: "Delicate watercolor illustration with soft edges" },
  { id: "style-pencil", label: "연필 스케치", instruction: "Detailed pencil sketch with cross-hatching" },
  { id: "style-synthwave", label: "신스웨이브", instruction: "Synthwave neon lighting with magenta and cyan palette" },
  { id: "style-cyberpunk", label: "사이버펑크", instruction: "Cyberpunk city lighting, neon reflections" },
  { id: "style-fantasy", label: "판타지", instruction: "High fantasy painting with dramatic lighting" },
  { id: "style-sci-fi", label: "SF", instruction: "Futuristic sci-fi render with holographic overlays" },
  { id: "style-fashion", label: "패션 화보", instruction: "Editorial fashion photoshoot lighting" },
  { id: "style-blackwhite", label: "흑백", instruction: "High contrast black and white portrait" },
  { id: "style-highkey", label: "하이키", instruction: "High-key studio lighting with bright background" },
  { id: "style-lowkey", label: "로우키", instruction: "Low-key moody lighting with strong shadows" },
  { id: "style-pastel", label: "파스텔", instruction: "Pastel color palette with soft gradients" },
  { id: "style-popart", label: "팝아트", instruction: "Pop art with bold flat colors and graphic outlines" },
  { id: "style-80s", label: "80's", instruction: "1980s retro portrait with film grain" },
  { id: "style-90s", label: "90's", instruction: "1990s magazine cover aesthetic" },
  { id: "style-desert", label: "사막톤", instruction: "Golden desert color grading with warm highlights" },
  { id: "style-winter", label: "윈터", instruction: "Cool winter palette with soft blues" },
  { id: "style-forest", label: "포레스트", instruction: "Forest-inspired greens with dappled light" },
  { id: "style-portrait-studio", label: "스튜디오", instruction: "Classic studio portrait with beauty dish lighting" },
  { id: "style-hdr", label: "HDR", instruction: "High dynamic range portrait with crisp details" },
  { id: "style-bokeh", label: "보케", instruction: "Shallow depth-of-field with large bokeh highlights" },
  { id: "style-cinematic", label: "시네마틱", instruction: "Cinematic lighting with anamorphic flares" }
];

const PHOTO_DUMP_VARIATION_VIEWS: ViewSpec[] = [
  {
    id: "dynamic-look-01",
    label: "룩 01",
    instruction:
      "Keep the character identity but switch to a casual street outfit, wind-swept hair, lively mid-step pose, cheerful smile, neon night backdrop"
  },
  {
    id: "dynamic-look-02",
    label: "룩 02",
    instruction:
      "Keep the identity while showcasing a formal suit, slicked-back hair, confident stance with hands in pockets, composed expression, modern office interior"
  },
  {
    id: "dynamic-look-03",
    label: "룩 03",
    instruction:
      "Maintain likeness wearing sporty activewear, high ponytail, dynamic running pose, focused expression, sunrise park background"
  },
  {
    id: "dynamic-look-04",
    label: "룩 04",
    instruction:
      "Preserve identity in a flowing evening dress, loose curls, gentle spin pose, joyful laugh, gala ballroom setting"
  },
  {
    id: "dynamic-look-05",
    label: "룩 05",
    instruction:
      "Retain facial features with edgy leather outfit, asymmetrical haircut, leaning forward pose, intense gaze, cyberpunk alley backdrop"
  },
  {
    id: "dynamic-look-06",
    label: "룩 06",
    instruction:
      "Keep the character recognizable in cozy knitwear, messy bun, seated relaxed pose, warm smile, rustic coffee shop interior"
  },
  {
    id: "dynamic-look-07",
    label: "룩 07",
    instruction:
      "Maintain identity wearing summer resort attire, wavy hair, playful jumping pose, laughing expression, tropical beach at golden hour"
  },
  {
    id: "dynamic-look-08",
    label: "룩 08",
    instruction:
      "Keep likeness with futuristic techwear, sleek bob haircut, action-ready stance, serious expression, holographic city plaza"
  },
  {
    id: "dynamic-look-09",
    label: "룩 09",
    instruction:
      "Preserve the face in bohemian outfit, braided hair, gentle hand-on-chest pose, serene smile, sunlit field of flowers"
  },
  {
    id: "dynamic-look-10",
    label: "룩 10",
    instruction:
      "Maintain character identity in winter coat and scarf, tousled hair with snowflakes, mid-stride pose, surprised expression, snow-covered city street"
  },
  {
    id: "dynamic-look-11",
    label: "룩 11",
    instruction:
      "Keep the same face with stage performance outfit, voluminous hairstyle, microphone-in-hand pose, energetic expression, concert lights background"
  },
  {
    id: "dynamic-look-12",
    label: "룩 12",
    instruction:
      "Retain identity wearing minimalist monochrome fashion, sleek straight hair, seated profile pose, calm expression, modern art gallery backdrop"
  }
];

const INITIAL_HISTORY_VISIBLE_COUNT = 36;
const HISTORY_VISIBLE_INCREMENT = 36;
const PRESET_BATCH_PROGRESS_TOAST_ID = "preset-batch-progress";
const FOUR_THREE_RATIO_CLASS = "aspect-[4/3]";
const PRESET_ACTION_MODE: GenerationMode = "create";

async function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("파일을 읽을 수 없습니다."));
      }
    };
    reader.onerror = () => reject(new Error("파일을 읽는 중 오류가 발생했습니다."));
    reader.readAsDataURL(file);
  });
}

const EMOTION_STUDY_VIEWS: ViewSpec[] = [
  {
    id: "emotion-joyful",
    label: "기쁜 웃음",
    instruction:
      "Maintain the exact character likeness and pose while lifting the cheeks into a radiant joyful smile, eyes sparkling with happiness."
  },
  {
    id: "emotion-serious",
    label: "진지함",
    instruction:
      "Keep the same composition and outfit while transitioning facial muscles into a composed, serious expression with focused eyes and a firm mouth."
  },
  {
    id: "emotion-surprised",
    label: "놀란",
    instruction:
      "Preserve the pose but widen the eyes and slightly open the mouth to convey a natural look of surprise without exaggerating the features."
  },
  {
    id: "emotion-confident",
    label: "자신감",
    instruction:
      "Hold the current framing while adding a subtle confident smirk, lifted chin, and steady gaze that communicates assurance."
  },
  {
    id: "emotion-shy",
    label: "수줍은",
    instruction:
      "Maintain the pose while softening the eyes, adding a gentle closed-lip smile, and a slight head tilt that feels shy yet endearing."
  },
  {
    id: "emotion-thoughtful",
    label: "사색적인/명상적인",
    instruction:
      "Keep the same posture while relaxing the face into a contemplative, meditative expression with softened gaze and calm breathing."
  },
  {
    id: "emotion-peaceful",
    label: "평화로운",
    instruction:
      "Preserve the original stance while presenting a serene, peaceful expression with relaxed eyelids and a faint content smile."
  },
  {
    id: "emotion-blank",
    label: "멍한",
    instruction:
      "Keep all body details identical while loosening the facial muscles into a spaced-out, absent-minded stare with parted lips."
  },
  {
    id: "emotion-playful",
    label: "장난스러움",
    instruction:
      "Maintain the same pose and lighting while adding a mischievous grin, raised eyebrow, and lively eyes that suggest playfulness."
  },
  {
    id: "emotion-angry",
    label: "화난",
    instruction:
      "Preserve the framing while knitting the brows, tightening the jaw, and narrowing the eyes to portray a controlled, angry glare."
  },
  {
    id: "emotion-afraid",
    label: "두려워하는",
    instruction:
      "Keep the body unchanged while widening the eyes, tensing the lips, and adding subtle brow lift to communicate fear or anxiety."
  },
  {
    id: "emotion-ecstatic",
    label: "황홀한/결연한",
    instruction:
      "Retain the pose while brightening the face with an awe-struck, ecstatic glow and resolute gaze that feels inspired and determined."
  }
];

const NINE_ZOOM_VIEW_POOL: ViewSpec[] = [
  {
    id: "nine-zoom-els-deep",
    label: "ELS 딥 포커스",
    instruction:
      "Extreme Long Shot / ELS, the subject appears very small inside a much larger environment, 24mm wide lens feeling, deep focus, high depth of field, f/8, background and subject both clear"
  },
  {
    id: "nine-zoom-wide-deep",
    label: "와이드 딥 포커스",
    instruction:
      "Long Shot / Wide Shot, full body visible with generous surrounding space, 28mm wide lens, deep depth of field, f/5.6, clear environment context"
  },
  {
    id: "nine-zoom-full-balanced",
    label: "풀샷 균형 심도",
    instruction:
      "Full Shot / FS, head-to-toe full body framing, 35mm lens, balanced depth of field, f/4, readable posture and outfit with soft background separation"
  },
  {
    id: "nine-zoom-knee-medium",
    label: "니샷 중간 심도",
    instruction:
      "Knee Shot / KS, frame from knees upward, 45mm lens, medium depth of field, f/3.5, preserve movement and facial expression together"
  },
  {
    id: "nine-zoom-mls-soft",
    label: "MLS 소프트 배경",
    instruction:
      "Medium Long Shot / MLS, frame from upper thighs or knees upward, 50mm lens, moderate shallow depth of field, f/2.8, balanced action and dialogue framing"
  },
  {
    id: "nine-zoom-ms-portrait",
    label: "미디엄 인물 심도",
    instruction:
      "Medium Shot / MS, waist-up framing, 65mm portrait lens feeling, shallow depth of field, f/2.4, subject clearly separated from the background"
  },
  {
    id: "nine-zoom-mcu-bokeh",
    label: "MCU 보케",
    instruction:
      "Medium Close-Up / MCU, chest-up framing, 85mm portrait lens, shallow depth of field, f/1.8, creamy bokeh while keeping facial features sharp"
  },
  {
    id: "nine-zoom-cu-shallow",
    label: "클로즈업 얕은 심도",
    instruction:
      "Close-Up / CU, face-centered framing, 100mm portrait lens, very shallow depth of field, f/1.6, emotional face focus with smooth background blur"
  },
  {
    id: "nine-zoom-bcu-ultra-shallow",
    label: "빅 클로즈업 초얕은 심도",
    instruction:
      "Big Close-Up / BCU, part of the face fills the frame, 120mm lens compression, extremely shallow depth of field, f/1.4, intense micro-expression emphasis"
  },
  {
    id: "nine-zoom-ecu-detail",
    label: "ECU 디테일",
    instruction:
      "Extreme Close-Up / ECU, isolate eyes, lips, hand, or a symbolic detail from the reference, macro lens feeling, f/2.8, crisp detail with falloff blur"
  },
  {
    id: "nine-zoom-low-wide",
    label: "로우 와이드",
    instruction:
      "Low-angle Wide Shot, camera below eye level with full figure dominance, 24mm lens, deep-to-medium depth of field, f/4, dramatic scale and presence"
  },
  {
    id: "nine-zoom-telephoto-compressed",
    label: "망원 압축",
    instruction:
      "Telephoto portrait compression, medium close framing, 135mm lens feeling, shallow depth of field, f/2, compressed background and elegant subject separation"
  }
];

function getRandomNineZoomViews(): ViewSpec[] {
  const shuffled = [...NINE_ZOOM_VIEW_POOL];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, 9).map((view, index) => ({
    ...view,
    id: `${view.id}-${index + 1}`,
    label: `9ZOOM ${index + 1} · ${view.label}`
  }));
}

const NINE_ANGLE_VIEW_POOL: ViewSpec[] = [
  {
    id: "nine-angle-eye-level",
    label: "아이레벨",
    instruction:
      "Eye-level camera angle, neutral human perspective, stable front three-quarter view, keep shot size around medium or full shot"
  },
  {
    id: "nine-angle-high",
    label: "하이앵글",
    instruction:
      "High angle view looking down at the subject, camera above eye level, preserve identity and styling, keep framing readable"
  },
  {
    id: "nine-angle-low",
    label: "로우앵글",
    instruction:
      "Low angle view looking up at the subject, camera below eye level, stronger presence and scale, avoid distortion of the face"
  },
  {
    id: "nine-angle-bird",
    label: "버드아이",
    instruction:
      "Bird's-eye view from directly above or near-top-down, composition clearly shows the subject from above while preserving recognizable design"
  },
  {
    id: "nine-angle-worm",
    label: "웜아이",
    instruction:
      "Worm's-eye view from very low near the ground, dramatic upward perspective, keep anatomy believable and subject recognizable"
  },
  {
    id: "nine-angle-dutch",
    label: "더치앵글",
    instruction:
      "Dutch angle with a deliberate tilted horizon, dynamic diagonal composition, preserve the same subject and visual style"
  },
  {
    id: "nine-angle-profile",
    label: "사이드 프로파일",
    instruction:
      "Side profile camera angle, subject seen from the left or right side, clear silhouette and facial profile, stable medium framing"
  },
  {
    id: "nine-angle-back",
    label: "후면",
    instruction:
      "Back view camera angle, subject seen from behind with recognizable outfit, hair, silhouette, and environment continuity"
  },
  {
    id: "nine-angle-over-shoulder",
    label: "오버숄더",
    instruction:
      "Over-the-shoulder angle, camera placed behind one shoulder looking toward the subject or scene, cinematic perspective"
  },
  {
    id: "nine-angle-three-quarter",
    label: "3/4 앵글",
    instruction:
      "Three-quarter camera angle, subject turned slightly from front, balanced depth and readable facial features"
  },
  {
    id: "nine-angle-front-symmetry",
    label: "정면 대칭",
    instruction:
      "Straight-on frontal camera angle, centered symmetrical composition, stable eye-level perspective, identity clearly visible"
  },
  {
    id: "nine-angle-canted-close",
    label: "캔티드 근접",
    instruction:
      "Slight canted close camera angle, subtle tilted perspective with intimate framing, keep facial identity sharp and undistorted"
  }
];

function getRandomNineAngleViews(): ViewSpec[] {
  const shuffled = [...NINE_ANGLE_VIEW_POOL];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, 9).map((view, index) => ({
    ...view,
    id: `${view.id}-${index + 1}`,
    label: `9앵글 ${index + 1} · ${view.label}`
  }));
}

const NINE_SHOT_SIZE_VIEWS: ViewSpec[] = [
  {
    id: "nine-shot-els",
    label: "ELS",
    instruction:
      "Extreme Long Shot / ELS, the subject is very small and the environment dominates the frame, neutral eye-level or three-quarter camera angle"
  },
  {
    id: "nine-shot-wide",
    label: "와이드샷",
    instruction:
      "Long Shot / Wide Shot, full body visible with generous surrounding space, neutral camera angle, clear subject-environment relationship"
  },
  {
    id: "nine-shot-full",
    label: "풀샷",
    instruction:
      "Full Shot / FS, head-to-toe full body framing, neutral camera angle, outfit, posture, and silhouette clearly visible"
  },
  {
    id: "nine-shot-knee",
    label: "니샷",
    instruction:
      "Knee Shot / KS, frame from knees upward, neutral camera angle, movement and facial expression both readable"
  },
  {
    id: "nine-shot-mls",
    label: "MLS",
    instruction:
      "Medium Long Shot / MLS, frame from upper thighs or knees upward, neutral camera angle, balanced action and expression"
  },
  {
    id: "nine-shot-ms",
    label: "미디엄샷",
    instruction:
      "Medium Shot / MS, waist-up framing, neutral eye-level camera angle, dialogue/interview style composition"
  },
  {
    id: "nine-shot-mcu",
    label: "MCU",
    instruction:
      "Medium Close-Up / MCU, chest-up framing, neutral camera angle, facial expression and spoken emotion emphasized"
  },
  {
    id: "nine-shot-cu",
    label: "클로즈업",
    instruction:
      "Close-Up / CU, face-centered framing, neutral camera angle, emotional reaction and facial details emphasized"
  },
  {
    id: "nine-shot-ecu",
    label: "ECU",
    instruction:
      "Extreme Close-Up / ECU, isolate eyes, lips, hands, or one symbolic detail from the reference subject, neutral camera angle"
  }
];

function getRandomNineShotSizeViews(): ViewSpec[] {
  const shuffled = [...NINE_SHOT_SIZE_VIEWS];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.map((view, index) => ({
    ...view,
    id: `${view.id}-${index + 1}`,
    label: `9화각 ${index + 1} · ${view.label}`
  }));
}

const ACTION9_VIEWS: ViewSpec[] = [
  {
    id: "action9-kick-hit",
    label: "액션9 1 · 발차기 명중",
    instruction:
      "Low-angle Wide Shot / Full Shot of a powerful kick landing on an opponent or threat, full body visible, camera below hip height, impact point and opponent reaction readable, motion blur and force lines visible, original equipment, condition, and background preserved"
  },
  {
    id: "action9-thrust-attack",
    label: "액션9 2 · 찌르기/돌진",
    instruction:
      "Over-the-shoulder or compressed telephoto Medium Long Shot / MLS of a direct thrust or lunging attack toward an opponent or target, camera aligned behind the attacking shoulder, clear attack trajectory line, weapon/tool/hand/gear follows what exists in the reference"
  },
  {
    id: "action9-dodge",
    label: "액션9 3 · 회피",
    instruction:
      "Dutch-angle Medium Wide Shot of the subject dodging an incoming strike, projectile, blade, fist, or environmental threat, body twisted diagonally away from danger, opponent or attack path visible, tilted horizon amplifies instability"
  },
  {
    id: "action9-parry",
    label: "액션9 4 · 패링",
    instruction:
      "Tight Medium Shot / MCU of a precise parry or block at the exact moment of contact, frame centered on the collision point between existing gear, arm, tool, or weapon, face and hands both readable, sparks/debris/force lines allowed if consistent"
  },
  {
    id: "action9-near-miss",
    label: "액션9 5 · 아슬아슬한 회피",
    instruction:
      "Dramatic Close-Up / CU with slight Dutch angle of a near-miss dodge, the attack passes extremely close to the face, body, clothing, or equipment at the edge of frame, shallow depth, visible tension and grazing motion"
  },
  {
    id: "action9-impact-damage",
    label: "액션9 6 · 큰 충격 데미지",
    instruction:
      "Low-angle Wide Shot of a heavy impact damage moment, camera near ground level, subject or opponent struck with visible shockwave, debris, fabric tension, gear strain, or environmental damage, background scale reinforces impact"
  },
  {
    id: "action9-clean-hit",
    label: "액션9 7 · 명중 순간",
    instruction:
      "Cinematic Medium Shot / Medium Close-Up of the exact split-second a clean hit connects, contact point placed near the rule-of-thirds focus, opponent/threat reaction and the subject's follow-through visible in the same frame"
  },
  {
    id: "action9-counter",
    label: "액션9 8 · 카운터 공격",
    instruction:
      "Diagonal Full Shot / Medium Long Shot of a counterattack immediately after blocking or dodging, camera set at a three-quarter low angle, defensive motion and offensive strike readable in one frame, strong diagonal composition"
  },
  {
    id: "action9-ecu-detail",
    label: "액션9 9 · 필수 ECU 디테일",
    instruction:
      "Mandatory dramatic Extreme Close-Up / ECU, macro-style framing of combat contact: eyes locking, clenched hand, weapon edge, gear scraping, fabric tearing, bloodless damage mark, spark, or impact detail, intense tension and very shallow focus"
  }
];

function getLocalImageId(url?: string | null): string | null {
  const match = url?.match(/^\/api\/images\/([A-Za-z0-9_\-]+)/);
  return match?.[1] ?? null;
}

function getRecordGeneratedImageUrl(record?: GeneratedImageDocument | null): string | null {
  return record?.imageUrl ?? record?.thumbnailUrl ?? record?.originalImageUrl ?? null;
}

function getRecordPromptText(record?: GeneratedImageDocument | null): string {
  return record?.promptMeta?.refinedPrompt || record?.promptMeta?.rawPrompt || "";
}

function isCharacterSheetRecord(record?: GeneratedImageDocument | null): boolean {
  const action = record?.metadata?.action;
  return typeof action === "string" && action.startsWith("character-sheet");
}

function promptCharacterRegistration(): { name: string; handle: string } | null {
  const inputName = window.prompt("캐릭터 이름");
  if (inputName === null) {
    return null;
  }
  const name = inputName.trim();
  if (!name) {
    toast.error("캐릭터 이름을 입력해주세요.");
    return null;
  }

  const inputHandle = window.prompt("핸들 (영문/한글, 1~32자)");
  if (inputHandle === null) {
    return null;
  }
  const handle = inputHandle.trim().replace(/^@+/, "");
  if (!handle) {
    toast.error("캐릭터 핸들을 입력해주세요.");
    return null;
  }

  return { name, handle };
}

type PresetApiImage = {
  id?: string;
  imageUrl?: string;
  base64Image?: string | null;
};

function getHistorySignature(records: GeneratedImageDocument[]): string {
  return records
    .map(record => `${record.id}:${record.updatedAt ?? record.createdAt ?? ""}`)
    .join("|");
}

interface RunBatchOptions {
  views: ViewSpec[];
  batchLabel: string;
  basePrompt: string;
  singleViewGuideline: string;
  commonViewGuideline?: string;
  negativePrompt: string;
  referenceImageForRequest: string | null;
  uniqueGalleryReferences: string[];
  aspectRatioValue: AspectRatioPreset;
  aspectRatioLabel: string;
  shouldApplyAspectRatio: boolean;
  actionLabel: string;
  targetModel: string;
  setPending: (value: boolean) => void;
  cameraPayload: { angle?: string; aperture: string };
  apertureLabel: string;
  effectiveCameraAngle: string | undefined;
  mergeLocalRecord: (
    record: GeneratedImageDocument,
    options?: { promoteToReference?: boolean; broadcast?: boolean }
  ) => void;
  mergeLocalRecords?: (records: GeneratedImageDocument[]) => void;
  referenceRecord: GeneratedImageDocument | null;
  referenceMetadata: { referenceId?: string | null };
  fallbackCandidate: GeneratedImageDocument | null;
  user: { uid: string } | null;
  imageGenOptions: GenerationOptionsValue;
  onProgress?: (view: ViewSpec, index: number, total: number) => void;
  onResult?: (view: ViewSpec, index: number, total: number, outcome: "success" | "error") => void;
  interRequestDelayMs?: number;
  concurrencyLimit?: number;
  cancelRef?: MutableRefObject<boolean>;
  onCancelled?: () => void;
}

async function runBatchSequence(options: RunBatchOptions) {
  const {
    views,
    batchLabel,
    basePrompt,
    singleViewGuideline,
    commonViewGuideline = "Keep design consistent with the supplied references. Background must be pure white, even lighting.",
    negativePrompt,
    referenceImageForRequest,
    uniqueGalleryReferences,
    aspectRatioValue,
    aspectRatioLabel,
    shouldApplyAspectRatio,
    actionLabel,
    targetModel,
    setPending,
    cameraPayload,
    apertureLabel,
    effectiveCameraAngle,
    mergeLocalRecord,
    mergeLocalRecords,
    referenceRecord,
    referenceMetadata,
    fallbackCandidate,
    user,
    imageGenOptions,
    onProgress,
    onResult,
    interRequestDelayMs = 1500,
    concurrencyLimit = 10,
    cancelRef,
    onCancelled
  } = options;

  const targetDimensions = shouldApplyAspectRatio ? getAspectRatioDimensions(aspectRatioValue) : null;
  const chunkSize = Math.max(1, Math.floor(concurrencyLimit));

  setPending(true);
  let successCount = 0;
  let cancelled = false;

  const markCancelled = () => {
    if (!cancelled) {
      cancelled = true;
      onCancelled?.();
    }
  };

  const runView = async (
    view: ViewSpec,
    index: number
  ): Promise<{ view: ViewSpec; index: number; records: GeneratedImageDocument[] }> => {
    if (cancelRef?.current) {
      markCancelled();
      return { view, index, records: [] };
    }

    onProgress?.(view, index, views.length);

    if (cancelRef?.current) {
      markCancelled();
      return { view, index, records: [] };
    }

    const viewInstructionSegments = [
      `${view.instruction}.`,
      singleViewGuideline,
      commonViewGuideline
    ];
    const viewPrompt = `${basePrompt}
${viewInstructionSegments.join(" ")}`;

    const generationOptions: Record<string, unknown> = {
      action: actionLabel,
      model: targetModel,
      characterView: view.id,
      characterViewLabel: view.label,
      quality: imageGenOptions.quality,
      imageSize: imageGenOptions.size,
      format: imageGenOptions.format,
      moderation: imageGenOptions.moderation,
      count: imageGenOptions.count
    };
    if (referenceImageForRequest) {
      generationOptions.referenceImageUrl = referenceImageForRequest;
    }
    if (shouldApplyAspectRatio) {
      generationOptions.aspectRatio = aspectRatioValue;
    }
    if (uniqueGalleryReferences.length) {
      generationOptions.referenceGallery = uniqueGalleryReferences;
    }
    if (targetDimensions) {
      generationOptions.dimensions = targetDimensions;
    }

    let result;
    try {
      result = await callGenerateApi({
        prompt: basePrompt,
        refinedPrompt: viewPrompt,
        negativePrompt,
        mode: PRESET_ACTION_MODE,
        camera: cameraPayload,
        options: generationOptions
      });
    } catch (error) {
      console.error("preset view request failed", view.id, error);
      toast.error(`${view.label} 뷰 생성 실패`, {
        description: "네트워크 환경을 확인한 후 다시 시도해주세요."
      });
      onResult?.(view, index, views.length, "error");
      if (cancelRef?.current) {
        markCancelled();
      }
      return { view, index, records: [] };
    }

    if (!result.ok) {
      toast.error(`${view.label} 뷰 생성 실패`, {
        description: result.reason ?? "잠시 후 다시 시도해주세요."
      });
      onResult?.(view, index, views.length, "error");
      if (cancelRef?.current) {
        markCancelled();
      }
      return { view, index, records: [] };
    }

    const responseImages = Array.isArray(result.images) ? (result.images as PresetApiImage[]) : [];
    const generatedImages =
      responseImages.length > 0
        ? responseImages
            .map((image, imageIndex) => ({
              id:
                typeof image.id === "string" && image.id.length > 0
                  ? image.id
                  : getLocalImageId(image.imageUrl) ?? `${actionLabel}-${view.id}-${imageIndex + 1}`,
              imageUrl: image.imageUrl ?? image.base64Image ?? null
            }))
            .filter((image): image is { id: string; imageUrl: string } => Boolean(image.imageUrl))
        : [
            {
              id:
                typeof result.id === "string" && result.id.length > 0
                  ? result.id
                  : getLocalImageId(result.imageUrl ?? result.base64Image) ?? `${actionLabel}-${view.id}`,
              imageUrl: result.imageUrl ?? result.base64Image ?? null
            }
          ].filter((image): image is { id: string; imageUrl: string } => Boolean(image.imageUrl));

    if (!generatedImages.length) {
      toast.error(`${view.label} 뷰 생성 실패`, {
        description: "이미지 데이터를 찾을 수 없습니다."
      });
      onResult?.(view, index, views.length, "error");
      if (cancelRef?.current) {
        markCancelled();
      }
      return { view, index, records: [] };
    }

    const beforeUrl = referenceImageForRequest ?? undefined;
    const referenceSourceId = referenceRecord
      ? referenceMetadata.referenceId ?? (referenceRecord.id !== REFERENCE_IMAGE_DOC_ID ? referenceRecord.id : null)
      : fallbackCandidate?.id ?? null;

    const now = new Date().toISOString();
    const newRecords: GeneratedImageDocument[] = [];
    for (const [imageIndex, generated] of generatedImages.entries()) {
      const storedImageUrl = generated.imageUrl;

      const serverImageId = generated.id || getLocalImageId(storedImageUrl);
      const recordId =
        serverImageId ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${actionLabel}-${view.id}-${Date.now()}-${imageIndex + 1}`);
      const metadataPayload: Record<string, unknown> = {
        action: `${actionLabel}-${view.id}`,
        referenceId: referenceSourceId,
        characterView: view.id,
        characterViewLabel: view.label,
        cameraAperture: apertureLabel,
        cameraAngle: effectiveCameraAngle,
        aspectRatio: aspectRatioLabel,
        sequenceIndex: index + 1,
        sequenceTotal: views.length,
        copyIndex: imageIndex + 1,
        copyTotal: generatedImages.length,
        fileId: serverImageId ?? recordId,
        generationOptions: {
          quality: imageGenOptions.quality,
          size: imageGenOptions.size,
          format: imageGenOptions.format,
          moderation: imageGenOptions.moderation,
          count: imageGenOptions.count
        }
      };

      newRecords.push({
        id: recordId,
        userId: user?.uid ?? "local",
        mode: PRESET_ACTION_MODE,
        promptMeta: {
          rawPrompt: basePrompt,
          refinedPrompt: viewPrompt,
          negativePrompt,
          camera: cameraPayload,
          aspectRatio: aspectRatioValue,
          referenceGallery: uniqueGalleryReferences
        },
        status: "completed",
        imageUrl: storedImageUrl,
        thumbnailUrl: storedImageUrl,
        originalImageUrl: beforeUrl ?? storedImageUrl,
        diff: beforeUrl
          ? {
              beforeUrl,
              afterUrl: storedImageUrl,
              sliderLabelBefore: "기준 이미지",
              sliderLabelAfter: "생성 결과"
            }
          : undefined,
        metadata: metadataPayload,
        model: targetModel,
        createdAt: now,
        updatedAt: now
      });
    }

    if (cancelRef?.current) {
      markCancelled();
    }

    return { view, index, records: newRecords };
  };

  try {
    for (let chunkStart = 0; chunkStart < views.length; chunkStart += chunkSize) {
      if (cancelRef?.current) {
        markCancelled();
        break;
      }

      const chunk = views.slice(chunkStart, chunkStart + chunkSize);
      const results = await Promise.all(
        chunk.map((view, offset) => runView(view, chunkStart + offset))
      );

      const sortedResults = results.sort((a, b) => a.index - b.index);
      const chunkRecords = sortedResults.flatMap(result => result.records);

      if (chunkRecords.length) {
        for (const newRecord of chunkRecords) {
          console.log(`[Preset] Adding to local records: ${newRecord.id}`);
        }
        if (mergeLocalRecords) {
          mergeLocalRecords(chunkRecords);
        } else {
          for (const newRecord of chunkRecords) {
            mergeLocalRecord(newRecord, { promoteToReference: false, broadcast: false });
          }
        }
      }

      for (const result of sortedResults) {
        if (!result.records.length) {
          continue;
        }
        successCount += result.records.length;
        onResult?.(result.view, result.index, views.length, "success");
      }

      if (cancelRef?.current) {
        markCancelled();
        break;
      }

      if (interRequestDelayMs > 0 && chunkStart + chunkSize < views.length) {
        await new Promise(resolve => setTimeout(resolve, interRequestDelayMs));
        if (cancelRef?.current) {
          markCancelled();
          break;
        }
      }
    }
  } finally {
    if (cancelled) {
      toast.info(`${batchLabel} 작업을 중지했습니다.`, { id: PRESET_BATCH_PROGRESS_TOAST_ID });
    } else if (successCount === 0) {
      toast.error(`${batchLabel} 생성에 실패했습니다.`, { id: PRESET_BATCH_PROGRESS_TOAST_ID });
    } else {
      toast.success(`${batchLabel} ${successCount}장 생성 완료`, { id: PRESET_BATCH_PROGRESS_TOAST_ID });
    }
    setPending(false);
    if (cancelRef) {
      cancelRef.current = false;
    }
  }
}


export function PresetsShell() {
  const { user } = useLocalUser();
  const router = useRouter();
  const { records, loading } = useGeneratedImages();
  const [localRecords, setLocalRecords] = useState<GeneratedImageDocument[]>([]);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const [referenceSlots, setReferenceSlots] = useState<ReferenceSlotState[]>(() =>
    Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot())
  );
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [previewRecord, setPreviewRecord] = useState<GeneratedImageDocument | null>(null);
  const [referenceImageUploading, setReferenceImageUploading] = useState(false);
  const [batchPending, setBatchPending] = useState(false);
  const [characterSheetPendingCount, setCharacterSheetPendingCount] = useState(0);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(INITIAL_HISTORY_VISIBLE_COUNT);
  const [imageGenOptions, setImageGenOptions] = useState<GenerationOptionsValue>(DEFAULT_GENERATION_OPTIONS);
  const previewZoom = useImagePanZoom({ min: MIN_IMAGE_ZOOM, max: MAX_IMAGE_ZOOM, wheelRequiresModifier: false });
  const cancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const historySyncSourceRef = useRef<string | null>(null);
  const persistedHistorySignatureRef = useRef<string | null>(null);
  const lastUidRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  // Clear local history/reference caches on user change to prevent cross-account leakage
  useEffect(() => {
    const currentUid = user?.uid ?? null;
    const prevUid = lastUidRef.current;
    const shouldReset = Boolean(prevUid && prevUid !== currentUid);

    if (shouldReset) {
      try {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
        window.localStorage.removeItem(REFERENCE_GALLERY_STORAGE_KEY);
        window.localStorage.removeItem(REFERENCE_SYNC_STORAGE_KEY);
      } catch {}
      setLocalRecords([]);
      setSelectedImageId(null);
      setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
      persistedHistorySignatureRef.current = getHistorySignature([]);
      broadcastReferenceUpdate(null, "presets");
    }

    if (!currentUid && prevUid) {
      setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
    }

    lastUidRef.current = currentUid;
  }, [user?.uid]);


  const cameraAngle = undefined;
  const apertureLabel = formatAperture(APERTURE_DEFAULT);
  const aspectRatioValue = DEFAULT_ASPECT_RATIO;
  const shouldApplyAspectRatio = false;
  const aspectRatioLabel = getAspectRatioLabel(aspectRatioValue);
  const cameraPayload = { aperture: apertureLabel } as { angle?: string; aperture: string };

  const collectReferenceGalleryUrls = () =>
    Array.from(
      new Set(
        referenceSlots
          .map(slot => slot.imageUrl)
          .filter((url): url is string => Boolean(url && url.trim().length))
      )
    );

  const openPreview = (record: GeneratedImageDocument) => {
    setSelectedImageId(record.id);
    setPreviewRecord(record);
    previewZoom.reset();
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as GeneratedImageDocument[];
        if (Array.isArray(parsed)) {
          const uid = user?.uid ?? null;
          const filtered = uid ? parsed.filter(record => !record.userId || record.userId === uid) : parsed;
          persistedHistorySignatureRef.current = getHistorySignature(filtered);
          setLocalRecords(filtered);
        }
      } else {
        persistedHistorySignatureRef.current = getHistorySignature([]);
      }
    } catch (error) {
      console.warn("Failed to read local history", error);
    } finally {
      setHistoryHydrated(true);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(REFERENCE_GALLERY_STORAGE_KEY);
      if (!raw) {
        setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
        return;
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .slice(0, MAX_REFERENCE_SLOT_COUNT)
          .map((item: { id?: unknown; imageUrl?: unknown; updatedAt?: unknown }) => ({
            id:
              typeof item?.id === "string"
                ? (item.id as string)
                : (typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
            imageUrl: typeof item?.imageUrl === "string" ? (item.imageUrl as string) : null,
            updatedAt: typeof item?.updatedAt === "string" ? (item.updatedAt as string) : new Date().toISOString()
          }));

        const currentUid = user?.uid ?? null;
        const normalizedFiltered = normalized.filter(slot => {
          if (!slot.imageUrl) return true;
          if (!currentUid) return false;
          const url = slot.imageUrl;
          return url.startsWith("data:") || url.includes(`/users/${currentUid}/`);
        });

        const ensured = normalizedFiltered.length
          ? normalizedFiltered
          : Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot());
        setReferenceSlots(ensured);
      } else {
        setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
      }
    } catch (error) {
      console.warn("Failed to load reference slots", error);
      setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
    }
  }, [user?.uid, setReferenceSlots]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const payload = referenceSlots.map(slot => ({
        id: slot.id,
        imageUrl: slot.imageUrl,
        updatedAt: slot.updatedAt
      }));
      window.localStorage.setItem(REFERENCE_GALLERY_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn("Failed to persist reference slots", error);
    }
  }, [referenceSlots]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<HistorySyncPayload>).detail;
      if (!detail || detail.source === "presets") {
        return;
      }

      const currentUid = user?.uid ?? null;
      const incoming = Array.isArray(detail.records)
        ? detail.records.filter(record => !record.userId || record.userId === currentUid)
        : [];
      if (!incoming.length) {
        return;
      }

      historySyncSourceRef.current = detail.source ?? null;

      setLocalRecords(prev => {
        const incomingMap = new Map(incoming.map(record => [record.id, record]));
        const merged = [...incoming];
        for (const record of prev) {
          if (!incomingMap.has(record.id)) {
            merged.push(record);
          }
        }
        return merged;
      });
    };

    window.addEventListener(HISTORY_SYNC_EVENT, handler as EventListener);
    return () => window.removeEventListener(HISTORY_SYNC_EVENT, handler as EventListener);
  }, [user?.uid]);

  const mergedRecords = useMemo(() => {
    const merged = mergeHistoryRecords(localRecords, records);

    const uid = user?.uid ?? null;
    // 단일 사용자 도구라 userId 필터를 풀어준다.
    return uid ? merged.filter(record => !record.userId || record.userId === uid) : merged;
  }, [localRecords, records, user?.uid]);

  const historyRecords = useMemo(() => {
    return mergedRecords.filter(record => record.id !== REFERENCE_IMAGE_DOC_ID);
  }, [mergedRecords]);

  const visibleHistoryRecords = useMemo(
    () => historyRecords.slice(0, historyVisibleCount),
    [historyRecords, historyVisibleCount]
  );
  const hasMoreHistoryRecords = historyVisibleCount < historyRecords.length;
  const emptyHistoryMessage = user ? "아직 생성된 이미지가 없습니다." : "로그인하여 생성 기록을 확인하세요.";

  useEffect(() => {
    if (!historyHydrated || typeof window === "undefined") {
      return;
    }
    const nextSignature = getHistorySignature(localRecords);
    if (persistedHistorySignatureRef.current === nextSignature) {
      return;
    }
    try {
      // 머지 패턴: 다른 페이지가 추가한 record를 덮어쓰지 않는다.
      const merged = persistRecordsMerge(localRecords);
      persistedHistorySignatureRef.current = nextSignature;
      if (historySyncSourceRef.current && historySyncSourceRef.current !== "presets") {
        historySyncSourceRef.current = null;
      } else {
        broadcastHistoryUpdate(merged, "presets");
      }
    } catch (error) {
      console.warn("Failed to persist local history", error);
    }
  }, [historyHydrated, localRecords]);

  const previewImageUrl = getRecordGeneratedImageUrl(previewRecord);
  const previewPromptText = getRecordPromptText(previewRecord);
  const previewLabel = previewPromptText || (previewRecord?.metadata?.characterViewLabel as string | undefined) || "";
  const previewZoomPercent = Math.round(previewZoom.scale * 100);

  useEffect(() => {
    if (!historyRecords.length) {
      setSelectedImageId(null);
      return;
    }

    if (!selectedImageId) {
      setSelectedImageId(historyRecords[0].id);
    } else if (!historyRecords.some(record => record.id === selectedImageId)) {
      setSelectedImageId(historyRecords[0].id);
    }
  }, [historyRecords, selectedImageId]);

  useEffect(() => {
    if (previewRecord && !historyRecords.some(record => record.id === previewRecord.id)) {
      setPreviewRecord(null);
    }
  }, [historyRecords, previewRecord]);

type ReferenceImageState = {
  url: string | null;
  signature: number;
  source: "override" | "derived";
};

  const referenceRecord = useMemo(() => {
    const byId = mergedRecords.find(record => record.id === REFERENCE_IMAGE_DOC_ID);
    if (byId) {
      return byId;
    }
    return mergedRecords.find(record => record.metadata?.isReference === true) ?? null;
  }, [mergedRecords]);

  const derivedReferenceImageUrl = getRecordGeneratedImageUrl(referenceRecord);

  const [referenceImageState, setReferenceImageState] = useState<ReferenceImageState>({
    url: null,
    signature: 0,
    source: "derived"
  });
  const setReferenceImageOverride = useCallback((url: string | null) => {
    setReferenceImageState(prev => ({
      url,
      signature: prev.signature + 1,
      source: "override"
    }));
  }, []);
  const hasReference = Boolean(referenceImageState.url ?? derivedReferenceImageUrl);
  const resolveReferenceImageForRequest = useCallback(() => {
    const selectedRecord = selectedImageId
      ? historyRecords.find(record => record.id === selectedImageId)
      : null;
    return referenceImageState.url ?? derivedReferenceImageUrl ?? getRecordGeneratedImageUrl(selectedRecord);
  }, [derivedReferenceImageUrl, historyRecords, referenceImageState.url, selectedImageId]);

  const mergeLocalRecord = useCallback(
    (
      record: GeneratedImageDocument,
      { promoteToReference = false, broadcast = true }: { promoteToReference?: boolean; broadcast?: boolean } = {}
    ) => {
      const newReferenceEntry = promoteToReference ? { ...record, id: REFERENCE_IMAGE_DOC_ID } : null;

      setLocalRecords(prev => {
        const existingReference = promoteToReference ? null : prev.find(item => item.id === REFERENCE_IMAGE_DOC_ID) ?? null;
        const others = prev.filter(item => item.id !== REFERENCE_IMAGE_DOC_ID && item.id !== record.id);
        const referenceEntry = promoteToReference ? newReferenceEntry : existingReference;
        return referenceEntry ? [referenceEntry, record, ...others] : [record, ...others];
      });

      if (promoteToReference && newReferenceEntry && broadcast) {
        broadcastReferenceUpdate(newReferenceEntry, "presets");
      }

      return newReferenceEntry;
    },
    [setLocalRecords]
  );

  const mergeLocalRecords = useCallback((recordsToMerge: GeneratedImageDocument[]) => {
    if (!recordsToMerge.length) {
      return;
    }

    setLocalRecords(prev => {
      const referenceEntry = prev.find(item => item.id === REFERENCE_IMAGE_DOC_ID) ?? null;
      const incomingIds = new Set(recordsToMerge.map(record => record.id));
      let others = prev.filter(item => item.id !== REFERENCE_IMAGE_DOC_ID && !incomingIds.has(item.id));

      for (const record of recordsToMerge) {
        others = [record, ...others];
      }

      return referenceEntry ? [referenceEntry, ...others] : others;
    });
  }, [setLocalRecords]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = readStoredReference();
    if (stored) {
      mergeLocalRecord(stored, { promoteToReference: true, broadcast: false });
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ReferenceSyncPayload>).detail;
      if (!detail || detail.source === "presets") {
        return;
      }
      if (!detail.record) {
        setLocalRecords(prev => prev.filter(item => item.id !== REFERENCE_IMAGE_DOC_ID));
        setSelectedImageId(null);
        return;
      }
      const currentUid = user?.uid;
      if (detail.record.userId && detail.record.userId !== currentUid) {
        return;
      }
      mergeLocalRecord(detail.record, { promoteToReference: true, broadcast: false });
  };

    window.addEventListener(REFERENCE_SYNC_EVENT, handler as EventListener);
    return () => window.removeEventListener(REFERENCE_SYNC_EVENT, handler as EventListener);
  }, [mergeLocalRecord, setLocalRecords, user?.uid]);

  useEffect(() => {
    if (!derivedReferenceImageUrl) {
      return;
    }

    setReferenceImageState(prev => {
      if (prev.source === "override" && prev.url && prev.url !== derivedReferenceImageUrl) {
        return prev;
      }
      if (prev.source === "derived" && prev.url === derivedReferenceImageUrl) {
        return prev;
      }
      const sameUrl = prev.url === derivedReferenceImageUrl;
      return {
        url: derivedReferenceImageUrl,
        signature: sameUrl ? prev.signature : prev.signature + 1,
        source: "derived"
      };
    });
  }, [derivedReferenceImageUrl]);

  const promoteReferenceImage = async (
    imageUrl: string,
    { recordId, metadata }: { recordId?: string; metadata?: Record<string, unknown> } = {}
  ) => {
    const id =
      recordId ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `reference-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const now = new Date().toISOString();
    const baseRecord: GeneratedImageDocument = {
      id,
      userId: user?.uid ?? "local",
      mode: PRESET_ACTION_MODE,
      promptMeta: {
        rawPrompt: "프리셋 기준 이미지",
        refinedPrompt: "프리셋 기준 이미지"
      },
      status: "completed",
      imageUrl,
      thumbnailUrl: imageUrl,
      originalImageUrl: imageUrl,
      metadata: { ...(metadata ?? {}), isReference: true },
      model: "reference-upload",
      createdAt: now,
      updatedAt: now
    };

  mergeLocalRecord(baseRecord, { promoteToReference: true });
  setSelectedImageId(id);
};

  const handleReferenceUpload = async (file: File) => {
    setReferenceImageUploading(true);
    try {
      const dataUrl = await readFileAsDataURL(file);
      const storedUrl = dataUrl;

      const previousReferenceUrl = referenceImageState.url ?? getRecordGeneratedImageUrl(referenceRecord);
      setReferenceImageOverride(storedUrl);

      try {
        await promoteReferenceImage(storedUrl, { metadata: { source: "preset" } });
        toast.success("기준 이미지를 추가했습니다.");
      } catch (error) {
        console.error(error);
        setReferenceImageOverride(previousReferenceUrl);
        toast.error("기준 이미지 업로드에 실패했습니다.");
      }
    } catch (error) {
      console.error(error);
      toast.error("기준 이미지 업로드에 실패했습니다.");
    } finally {
      setReferenceImageUploading(false);
    }
  };

  const handleReferenceRemove = async () => {
    if (!referenceRecord) {
      toast.info("삭제할 기준 이미지가 없습니다.");
      return;
    }

    const referenceIds = new Set([REFERENCE_IMAGE_DOC_ID]);
    if (referenceRecord.id) {
      referenceIds.add(referenceRecord.id);
    }
    const isReferenceRecord = (record: GeneratedImageDocument) =>
      referenceIds.has(record.id) || record.metadata?.isReference === true;

    setLocalRecords(prev => prev.filter(record => !isReferenceRecord(record)));
    try {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as GeneratedImageDocument[];
        if (Array.isArray(parsed)) {
          window.localStorage.setItem(
            LOCAL_STORAGE_KEY,
            JSON.stringify(parsed.filter(record => !isReferenceRecord(record)))
          );
        }
      }
    } catch (error) {
      console.warn("Failed to remove reference from local history", error);
    }
    broadcastReferenceUpdate(null, "presets");
    setReferenceImageOverride(null);
    toast.success("기준 이미지를 삭제했습니다.");
  };

  const handleReferenceSlotAdd = () => {
    setReferenceSlots(prev => {
      if (prev.length >= MAX_REFERENCE_SLOT_COUNT) {
        toast.error(`참조 이미지는 최대 ${MAX_REFERENCE_SLOT_COUNT}개까지 추가할 수 있습니다.`);
        return prev;
      }
      return [...prev, createReferenceSlot()];
    });
  };

  const handleReferenceDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes("Files")) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const getDroppedFile = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    return event.dataTransfer.files[0] ?? null;
  };

  const handleReferenceSlotCreateUpload = async (file: File) => {
    if (referenceSlots.length >= MAX_REFERENCE_SLOT_COUNT) {
      toast.error(`참조 이미지는 최대 ${MAX_REFERENCE_SLOT_COUNT}개까지 추가할 수 있습니다.`);
      return;
    }

    try {
      const dataUrl = await readFileAsDataURL(file);
      const storedUrl = dataUrl;
      const now = new Date().toISOString();

      setReferenceSlots(prev =>
        prev.length >= MAX_REFERENCE_SLOT_COUNT
          ? prev
          : [...prev, { ...createReferenceSlot(), imageUrl: storedUrl, updatedAt: now }]
      );
      toast.success("참조 이미지를 추가했습니다.");
    } catch (error) {
      console.error("reference slot create upload error", error);
      toast.error("참조 이미지 업로드에 실패했습니다.");
    }
  };

  const handleReferenceSlotUpload = async (slotId: string, file: File) => {
    const slot = referenceSlots.find(item => item.id === slotId);
    if (!slot) {
      toast.error("참조 슬롯을 찾을 수 없습니다.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataURL(file);
      const storedUrl = dataUrl;

      setReferenceSlots(prev =>
        prev.map(item =>
          item.id === slotId
            ? { ...item, imageUrl: storedUrl, updatedAt: new Date().toISOString() }
            : item
        )
      );
      // Do not auto-promote on upload; promotion happens on "사용" click
      toast.success("참조 이미지를 추가했습니다.");
    } catch (error) {
      console.error("reference slot upload error", error);
      toast.error("참조 이미지 업로드에 실패했습니다.");
    }
  };

  const handleReferenceSlotClear = (slotId: string) => {
    const slot = referenceSlots.find(item => item.id === slotId);
    if (!slot?.imageUrl) {
      toast.info("삭제할 참조 이미지가 없습니다.");
      return;
    }

    setReferenceSlots(prev =>
      prev.map(item =>
        item.id === slotId
          ? { ...item, imageUrl: null, updatedAt: new Date().toISOString() }
          : item
      )
    );
    toast.success("참조 이미지를 삭제했습니다.");
  };

  const handleReferenceSlotSelect = async (slotId: string) => {
    const slot = referenceSlots.find(item => item.id === slotId);
    if (!slot?.imageUrl) {
      toast.error("먼저 이미지를 업로드해주세요.");
      return;
    }

    const previousReferenceUrl = referenceImageState.url ?? getRecordGeneratedImageUrl(referenceRecord);
    setReferenceImageOverride(slot.imageUrl);

    try {
      await promoteReferenceImage(slot.imageUrl, { metadata: { referenceSlotId: slotId, source: "preset-slot" } });
      setReferenceSlots(prev =>
        prev.map(item => (item.id === slotId ? { ...item, updatedAt: new Date().toISOString() } : item))
      );
      toast.success("기준 이미지를 설정했습니다.");
    } catch (error) {
      console.error("preset reference slot select error", error);
      setReferenceImageOverride(previousReferenceUrl);
      toast.error("기준 이미지를 설정하지 못했습니다.");
    }
  };

  const handleCancelBatch = () => {
    if (!batchPending) {
      return;
    }
    cancelRef.current = true;
    setCancelRequested(true);
    toast.info("생성 중지를 요청했습니다.");
  };

  const handleSetReferenceFromHistory = async (recordId: string) => {
    const candidate = historyRecords.find(record => record.id === recordId);
    if (!candidate) {
      toast.error("선택한 기록을 찾을 수 없습니다.");
      return;
    }

    const newUrl = getRecordGeneratedImageUrl(candidate);
    const previousReferenceUrl = referenceImageState.url ?? getRecordGeneratedImageUrl(referenceRecord);
    if (newUrl) {
      setReferenceImageOverride(newUrl);
    }

    try {
      mergeLocalRecord(candidate, { promoteToReference: true });
    } catch (error) {
      console.error("preset history reference select error", error);
      if (newUrl) {
        setReferenceImageOverride(previousReferenceUrl);
      }
      toast.error("기준 이미지를 업데이트하지 못했습니다.");
      return;
    }

    toast.success("기준 이미지를 업데이트했습니다.");
  };

  const handleToggleFavorite = async (recordId: string) => {
    const target = historyRecords.find(record => record.id === recordId);
    if (!target) {
      toast.error("기록을 찾을 수 없습니다.");
      return;
    }

    const nextFavorite = !isHistoryRecordFavorite(target);
    const updatedRecord = setHistoryRecordFavorite(target, nextFavorite);

    setLocalRecords(prev => {
      const exists = prev.some(record => record.id === recordId);
      if (exists) {
        return prev.map(record => (record.id === recordId ? updatedRecord : record));
      }
      return [updatedRecord, ...prev];
    });

  };

  const handleDownloadRecord = async (record: GeneratedImageDocument) => {
    const url = getRecordGeneratedImageUrl(record);
    if (!url) {
      toast.error("다운로드할 이미지를 찾을 수 없습니다.");
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const filename = `${record.id}.png`;

    if (url.startsWith("data:")) {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // 로컬 라우트는 그대로 다운로드, 외부 URL만 /api/download 프록시 경유.
    if (url.startsWith("/api/") || url.startsWith("/")) {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const mediaUrl = url.includes("alt=media") ? url : `${url}${url.includes('?') ? '&' : '?'}alt=media`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(filename)}`;
    window.location.assign(downloadUrl);
  };

  const handleDeleteRecord = async (recordId: string) => {
    const target = historyRecords.find(record => record.id === recordId);
    if (!target) {
      toast.error("삭제할 이미지를 찾을 수 없습니다.");
      return;
    }

    setLocalRecords(prev => prev.filter(record => record.id !== recordId));
    removeRecordFromLocalStorage(recordId);

    const metadataFileId = (target.metadata as { fileId?: unknown } | undefined)?.fileId;
    const localImageId =
      getLocalImageId(target.imageUrl) ??
      getLocalImageId(target.thumbnailUrl) ??
      getLocalImageId(target.originalImageUrl) ??
      (typeof metadataFileId === "string" ? metadataFileId : null) ??
      recordId;

    if (
      target.imageUrl?.startsWith("/api/images/") ||
      target.thumbnailUrl?.startsWith("/api/images/") ||
      target.originalImageUrl?.startsWith("/api/images/")
    ) {
      try {
        await fetch(`/api/images/${localImageId}`, { method: "DELETE" });
      } catch (error) {
        console.warn("[Presets] Failed to delete local image file", error);
      }
    }

    if (previewRecord?.id === recordId) {
      setPreviewRecord(null);
      previewZoom.reset();
    }

    toast.success("이미지가 삭제되었습니다.");
  };

  const closePreviewRecord = () => {
    setPreviewRecord(null);
    previewZoom.reset();
  };

  const handleCopyPreviewPrompt = async () => {
    if (!previewPromptText) {
      toast.error("복사할 프롬프트가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(previewPromptText);
      toast.success("프롬프트를 복사했습니다.");
    } catch (error) {
      console.error("preset prompt copy error", error);
      toast.error("프롬프트 복사에 실패했습니다.");
    }
  };

  const handleSetPreviewAsReference = async () => {
    if (!previewRecord) {
      return;
    }
    await handleSetReferenceFromHistory(previewRecord.id);
  };

  const handleDownloadPreviewRecord = () => {
    if (!previewRecord) {
      return;
    }
    void handleDownloadRecord(previewRecord);
  };

  const handleRegisterRecordAsCharacter = async (record: GeneratedImageDocument) => {
    const imageUrl = getRecordGeneratedImageUrl(record);
    if (!imageUrl) {
      toast.error("캐릭터로 등록할 이미지를 찾을 수 없습니다.");
      return;
    }

    const registration = promptCharacterRegistration();
    if (!registration) {
      return;
    }

    try {
      const storedUrl = await copyCharacterImageToStorage(imageUrl);
      const promptText = getRecordPromptText(record);
      const viewLabel = record.metadata?.characterViewLabel;
      const tags = ["character-sheet", typeof viewLabel === "string" ? viewLabel : undefined].filter(
        (tag): tag is string => Boolean(tag)
      );

      saveCharacter({
        name: registration.name,
        handle: registration.handle,
        description: promptText || undefined,
        thumbnailUrl: storedUrl,
        primaryImageUrl: storedUrl,
        sheetUrl: storedUrl,
        shots: [
          {
            id: `${record.id}-sheet`,
            url: storedUrl,
            kind: "sheet",
            label: typeof viewLabel === "string" ? viewLabel : "Character sheet"
          }
        ],
        tags,
        source: "preset-sheet"
      });
      toast.success("캐릭터 라이브러리에 등록됨");
    } catch (error) {
      console.error("preset character register error", error);
      toast.error(error instanceof Error ? error.message : "캐릭터 등록에 실패했습니다.");
    }
  };

  const handleDeletePreviewRecord = async () => {
    if (!previewRecord) {
      return;
    }
    const recordId = previewRecord.id;
    closePreviewRecord();
    await handleDeleteRecord(recordId);
  };

  const handlePresetCharacterSet = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest = resolveReferenceImageForRequest();

    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: CHARACTER_SHEET_VIEWS,
        batchLabel: "캐릭터 시트",
        basePrompt: CHARACTER_SHEET_BASE_PROMPT,
        singleViewGuideline: CHARACTER_SHEET_SINGLE_VIEW_GUIDELINE,
        commonViewGuideline: "",
        negativePrompt: CHARACTER_SHEET_NEGATIVE,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue: "16:9",
        aspectRatioLabel: "16:9",
        shouldApplyAspectRatio: true,
        actionLabel: "character-sheet",
        targetModel: "gpt-image-2",
        setPending: (active: boolean) => {
          setCharacterSheetPendingCount(prev => {
            const next = active ? prev + 1 : Math.max(0, prev - 1);
            if (next > 0) {
              toast.loading(`캐릭터 시트 생성 중... (${next}개 진행)`, {
                id: PRESET_BATCH_PROGRESS_TOAST_ID,
                duration: Infinity
              });
            } else {
              toast.dismiss(PRESET_BATCH_PROGRESS_TOAST_ID);
              toast.success("캐릭터 시트 생성이 모두 완료되었습니다.");
            }
            return next;
          });
        },
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        mergeLocalRecords,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        imageGenOptions: {
          ...imageGenOptions,
          size: "2048x1152",
          count: 1
        },
        cancelRef,
        onCancelled: () => setCancelRequested(false)
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePresetView360 = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest = resolveReferenceImageForRequest();

    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: TURNAROUND_VIEWS,
        batchLabel: "360도 뷰",
        basePrompt: TURNAROUND_BASE_PROMPT_FALLBACK,
        singleViewGuideline: TURNAROUND_SINGLE_VIEW_GUIDELINE,
        negativePrompt: TURNAROUND_NEGATIVE_ENFORCEMENT,
        commonViewGuideline:
          "Keep the design and the entire scene (background, environment, lighting) consistent with the supplied references.",
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "view-360",
        targetModel: "gpt-image-2",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        mergeLocalRecords,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        imageGenOptions,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            id: PRESET_BATCH_PROGRESS_TOAST_ID,
            duration: 5000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePreset9Zoom = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest = resolveReferenceImageForRequest();
    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);
    const nineZoomImageGenOptions: GenerationOptionsValue = { ...imageGenOptions, count: 1 };

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: getRandomNineZoomViews(),
        batchLabel: "9ZOOM",
        basePrompt:
          "High fidelity camera coverage study of the supplied reference subject. Generate a new image from the same identity, wardrobe, color design, and visual style.",
        singleViewGuideline:
          "Change only camera distance, lens perspective, framing, and depth of field according to the requested shot. Preserve the subject identity and core design exactly.",
        commonViewGuideline:
          "Use the supplied reference as the identity anchor. Preserve the original scene, wardrobe, color palette, and art direction when possible; do not convert this into a character sheet or white-background lineup.",
        negativePrompt: `${CHARACTER_NEGATIVE_ENFORCEMENT}, identity swap, different character, duplicate person, extra limbs, deformed face, random outfit change, unrelated background, text, watermark`,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "9zoom",
        targetModel: "gpt-image-2",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        mergeLocalRecords,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        imageGenOptions: nineZoomImageGenOptions,
        interRequestDelayMs: 1000,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            id: PRESET_BATCH_PROGRESS_TOAST_ID,
            duration: 4000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePreset9Angle = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest = resolveReferenceImageForRequest();
    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);
    const nineAngleImageGenOptions: GenerationOptionsValue = { ...imageGenOptions, count: 1 };

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: getRandomNineAngleViews(),
        batchLabel: "9앵글",
        basePrompt:
          "High fidelity camera angle study of the supplied reference subject. Generate a new image from the same identity, wardrobe, color design, and visual style.",
        singleViewGuideline:
          "Change only the camera angle and viewpoint according to the requested angle. Keep shot size relatively stable around medium or full framing unless the angle requires minor adjustment.",
        commonViewGuideline:
          "Use the supplied reference as the identity anchor. Preserve the original scene, wardrobe, color palette, and art direction when possible; do not change the subject into a different character.",
        negativePrompt: `${CHARACTER_NEGATIVE_ENFORCEMENT}, identity swap, different character, duplicate person, extra limbs, deformed face, random outfit change, unrelated background, text, watermark`,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "9angle",
        targetModel: "gpt-image-2",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        mergeLocalRecords,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        imageGenOptions: nineAngleImageGenOptions,
        interRequestDelayMs: 1000,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            id: PRESET_BATCH_PROGRESS_TOAST_ID,
            duration: 4000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePreset9ShotSize = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest = resolveReferenceImageForRequest();
    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);
    const nineShotImageGenOptions: GenerationOptionsValue = { ...imageGenOptions, count: 1 };

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: getRandomNineShotSizeViews(),
        batchLabel: "9화각",
        basePrompt:
          "High fidelity shot-size coverage study of the supplied reference subject. Generate a new image from the same identity, wardrobe, color design, and visual style.",
        singleViewGuideline:
          "Change only the shot size and framing distance according to the requested shot. Keep camera angle stable, preferably neutral eye-level or front three-quarter.",
        commonViewGuideline:
          "Use the supplied reference as the identity anchor. Preserve the original scene, wardrobe, color palette, and art direction when possible; do not change the subject into a different character.",
        negativePrompt: `${CHARACTER_NEGATIVE_ENFORCEMENT}, identity swap, different character, duplicate person, extra limbs, deformed face, random outfit change, unrelated background, text, watermark`,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "9shot",
        targetModel: "gpt-image-2",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        mergeLocalRecords,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        imageGenOptions: nineShotImageGenOptions,
        interRequestDelayMs: 1000,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            id: PRESET_BATCH_PROGRESS_TOAST_ID,
            duration: 4000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePresetAction9 = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest = resolveReferenceImageForRequest();
    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);
    const action9ImageGenOptions: GenerationOptionsValue = { ...imageGenOptions, count: 1 };

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: ACTION9_VIEWS,
        batchLabel: "액션9",
        basePrompt:
          "High fidelity combat action coverage study of the supplied reference subject. Generate intense fight-scene images from the same identity, equipment, current condition, background, lighting, color design, and visual style.",
        singleViewGuideline:
          "Create direct physical conflict, contact, attack trajectory, defensive reaction, or near-contact danger in every frame. Change only the combat action and requested shot/framing; keep all existing gear, props, clothing, damage/state, background elements, and scene atmosphere grounded in the reference.",
        commonViewGuideline:
          "Use the supplied reference as the identity and scene anchor. The scene must not be an isolated solo pose: include an opponent, threat, incoming attack, impact contact, parry contact, or visible attack path. Preserve the exact equipment and visible state from the reference; do not invent unrelated gear, do not change the location, and do not reset the subject condition.",
        negativePrompt: `${CHARACTER_NEGATIVE_ENFORCEMENT}, isolated pose, standing alone, passive pose, empty action, no contact, no opponent, no threat, no impact, no attack trajectory, identity swap, different character, missing equipment, invented unrelated equipment, changed background, clean reset of damaged or worn state, duplicate person, extra limbs, deformed face, text, watermark`,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "action9",
        targetModel: "gpt-image-2",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        mergeLocalRecords,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        imageGenOptions: action9ImageGenOptions,
        interRequestDelayMs: 1000,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            id: PRESET_BATCH_PROGRESS_TOAST_ID,
            duration: 4000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePresetPhotoDump = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest = resolveReferenceImageForRequest();

    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: PHOTO_DUMP_VIEWS,
        batchLabel: "포토 덤프",
        basePrompt: "High fidelity portrait of the supplied reference character",
        singleViewGuideline:
          "Keep the same pose and expression as the reference image while adapting to the requested style.",
        negativePrompt: `${CHARACTER_NEGATIVE_ENFORCEMENT}, different facial expression, different pose, extra limbs, distorted anatomy`,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "photo-dump",
        targetModel: "gpt-image-2",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        mergeLocalRecords,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        imageGenOptions,
        interRequestDelayMs: 1200,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            id: PRESET_BATCH_PROGRESS_TOAST_ID,
            duration: 5000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePresetTealOrange = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest = resolveReferenceImageForRequest();

    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: [
          {
            id: "teal-orange",
            label: "틸 & 오렌지",
            instruction:
              "Apply professional teal and orange feature film color grading while maintaining the original pose and composition"
          }
        ],
        batchLabel: "틸 & 오렌지",
        basePrompt: "High fidelity portrait of the supplied reference character",
        singleViewGuideline: TURNAROUND_SINGLE_VIEW_GUIDELINE,
        negativePrompt: `${CHARACTER_NEGATIVE_ENFORCEMENT}, altered pose, different expression`,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "teal-orange",
        targetModel: "gpt-image-2",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        mergeLocalRecords,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        imageGenOptions,
        interRequestDelayMs: 0,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            id: PRESET_BATCH_PROGRESS_TOAST_ID,
            duration: 3000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePresetPhotoDumpDynamic = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest = resolveReferenceImageForRequest();

    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: PHOTO_DUMP_VARIATION_VIEWS,
        batchLabel: "포토 덤프 12",
        basePrompt: "High fidelity portrait of the supplied reference character, same art style as reference",
        singleViewGuideline:
          "Preserve character likeness while adapting outfit, hairstyle, body pose, facial expression, and scene backdrop exactly as described for each view.",
        negativePrompt: `${CHARACTER_NEGATIVE_ENFORCEMENT}, identity swap, duplicate person, deformed body, severe distortion`,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "photo-dump-dynamic",
        targetModel: "gpt-image-2",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        mergeLocalRecords,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        imageGenOptions,
        interRequestDelayMs: 1200,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            id: PRESET_BATCH_PROGRESS_TOAST_ID,
            duration: 5000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePresetEmotionStudy = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest = resolveReferenceImageForRequest();

    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: EMOTION_STUDY_VIEWS,
        batchLabel: "감정 프리셋 12컷",
        basePrompt: "High fidelity portrait of the supplied reference character, identical styling and camera framing, adjust only the facial expression per instruction.",
        singleViewGuideline:
          "Keep the subject's pose, outfit, and camera angle unchanged. Modify only the facial muscles to match the requested emotion with natural nuance.",
        negativePrompt: `${CHARACTER_NEGATIVE_ENFORCEMENT}, different pose, head swapped, extra limbs, distorted face, exaggerated cartoon expression`,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "emotion-preset",
        targetModel: "gpt-image-2",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        mergeLocalRecords,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        imageGenOptions,
        interRequestDelayMs: 1000,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            id: PRESET_BATCH_PROGRESS_TOAST_ID,
            duration: 4000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const referenceImageUrl = referenceImageState.url ?? derivedReferenceImageUrl ?? null;
  const cacheBustedReferenceImageUrl = useMemo(() => {
    if (!referenceImageUrl) {
      return null;
    }
    if (referenceImageUrl.startsWith("data:")) {
      return referenceImageUrl;
    }
    if (!referenceImageState.signature) {
      return referenceImageUrl;
    }
    try {
      const url = new URL(referenceImageUrl);
      url.searchParams.set("_cb", referenceImageState.signature.toString());
      return url.toString();
    } catch {
      return `${referenceImageUrl}${referenceImageUrl.includes("?") ? "&" : "?"}_cb=${referenceImageState.signature}`;
    }
  }, [referenceImageState.signature, referenceImageUrl]);

  return (
    <>
      {/* 상단 네비게이션 */}
      <div className="border-b bg-muted/60 backdrop-blur-sm">
        <Tabs value="presets">
          <div className="px-4 py-3">
            <TabsList className="flex flex-wrap gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-1 shadow-sm border">
              {PRESET_MODES.map(mode =>
                mode.href ? (
                  <Link
                    key={mode.id}
                    href={mode.href}
                    className={cn(
                      "rounded-lg border border-transparent px-3 py-2 text-xs transition-all duration-200",
                      "bg-background/70 text-foreground hover:bg-primary/10 hover:border-primary/20",
                      "flex flex-col text-center shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                    )}
                  >
                    <span className="font-medium leading-none">{mode.label}</span>
                  </Link>
                ) : (
                  <div
                    key={mode.id}
                    className={cn(
                      "rounded-lg border border-transparent px-3 py-2 text-xs transition-all duration-200",
                      "bg-primary text-primary-foreground shadow-lg border-primary/30",
                      "flex flex-col text-center"
                    )}
                  >
                    <span className="font-medium leading-none">{mode.label}</span>
                  </div>
                )
              )}
            </TabsList>
          </div>
        </Tabs>
      </div>

      <div className="flex min-h-screen flex-col gap-8 bg-background p-6">
      <GenerationOptionsPanel value={imageGenOptions} onChange={setImageGenOptions} />
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>기준 이미지</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div
              className={cn(
                "relative overflow-hidden rounded-xl border bg-muted",
                FOUR_THREE_RATIO_CLASS,
                referenceImageUrl ? "" : "flex items-center justify-center"
              )}
              onDragOver={handleReferenceDragOver}
              onDrop={event => {
                event.stopPropagation();
                const file = getDroppedFile(event);
                if (batchPending) {
                  return;
                }
                if (file) {
                  void handleReferenceUpload(file);
                }
              }}
            >
              {cacheBustedReferenceImageUrl ? (
                <Image
                  key={cacheBustedReferenceImageUrl}
                  src={cacheBustedReferenceImageUrl}
                  alt="reference"
                  fill
                  className="object-cover"
                  unoptimized={cacheBustedReferenceImageUrl.startsWith('data:')}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                  <span>기준 이미지를 업로드하세요</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleReferenceUpload(file);
                  }
                  if (event.target.value) {
                    event.target.value = "";
                  }
                }}
                disabled={batchPending}
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => fileInputRef.current?.click()} disabled={referenceImageUploading || batchPending}>
                기준 이미지 추가
              </Button>
              <Button variant="secondary" onClick={() => router.push("/")}>
                편집 열기
              </Button>
              <Button variant="destructive" onClick={() => void handleReferenceRemove()} disabled={!hasReference || batchPending}>
                삭제
              </Button>
            </div>
            <div
              className="space-y-2"
              onDragOver={handleReferenceDragOver}
              onDrop={event => {
                const file = getDroppedFile(event);
                if (batchPending) {
                  return;
                }
                if (file) {
                  void handleReferenceSlotCreateUpload(file);
                }
              }}
            >
              <div className="flex items-center justify-between text-sm font-medium">
                <span>참조 이미지</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReferenceSlotAdd}
                  onDragOver={handleReferenceDragOver}
                  onDrop={event => {
                    event.stopPropagation();
                    const file = getDroppedFile(event);
                    if (batchPending) {
                      return;
                    }
                    if (file) {
                      void handleReferenceSlotCreateUpload(file);
                    }
                  }}
                  disabled={referenceSlots.length >= MAX_REFERENCE_SLOT_COUNT || batchPending}
                >
                  슬롯 추가
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {referenceSlots.map(slot => (
                  <div
                    key={slot.id}
                    className="group relative aspect-[4/3] overflow-hidden rounded-lg border"
                    onDragOver={handleReferenceDragOver}
                    onDrop={event => {
                      event.stopPropagation();
                      const file = getDroppedFile(event);
                      if (batchPending) {
                        return;
                      }
                      if (file) {
                        void handleReferenceSlotUpload(slot.id, file);
                      }
                    }}
                  >
                    {slot.imageUrl ? (
                      <>
                        <Image src={slot.imageUrl} alt="reference slot" width={160} height={120} className="h-full w-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition group-hover:opacity-100">
                          <Button size="icon" variant="secondary" onClick={() => void handleReferenceSlotSelect(slot.id)} disabled={batchPending}>
                            <Stars className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="destructive" onClick={() => handleReferenceSlotClear(slot.id)} disabled={batchPending}>
                            <Download className="h-4 w-4 rotate-180" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <label className="flex h-full w-full cursor-pointer items-center justify-center text-xs text-muted-foreground">
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={event => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void handleReferenceSlotUpload(slot.id, file);
                            }
                            if (event.target.value) {
                              event.target.value = "";
                            }
                          }}
                          disabled={batchPending}
                        />
                        업로드
                      </label>
                    )}
                  </div>
                ))}
                {referenceSlots.length < MAX_REFERENCE_SLOT_COUNT ? (
                  <button
                    type="button"
                    className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dashed text-muted-foreground transition hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleReferenceSlotAdd}
                    onDragOver={handleReferenceDragOver}
                    onDrop={event => {
                      event.stopPropagation();
                      const file = getDroppedFile(event);
                      if (batchPending) {
                        return;
                      }
                      if (file) {
                        void handleReferenceSlotCreateUpload(file);
                      }
                    }}
                    disabled={batchPending}
                    aria-label="참조 슬롯 추가"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>프리셋</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              <Button className="h-20 text-lg" onClick={() => void handlePresetCharacterSet()} disabled={batchPending}>
                <Sparkles className="mr-2 h-5 w-5" />
                캐릭터 시트
                {characterSheetPendingCount > 0 ? (
                  <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-xs">
                    {characterSheetPendingCount} 진행 중
                  </span>
                ) : null}
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePresetView360()} disabled={batchPending}>
                <Stars className="mr-2 h-5 w-5" /> 360도 뷰
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePreset9Zoom()} disabled={batchPending}>
                <ZoomIn className="mr-2 h-5 w-5" /> 9ZOOM
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePreset9Angle()} disabled={batchPending}>
                <Stars className="mr-2 h-5 w-5" /> 9앵글
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePreset9ShotSize()} disabled={batchPending}>
                <ImageIcon className="mr-2 h-5 w-5" /> 9화각
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePresetAction9()} disabled={batchPending}>
                <Zap className="mr-2 h-5 w-5" /> 액션9
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePresetPhotoDump()} disabled={batchPending}>
                <Zap className="mr-2 h-5 w-5" /> 포토 덤프 (26컷)
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePresetPhotoDumpDynamic()} disabled={batchPending}>
                <Zap className="mr-2 h-5 w-5" /> 포토 덤프 12컷 (스타일 변주)
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePresetEmotionStudy()} disabled={batchPending}>
                <Sparkles className="mr-2 h-5 w-5" /> 감정 프리셋 12컷
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePresetTealOrange()} disabled={batchPending}>
                <Sparkles className="mr-2 h-5 w-5" /> 틸 & 오렌지 컬러그레이딩
              </Button>
              {batchPending && (
                <Button
                  className="col-span-full h-12 text-sm"
                  variant="destructive"
                  onClick={handleCancelBatch}
                  disabled={cancelRequested}
                >
                  {cancelRequested ? "중지 요청 처리 중..." : "생성 중지"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">최근 생성 기록</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {loading
              ? "기록 동기화 중"
              : `${Math.min(historyVisibleCount, historyRecords.length)} / ${historyRecords.length}개 표시 중`}
            <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
              스튜디오 열기
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {visibleHistoryRecords.map(record => {
            const imageUrl = record.imageUrl ?? record.thumbnailUrl ?? record.originalImageUrl;
            const recordLabel =
              (record.metadata?.characterViewLabel as string | undefined) ??
              (record.promptMeta?.refinedPrompt as string | undefined) ??
              (record.promptMeta?.rawPrompt as string | undefined) ??
              "";
            const canRegisterCharacter = isCharacterSheetRecord(record);
            return (
              <div
                key={record.id}
                className={cn(
                  "group relative overflow-hidden rounded-lg border bg-card",
                  FOUR_THREE_RATIO_CLASS,
                  selectedImageId === record.id ? "ring-2 ring-primary" : ""
                )}
                role="button"
                tabIndex={0}
                onClick={() => openPreview(record)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openPreview(record);
                  }
                }}
              >
                {imageUrl ? (
                  <Image src={imageUrl} alt="generated" fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">이미지 없음</div>
                )}
                <div className="absolute inset-0 flex flex-col justify-between bg-black/0 transition group-hover:bg-black/60">
                  <div className="flex justify-end gap-1 p-2 opacity-0 transition group-hover:opacity-100">
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={event => {
                        event.stopPropagation();
                        void handleToggleFavorite(record.id);
                      }}
                      className={isHistoryRecordFavorite(record) ? "text-amber-500" : ""}
                      disabled={batchPending}
                    >
                      <Stars className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={event => {
                        event.stopPropagation();
                        void handleSetReferenceFromHistory(record.id);
                      }}
                      disabled={batchPending}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                    {canRegisterCharacter ? (
                      <Button
                        size="icon"
                        variant="secondary"
                        title="캐릭터로 등록"
                        aria-label="캐릭터로 등록"
                        onClick={event => {
                          event.stopPropagation();
                          void handleRegisterRecordAsCharacter(record);
                        }}
                        disabled={batchPending}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={event => {
                        event.stopPropagation();
                        void handleDownloadRecord(record);
                      }}
                      disabled={batchPending}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                  <button
                    className="flex items-center justify-between px-3 py-2 text-left text-xs text-white opacity-0 transition group-hover:opacity-100"
                    onClick={event => {
                      event.stopPropagation();
                      openPreview(record);
                    }}
                  >
                    <span className="line-clamp-2">{recordLabel}</span>
                    <span>{new Date(record.createdAt ?? record.updatedAt ?? "").toLocaleDateString()}</span>
                  </button>
                </div>
              </div>
            );
          })}
          {visibleHistoryRecords.length === 0 && (
            <div className="col-span-full flex h-40 items-center justify-center rounded-lg border text-sm text-muted-foreground">
              {emptyHistoryMessage}
            </div>
          )}
        </div>
        {hasMoreHistoryRecords ? (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setHistoryVisibleCount(count => count + HISTORY_VISIBLE_INCREMENT)}
            >
              더 보기
            </Button>
          </div>
        ) : null}
      </div>
      </div>
      {previewRecord ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 lg:p-6"
          onClick={closePreviewRecord}
        >
          <div
            className="relative grid h-full max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-xl border border-white/20 bg-background shadow-2xl lg:grid-cols-[minmax(0,1fr)_360px]"
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-4 top-4 z-30 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur transition hover:bg-black/70"
              onClick={event => {
                event.stopPropagation();
                closePreviewRecord();
              }}
            >
              닫기
            </button>
            <div className="flex min-h-0 flex-col bg-black">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-white">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">원본 이미지</p>
                  <p className="truncate text-xs text-white/60">
                    {previewRecord.model} · {new Date(previewRecord.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="mr-14 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => previewZoom.zoomOut()}
                    disabled={previewZoom.scale <= MIN_IMAGE_ZOOM}
                  >
                    축소
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => previewZoom.reset()}
                    disabled={previewZoom.scale === 1}
                  >
                    {previewZoomPercent}%
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => previewZoom.zoomIn()}
                    disabled={previewZoom.scale >= MAX_IMAGE_ZOOM}
                  >
                    확대
                  </Button>
                </div>
              </div>
              <div
                {...previewZoom.bind}
                className={cn(
                  "relative flex min-h-[50vh] flex-1 touch-none select-none items-center justify-center overflow-hidden bg-black",
                  previewZoom.isPanning ? "cursor-grabbing" : "cursor-grab"
                )}
                title="마우스 휠로 확대/축소, 드래그로 이동, 더블클릭으로 원래대로"
              >
                {previewImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewImageUrl}
                    alt={previewLabel || "preview"}
                    className="max-h-full max-w-full object-contain will-change-transform"
                    draggable={false}
                    style={{
                      transform: `translate(${previewZoom.transform.panX}px, ${previewZoom.transform.panY}px) scale(${previewZoom.transform.scale})`,
                      transformOrigin: "center center"
                    }}
                  />
                ) : (
                  <div className="text-sm text-white/70">이미지를 불러올 수 없습니다.</div>
                )}
              </div>
            </div>
            <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-border bg-card p-4 lg:border-l lg:border-t-0">
              <div className="space-y-1 pr-10 lg:pr-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">생성 기록</p>
                <h2 className="text-base font-semibold text-foreground">프롬프트와 액션</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void handleSetPreviewAsReference()} disabled={!previewImageUrl || batchPending}>
                  기준이미지 등록
                </Button>
                {isCharacterSheetRecord(previewRecord) ? (
                  <Button size="sm" variant="outline" onClick={() => void handleRegisterRecordAsCharacter(previewRecord)} disabled={!previewImageUrl || batchPending}>
                    캐릭터로 등록
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => void handleCopyPreviewPrompt()} disabled={!previewPromptText}>
                  프롬프트 복사
                </Button>
                <Button size="sm" variant="outline" onClick={handleDownloadPreviewRecord} disabled={!previewImageUrl}>
                  다운로드
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void handleDeletePreviewRecord()} disabled={batchPending}>
                  삭제
                </Button>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">생성 프롬프트</p>
                <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
                  {previewPromptText || "저장된 프롬프트가 없습니다."}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="rounded-lg border bg-background/60 p-2">
                  <p className="font-medium text-foreground">모드</p>
                  <p className="uppercase">{previewRecord.mode}</p>
                </div>
                <div className="rounded-lg border bg-background/60 p-2">
                  <p className="font-medium text-foreground">모델</p>
                  <p>{previewRecord.model}</p>
                </div>
                <div className="rounded-lg border bg-background/60 p-2">
                  <p className="font-medium text-foreground">파일</p>
                  <p>{previewImageUrl?.startsWith("/api/images/") ? "로컬 원본" : "이미지 URL"}</p>
                </div>
                {(previewRecord.metadata as any)?.characterViewLabel ? (
                  <div className="rounded-lg border bg-background/60 p-2">
                    <p className="font-medium text-foreground">프리셋</p>
                    <p>{(previewRecord.metadata as any).characterViewLabel}</p>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </>
  );
}
