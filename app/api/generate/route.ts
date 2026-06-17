import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { GenerationMode } from "@/lib/types";
import { describeAspectRatioForPrompt } from "@/lib/aspect";
import { generateId } from "@/lib/utils";
import {
  callCodexResponses,
  CodexResponseError,
  type CodexContentPart,
  type CodexImageOptions
} from "@/lib/codex-fetch";
import { CodexAuthError } from "@/lib/codex-oauth";
import { saveImageBuffer, readImageById, saveImageMetadata, type ImageMetadata } from "@/lib/local/storage";
import {
  buildReferenceHandleMappings,
  formatOrdinal,
  normalizeReferenceHandle,
  replaceReferenceHandleMentions,
  resolveReferenceHandles
} from "@/lib/studio-helpers/reference-handles";

const generationModes = [
  "create",
  "remix",
  "camera",
  "crop",
  "prompt-adapt",
  "lighting",
  "pose",
  "style",
  "upscale",
  "sketch",
  "external"
] as const satisfies GenerationMode[];

const DEFAULT_IMAGE_MIME = "image/png";
const MAX_REFERENCE_IMAGES = 8;
const MAX_REFERENCE_BYTES = 25 * 1024 * 1024;
const MAX_REFERENCE_DATA_CHARS = Math.ceil((MAX_REFERENCE_BYTES * 4) / 3) + 1024;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

const referenceObjectSchema = z
  .object({
    data: z.string().min(1).max(MAX_REFERENCE_DATA_CHARS).optional(),
    mimeType: z.string().min(1).max(80).optional(),
    url: z.string().min(1).max(MAX_REFERENCE_DATA_CHARS).optional()
  })
  .strict()
  .refine(value => Boolean(value.data || value.url), {
    message: "reference entry must include data or url"
  });

const referenceSourceSchema = z.union([
  z.string().min(1).max(MAX_REFERENCE_DATA_CHARS),
  referenceObjectSchema
]);

const generationOptionsSchema = z
  .object({
    action: z.string().min(1).max(80).optional(),
    // 프론트 호환을 위해 받되 서버 모델 선택에는 사용하지 않는다.
    model: z.string().min(1).max(80).optional(),
    outputMimeType: z.literal("image/png").optional(),
    characterView: z.string().min(1).max(80).optional(),
    characterViewLabel: z.string().min(1).max(120).optional(),
    batchItemId: z.string().min(1).max(160).optional(),
    batchItemName: z.string().min(1).max(260).optional(),
    dimensions: z
      .object({
        width: z.number().int().positive().max(8192),
        height: z.number().int().positive().max(8192)
      })
      .strict()
      .optional(),
    lighting: z.record(z.array(z.string().min(1).max(120)).max(16)).optional(),
    pose: z.record(z.array(z.string().min(1).max(120)).max(16)).optional(),
    quality: z.enum(["low", "medium", "high", "auto"]).optional(),
    imageSize: z.string().min(1).max(32).optional(),
    aspectRatio: z.string().min(1).max(32).optional(),
    format: z.enum(["png", "jpeg", "webp"]).optional(),
    moderation: z.enum(["low", "auto"]).optional(),
    count: z.union([z.literal(1), z.literal(2), z.literal(4)]).optional(),
    referenceImage: referenceSourceSchema.optional(),
    referenceImageUrl: z.string().min(1).max(MAX_REFERENCE_DATA_CHARS).optional(),
    referenceGallery: z.array(referenceSourceSchema).max(MAX_REFERENCE_IMAGES).optional(),
    referenceHandles: z.array(z.string().max(64)).max(MAX_REFERENCE_IMAGES + 1).optional(),
    idempotencyKey: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9_.:-]+$/, "idempotencyKey contains invalid characters")
      .optional()
  })
  .strict();

const requestSchema = z.object({
  prompt: z.string().min(1, "프롬프트를 입력해주세요."),
  refinedPrompt: z.string().optional(),
  negativePrompt: z.string().optional(),
  mode: z.enum(generationModes).default("create"),
  camera: z
    .object({
      angle: z.string().optional(),
      aperture: z.string().optional(),
      subjectDirection: z.string().optional(),
      cameraDirection: z.string().optional(),
      zoom: z.string().optional()
    })
    .optional(),
  options: generationOptionsSchema.optional()
});

