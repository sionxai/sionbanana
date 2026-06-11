import { NextRequest, NextResponse } from "next/server";
import { listAllImages } from "@/lib/local/storage";

export const runtime = "nodejs";

function asPromptString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toPromptItems(diskItems: Awaited<ReturnType<typeof listAllImages>>) {
  return diskItems.map(({ metadata, ...item }) => ({
    ...item,
    promptMeta: {
      rawPrompt: asPromptString(metadata?.rawPrompt),
      refinedPrompt: asPromptString(metadata?.refinedPrompt)
    }
  }));
}

function parseLimit(value: string | null): number {
  if (!value) return 60;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 200) : 60;
}

function parseCursor(value: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function sortNewestFirst<T extends { createdAtIso: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.createdAtIso);
    const bTime = Date.parse(b.createdAtIso);
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
}

export async function GET(request: NextRequest) {
  try {
    const diskItems = await listAllImages({ includeMetadata: true });
    const hasPagination = request.nextUrl.searchParams.has("limit") || request.nextUrl.searchParams.has("cursor");
    if (!hasPagination) {
      return NextResponse.json({ ok: true, items: toPromptItems(diskItems) });
    }

    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const cursor = parseCursor(request.nextUrl.searchParams.get("cursor"));
    const sortedItems = sortNewestFirst(toPromptItems(diskItems));
    const items = sortedItems.slice(cursor, cursor + limit);
    const nextOffset = cursor + items.length;
    return NextResponse.json({
      ok: true,
      items,
      nextCursor: nextOffset < sortedItems.length ? String(nextOffset) : null,
      total: sortedItems.length
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "list failed" },
      { status: 500 }
    );
  }
}
