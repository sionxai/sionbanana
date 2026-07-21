import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  deleteProject,
  MotionStorageError,
  readProject,
  rebuildProject
} from "@/lib/motion/storage";
import {
  animationSchema,
  frameSchema,
  gridSpecSchema,
  matteSpecSchema,
  normalizePivotXValues,
  normalizePivotYValues,
  normalizeScaleValues,
  sliceModeValues
} from "@/lib/motion/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProjectRouteContext = { params: { id: string } };

class InvalidRequestJsonError extends Error {}

const patchSchema = z
  .object({
    sliceMode: z.enum(sliceModeValues).optional(),
    normalizeScale: z.enum(normalizeScaleValues).optional(),
    normalizePivotX: z.enum(normalizePivotXValues).optional(),
    normalizePivotY: z.enum(normalizePivotYValues).optional(),
    grid: gridSpecSchema.optional(),
    matte: matteSpecSchema.optional(),
    frames: z.array(frameSchema).optional(),
    animations: z.array(animationSchema).optional()
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, "At least one patch field is required.");

function errorResponse(error: unknown, context: string): Response {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, reason: error.issues[0]?.message ?? "Invalid request.", issues: error.issues },
      { status: 400 }
    );
  }
  if (error instanceof InvalidRequestJsonError) {
    return NextResponse.json({ ok: false, reason: "Request body must be valid JSON." }, { status: 400 });
  }
  if (error instanceof MotionStorageError) {
    return NextResponse.json({ ok: false, reason: error.message }, { status: error.status });
  }
  console.error(context, error);
  return NextResponse.json(
    { ok: false, reason: error instanceof Error ? error.message : "Unknown motion project error." },
    { status: 500 }
  );
}

async function readRequestJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw new InvalidRequestJsonError();
    throw error;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: ProjectRouteContext
): Promise<Response> {
  try {
    return NextResponse.json({ ok: true, project: await readProject(params.id) });
  } catch (error) {
    return errorResponse(error, "/api/motion/projects/[id] GET error");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: ProjectRouteContext
): Promise<Response> {
  try {
    const patch = patchSchema.parse(await readRequestJson(request));
    return NextResponse.json({ ok: true, project: await rebuildProject(params.id, patch) });
  } catch (error) {
    return errorResponse(error, "/api/motion/projects/[id] PATCH error");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: ProjectRouteContext
): Promise<Response> {
  try {
    await deleteProject(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "/api/motion/projects/[id] DELETE error");
  }
}