type ReferenceSource = { data: string; mimeType?: string } | { url: string };
type GeneratePayload = z.infer<typeof requestSchema>;
type GenerateResult = { status: number; body: Record<string, unknown> };

type IdempotencyEntry = {
  fingerprint: string;
  expiresAt: number;
  result?: GenerateResult;
  promise?: Promise<GenerateResult>;
};

const idempotencyCache = new Map<string, IdempotencyEntry>();

class ReferenceImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceImageError";
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const payload = requestSchema.parse(await request.json());
    const result = await runGenerateWithIdempotency(request, payload);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const result = generateErrorResult(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}

async function runGenerateWithIdempotency(
  request: NextRequest,
  payload: GeneratePayload
): Promise<GenerateResult> {
  const key = payload.options?.idempotencyKey;
  if (!key) {
    return executeGenerate(request, payload);
  }

  const now = Date.now();
  cleanupIdempotencyCache(now);
  const fingerprint = createPayloadFingerprint(payload);
  const existing = idempotencyCache.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      return {
        status: 409,
        body: { ok: false, reason: "같은 idempotencyKey가 다른 요청 본문과 재사용되었습니다." }
      };
    }
    if (existing.result) {
      return existing.result;
    }
    if (existing.promise) {
      return existing.promise;
    }
  }

  const promise = executeGenerate(request, payload);
  idempotencyCache.set(key, {
    fingerprint,
    expiresAt: now + IDEMPOTENCY_TTL_MS,
    promise
  });

  try {
    const result = await promise;
    if (isCacheableGenerationResult(result)) {
      idempotencyCache.set(key, {
        fingerprint,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
        result
      });
    } else {
      idempotencyCache.delete(key);
    }
    return result;
  } catch (error) {
    idempotencyCache.delete(key);
    throw error;
  }
}

