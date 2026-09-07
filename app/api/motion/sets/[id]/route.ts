import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { motionActionPresetValues } from "@/lib/motion/prompt";
import {
  deleteSet,
  readSet,
  spawnSetWorker,
  updateSet,
  type MotionSetStorageError
} from "@/lib/motion/set-storage";
import {
  deriveSetStatus,
  motionSetOverridesSchema,
  type MotionSet,
  type MotionSetMember
} from "@/lib/motion/set-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const memberPatchSchema = z
  .object({
    action: z.enum(motionActionPresetValues),
    prompt: z.string().trim().max(4000).optional(),
    overrides: motionSetOverridesSchema.optional()
  })
  .strict();

const patchSetSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    members: z.array(memberPatchSchema).min(1).optional(),
    regenerate: z.array(z.enum(motionActionPresetValues)).min(1).optional(),
    start: z.boolean().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.name === undefined &&
      value.members === undefined &&
      value.regenerate === undefined &&
      value.start === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PATCH body must include at least one field."
      });
    }
    for (const [field, actions] of [
      ["members", value.members?.map(member => member.action)],
      ["regenerate", value.regenerate]
    ] as const) {
      const seen = new Set<string>();
      for (const [index, action] of (actions ?? []).entries()) {
        if (!seen.has(action)) {
          seen.add(action);
          continue;
        }
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field, index],
          message: `Duplicate motion action: ${action}.`
        });
      }
    }
  });

class MotionSetRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MotionSetRequestError";
    this.status = status;
  }
}

function requestError(error: unknown, context: string): Response {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, reason: error.issues[0]?.message ?? "Invalid request.", issues: error.issues },
      { status: 400 }
    );
  }
  if (
    error instanceof MotionSetRequestError ||
    (error instanceof Error && "status" in error && typeof (error as { status?: unknown }).status === "number")
  ) {
    return NextResponse.json(
      { ok: false, reason: error.message },
      { status: (error as MotionSetRequestError | MotionSetStorageError).status }
    );
  }
  console.error(context, error);
  return NextResponse.json(
    { ok: false, reason: error instanceof Error ? error.message : "Unknown motion set error." },
    { status: 500 }
  );
}

async function readRequestJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new MotionSetRequestError("Request body must be valid JSON.", 400);
    }
    throw error;
  }
}

function memberIndex(set: MotionSet, action: MotionSetMember["action"]): number {
  const index = set.members.findIndex(member => member.action === action);
  if (index === -1) {
    throw new MotionSetRequestError(`Motion action ${action} is not a member of this set.`, 400);
  }
  return index;
}

function assertEditable(member: MotionSetMember): void {
  if (member.status === "running") {
    throw new MotionSetRequestError("A running motion member cannot be changed.", 409);
  }
}

function assertFrameLimits(set: MotionSet): void {
  for (const member of set.members) {
    const cols = member.overrides?.cols ?? set.common.cols;
    const rows = member.overrides?.rows ?? set.common.rows;
    if (cols * rows > 12) {
      throw new MotionSetRequestError("Generated sprite sheets support at most 12 frames.", 400);
    }
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
): Promise<Response> {
  try {
    return NextResponse.json({ ok: true, set: await readSet(context.params.id) });
  } catch (error) {
    return requestError(error, "/api/motion/sets/[id] GET error");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
): Promise<Response> {
  try {
    const payload = patchSetSchema.parse(await readRequestJson(request));
    const set = await updateSet(context.params.id, current => {
      let members = current.members;
      if (payload.members) {
        members = [...members];
        for (const patch of payload.members) {
          const index = memberIndex({ ...current, members }, patch.action);
          const member = members[index];
          assertEditable(member);
          members[index] = {
            ...member,
            ...(Object.prototype.hasOwnProperty.call(patch, "prompt") ? { prompt: patch.prompt } : {}),
            ...(Object.prototype.hasOwnProperty.call(patch, "overrides")
              ? { overrides: patch.overrides }
              : {})
          };
        }
      }
      if (payload.regenerate) {
        members = [...members];
        for (const action of payload.regenerate) {
          const index = memberIndex({ ...current, members }, action);
          const member = members[index];
          assertEditable(member);
          members[index] = {
            ...member,
            status: "pending",
            projectId: null,
            reason: null,
            startedAtIso: null,
            finishedAtIso: null
          };
        }
      }
      const next = {
        ...current,
        ...(payload.name === undefined ? {} : { name: payload.name }),
        members,
        status: deriveSetStatus(members)
      };
      assertFrameLimits(next);
      return next;
    });
    if (
      payload.start === true &&
      set.members.some(member => member.status === "pending") &&
      !set.members.some(member => member.status === "running")
    ) {
      spawnSetWorker(set.id, request.nextUrl.origin);
    }
    return NextResponse.json({ ok: true, set });
  } catch (error) {
    return requestError(error, "/api/motion/sets/[id] PATCH error");
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: { id: string } }
): Promise<Response> {
  try {
    await deleteSet(context.params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return requestError(error, "/api/motion/sets/[id] DELETE error");
  }
}
