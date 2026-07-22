import { keyColorForSubject, type SubjectType } from "@/lib/motion/matte-color";

const DEFAULT_STYLE = "detailed hand-painted 2D game asset, clean crisp silhouette";

export type MotionActionPreset = "walk" | "run" | "idle" | "jump" | "attack" | "custom";

const ACTION_PHASES: Record<Exclude<MotionActionPreset, "custom">, readonly string[]> = {
  walk: [
    "contact pose with the leading heel touching down and the trailing toe extended",
    "down pose as the body absorbs weight over the leading foot",
    "passing pose with the rear foot moving past the planted leg",
    "up pose with the body lifted and the next heel reaching forward"
  ],
  run: [
    "run contact pose with one foot landing ahead of the body",
    "compression pose as the landing leg absorbs the impact",
    "passing pose as the free leg drives forward beneath the body",
    "airborne pose with both feet clear of the ground"
  ],
  idle: [
    "neutral idle pose at the top of a gentle breath",
    "subtle settling pose as the torso begins to lower",
    "lowest breathing pose with relaxed secondary motion",
    "subtle rising pose returning toward neutral"
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

function buildPresetSequence(action: Exclude<MotionActionPreset, "custom">, frameCount: number): string {
  const phases = ACTION_PHASES[action];
  const isCyclic = action === "walk" || action === "run" || action === "idle";
  const descriptions = Array.from({ length: frameCount }, (_, index) => {
    const phaseIndex = isCyclic
      ? index % phases.length
      : frameCount === 1
        ? 0
        : Math.round((index * (phases.length - 1)) / (frameCount - 1));
    return `${index + 1}. ${phases[phaseIndex]}`;
  });
  return `Render this ${frameCount}-frame ${action} sequence in order: ${descriptions.join(" ")}`;
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
  if (input.frames || (input.action && input.action !== "custom")) {
    sequence += " The final frame must flow naturally back into the first frame as a seamless loop.";
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
    "Direction: every frame must face the same direction, with the head pointing right. Do not mirror any row or any frame.",
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
