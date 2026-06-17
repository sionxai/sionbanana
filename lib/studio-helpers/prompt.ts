import { findCharacterByHandle, type Character } from "@/lib/characters";
import { parseCharacterMentions } from "@/lib/character-mentions";
import {
  DEFAULT_CAMERA_ANGLE,
  DEFAULT_CAMERA_DIRECTION,
  DEFAULT_SUBJECT_DIRECTION,
  DEFAULT_ZOOM_LEVEL
} from "@/lib/camera";
import { CAMERA_MODE_DEFAULT_DIRECTIVE } from "@/components/studio/camera-config";
import type {
  LightingPresetCategory,
  LightingSelections,
  PosePresetCategory,
  PoseSelections
} from "@/components/studio/types";

export function buildCharacterReferencePrompt(
  promptText: string,
  mentionSource: string,
  characters: Character[],
  referenceIndexByHandle: Record<string, number> = {}
): string {
  const basePrompt = promptText.trim();
  const parsedMentions = parseCharacterMentions(mentionSource, characters);

  if (!basePrompt || parsedMentions.mentioned.length === 0) {
    return basePrompt;
  }

  if (basePrompt.startsWith("Reference map:") && basePrompt.includes("Detailed prompt:")) {
    return basePrompt;
  }

  const referenceMap = parsedMentions.mentioned
    .map((handle, index) => {
      const character = findCharacterByHandle(characters, handle);
      const referenceIndex = referenceIndexByHandle[handle] ?? index + 1;
      return character ? `Image ${referenceIndex} = Character @${handle} (name: ${character.name})` : null;
    })
    .filter((entry): entry is string => Boolean(entry))
    .join(". ");

  return referenceMap ? `Reference map: ${referenceMap}. Detailed prompt: ${basePrompt}` : basePrompt;
}

export interface NormalizedCameraSettings {
  angle?: string;
  subjectDirection?: string;
  cameraDirection?: string;
  zoom?: string;
}

const CAMERA_ANGLE_PROMPT_MAP: Record<string, string> = {
  로우앵글: "a dramatic low-angle hero shot",
  lowangle: "a dramatic low-angle hero shot",
  웜즈아이: "an extreme worm's-eye perspective",
  wormseye: "an extreme worm's-eye perspective",
  하이앵글: "a high-angle overhead viewpoint",
  highangle: "a high-angle overhead viewpoint",
  버드아이: "a sweeping bird's-eye perspective",
  birdseye: "a sweeping bird's-eye perspective",
  더치앵글: "a tilted Dutch angle composition",
  dutchangle: "a tilted Dutch angle composition",
  아이레벨: "a natural eye-level perspective",
  eyelevel: "a natural eye-level perspective",
  반대방향: "a reverse-angle viewpoint that looks back toward the subject",
  reverseangle: "a reverse-angle viewpoint that looks back toward the subject",
  오버숄더: "an intimate over-the-shoulder framing",
  overtheshoulder: "an intimate over-the-shoulder framing"
};

const SUBJECT_DIRECTION_PROMPT_MAP: Record<string, string> = {
  정면: "the subject facing forward",
  좌측면: "the subject turned to the left",
  우측면: "the subject turned to the right",
  후면: "the subject showing their back",
  위에서: "the subject looking upward",
  아래에서: "the subject looking downward",
  front: "the subject facing forward",
  left: "the subject turned to the left",
  right: "the subject turned to the right",
  back: "the subject showing their back",
  up: "the subject looking upward",
  down: "the subject looking downward"
};

const CAMERA_DIRECTION_PROMPT_MAP: Record<string, string> = {
  정면: "the camera positioned directly in front of the subject",
  좌측면: "the camera positioned on the subject's left side",
  우측면: "the camera positioned on the subject's right side",
  후면: "the camera positioned behind the subject",
  위에서: "the camera placed overhead looking downward",
  아래에서: "the camera positioned low to the ground looking upward",
  front: "the camera positioned directly in front of the subject",
  left: "the camera positioned on the subject's left side",
  right: "the camera positioned on the subject's right side",
  back: "the camera positioned behind the subject",
  up: "the camera placed overhead looking downward",
  down: "the camera positioned low to the ground looking upward"
};

