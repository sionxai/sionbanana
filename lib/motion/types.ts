import { z } from "zod";

// Coordinate convention: the origin is the top-left and y increases downward.
// `source` uses source-sheet coordinates. `trim` and `pivot` use normalized-canvas coordinates.

export const remainderPolicyValues = ["distribute", "crop"] as const;
export const matteModeValues = ["none", "keyColor", "edgeFlood"] as const;
export const animationLoopValues = ["loop", "pingpong", "once"] as const;
export const sliceModeValues = ["auto", "grid"] as const;
export const normalizeScaleValues = ["none", "height", "area"] as const;
export const normalizePivotXValues = ["foot", "centroid"] as const;
export const normalizePivotYValues = ["pin", "preserve"] as const;

const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;

export const frameRectSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    w: z.number().int().nonnegative(),
    h: z.number().int().nonnegative()
  })
  .strict();

export const pivotSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite()
  })
  .strict();

export const gridSpecSchema = z
  .object({
    cols: z.number().int().min(1),
    rows: z.number().int().min(1),
    gutter: z.number().int().nonnegative().default(0),
    remainderPolicy: z.enum(remainderPolicyValues).default("distribute")
  })
  .strict();

export const matteSpecSchema = z
  .object({
    mode: z.enum(matteModeValues),
    keyColor: z
      .string()
      .regex(hexColorPattern, "keyColor must use #RRGGBB format.")
      .optional(),
    tolerance: z.number().int().min(0).max(100).default(45),
    softness: z.number().int().min(0).max(10).default(2),
    despill: z.boolean().default(true),
    choke: z.number().int().min(0).max(5).default(1)
  })
  .strict();

export const frameSchema = z
  .object({
    index: z.number().int().nonnegative(),
    source: frameRectSchema,
    trim: frameRectSchema,
    pivot: pivotSchema,
    appliedScale: z.number().finite().positive().default(1),
    flipX: z.boolean().default(false),
    excluded: z.boolean().default(false),
    durationMs: z.number().int().positive().nullable().default(null)
  })
  .strict();

export const animationSchema = z
  .object({
    name: z.string().trim().min(1),
    frameIndices: z.array(z.number().int().nonnegative()),
    fps: z.number().int().positive().default(12),
    loop: z.enum(animationLoopValues).default("loop")
  })
  .strict();

export const sourceImageSchema = z
  .object({
    path: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive()
  })
  .strict();

export const motionCanvasSchema = z
  .object({
    w: z.number().int().positive(),
    h: z.number().int().positive()
  })
  .strict();

export const motionProjectSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    createdAtIso: z.string().datetime(),
    sourceImage: sourceImageSchema,
    sliceMode: z.enum(sliceModeValues),
    sliceConfidence: z.number().finite().min(0).max(1).default(1),
    normalizeScale: z.enum(normalizeScaleValues).default("area"),
    normalizePivotX: z.enum(normalizePivotXValues).default("centroid"),
    normalizePivotY: z.enum(normalizePivotYValues).default("preserve"),
    grid: gridSpecSchema,
    canvas: motionCanvasSchema,
    matte: matteSpecSchema,
    frames: z.array(frameSchema),
    animations: z.array(animationSchema)
  })
  .strict();

export type RemainderPolicy = z.infer<typeof gridSpecSchema>["remainderPolicy"];
export type GridSpec = z.infer<typeof gridSpecSchema>;
export type FrameRect = z.infer<typeof frameRectSchema>;
export type Pivot = z.infer<typeof pivotSchema>;
export type MatteSpec = z.infer<typeof matteSpecSchema>;
export type Frame = z.infer<typeof frameSchema>;
export type Animation = z.infer<typeof animationSchema>;
export type MotionProject = z.infer<typeof motionProjectSchema>;
export type SliceMode = z.infer<typeof motionProjectSchema>["sliceMode"];
export type NormalizeScale = z.infer<typeof motionProjectSchema>["normalizeScale"];
export type NormalizePivotX = z.infer<typeof motionProjectSchema>["normalizePivotX"];
export type NormalizePivotY = z.infer<typeof motionProjectSchema>["normalizePivotY"];

export function parseMotionProject(input: unknown): MotionProject {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return motionProjectSchema.parse(input);
  }
  const project = input as Record<string, unknown>;
  const sliceMode =
    !Object.prototype.hasOwnProperty.call(project, "sliceMode") || project.sliceMode === undefined
      ? "grid"
      : project.sliceMode;
  const sliceConfidence =
    !Object.prototype.hasOwnProperty.call(project, "sliceConfidence") ||
    project.sliceConfidence === undefined
      ? 1
      : project.sliceConfidence;
  const normalizeScale =
    !Object.prototype.hasOwnProperty.call(project, "normalizeScale") ||
    project.normalizeScale === undefined
      ? "none"
      : project.normalizeScale;
  const normalizePivotX =
    !Object.prototype.hasOwnProperty.call(project, "normalizePivotX") ||
    project.normalizePivotX === undefined
      ? "foot"
      : project.normalizePivotX;
  const normalizePivotY =
    !Object.prototype.hasOwnProperty.call(project, "normalizePivotY") ||
    project.normalizePivotY === undefined
      ? "pin"
      : project.normalizePivotY;
  return motionProjectSchema.parse({
    ...project,
    sliceMode,
    sliceConfidence,
    normalizeScale,
    normalizePivotX,
    normalizePivotY
  });
}
