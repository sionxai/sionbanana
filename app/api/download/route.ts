import { NextRequest } from "next/server";
import { Buffer } from "node:buffer";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const remoteUrl = searchParams.get("url");
  const filename = searchParams.get("filename") ?? "download";

  if (!remoteUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  try {
    const response = await fetch(remoteUrl);
    if (!response.ok) {
      return new Response("Failed to fetch remote file", { status: response.status });
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error) {
    console.error("download proxy failed", error);
    return new Response("Failed to download file", { status: 500 });
  }
}
