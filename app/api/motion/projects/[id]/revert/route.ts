import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { MotionStorageError, revertFrameOverrides } from "@/lib/motion/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({ frames: z.array(z.number().int().nonnegative()).min(1).optional() }).strict();
type RouteContext = { params: { id: string } };

function errorResponse(error: unknown, context: string): Response {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, reason: error.issues[0]?.message ?? "Invalid request.", issues: error.issues },
      { status: 400 }
    );
  }
  if (error instanceof MotionStorageError) {
    return NextResponse.json({ ok: false, reason: error.message }, { status: error.status });
  }
  console.error(context, "Unexpected motion override revert failure");
  return NextResponse.json({ ok: false, reason: "Unable to revert motion overrides." }, { status: 500 });
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
    return NextResponse.json({ ok: true, project: await revertFrameOverrides(params.id, payload.frames) });
  } catch (error) {
    return errorResponse(error, "/api/motion/projects/[id]/revert POST error");
  }
}
