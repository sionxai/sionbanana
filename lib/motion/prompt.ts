const DEFAULT_STYLE = "detailed hand-painted 2D game asset, clean crisp silhouette";

export type BuildSheetPromptInput = {
  description: string;
  cols: number;
  rows: number;
  frames?: string[];
  style?: string;
};

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

export function buildSheetPrompt(input: BuildSheetPromptInput): string {
  const description = input.description.trim();
  if (!description) {
    throw new TypeError("description must not be empty.");
  }
  requirePositiveInteger(input.cols, "cols");
  requirePositiveInteger(input.rows, "rows");

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
  } else {
    sequence =
      `Render ${frameCount} consecutive frames of the described action in chronological order. ` +
      "The final frame must flow naturally back into the first frame as a seamless loop.";
  }
  if (input.frames) {
    sequence += " The final frame must flow naturally back into the first frame as a seamless loop.";
  }

  const style = input.style?.trim() || DEFAULT_STYLE;
  return [
    `Create a ${input.cols} columns by ${input.rows} rows (${input.cols}x${input.rows}) sprite sheet for: ${description}`,
    `Style: ${style}.`,
    `Background: use a perfectly flat, solid chroma-key magenta #FF00FF across the entire canvas. ` +
      "Every gap between the legs, beneath the torso, and around the tail must also be filled with #FF00FF. " +
      "No gradients, shadows, texture, lighting variation, or anti-background decoration. The subject itself must contain no magenta.",
    `Layout: exactly ${input.cols}x${input.rows} equal cells with one complete subject per cell and the same scale in every cell. ` +
      "No grid lines, borders, labels, numbers, captions, or other text.",
    "Direction: every frame must face the same direction, with the head pointing right. Do not mirror any row or any frame.",
    sequence,
    "Identity: show the exact same subject in every frame, preserving colors, proportions, and size; only the pose may change."
  ].join("\n");
}
