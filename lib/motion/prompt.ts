import { keyColorForSubject, type SubjectType } from "@/lib/motion/matte-color";

const DEFAULT_STYLE = "detailed hand-painted 2D game asset, clean crisp silhouette";

export type MotionActionPreset =
  | "walk"
  | "run"
  | "idle"
  | "jump"
  | "attack"
  | "reload"
  | "hit"
  | "fall"
  | "stun"
  | "getup"
  | "custom";

export const motionActionPresetValues = [
  "idle",
  "walk",
  "run",
  "jump",
  "attack",
  "reload",
  "hit",
  "fall",
  "stun",
  "getup",
  "custom"
] as const;

export type MotionActionMeta = {
  label: string;
  cyclic: boolean;
  defaultLoop: "loop" | "once";
  recommendedFrames: number;
};

export const MOTION_ACTION_PRESETS: Record<MotionActionPreset, MotionActionMeta> = {
  idle: { label: "대기", cyclic: true, defaultLoop: "loop", recommendedFrames: 8 },
  walk: { label: "이동", cyclic: true, defaultLoop: "loop", recommendedFrames: 8 },
  run: { label: "질주", cyclic: true, defaultLoop: "loop", recommendedFrames: 8 },
  jump: { label: "점프", cyclic: false, defaultLoop: "once", recommendedFrames: 8 },
  attack: { label: "공격", cyclic: false, defaultLoop: "once", recommendedFrames: 6 },
  reload: { label: "장전", cyclic: false, defaultLoop: "once", recommendedFrames: 6 },
  hit: { label: "피격", cyclic: false, defaultLoop: "once", recommendedFrames: 5 },
  fall: { label: "넘어짐", cyclic: false, defaultLoop: "once", recommendedFrames: 8 },
  stun: { label: "스턴", cyclic: true, defaultLoop: "loop", recommendedFrames: 8 },
  getup: { label: "일어나기", cyclic: false, defaultLoop: "once", recommendedFrames: 6 },
  custom: { label: "직접 입력", cyclic: false, defaultLoop: "loop", recommendedFrames: 8 }
};

const ACTION_PHASES: Record<Exclude<MotionActionPreset, "custom">, readonly string[]> = {
  walk: [
    "contact pose, right foot forward with the heel just touching down, left toe extended behind",
    "down pose, body at its lowest as the right leg absorbs the weight",
    "passing pose, left foot lifted and swinging past the planted right leg, body rising",
    "up pose, body at its highest on the ball of the right foot, left leg reaching forward",
    "contact pose, left foot forward with the heel just touching down, right toe extended behind",
    "down pose, body at its lowest as the left leg absorbs the weight",
    "passing pose, right foot lifted and swinging past the planted left leg, body rising",
    "up pose, body at its highest on the ball of the left foot, right leg reaching forward"
  ],
  run: [
    "run contact pose, right foot landing ahead of the body, left leg trailing far behind",
    "compression pose, right leg bending deeply as it absorbs the landing",
    "drive pose, right leg pushing off behind, left knee driving forward and up",
    "airborne pose, both feet off the ground, right leg trailing, left leg reaching forward",
    "run contact pose, left foot landing ahead of the body, right leg trailing far behind",
    "compression pose, left leg bending deeply as it absorbs the landing",
    "drive pose, left leg pushing off behind, right knee driving forward and up",
    "airborne pose, both feet off the ground, left leg trailing, right leg reaching forward"
  ],
  idle: [
    "neutral idle pose at the top of a breath, chest lifted",
    "slight settling pose, shoulders beginning to relax downward",
    "lowering pose, chest sinking as the breath goes out",
    "lowest breathing pose, shoulders dropped, hair and cloth settling",
    "slight lifting pose, chest beginning to rise again",
    "rising pose, shoulders lifting with the incoming breath",
    "near-top pose, chest almost fully lifted, hair and cloth trailing",
    "top pose with a tiny weight shift, returning toward the neutral stance"
  ],
  jump: [
    "anticipation crouch before takeoff",
    "forceful takeoff with the body extending upward",
    "airborne ascent approaching the apex",
    "apex pose followed by the beginning of descent",
    "descending pose preparing for ground contact",
    "landing compression absorbing the impact",
    "recovery pose rising back toward the starting stance"
  ],
  attack: [
    "anticipation pose winding up the attack",
    "early attack pose accelerating toward the target",
    "impact pose at the strongest point of the strike",
    "follow-through pose carrying the attack momentum",
    "recovery pose returning toward the starting stance"
  ],
  reload: [
    "ready stance with the weapon raised, beginning to lower it slightly",
    "weapon tilted down as the free hand reaches for the fresh magazine at the hip",
    "spent magazine dropping free while the fresh magazine comes up in the free hand",
    "fresh magazine being seated into the weapon with a firm push",
    "charging handle or slide being racked back with the free hand",
    "weapon raised back into the ready stance, both hands on the grip"
  ],
  hit: [
    "impact pose, head snapping back and shoulders jolting from the hit",
    "body pushed backward with arms flung slightly outward",
    "staggering step backward with the torso bent and weight on the rear foot",
    "catching balance, torso straightening while the front foot steps in",
    "recovery pose returning toward the ready stance"
  ],
  fall: [
    "losing balance with arms flailing and the torso tipping backward",
    "toppling backward as the feet begin to leave the ground",
    "body nearly horizontal in the air, arms spread",
    "hitting the ground on the back with legs still in the air",
    "bouncing slightly as the legs come down",
    "settling flat on the ground, arms out to the sides",
    "lying still flat on the back, the end pose"
  ],
  stun: [
    "dazed pose leaning left with the head lolling and eyes unfocused",
    "wobbling upright with knees bent and shoulders slumped",
    "dazed pose leaning right with the head lolling and eyes unfocused",
    "wobbling upright with knees bent, arms hanging loosely",
    "leaning left again a little less, head tilted",
    "swaying upright, weight shifting to the toes",
    "leaning right again a little less, head tilted",
    "swaying upright, weight settling back toward the heels"
  ],
  getup: [
    "lying flat on the back, the starting pose",
    "rolling onto one side and pushing up on one arm",
    "kneeling on one knee with a hand on the ground",
    "pushing up with both legs, torso still bent forward",
    "rising to standing with the torso straightening",
    "standing back in the ready stance, the end pose"
  ]
};

