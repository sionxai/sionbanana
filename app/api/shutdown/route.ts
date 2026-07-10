import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SHUTDOWN_DELAY_MS = 300;

function isAllowedOrigin(origin: string): boolean {
  try {
    const parsedOrigin = new URL(origin);
    return (
      parsedOrigin.protocol === "http:" &&
      (parsedOrigin.hostname === "localhost" || parsedOrigin.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== null && !isAllowedOrigin(origin)) {
    return NextResponse.json({ ok: false, reason: "forbidden origin" }, { status: 403 });
  }

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