async function executeGenerate(request: NextRequest, payload: GeneratePayload): Promise<GenerateResult> {
  const referenceSettings = getReferenceImageSettings(payload.options);
  const requestedReferenceHandles = getReferenceHandles(payload.options);
  const referenceParts: CodexContentPart[] = [];
  const galleryResolvedFlags: boolean[] = [];
  const requestOrigin = request.nextUrl.origin;

  const primary = await resolveReferenceSource(referenceSettings.primary, requestOrigin);
  if (primary) {
    referenceParts.push({
      type: "input_image",
      image_url: `data:${primary.mimeType};base64,${primary.data}`
    });
  }

  for (const entry of referenceSettings.gallery) {
    if (referenceParts.length >= MAX_REFERENCE_IMAGES) break;
    const resolved = await resolveReferenceSource(entry, requestOrigin);
    galleryResolvedFlags.push(Boolean(resolved));
    if (resolved) {
      referenceParts.push({
        type: "input_image",
        image_url: `data:${resolved.mimeType};base64,${resolved.data}`
      });
    }
  }

  const resolvedReferenceHandles = resolveReferenceHandles({
    requestedHandles: requestedReferenceHandles,
    primaryRequested: Boolean(referenceSettings.primary),
    primaryResolved: Boolean(primary),
    galleryResolvedFlags
  });
  const promptText = buildPrompt(payload, referenceParts.length > 0, resolvedReferenceHandles);

  const userContent: CodexContentPart[] = [
    ...referenceParts,
    { type: "input_text", text: promptText }
  ];

  const requestedSize = payload.options?.imageSize ?? payload.options?.aspectRatio;
  const imageOptions: CodexImageOptions = {
    quality: mapQuality(payload.options?.quality),
    size: mapSize(requestedSize),
    moderation: mapModeration(payload.options?.moderation),
    output_format: mapFormat(payload.options?.format)
  };

  const count = clampCount(payload.options?.count);

  const callOnce = () =>
    callCodexResponses({
      mode: "image",
      input: [
        {
          role: "system",
          content:
            "You generate images for the user using the image_generation tool. Use the supplied prompt and any reference images. Do not narrate; just produce the image."
        },
        { role: "user", content: userContent }
      ],
      imageOptions,
      logTag: "api/generate"
    });

  const settled = await Promise.allSettled(Array.from({ length: count }, () => callOnce()));
  const allImages: Array<{ b64: string; mimeType: string; revisedPrompt?: string }> = [];
  const errors: string[] = [];
  const errorStatuses: number[] = [];
  for (const entry of settled) {
    if (entry.status === "fulfilled") {
      for (const img of entry.value.images) {
        allImages.push(img);
      }
    } else {
      const reason = entry.reason instanceof Error ? entry.reason.message : String(entry.reason);
      errors.push(reason);
      if (entry.reason instanceof CodexAuthError) {
        errorStatuses.push(401);
      } else if (entry.reason instanceof CodexResponseError) {
        errorStatuses.push(mapCodexErrorStatus(entry.reason.status));
      }
    }
  }

  if (!allImages.length) {
    return {
      status: chooseFailureStatus(errorStatuses),
      body: {
        ok: false,
        reason: errors[0] || "Codex가 이미지를 반환하지 않았습니다."
      }
    };
  }

  type Persisted = {
    id: string;
    imageUrl: string;
    base64Image: null;
    storagePath: string;
    revisedPrompt: string | null;
    mimeType: string;
  };
  const persistedSettled = await Promise.allSettled(
    allImages.map(async (img): Promise<Persisted> => {
      const id = generateId();
      const buffer = Buffer.from(img.b64, "base64");
      const saved = await saveImageBuffer(id, buffer, img.mimeType);
      const bucket = saved.relativePath.split(/[\\/]/)[0];
      const createdAtIso = new Date().toISOString();
      await saveGeneratedImageMetadata({
        id,
        bucket,
        payload,
        image: img,
        createdAtIso
      });
      return {
        id,
        imageUrl: `/api/images/${id}`,
        base64Image: null,
        storagePath: saved.relativePath,
        revisedPrompt: img.revisedPrompt ?? null,
        mimeType: img.mimeType
      };
    })
  );
  const persisted: Persisted[] = [];
  const persistErrors: string[] = [];
  for (const entry of persistedSettled) {
    if (entry.status === "fulfilled") persisted.push(entry.value);
    else persistErrors.push(entry.reason instanceof Error ? entry.reason.message : String(entry.reason));
  }
  if (!persisted.length) {
    console.error("/api/generate disk persistence failed for all images", persistErrors);
    return {
      status: 500,
      body: {
        ok: false,
        reason: persistErrors[0] || "이미지를 디스크에 저장하지 못했습니다."
      }
    };
  }

  const primaryImage = persisted[0];
  return {
    status: 200,
    body: {
      ok: true,
      // 호환을 위해 첫 이미지를 최상위에 펼쳐 두고, 나머지는 images 배열로 제공
      imageUrl: primaryImage.imageUrl,
      base64Image: primaryImage.base64Image,
      storagePath: primaryImage.storagePath,
      model: "gpt-image-2",
      id: primaryImage.id,
      revisedPrompt: primaryImage.revisedPrompt,
      images: persisted,
      partial: errors.length > 0 ? errors : undefined
    }
  };
}

async function saveGeneratedImageMetadata({
  id,
  bucket,
  payload,
  image,
  createdAtIso
}: {
  id: string;
  bucket: string;
  payload: GeneratePayload;
  image: { revisedPrompt?: string };
  createdAtIso: string;
}): Promise<void> {
  const referenceHandles = getReferenceHandles(payload.options);
  const referenceHandleMap = buildReferenceHandleMappings(referenceHandles);
  const metadata: ImageMetadata = {
    rawPrompt: payload.prompt,
    refinedPrompt: payload.refinedPrompt || image.revisedPrompt || undefined,
    revisedPrompt: image.revisedPrompt,
    model: "gpt-image-2",
    mode: payload.mode,
    createdAtIso,
    negativePrompt: payload.negativePrompt || undefined,
    camera: payload.camera,
    aspectRatio: typeof payload.options?.aspectRatio === "string" ? payload.options.aspectRatio : undefined,
    imageSize: typeof payload.options?.imageSize === "string" ? payload.options.imageSize : undefined,
    quality: payload.options?.quality,
    format: payload.options?.format,
    moderation: payload.options?.moderation,
    batchItemId: payload.options?.batchItemId,
    batchItemName: payload.options?.batchItemName,
    characterView: payload.options?.characterView,
    characterViewLabel: payload.options?.characterViewLabel,
    referenceHandles: referenceHandles.some(Boolean) ? referenceHandles : undefined,
    referenceHandleMap: referenceHandleMap.length ? referenceHandleMap : undefined
  };

  try {
    await saveImageMetadata(id, bucket, metadata);
  } catch (error) {
    console.warn(
      "/api/generate image metadata sidecar save failed",
      id,
      error instanceof Error ? error.message : String(error)
    );
  }
}

