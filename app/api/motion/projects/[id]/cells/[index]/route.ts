import { NextRequest, NextResponse } from "next/server";

import { MotionStorageError, readOrientedCell } from "@/lib/motion/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string; index: string } };

function parseIndex(value: string): number | null {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return null;
  const index = Number(value);
  return Number.isSafeInteger(index) ? index : null;
}

export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  const index = parseIndex(params.index);
  if (index === null) {
    return NextResponse.json({ ok: false, reason: "Motion frame was not found." }, { status: 404 });
  }
  try {
    const cell = await readOrientedCell(params.id, index);
    return new Response(new Uint8Array(cell.buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Cell-Trim": `${cell.trim.x},${cell.trim.y},${cell.trim.w},${cell.trim.h}`,
        "X-Cell-Pivot": `${cell.pivot.x},${cell.pivot.y}`
      }
    });
  } catch (error) {
    if (error instanceof MotionStorageError) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: error.status });
    }
    console.error("/api/motion/projects/[id]/cells/[index] GET error", "Unexpected motion cell failure");
    return NextResponse.json({ ok: false, reason: "Unable to read motion cell." }, { status: 500 });
  }
}