const ZOOM_PROMPT_MAP: Record<string, string> = {
  줌인: "tight zoomed-in framing that highlights facial detail",
  줌아웃: "zoomed-out framing that reveals the environment",
  확대: "an extreme close-up magnification",
  "익스트림 롱샷": "an extreme long shot / ELS where the subject appears very small against a vast, dominant environment, emphasizing location, era, scale, or isolation",
  "롱샷 / 와이드샷": "a long shot / wide shot showing the full body and broad surrounding space to clarify the relationship between the subject and environment",
  풀샷: "a full shot / FS framing the subject from head to toe, clearly showing posture, wardrobe, and body movement",
  니샷: "a knee shot / KS framing the subject from the knees upward, balancing body movement with facial expression",
  "미디엄 롱샷": "a medium long shot / MLS framing from the thighs or knees upward, balancing dialogue and physical action",
  미디엄샷: "a medium shot / MS framing from the waist upward, suitable for dialogue, interview, or explanatory scenes",
  "미디엄 클로즈업": "a medium close-up / MCU framing from the chest or upper torso upward, emphasizing facial expression and spoken emotion",
  클로즈업: "a close-up / CU centered on the full face, emphasizing emotion, reaction, and immersion",
  "빅 클로즈업": "a big close-up / BCU filling the frame with part of the face, emphasizing tension, tears, or subtle micro-emotions",
  "익스트림 클로즈업": "an extreme close-up / ECU isolating only the eyes, mouth, hands, or a small object detail to emphasize clues, unease, symbolism, or fine texture",
  zoomin: "tight zoomed-in framing that highlights facial detail",
  zoomout: "zoomed-out framing that reveals the environment",
  magnify: "an extreme close-up magnification",
  extremelongshot: "an extreme long shot / ELS where the subject appears very small against a vast, dominant environment, emphasizing location, era, scale, or isolation",
  els: "an extreme long shot / ELS where the subject appears very small against a vast, dominant environment, emphasizing location, era, scale, or isolation",
  longshot: "a long shot / wide shot showing the full body and broad surrounding space to clarify the relationship between the subject and environment",
  wideshot: "a long shot / wide shot showing the full body and broad surrounding space to clarify the relationship between the subject and environment",
  fullshot: "a full shot / FS framing the subject from head to toe, clearly showing posture, wardrobe, and body movement",
  fs: "a full shot / FS framing the subject from head to toe, clearly showing posture, wardrobe, and body movement",
  kneeshot: "a knee shot / KS framing the subject from the knees upward, balancing body movement with facial expression",
  ks: "a knee shot / KS framing the subject from the knees upward, balancing body movement with facial expression",
  mediumlongshot: "a medium long shot / MLS framing from the thighs or knees upward, balancing dialogue and physical action",
  mls: "a medium long shot / MLS framing from the thighs or knees upward, balancing dialogue and physical action",
  mediumshot: "a medium shot / MS framing from the waist upward, suitable for dialogue, interview, or explanatory scenes",
  ms: "a medium shot / MS framing from the waist upward, suitable for dialogue, interview, or explanatory scenes",
  mediumcloseup: "a medium close-up / MCU framing from the chest or upper torso upward, emphasizing facial expression and spoken emotion",
  mcu: "a medium close-up / MCU framing from the chest or upper torso upward, emphasizing facial expression and spoken emotion",
  closeup: "a close-up / CU centered on the full face, emphasizing emotion, reaction, and immersion",
  cu: "a close-up / CU centered on the full face, emphasizing emotion, reaction, and immersion",
  bigcloseup: "a big close-up / BCU filling the frame with part of the face, emphasizing tension, tears, or subtle micro-emotions",
  bcu: "a big close-up / BCU filling the frame with part of the face, emphasizing tension, tears, or subtle micro-emotions",
  extremecloseup: "an extreme close-up / ECU isolating only the eyes, mouth, hands, or a small object detail to emphasize clues, unease, symbolism, or fine texture",
  ecu: "an extreme close-up / ECU isolating only the eyes, mouth, hands, or a small object detail to emphasize clues, unease, symbolism, or fine texture"
};

function sanitizePromptKey(value?: string | null) {
  if (!value) {
    return "";
  }
  return value.replace(/[\s_-]+/g, "").toLowerCase();
}

function resolveCameraAnglePrompt(angle?: string | null) {
  if (!angle || angle === DEFAULT_CAMERA_ANGLE) {
    return null;
  }
  const key = sanitizePromptKey(angle);
  return CAMERA_ANGLE_PROMPT_MAP[key] ?? CAMERA_ANGLE_PROMPT_MAP[angle];
}

function resolveSubjectDirectionPrompt(direction?: string | null) {
  if (!direction || direction === DEFAULT_SUBJECT_DIRECTION) {
    return null;
  }
  const key = sanitizePromptKey(direction);
  return SUBJECT_DIRECTION_PROMPT_MAP[key] ?? SUBJECT_DIRECTION_PROMPT_MAP[direction];
}