function generateErrorResult(error: unknown): GenerateResult {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { ok: false, reason: "유효하지 않은 입력입니다.", issues: error.issues }
    };
  }
  if (error instanceof CodexAuthError) {
    return {
      status: 401,
      body: { ok: false, reason: error.message, code: error.code }
    };
  }
  if (error instanceof ReferenceImageError) {
    return {
      status: 400,
      body: { ok: false, reason: error.message }
    };
  }
  if (error instanceof CodexResponseError) {
    console.error("/api/generate Codex error", error.status, error.body.slice(0, 500));
    return {
      status: mapCodexErrorStatus(error.status),
      body: {
        ok: false,
        reason: `Codex 호출 실패 (${error.status})`
      }
    };
  }
  console.error("/api/generate error", error);
  return {
    status: 500,
    body: {
      ok: false,
      reason: error instanceof Error ? error.message : "알 수 없는 오류"
    }
  };
}

function mapCodexErrorStatus(status: number): number {
  if (status === 401 || status === 403 || status === 429) {
    return status;
  }
  if (status >= 400 && status < 500) {
    return 400;
  }
  return 502;
}

function chooseFailureStatus(statuses: number[]): number {
  if (statuses.includes(401)) return 401;
  if (statuses.includes(403)) return 403;
  if (statuses.includes(429)) return 429;
  return statuses[0] ?? 502;
}

function cleanupIdempotencyCache(now: number): void {
  for (const [key, entry] of idempotencyCache.entries()) {
    if (entry.expiresAt <= now && !entry.promise) {
      idempotencyCache.delete(key);
    }
  }
}

function createPayloadFingerprint(payload: GeneratePayload): string {
  const options = payload.options ? { ...payload.options } : undefined;
  if (options) {
    delete options.idempotencyKey;
  }
  return createHash("sha256")
    .update(JSON.stringify({ ...payload, options }))
    .digest("hex");
}

function isCacheableGenerationResult(result: GenerateResult): boolean {
  return result.status >= 200 && result.status < 300 && result.body.ok === true;
}

function getReferenceHandles(options: unknown): string[] {
  if (!options || typeof options !== "object") {
    return [];
  }
  const raw = (options as Record<string, unknown>).referenceHandles;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .slice(0, MAX_REFERENCE_IMAGES + 1)
    .map(item => normalizeReferenceHandle(item));
}

