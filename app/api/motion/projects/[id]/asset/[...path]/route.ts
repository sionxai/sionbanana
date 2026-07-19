import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";

import { readAssetFile } from "@/lib/motion/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssetRouteContext = { params: { id: string; path: string[] } };

export async function GET(
  _request: NextRequest,
  { params }: AssetRouteContext
): Promise<Response> {
  try {
    const result = await readAssetFile(params.id, params.path.join("/"));
    if (!result) {
      return NextResponse.json({ ok: false, reason: "Motion asset was not found." }, { status: 404 });
    }
    const webStream = Readable.toWeb(result.stream) as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Length": String(result.bytes),
        "Cache-Control": "private, max-age=0, must-revalidate"
      }
    });
  } catch (error) {
    console.error("/api/motion/projects/[id]/asset/[...path] GET error", error);
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Unable to read motion asset." },
      { status: 500 }
    );
  }
}