function resolveCameraDirectionPrompt(direction?: string | null) {
  if (!direction || direction === DEFAULT_CAMERA_DIRECTION) {
    return null;
  }
  const key = sanitizePromptKey(direction);
  return CAMERA_DIRECTION_PROMPT_MAP[key] ?? CAMERA_DIRECTION_PROMPT_MAP[direction];
}

function resolveZoomPrompt(zoom?: string | null) {
  if (!zoom || zoom === DEFAULT_ZOOM_LEVEL) {
    return null;
  }
  const key = sanitizePromptKey(zoom);
  return ZOOM_PROMPT_MAP[key] ?? ZOOM_PROMPT_MAP[zoom];
}

export function buildCameraAdjustmentInstruction(settings: NormalizedCameraSettings) {
  const anglePhrase = resolveCameraAnglePrompt(settings.angle);
  const zoomPhrase = resolveZoomPrompt(settings.zoom);
  const subjectPhrase = resolveSubjectDirectionPrompt(settings.subjectDirection);
  const cameraPhrase = resolveCameraDirectionPrompt(settings.cameraDirection);

  const guidance: string[] = [];

  if (anglePhrase) {
    guidance.push(`Use ${anglePhrase}.`);
  }
  if (cameraPhrase) {
    guidance.push(`Position the camera so it is ${cameraPhrase}.`);
  }
  if (zoomPhrase) {
    guidance.push(`Maintain ${zoomPhrase}.`);
  }
  if (subjectPhrase) {
    guidance.push(`Keep ${subjectPhrase}.`);
  }

  return guidance.length ? guidance.join(' ') : null;
}

export function combinePromptWithGuidance(
  promptText: string | null | undefined,
  guidance: string | null
): string {
  const trimmedGuidance = guidance?.trim();
  const base = (promptText ?? "").trim();

  if (!trimmedGuidance) {
    return base;
  }
  if (!base) {
    return trimmedGuidance;
  }
  if (base.includes(trimmedGuidance)) {
    return base;
  }
  return `${base}
${trimmedGuidance}`.trim();
}

export function applyCameraPromptDirectives(
  promptText: string | null | undefined,
  guidance: string | null
): string {
  const trimmedGuidance = guidance?.trim();
  const base = (promptText ?? "").trim();

  if (trimmedGuidance && trimmedGuidance.length) {
    return combinePromptWithGuidance(base, trimmedGuidance);
  }

  return base || CAMERA_MODE_DEFAULT_DIRECTIVE;
}

const LIGHTING_CATEGORY_ORDER: LightingPresetCategory[] = [
  "illumination",
  "atmosphere",
  "time",
  "cinematic",
  "artistic",
  "harmony",
  "mood"
];

export function cloneLightingSelections(selections: LightingSelections): LightingSelections {
  return LIGHTING_CATEGORY_ORDER.reduce((acc, category) => {
    acc[category] = [...(selections[category] ?? [])];
    return acc;
  }, {} as LightingSelections);
}

const POSE_CATEGORY_ORDER: PosePresetCategory[] = [
  "expression",
  "posture"
];

export function clonePoseSelections(selections: PoseSelections): PoseSelections {
  return {
    expression: [...selections.expression],
    posture: [...selections.posture]
  };
}

export function normalizeCameraSettings(
  angle: string,
  subjectDirection: string,
  cameraDirection: string,
  zoom: string
): NormalizedCameraSettings {
  const normalized: NormalizedCameraSettings = {};
  if (angle && angle !== DEFAULT_CAMERA_ANGLE) {
    normalized.angle = angle;
  }
  if (subjectDirection && subjectDirection !== DEFAULT_SUBJECT_DIRECTION) {
    normalized.subjectDirection = subjectDirection;
  }
  if (cameraDirection && cameraDirection !== DEFAULT_CAMERA_DIRECTION) {
    normalized.cameraDirection = cameraDirection;
  }
  if (zoom && zoom !== DEFAULT_ZOOM_LEVEL) {
    normalized.zoom = zoom;
  }
  return normalized;
}

export function buildCameraPrompt({ settings }: { settings: NormalizedCameraSettings }): string {
  const guidance = buildCameraAdjustmentInstruction(settings);
  const trimmed = guidance?.trim();
  return trimmed && trimmed.length ? trimmed : CAMERA_MODE_DEFAULT_DIRECTIVE;
}
