import { NextRequest } from "next/server";
import { Buffer } from "node:buffer";

export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set<string>([
  // 필요 시 외부 호스트 추가. 기본은 비어 있고, 로컬 라우트만 허용한다.
]);
const ALLOWED_CONTENT_PREFIXES = ["image/"];
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const remoteUrl = searchParams.get("url");
  const filename = searchParams.get("filename") ?? "download";

  if (!remoteUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  // 정책: 같은 origin의 /api/images/<id>만 허용. 외부 URL은 명시적 화이트리스트 필요.
  // 같은 origin이라면 클라이언트가 직접 접근 가능하므로 사실상 이 프록시는 거의 쓰이지 않는다.
  let parsed: URL;
  try {
    parsed = new URL(remoteUrl, request.nextUrl.origin);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  const sameOrigin = parsed.origin === request.nextUrl.origin;
  const isLocalRoute = sameOrigin && parsed.pathname.startsWith("/api/images/");
  const isAllowedHost = ALLOWED_HOSTS.has(parsed.host);

  if (!isLocalRoute && !isAllowedHost) {
    return new Response("Forbidden host", { status: 403 });
  }

  try {
    const response = await fetch(parsed.toString());
    if (!response.ok) {
      return new Response("Failed to fetch remote file", { status: response.status });
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!ALLOWED_CONTENT_PREFIXES.some(prefix => contentType.startsWith(prefix))) {
      return new Response("Unsupported content-type", { status: 415 });
    }

    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (declaredLength > MAX_BYTES) {
      return new Response("File too large", { status: 413 });
    }

    if (!response.body) {
      return new Response("Empty body", { status: 502 });
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > MAX_BYTES) {
          try { await reader.cancel(); } catch {}
          return new Response("File too large", { status: 413 });
        }
        chunks.push(value);
      }
    }
    const buffer = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error) {
    console.error("download proxy failed", error);
    return new Response("Failed to download file", { status: 500 });
  }
}
