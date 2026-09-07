import { Buffer } from "node:buffer";

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";

import { motionActionPresetValues } from "@/lib/motion/prompt";
import {
  createSet,
  listSets,
  spawnSetWorker,
  type MotionSetStorageError
} from "@/lib/motion/set-storage";
import {
  motionSetCommonSchema,
  motionSetOverridesSchema,
  type MotionSetMember
} from "@/lib/motion/set-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_DATA_URL_CHARS = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 128;

const memberInputSchema = z
  .object({
    action: z.enum(motionActionPresetValues),
    prompt: z.string().trim().max(4000).optional(),
    overrides: motionSetOverridesSchema.optional()
  })
  .strict()
  .superRefine((member, context) => {
    if (member.action === "custom" && !member.prompt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prompt"],
        message: "Custom motion members require a prompt."
      });
    }
  });

const createSetSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    base: z
      .object({
        description: z.string().trim().min(1).max(4000),
        style: z.string().trim().max(400).optional(),
        facing: z.enum(["right", "left"]).default("right"),
        allowMirror: z.boolean().default(true),
        subjectType: z.enum(["character", "object"]).default("character"),
        characterId: z.string().trim().max(200).optional(),
        referenceImage: z.string().min(1).max(MAX_DATA_URL_CHARS).optional()
      })
      .strict(),
    common: motionSetCommonSchema,
    members: z.array(memberInputSchema).min(1),
    start: z.boolean().default(true)
  })
  .strict()
  .superRefine((value, context) => {
    const actions = new Set<string>();
    for (const [index, member] of value.members.entries()) {
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

async function normalizeReferenceImage(dataUrl: string): Promise<Buffer> {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match || match[2].length === 0 || match[2].length % 4 !== 0) {
    throw new MotionSetRequestError(
      "base.referenceImage must be a base64 PNG or JPEG data URL.",
      400
    );
  }
  const input = Buffer.from(match[2], "base64");
  if (input.byteLength > MAX_UPLOAD_BYTES) {
    throw new MotionSetRequestError("Uploaded image exceeds the 20MB limit.", 413);
  }
  try {
    const metadata = await sharp(input).metadata();
    const expectedFormat = match[1] === "image/png" ? "png" : "jpeg";
    if (!metadata.width || !metadata.height || metadata.format !== expectedFormat) {
      throw new Error("Declared image type does not match the decoded image.");
    }
    return sharp(input).png().toBuffer();
  } catch (error) {
    throw new MotionSetRequestError(
      error instanceof Error ? `Invalid uploaded image: ${error.message}` : "Invalid uploaded image.",
      400
    );
  }
}

function assertFrameLimits(input: {
  common: { cols: number; rows: number };
  members: Array<{ overrides?: { cols?: number; rows?: number } }>;
}): void {
  for (const member of input.members) {
    const cols = member.overrides?.cols ?? input.common.cols;
    const rows = member.overrides?.rows ?? input.common.rows;
    if (cols * rows > 12) {
      throw new MotionSetRequestError("Generated sprite sheets support at most 12 frames.", 400);
    }
  }
}

export async function GET(): Promise<Response> {
  try {
    return NextResponse.json({ ok: true, sets: await listSets() });
  } catch (error) {
    return requestError(error, "/api/motion/sets GET error");
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const payload = createSetSchema.parse(await readRequestJson(request));
    assertFrameLimits(payload);
    const referencePng = payload.base.referenceImage
      ? await normalizeReferenceImage(payload.base.referenceImage)
      : undefined;
    const { referenceImage: _referenceImage, ...base } = payload.base;
    const members: MotionSetMember[] = payload.members.map(member => ({
      ...member,
      status: "pending",
      projectId: null,
      reason: null,
      startedAtIso: null,
      finishedAtIso: null
    }));
    const set = await createSet({
      name: payload.name,
      base,
      common: payload.common,
      members,
      referencePng
    });
    if (payload.start) {
      spawnSetWorker(set.id, request.nextUrl.origin);
    }
    return NextResponse.json({ ok: true, set }, { status: 201 });
  } catch (error) {
    return requestError(error, "/api/motion/sets POST error");
  }
}
