import { NextRequest } from "next/server";
import { Readable } from "node:stream";
import { readVideoById } from "@/lib/local/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const result = await readVideoById(params.id);
  if (!result) {
    return new Response("Not found", { status: 404 });
  }

  const webStream = Readable.toWeb(result.stream) as ReadableStream;
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": result.mimeType,
      "Content-Length": String(result.bytes),
      "Cache-Control": "private, max-age=31536000, immutable"
    }
  });
}
