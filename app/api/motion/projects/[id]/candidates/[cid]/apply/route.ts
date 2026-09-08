import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CandidateStorageError } from "@/lib/motion/candidates";
import { applyCandidateFrames, MotionStorageError } from "@/lib/motion/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z
  .object({
    frames: z.array(z.number().int().nonnegative()).min(1).optional(),
    force: z.boolean().optional(),
    allowContentLoss: z.boolean().optional(),
    intentionalEmptyFrames: z.array(z.number().int().nonnegative()).optional(),
    maxLostPixels: z.number().int().nonnegative().optional()
  })
  .strict();
type RouteContext = { params: { id: string; cid: string } };

function errorResponse(error: unknown, context: string): Response {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, reason: error.issues[0]?.message ?? "Invalid request.", issues: error.issues },
      { status: 400 }
    );
  }
  if (error instanceof CandidateStorageError || error instanceof MotionStorageError) {
    return NextResponse.json({ ok: false, reason: error.message, code: error.code }, { status: error.status });
  }
  console.error(context, "Unexpected motion candidate apply failure");
  return NextResponse.json({ ok: false, reason: "Unable to apply motion candidate." }, { status: 500 });
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json({ ok: false, reason: "Request body must be valid JSON." }, { status: 400 });
      }
      throw error;
    }
    const payload = payloadSchema.parse(input);
    return NextResponse.json({
      ok: true,
      project: await applyCandidateFrames(params.id, params.cid, payload.frames, {
        force: payload.force,
        allowContentLoss: payload.allowContentLoss,
        intentionalEmptyFrames: payload.intentionalEmptyFrames,
        maxLostPixels: payload.maxLostPixels
      })
    });
  } catch (error) {
    return errorResponse(error, "/api/motion/projects/[id]/candidates/[cid]/apply POST error");
  }
}
