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
export const candidateModeValues = ["mask", "strip", "upload"] as const;
export const candidateStatusValues = ["pending", "running", "ready", "failed"] as const;

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

export const frameOverrideSchema = z
  .object({
    candidateId: z.string().regex(/^[A-Za-z0-9-]+$/),
    mode: z.enum(candidateModeValues),
    appliedAtIso: z.string().datetime(),
    instruction: z.string().max(4000).nullable().default(null),
    fit: z
      .object({
        verdict: z.enum(["review"]),
        reasons: z.array(z.string()).min(1),
        lostPixels: z.number().int().nonnegative().default(0),
        touchesEdge: z.array(z.enum(["left", "right", "top", "bottom"])).default([])
      })
      .strict()
      .optional(),
    review: z
      .object({
        candidateId: z.string().regex(/^[A-Za-z0-9-]+$/),
        reasons: z.array(z.string().min(1)).min(1),
        recordedAtIso: z.string().datetime()
      })
      .strict()
      .optional()
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
    durationMs: z.number().int().positive().nullable().default(null),
    override: frameOverrideSchema.nullable().default(null)
  })
  .strict();

const candidateRelativePathSchema = z
  .string()
  .regex(/^(?:frames|masks)\/f[0-9]{2,}\.png$/, "Candidate file paths must be frame-relative PNG paths.");

export const candidateSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9-]+$/),
    projectId: z.string().regex(/^[A-Za-z0-9-]+$/),
    mode: z.enum(candidateModeValues),
    status: z.enum(candidateStatusValues),
    frames: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            file: candidateRelativePathSchema.nullable().default(null),
            mask: candidateRelativePathSchema.nullable().default(null)
          })
          .strict()
      )
      .min(1),
    instruction: z.string().max(4000).nullable().default(null),
    protect: z.array(z.string().trim().min(1).max(200)).default([]),
    cellAligned: z.boolean().default(false),
    requiresReview: z.boolean().default(false),
    reviewReasons: z.array(z.string().min(1)).default([]),
    baseline: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            overrideCandidateId: z.string().nullable()
          })
          .strict()
      )
      .default([]),
    reason: z.string().nullable().default(null),
    createdAtIso: z.string().datetime(),
    updatedAtIso: z.string().datetime(),
    appliedAtIso: z.string().datetime().nullable().default(null),
    metrics: z.record(z.unknown()).nullable().default(null)
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

export const mirrorDetectionSchema = z
  .object({
    enabled: z.boolean(),
    rows: z.array(
      z
        .object({
          mirrored: z.boolean(),
          score: z.number().finite()
        })
        .strict()
    )
  })
  .strict();

export const duplicateDetectionSchema = z
  .object({
    enabled: z.boolean(),
    rows: z.array(
      z
        .object({
          repeated: z.boolean(),
          ratio: z.number().finite()
        })
        .strict()
    ),
    excludedFrames: z.array(z.number().int().nonnegative())
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
    layoutValidated: z.boolean().nullable().default(null),
    normalizeScale: z.enum(normalizeScaleValues).default("area"),
    normalizePivotX: z.enum(normalizePivotXValues).default("centroid"),
    normalizePivotY: z.enum(normalizePivotYValues).default("preserve"),
    grid: gridSpecSchema,
    canvas: motionCanvasSchema,
    matte: matteSpecSchema,
    mirrorDetection: mirrorDetectionSchema.nullable().default(null),
    duplicateDetection: duplicateDetectionSchema.nullable().default(null),
    reviewApproval: z
      .object({
        approvedAtIso: z.string().datetime(),
        approvedReasons: z.array(z.string().min(1)),
        note: z.string().max(500).nullable().default(null)
      })
      .strict()
      .nullable()
      .default(null),
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
export type FrameOverride = z.infer<typeof frameOverrideSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type Animation = z.infer<typeof animationSchema>;
export type MirrorDetection = z.infer<typeof mirrorDetectionSchema>;
export type DuplicateDetection = z.infer<typeof duplicateDetectionSchema>;
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
  const layoutValidated =
    !Object.prototype.hasOwnProperty.call(project, "layoutValidated") ||
    project.layoutValidated === undefined
      ? null
      : project.layoutValidated;
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
  const mirrorDetection =
    !Object.prototype.hasOwnProperty.call(project, "mirrorDetection") ||
    project.mirrorDetection === undefined
      ? null
      : project.mirrorDetection;
  const duplicateDetection =
    !Object.prototype.hasOwnProperty.call(project, "duplicateDetection") ||
    project.duplicateDetection === undefined
      ? null
      : project.duplicateDetection;
  return motionProjectSchema.parse({
    ...project,
    sliceMode,
    sliceConfidence,
    layoutValidated,
    normalizeScale,
    normalizePivotX,
    normalizePivotY,
    mirrorDetection,
    duplicateDetection
  });
}

export function parseCandidate(input: unknown): Candidate {
  return candidateSchema.parse(input);
}
