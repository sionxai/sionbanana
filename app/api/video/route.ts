import { Buffer } from "node:buffer";
import type { ReadStream } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_GROK_VIDEO_DURATION,
  DEFAULT_GROK_VIDEO_RESOLUTION,
  generateGrokVideo,
  GrokVideoError,
  maxDurationForGrokVideoModel,
  resolveDefaultGrokVideoModel,
  supportsFrameReferences
} from "@/lib/grok-video";
import { listVideos, readImageById, saveVideoBuffer, saveVideoMetadata } from "@/lib/local/storage";
import { generateId } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
const imageIdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9_\-]+$/);

const requestSchema = z
  .object({
    sourceImageId: imageIdSchema.optional(),
    lastFrameImageId: imageIdSchema.optional(),
    referenceImageIds: z.array(imageIdSchema).min(1).max(3).optional(),
    prompt: z.string().min(1, "프롬프트를 입력해주세요.").max(8000),
    duration: z.number().int().positive().max(30).optional(),
    resolution: z.string().min(1).max(32).optional(),
    aspectRatio: z.string().min(1).max(32).regex(/^[A-Za-z0-9:_\-]+$/).optional(),
    model: z.string().min(1).max(80).regex(/^[A-Za-z0-9_.:\-]+$/).optional()
  })
  .strict()
  .superRefine((payload, issueContext) => {
    if (!payload.sourceImageId && !payload.referenceImageIds) {
      issueContext.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sourceImageId 또는 referenceImageIds 중 하나는 필요합니다."
      });
    }
  });

type VideoPayload = z.infer<typeof requestSchema>;

class VideoSourceImageError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "VideoSourceImageError";
    this.status = status;
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { limit } = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50)
    }).strict().parse(Object.fromEntries(request.nextUrl.searchParams));
    const videos = (await listVideos())
      .sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso))
      .slice(0, limit)
      .map(video => ({
        id: video.id,
        createdAtIso: video.createdAtIso,
        prompt: video.prompt?.slice(0, 120) ?? "",
        model: video.model ?? null,
        duration: video.duration ?? null,
        resolution: video.resolution ?? null,
        aspectRatio: video.aspectRatio ?? null,
        videoUrl: video.videoUrl
      }));
    return NextResponse.json({ ok: true, videos });
  } catch (error) {
    const result = videoErrorResult(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const payload = requestSchema.parse(await request.json());
    const model = payload.model?.trim() || resolveDefaultGrokVideoModel();
    const maxDuration = maxDurationForGrokVideoModel(model);
    if (payload.duration !== undefined && payload.duration > maxDuration) {
      return NextResponse.json(
        {
          ok: false,
          reason: `${model} supports videos up to ${maxDuration} seconds; requested ${payload.duration}.`
        },
        { status: 400 }
      );
    }
    if ((payload.lastFrameImageId || payload.referenceImageIds) && !supportsFrameReferences(model)) {
      return NextResponse.json(
        {
          ok: false,
          reason: `${model} does not support last_frame or reference_images; use a grok-imagine-video-1.5 model.`
        },
        { status: 400 }
      );
    }
    const result = await executeVideoGeneration(request, payload, model);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const result = videoErrorResult(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}

async function executeVideoGeneration(
  request: NextRequest,
  payload: VideoPayload,
  model: string
): Promise<Record<string, unknown>> {
  const sourceImage = payload.sourceImageId
    ? await readLocalImageAsDataUri(payload.sourceImageId)
    : undefined;
  const lastFrameImage = payload.lastFrameImageId
    ? await readLocalImageAsDataUri(payload.lastFrameImageId)
    : undefined;
  const referenceImages = payload.referenceImageIds
    ? await Promise.all(payload.referenceImageIds.map(id => readLocalImageAsDataUri(id)))
    : undefined;
  const generated = await generateGrokVideo({
    sourceImageDataUri: sourceImage?.dataUri,
    lastFrameDataUri: lastFrameImage?.dataUri,
    referenceImageDataUris: referenceImages?.map(image => image.dataUri),
    prompt: payload.prompt,
    duration: payload.duration,
    resolution: payload.resolution,
    aspectRatio: payload.aspectRatio,
    model,
    proxyUrl: process.env.SIONBANANA_GROK_PROXY,
    signal: request.signal
  });

  const id = generateId();
  const saved = await saveVideoBuffer(id, generated.videoBuffer);
  const createdAtIso = new Date().toISOString();
  const requestId = generated.requestId;
  const responseModel = generated.model || model;
  const duration = generated.duration || payload.duration || DEFAULT_GROK_VIDEO_DURATION;
  const resolution = generated.resolution || payload.resolution || DEFAULT_GROK_VIDEO_RESOLUTION;
  const aspectRatio = generated.aspectRatio || payload.aspectRatio || null;

  await saveVideoMetadata(
    id,
    {
      ...(payload.sourceImageId ? { sourceImageId: payload.sourceImageId } : {}),
      ...(payload.lastFrameImageId ? { lastFrameImageId: payload.lastFrameImageId } : {}),
      ...(payload.referenceImageIds ? { referenceImageIds: payload.referenceImageIds } : {}),
      prompt: payload.prompt,
      model: responseModel,
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
    ...(payload.sourceImageId ? { sourceImageId: payload.sourceImageId } : {}),
    ...(payload.lastFrameImageId ? { lastFrameImageId: payload.lastFrameImageId } : {}),
    ...(payload.referenceImageIds ? { referenceImageIds: payload.referenceImageIds } : {}),
    model: responseModel,
    duration,
    resolution,
    aspectRatio,
    createdAtIso,
    contentType: generated.contentType,
    bytes: saved.bytes,
    ...(sourceImage
      ? {
          sourceImage: {
            mimeType: sourceImage.mimeType,
            bytes: sourceImage.bytes
          }
        }
      : {}),
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
