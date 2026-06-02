import { NextResponse } from "next/server";
import { listVideos } from "@/lib/local/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const videos = await listVideos();
    return NextResponse.json({ ok: true, videos });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "list failed" },
      { status: 500 }
    );
  }
}