export type BuildSheetPromptInput = {
  description: string;
  cols: number;
  rows: number;
  frames?: string[];
  style?: string;
  hasReference?: boolean;
  action?: MotionActionPreset;
  subjectType?: SubjectType; // Defaults to character.
};

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

export function isCyclicAction(action: MotionActionPreset): boolean {
  return MOTION_ACTION_PRESETS[action].cyclic;
}

function buildPresetSequence(action: Exclude<MotionActionPreset, "custom">, frameCount: number): string {
  const phases = ACTION_PHASES[action];
  const isCyclic = isCyclicAction(action);
  let previousPhaseIndex = -1;
  const descriptions = Array.from({ length: frameCount }, (_, index) => {
    const phaseIndex = isCyclic
      ? Math.floor((index * phases.length) / frameCount)
      : frameCount === 1
        ? 0
        : Math.round((index * (phases.length - 1)) / (frameCount - 1));
    const next = isCyclic
      ? (phaseIndex + 1) % phases.length
      : Math.min(phaseIndex + 1, phases.length - 1);
    const description = phaseIndex === previousPhaseIndex
      ? `a pose halfway between (${phases[phaseIndex]}) and (${phases[next]})`
      : phases[phaseIndex];
    previousPhaseIndex = phaseIndex;
    return `${index + 1}. ${description}`;
  });
  const promptAction = action === "getup" ? "get-up" : action === "hit" ? "hit-reaction" : action;
  return `Render this ${frameCount}-frame ${promptAction} sequence in order: ${descriptions.join(" ")}`;
}

export function buildSheetPrompt(input: BuildSheetPromptInput): string {
  const description = input.description.trim();
  if (!description) {
    throw new TypeError("description must not be empty.");
  }
  requirePositiveInteger(input.cols, "cols");
  requirePositiveInteger(input.rows, "rows");
  const { hex, name } = keyColorForSubject(input.subjectType ?? "character");

  const frameCount = input.cols * input.rows;
  let sequence: string;
  if (input.frames) {
    if (input.frames.length !== frameCount) {
      throw new RangeError(`frames must contain exactly ${frameCount} descriptions.`);
    }
    const descriptions = input.frames.map((frame, index) => {
      const text = frame.trim();
      if (!text) {
        throw new TypeError(`frames[${index}] must not be empty.`);
      }
      return `${index + 1}. ${text}`;
    });
    sequence = `Render these ${frameCount} poses in order: ${descriptions.join(" ")}`;
  } else if (input.action && input.action !== "custom") {
    sequence = buildPresetSequence(input.action, frameCount);
  } else {
    sequence =
      `Render ${frameCount} consecutive frames of the described action in chronological order. ` +
      "The final frame must flow naturally back into the first frame as a seamless loop.";
  }
  if (input.frames || (input.action && isCyclicAction(input.action))) {
    sequence += " The final frame must flow naturally back into the first frame as a seamless loop.";
  } else if (input.action && input.action !== "custom") {
    sequence += " This is a one-shot action: the last frame is the settled end pose and must not return to the first frame.";
  }

  const style = input.style?.trim() || DEFAULT_STYLE;
  const directives = [
    `Create a ${input.cols} columns by ${input.rows} rows (${input.cols}x${input.rows}) sprite sheet for: ${description}`,
    `Style: ${style}.`,
    `Background: use a perfectly flat, solid chroma-key ${name} ${hex} across the entire canvas. ` +
      `Every gap between the legs, beneath the torso, and around the tail must also be filled with ${hex}. ` +
      `No gradients, shadows, texture, lighting variation, or anti-background decoration. The subject itself must contain no ${name}.`,
    `Layout: exactly ${input.cols}x${input.rows} equal cells with one complete subject per cell and the same scale in every cell. ` +
      "No grid lines, borders, labels, numbers, captions, or other text.",
    "Direction: the subject faces the RIGHT edge of the canvas in every cell of every row, including the second and later rows; nose, gaze, and leading foot all point right. Read the cells left-to-right, then top-to-bottom; row 2 continues the sequence facing the same way as row 1 (no snake order, no return trip). Do not mirror any row or any frame.",
    sequence,
    "Identity: show the exact same subject in every frame, preserving colors, proportions, and size; only the pose may change."
  ];
  if (input.hasReference) {
    directives.unshift(
      "첨부한 참조 이미지의 캐릭터를 그대로 유지하라 — 동일한 얼굴·헤어·의상·체형·색상. 새로운 인물을 만들지 마라."
    );
  }
  return directives.join("\n");
}
