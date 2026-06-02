import { Buffer } from "node:buffer";
import type { ReadStream } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_GROK_VIDEO_DURATION,
  DEFAULT_GROK_VIDEO_MODEL,
  DEFAULT_GROK_VIDEO_RESOLUTION,
  generateGrokVideo,
  GrokVideoError
} from "@/lib/grok-video";
import { readImageById, saveVideoBuffer, saveVideoMetadata } from "@/lib/local/storage";
import { generateId } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;

const requestSchema = z
  .object({
    sourceImageId: z.string().min(1).max(160).regex(/^[A-Za-z0-9_\-]+$/),
    prompt: z.string().min(1, "프롬프트를 입력해주세요.").max(8000),
    duration: z.number().int().positive().max(30).optional(),
    resolution: z.string().min(1).max(32).optional(),
    aspectRatio: z.string().min(1).max(32).regex(/^[A-Za-z0-9:_\-]+$/).optional(),
    model: z.string().min(1).max(80).regex(/^[A-Za-z0-9_.:\-]+$/).optional()
  })
  .strict();

type VideoPayload = z.infer<typeof requestSchema>;

class VideoSourceImageError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "VideoSourceImageError";
    this.status = status;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const payload = requestSchema.parse(await request.json());
    const result = await executeVideoGeneration(request, payload);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const result = videoErrorResult(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}

async function executeVideoGeneration(request: NextRequest, payload: VideoPayload): Promise<Record<string, unknown>> {
  const sourceImage = await readLocalImageAsDataUri(payload.sourceImageId);
  const generated = await generateGrokVideo({
    sourceImageDataUri: sourceImage.dataUri,
    prompt: payload.prompt,
    duration: payload.duration,
    resolution: payload.resolution,
    aspectRatio: payload.aspectRatio,
    model: payload.model,
    proxyUrl: process.env.SIONBANANA_GROK_PROXY,
    signal: request.signal
  });

  const id = generateId();
  const saved = await saveVideoBuffer(id, generated.videoBuffer);
  const createdAtIso = new Date().toISOString();
  const requestId = generated.requestId;
  const model = generated.model || payload.model || DEFAULT_GROK_VIDEO_MODEL;
  const duration = generated.duration || payload.duration || DEFAULT_GROK_VIDEO_DURATION;
  const resolution = generated.resolution || payload.resolution || DEFAULT_GROK_VIDEO_RESOLUTION;
  const aspectRatio = generated.aspectRatio || payload.aspectRatio || null;

  await saveVideoMetadata(
    id,
    {
      sourceImageId: payload.sourceImageId,
      prompt: payload.prompt,
      model,
      duration,
      resolution,
      aspectRatio: aspectRatio ?? undefined,
      requestId,
      createdAtIso,
      bytes: saved.bytes
    },
    getBucketFromRelativePath(saved.relativePath)
  );

  return {
    ok: true,
    id,
    videoUrl: `/api/videos/${id}`,
    storagePath: saved.relativePath,
    requestId,
    sourceImageId: payload.sourceImageId,
    model,
    duration,
    resolution,
    aspectRatio,
    createdAtIso,
    contentType: generated.contentType,
    bytes: saved.bytes,
    sourceImage: {
      mimeType: sourceImage.mimeType,
      bytes: sourceImage.bytes
    },
    usage: generated.usage ?? null
  };
}

function getBucketFromRelativePath(relativePath: string): string {
  const [bucket] = relativePath.split(/[\\/]/);
  if (!bucket) {
    throw new Error("Invalid video storage path");
  }
  return bucket;
}

async function readLocalImageAsDataUri(id: string): Promise<{ dataUri: string; mimeType: string; bytes: number }> {
  const result = await readImageById(id);
  if (!result) {
    throw new VideoSourceImageError(`sourceImageId에 해당하는 로컬 이미지를 찾지 못했습니다: ${id}`, 404);
  }
  if (!isAllowedImageMime(result.mimeType)) {
    throw new VideoSourceImageError(`지원하지 않는 이미지 MIME 타입입니다: ${result.mimeType}`);
  }
  if (result.bytes > MAX_SOURCE_IMAGE_BYTES) {
    throw new VideoSourceImageError("소스 이미지가 25MB 제한을 초과했습니다.");
  }

  const buffer = await streamToBuffer(result.stream, MAX_SOURCE_IMAGE_BYTES);
  return {
    dataUri: `data:${result.mimeType};base64,${buffer.toString("base64")}`,
    mimeType: result.mimeType,
    bytes: buffer.byteLength
  };
}

function streamToBuffer(stream: ReadStream, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    stream.on("data", (chunk: string | Buffer) => {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += buffer.byteLength;
      if (total > maxBytes) {
        stream.destroy(new Error("소스 이미지가 25MB 제한을 초과했습니다."));
        return;
      }
      chunks.push(buffer);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks, total)));
    stream.on("error", error => reject(error));
  });
}

function isAllowedImageMime(mimeType: string): boolean {
  return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp";
}

function videoErrorResult(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { ok: false, reason: "유효하지 않은 입력입니다.", issues: error.issues }
    };
  }
  if (error instanceof VideoSourceImageError) {
    return {
      status: error.status,
      body: { ok: false, reason: error.message }
    };
  }
  if (error instanceof GrokVideoError) {
    return {
      status: error.status,
      body: { ok: false, reason: error.message, code: error.code }
    };
  }

  console.error("/api/video error", error);
  return {
    status: 500,
    body: {
      ok: false,
      reason: error instanceof Error ? error.message : "알 수 없는 오류"
    }
  };
}
