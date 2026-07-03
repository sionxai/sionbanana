import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SHUTDOWN_DELAY_MS = 300;

export async function POST() {
  const stopFlagDir = path.join(os.homedir(), "Library", "Application Support", "SionBanana");
  const stopFlagPath = path.join(stopFlagDir, "server-stopped");
  const stoppedAt = new Date().toISOString();

  try {
    await mkdir(stopFlagDir, { recursive: true });
    await writeFile(stopFlagPath, stoppedAt, "utf8");
  } catch (error) {
    console.error("[shutdown] failed to write stop flag", error);
    const reason = error instanceof Error ? error.message : "Failed to write stop flag";
    return NextResponse.json({ ok: false, reason }, { status: 500 });
  }

  setTimeout(() => {
    process.exit(0);
  }, SHUTDOWN_DELAY_MS);

  return NextResponse.json({ ok: true });
}