function buildPrompt(payload: GeneratePayload, hasReferenceImage: boolean, referenceHandles: string[]) {
  const referenceHandleMappings = buildReferenceHandleMappings(referenceHandles);
  const promptBody = replaceReferenceHandleMentions(
    payload.refinedPrompt || payload.prompt,
    referenceHandleMappings
  );
  const segments = [promptBody];

  if (payload.negativePrompt) {
    segments.push(`Negative prompt: ${payload.negativePrompt}`);
  }

  if (payload.camera) {
    const cameraDetails = [
      payload.camera.angle ? `angle: ${payload.camera.angle}` : null,
      payload.camera.aperture ? `aperture: ${payload.camera.aperture}` : null,
      payload.camera.subjectDirection ? `subject orientation: ${payload.camera.subjectDirection}` : null,
      payload.camera.cameraDirection ? `camera facing: ${payload.camera.cameraDirection}` : null,
      payload.camera.zoom ? `zoom: ${payload.camera.zoom}` : null
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join(", ");

    if (cameraDetails.length) {
      segments.push(`Camera guidance - ${cameraDetails}.`);
    }
  }

  const rawGalleryOption = (payload.options as { referenceGallery?: unknown } | undefined)?.referenceGallery;
  const galleryCount = Array.isArray(rawGalleryOption)
    ? rawGalleryOption.filter(entry =>
        typeof entry === "string" ? entry.trim().length > 0 : typeof entry === "object"
      ).length
    : 0;
  if (galleryCount > 0) {
    segments.push(`Additional reference gallery provided: ${galleryCount} image(s).`);
  }

  if (referenceHandleMappings.length) {
    const mappingText = referenceHandleMappings
      .map(item => `@${item.handle} = the ${formatOrdinal(item.referenceIndex)} reference image`)
      .join("; ");
    segments.push(`Reference handle map: ${mappingText}.`);
  }

  const aspectRatioSetting =
    typeof payload.options?.aspectRatio === "string" ? payload.options.aspectRatio : undefined;
  if (aspectRatioSetting && aspectRatioSetting !== "original") {
    const ratioLabel = describeAspectRatioForPrompt(aspectRatioSetting) ?? `${aspectRatioSetting} composition`;
    segments.push(`Aspect ratio guidance: ${ratioLabel}.`);
  }

  if (payload.mode) {
    segments.push(`Generation mode: ${payload.mode}`);
  }

  if (hasReferenceImage) {
    segments.push("Use the provided reference image as the visual foundation while applying the requested changes.");
  }

  return segments.join("\n");
}

function getReferenceImageSettings(options: unknown): {
  primary: ReferenceSource | null;
  gallery: ReferenceSource[];
} {
  const normalizeStringEntry = (value: string): ReferenceSource | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("data:")) {
      const commaIndex = trimmed.indexOf(",");
      if (commaIndex === -1) return null;
      const header = trimmed.slice(5, commaIndex);
      const dataPart = trimmed.slice(commaIndex + 1);
      const parts = header.split(";");
      const mimeType = parts[0] || DEFAULT_IMAGE_MIME;
      const isBase64 = parts.some(part => part.toLowerCase() === "base64");
      if (!isBase64) {
        console.warn("Data URL reference image provided without base64 encoding; skipping.");
        return null;
      }
      if (!isAllowedImageMime(mimeType) || estimatedBase64Bytes(dataPart) > MAX_REFERENCE_BYTES) {
        console.warn("Data URL reference image is not an allowed image or exceeds the size limit; skipping.");
        return null;
      }
      return { data: dataPart, mimeType };
    }

    return { url: trimmed };
  };

  const normalizeEntry = (entry: unknown): ReferenceSource | null => {
    if (!entry) return null;
    if (typeof entry === "string") return normalizeStringEntry(entry);

    if (typeof entry === "object") {
      const objectEntry = entry as Record<string, unknown>;
      const data = typeof objectEntry.data === "string" ? objectEntry.data : undefined;
      const mimeType = typeof objectEntry.mimeType === "string" ? objectEntry.mimeType : undefined;
      const url = typeof objectEntry.url === "string" ? objectEntry.url : undefined;

      if (data) {
        if (data.startsWith("data:")) return normalizeStringEntry(data);
        if (!isAllowedImageMime(mimeType ?? DEFAULT_IMAGE_MIME) || estimatedBase64Bytes(data) > MAX_REFERENCE_BYTES) {
          console.warn("Reference image data is not an allowed image or exceeds the size limit; skipping.");
          return null;
        }
        return { data, mimeType };
      }

      if (url) return normalizeStringEntry(url);
    }

    return null;
  };

  if (!options || typeof options !== "object") {
    return { primary: null, gallery: [] };
  }

  const opts = options as Record<string, unknown>;
  const rawGallery = Array.isArray(opts.referenceGallery) ? opts.referenceGallery : [];

  let primary: ReferenceSource | null = null;
  const rawPrimary = normalizeEntry(opts.referenceImage);
  if (rawPrimary) {
    primary = rawPrimary;
  } else if (typeof opts.referenceImageUrl === "string") {
    primary = normalizeEntry(opts.referenceImageUrl);
  }

  const gallery: ReferenceSource[] = rawGallery
    .map(item => normalizeEntry(item))
    .filter((entry): entry is ReferenceSource => entry !== null);

  return { primary, gallery };
}

async function resolveReferenceSource(
  entry: ReferenceSource | null,
  requestOrigin: string
): Promise<{ data: string; mimeType: string } | null> {
  if (!entry) return null;

  if ("data" in entry) {
    const mimeType = entry.mimeType ?? DEFAULT_IMAGE_MIME;
    if (!isAllowedImageMime(mimeType) || estimatedBase64Bytes(entry.data) > MAX_REFERENCE_BYTES) {
      return null;
    }
    return { data: entry.data, mimeType };
  }

  if ("url" in entry) {
    try {
      return await fetchImageAsBase64(entry.url, requestOrigin);
    } catch (error) {
      throw new ReferenceImageError(error instanceof Error ? error.message : "Reference image를 읽을 수 없습니다.");
    }
  }

  return null;
}

