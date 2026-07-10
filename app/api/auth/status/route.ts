import { NextResponse } from "next/server";
import { getCodexAuthStatus, getWebCodexAuthFilePath } from "@/lib/codex-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const status = await getCodexAuthStatus();

  if (!status.authenticated) {
    return NextResponse.json({
      authenticated: false,
      webAuthPath: getWebCodexAuthFilePath(),
      error: status.error ?? null
    });
  }

  return NextResponse.json({
    authenticated: true,
    email: status.email ?? null,
    planType: status.planType ?? null,
    accountId: status.accountId ?? null,
    expiresAt: status.expiresAt ?? null,
    source: status.source ?? "codex-cli",
    webAuthPath: getWebCodexAuthFilePath()
  });
}
