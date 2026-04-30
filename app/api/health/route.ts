import { NextResponse } from "next/server";
import { getCodexAuthStatus } from "@/lib/codex-oauth";
import { DEFAULT_TEXT_MODEL, DEFAULT_IMAGE_MODEL } from "@/lib/codex-fetch";

export async function GET() {
  const codex = await getCodexAuthStatus();

  return NextResponse.json({
    ok: true,
    version: process.env.npm_package_version ?? "0.0.0",
    codex: {
      authenticated: codex.authenticated,
      filePath: codex.filePath ?? null,
      accountId: codex.accountId ?? null,
      expiresAt: codex.expiresAt ?? null,
      error: codex.error ?? null
    },
    defaults: {
      textModel: DEFAULT_TEXT_MODEL,
      imageModel: DEFAULT_IMAGE_MODEL
    }
  });
}