async function fetchImageAsBase64(url: string, requestOrigin: string): Promise<{ data: string; mimeType: string }> {
  // 보안 정책: server-side에서 임의 URL을 fetch하면 SSRF/내부망 접근/대용량 메모리 공격이 가능하다.
  // 따라서 이 함수가 다루는 URL은 우리 로컬 라우트(/api/images/<id>)만 허용.
  // data: URL은 호출자가 normalizeStringEntry에서 미리 분해하므로 여기까지 오지 않는다.
  const id = extractLocalImageId(url, requestOrigin);
  const result = await readImageById(id);
  if (!result) throw new Error(`Reference image not found locally: ${id}`);
  if (!isAllowedImageMime(result.mimeType)) {
    throw new Error(`Reference image has unsupported mime type: ${result.mimeType}`);
  }
  if (result.bytes > MAX_REFERENCE_BYTES) {
    throw new Error("Reference image exceeds 25MB limit");
  }

  const chunks: Buffer[] = [];
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    result.stream.on("data", (chunk: string | Buffer) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += buf.byteLength;
      if (total > MAX_REFERENCE_BYTES) {
        reject(new Error("Reference image exceeds 25MB limit"));
        return;
      }
      chunks.push(buf);
    });
    result.stream.on("end", () => resolve());
    result.stream.on("error", err => reject(err));
  });
  const data = Buffer.concat(chunks).toString("base64");
  return { data, mimeType: result.mimeType };
}

function extractLocalImageId(value: string, requestOrigin: string): string {
  let parsed: URL;
  try {
    parsed = value.startsWith("/") ? new URL(value, requestOrigin) : new URL(value);
  } catch {
    throw new Error("Reference URL이 허용되지 않습니다. 로컬 /api/images/<id> 또는 data URL만 사용 가능합니다.");
  }

  if (parsed.origin !== requestOrigin) {
    throw new Error("Reference URL origin이 현재 앱 origin과 다릅니다.");
  }

  const match = parsed.pathname.match(/^\/api\/images\/([A-Za-z0-9_\-]+)$/);
  if (!match) {
    throw new Error("Reference URL path가 허용되지 않습니다. /api/images/<id>만 사용할 수 있습니다.");
  }
  return match[1];
}

function isAllowedImageMime(mimeType: string): boolean {
  return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp";
}

function estimatedBase64Bytes(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const padding = trimmed.endsWith("==") ? 2 : trimmed.endsWith("=") ? 1 : 0;
  return Math.ceil((trimmed.length * 3) / 4) - padding;
}

// 명시적인 픽셀 크기 또는 종횡비 별칭을 모두 받아준다.
const SIZE_ALIASES: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1824x1024",
  "9:16": "1024x1824",
  "4:3": "1360x1024",
  "3:4": "1024x1360",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
  "2k-1:1": "2048x2048",
  "2k-16:9": "2048x1152",
  "2k-9:16": "1152x2048",
  "4k-16:9": "3824x2160",
  "4k-9:16": "2160x3824",
  original: "1024x1024",
  "": "1024x1024"
};

const ALLOWED_PIXEL_SIZES = new Set([
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1360x1024",
  "1024x1360",
  "1824x1024",
  "1024x1824",
  "2048x2048",
  "2048x1152",
  "1152x2048",
  "3824x2160",
  "2160x3824"
]);

function mapSize(input: unknown): CodexImageOptions["size"] {
  if (typeof input !== "string") return "1024x1024";
  const trimmed = input.trim();
  if (trimmed === "auto") return "auto";
  if (SIZE_ALIASES[trimmed]) return SIZE_ALIASES[trimmed];
  const normalized = trimmed.replace(/[^0-9x]/gi, "").toLowerCase();
  if (ALLOWED_PIXEL_SIZES.has(normalized)) return normalized;
  return "1024x1024";
}

function mapQuality(quality: unknown): CodexImageOptions["quality"] {
  if (quality === "low" || quality === "medium" || quality === "high" || quality === "auto") {
    return quality;
  }
  return "medium";
}

function mapModeration(value: unknown): CodexImageOptions["moderation"] {
  return value === "auto" ? "auto" : "low";
}

function mapFormat(value: unknown): CodexImageOptions["output_format"] | undefined {
  if (value === "png" || value === "jpeg" || value === "webp") return value;
  return undefined;
}

function clampCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(4, Math.floor(n)));
}
