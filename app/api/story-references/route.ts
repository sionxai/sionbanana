import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { saveImageBuffer } from "@/lib/local/storage";
import { generateId } from "@/lib/utils";

export const runtime = "nodejs";

const DEFAULT_MIME = "image/jpeg";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const requestSchema = z
  .object({
    imageBase64: z.string().min(1),
    mime: z.string().min(1).max(80).optional()
  })
  .strict();

type ParsedImage = {
  buffer: Buffer;
  mime: string;
};

class StoryReferenceUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryReferenceUploadError";
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = requestSchema.parse(await request.json());
    const image = parseImagePayload(payload.imageBase64, payload.mime);

    if (image.buffer.byteLength > MAX_IMAGE_BYTES) {
      return jsonError("이미지는 10MB 이하만 업로드할 수 있습니다.", 400);
    }

    const id = generateId();
    await saveImageBuffer(id, image.buffer, image.mime);

    return NextResponse.json({
      ok: true,
      imageUrl: `/api/images/${id}`,
      id
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, reason: "유효하지 않은 입력입니다.", issues: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof StoryReferenceUploadError) {
      return jsonError(error.message, 400);
    }

    console.error("/api/story-references error", error);
    return jsonError("스토리 레퍼런스 이미지를 저장하지 못했습니다.", 500);
  }
}

function parseImagePayload(imageBase64: string, providedMime?: string): ParsedImage {
  const trimmed = imageBase64.trim();
  if (!trimmed) {
    throw new StoryReferenceUploadError("이미지 데이터가 비어 있습니다.");
  }

  if (trimmed.startsWith("data:")) {
    return parseDataUrl(trimmed, providedMime);
  }

  if (!providedMime?.trim()) {
    throw new StoryReferenceUploadError("pure base64 업로드에는 mime 값이 필요합니다.");
  }

  return {
    buffer: decodeBase64(trimmed),
    mime: normalizeMime(providedMime)
  };
}

function parseDataUrl(value: string, providedMime?: string): ParsedImage {
  const commaIndex = value.indexOf(",");
  if (commaIndex === -1) {
    throw new StoryReferenceUploadError("data URL 형식이 올바르지 않습니다.");
  }

  const header = value.slice(5, commaIndex);
  const data = value.slice(commaIndex + 1);
  const parts = header.split(";").filter(Boolean);
  const isBase64 = parts.some(part => part.toLowerCase() === "base64");
  if (!isBase64) {
    throw new StoryReferenceUploadError("data URL은 base64 인코딩이어야 합니다.");
  }

  const mime = parts.find(part => part.includes("/")) ?? providedMime ?? DEFAULT_MIME;
  return {
    buffer: decodeBase64(data),
    mime: normalizeMime(mime)
  };
}

function decodeBase64(value: string): Buffer {
  const normalized = value.replace(/\s/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new StoryReferenceUploadError("base64 이미지 데이터가 올바르지 않습니다.");
  }
  return Buffer.from(normalized, "base64");
}

function normalizeMime(value: string): string {
  const mime = value.trim().toLowerCase();
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
    throw new StoryReferenceUploadError("지원하지 않는 이미지 형식입니다.");
  }
  return mime;
}

function jsonError(reason: string, status: number): Response {
  return NextResponse.json({ ok: false, reason }, { status });
}
