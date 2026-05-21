import { NextResponse } from "next/server";
import { listAllImages } from "@/lib/local/storage";

export const runtime = "nodejs";

function asPromptString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function GET() {
  try {
    const diskItems = await listAllImages({ includeMetadata: true });
    const items = diskItems.map(({ metadata, ...item }) => ({
      ...item,
      promptMeta: {
        rawPrompt: asPromptString(metadata?.rawPrompt),
        refinedPrompt: asPromptString(metadata?.refinedPrompt)
      }
    }));
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "list failed" },
      { status: 500 }
    );
  }
}
