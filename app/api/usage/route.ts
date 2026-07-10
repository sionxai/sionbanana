import { NextResponse } from "next/server";
import {
  fetchCodexUsage,
  CodexResponseError,
  DEFAULT_TEXT_MODEL,
  DEFAULT_IMAGE_MODEL
} from "@/lib/codex-fetch";
import { CodexAuthError } from "@/lib/codex-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const usage = await fetchCodexUsage();
    return NextResponse.json(
      {
        ok: true,
        usage,
        models: { text: DEFAULT_TEXT_MODEL, image: DEFAULT_IMAGE_MODEL }
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof CodexAuthError) {
      return NextResponse.json(
        { ok: false, reason: error.message, code: error.code },
        { status: 401 }
      );
    }
    if (error instanceof CodexResponseError) {
      return NextResponse.json(
        { ok: false, reason: `Codex 사용량 조회 실패 (${error.status})` },
        { status: error.status === 401 ? 401 : 502 }
      );
    }
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}
