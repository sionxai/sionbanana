import { NextResponse } from "next/server";
import { deleteWebCodexAuth } from "@/lib/codex-oauth";

export const runtime = "nodejs";

export async function DELETE() {
  const removed = await deleteWebCodexAuth();
  return NextResponse.json({ ok: true, removed });
}
