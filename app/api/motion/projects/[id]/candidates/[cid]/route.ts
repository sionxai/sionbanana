import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CandidateStorageError, deleteCandidate, readCandidate } from "@/lib/motion/candidates";
import { MotionStorageError } from "@/lib/motion/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string; cid: string } };

function errorResponse(error: unknown, context: string): Response {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, reason: error.issues[0]?.message ?? "Invalid request.", issues: error.issues },
      { status: 400 }
    );
  }
  if (error instanceof CandidateStorageError || error instanceof MotionStorageError) {
    return NextResponse.json({ ok: false, reason: error.message }, { status: error.status });
  }
  console.error(context, "Unexpected motion candidate failure");
  return NextResponse.json({ ok: false, reason: "Unable to process motion candidate." }, { status: 500 });
}

export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    return NextResponse.json({ ok: true, candidate: await readCandidate(params.id, params.cid) });
  } catch (error) {
    return errorResponse(error, "/api/motion/projects/[id]/candidates/[cid] GET error");
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    await deleteCandidate(params.id, params.cid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "/api/motion/projects/[id]/candidates/[cid] DELETE error");
  }
}
