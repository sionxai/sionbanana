import { z } from "zod";

import { motionActionPresetValues } from "@/lib/motion/prompt";
import { animationLoopValues } from "@/lib/motion/types";

export const motionSetFacingValues = ["right", "left"] as const;
export const motionSetMemberStatusValues = ["pending", "running", "ready", "failed"] as const;
export const motionSetStatusValues = ["pending", "running", "ready", "partial", "failed"] as const;

const motionSetActionSchema = z.enum(motionActionPresetValues);
const motionSetGridValueSchema = z.number().int().min(1).max(8);
const motionSetFpsSchema = z.number().int().min(1).max(60);

export const motionSetBaseSchema = z
  .object({
    description: z.string().trim().min(1).max(4000),
    style: z.string().trim().max(400).optional(),
    facing: z.enum(motionSetFacingValues).default("right"),
    allowMirror: z.boolean().default(true),
    subjectType: z.enum(["character", "object"]).default("character"),
    hasReference: z.boolean().default(false),
    characterId: z.string().trim().max(200).optional()
  })
  .strict();

export const motionSetCommonSchema = z
  .object({
    cols: motionSetGridValueSchema,
    rows: motionSetGridValueSchema,
    fps: motionSetFpsSchema.default(12)
  })
  .strict();

export const motionSetOverridesSchema = z
  .object({
    cols: motionSetGridValueSchema.optional(),
    rows: motionSetGridValueSchema.optional(),
    fps: motionSetFpsSchema.optional(),
    loop: z.enum(animationLoopValues).optional()
  })
  .strict();

const motionSetMemberObjectSchema = z
  .object({
    action: motionSetActionSchema,
    prompt: z.string().trim().max(4000).optional(),
    overrides: motionSetOverridesSchema.optional(),
    status: z.enum(motionSetMemberStatusValues).default("pending"),
    projectId: z.string().nullable().default(null),
    reason: z.string().nullable().default(null),
    startedAtIso: z.string().datetime().nullable().default(null),
    finishedAtIso: z.string().datetime().nullable().default(null)
  })
  .strict();

export const motionSetMemberSchema = motionSetMemberObjectSchema.superRefine((member, context) => {
  if (member.action === "custom" && !member.prompt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["prompt"],
      message: "Custom motion members require a prompt."
    });
  }
});

export const motionSetSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9-]+$/),
    name: z.string().trim().min(1).max(200),
    createdAtIso: z.string().datetime(),
    updatedAtIso: z.string().datetime(),
    base: motionSetBaseSchema,
    common: motionSetCommonSchema,
    members: z.array(motionSetMemberSchema).min(1),
    status: z.enum(motionSetStatusValues).default("pending")
  })
  .strict()
  .superRefine((set, context) => {
    const actions = new Set<string>();
    for (const [index, member] of set.members.entries()) {
      if (actions.has(member.action)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["members", index, "action"],
          message: `Duplicate motion action: ${member.action}.`
        });
      }
      actions.add(member.action);
    }
  });

export type MotionSetBase = z.infer<typeof motionSetBaseSchema>;
export type MotionSetCommon = z.infer<typeof motionSetCommonSchema>;
export type MotionSetOverrides = z.infer<typeof motionSetOverridesSchema>;
export type MotionSetMember = z.infer<typeof motionSetMemberSchema>;
export type MotionSet = z.infer<typeof motionSetSchema>;

export function parseMotionSet(input: unknown): MotionSet {
  return motionSetSchema.parse(input);
}

export function deriveSetStatus(members: readonly MotionSetMember[]): MotionSet["status"] {
  if (members.every(member => member.status === "ready")) return "ready";
  if (members.some(member => member.status === "running")) return "running";
  if (members.every(member => member.status === "pending")) return "pending";
  if (members.every(member => member.status === "failed")) return "failed";
  if (
    members.every(member => member.status === "ready" || member.status === "failed") &&
    members.some(member => member.status === "ready") &&
    members.some(member => member.status === "failed")
  ) {
    return "partial";
  }
  return "pending";
}
