import { NextResponse } from "next/server";
import { listAllImages } from "@/lib/local/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const items = await listAllImages();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "list failed" },
      { status: 500 }
    );
  }
}
