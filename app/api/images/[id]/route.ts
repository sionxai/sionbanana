import { NextRequest, NextResponse } from "next/server";
import { readImageById, deleteImageById } from "@/lib/local/storage";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const result = await readImageById(params.id);
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

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const removed = await deleteImageById(params.id);
  return NextResponse.json({ ok: true, removed });
}
