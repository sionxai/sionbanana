import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { MissingServiceAccountKeyError, getAdminAuth, getAdminDb, getAdminStorage } from "@/lib/firebase/admin";
import { ADMIN_UID, PLANS } from "@/lib/constants";
import { startOfNextMonthUTC } from "@/lib/entitlements";
import type { GenerationMode } from "@/lib/types";
import { describeAspectRatioForPrompt } from "@/lib/aspect";
import { generateId } from "@/lib/utils";

const generationModes = [
  "create",
  "remix",
  "camera",
  "crop",
  "prompt-adapt",
  "lighting",
  "pose",
  "upscale",
  "sketch",
  "external"
] as const satisfies GenerationMode[];

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
  options: z.record(z.any()).optional()
});

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-image-preview";
const FALLBACK_IMAGE_MODEL = "gemini-2.0-flash-exp-image-generation";
const IMAGE_MODEL_PREFIXES = ["imagen-"];
const TEXT_RESPONSE_MIME_SET = new Set([
  "text/plain",
  "application/json",
  "application/xml",
  "application/yaml",
  "text/x.enum"
]);
const DEFAULT_IMAGE_MIME = "image/png";

function filterLargeBase64FromOptions(options: Record<string, any>): Record<string, any> {
  const filtered: Record<string, any> = {};

  for (const [key, value] of Object.entries(options)) {
    if (typeof value === "string" && value.startsWith("data:") && value.length > 100000) {
      // Replace large base64 data with a placeholder
      filtered[key] = `[BASE64_DATA_FILTERED_${value.length}_BYTES]`;
    } else if (Array.isArray(value)) {
      // Check array elements for large base64 data
      filtered[key] = value.map(item => {
        if (typeof item === "string" && item.startsWith("data:") && item.length > 100000) {
          return `[BASE64_DATA_FILTERED_${item.length}_BYTES]`;
        }
        return item;
      });
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}

async function canGenerateAndConsume(uid: string) {
  const ref = getAdminDb().collection("users").doc(uid);
  const now = Timestamp.now();
  let allowed = false;
  let reason = "forbidden";

  const normalizeTimestamp = (value: any): Timestamp | null => {
    if (!value) {
      return null;
    }
    if (value instanceof Timestamp) {
      return value;
    }
    if (value instanceof Date) {
      return Timestamp.fromDate(value);
    }
    if (typeof value === "string") {
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) {
        return Timestamp.fromDate(new Date(ms));
      }
      return null;
    }
    if (typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function") {
      try {
        const date = (value as { toDate: () => Date }).toDate();
        if (date instanceof Date && !Number.isNaN(date.getTime())) {
          return Timestamp.fromDate(date);
        }
      } catch (error) {
        console.warn("Failed to normalize timestamp", error);
      }
    }
    return null;
  };

  await getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new Error("user doc missing");
    }

    const data = snap.data() as any;

    // Admin: unlimited usage, no quota decrement (but still track usage)
    const isAdmin = uid === ADMIN_UID || data.role === "admin";
    if (isAdmin) {
      allowed = true;
      reason = "admin";
      tx.update(ref, {
        "usage.generatedImages": (data.usage?.generatedImages ?? 0) + 1,
        "usage.lastGeneratedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return;
    }

    if (!data.quota || typeof data.quota !== "object") {
      data.quota = { imagesRemaining: 0, resetsAt: null };
    }

    const quotaResetAt = normalizeTimestamp(data.quota.resetsAt);
    if (quotaResetAt && quotaResetAt.toMillis() <= now.toMillis()) {
      const planId = (data.plan?.id as keyof typeof PLANS | undefined) ?? "guest";
      const base = PLANS[planId] ?? PLANS.guest;
      const resetTimestamp = startOfNextMonthUTC();
      tx.update(ref, {
        "quota.imagesRemaining": base.monthlyImages,
        "quota.resetsAt": resetTimestamp
      });
      data.quota = {
        imagesRemaining: base.monthlyImages,
        resetsAt: resetTimestamp
      };
    } else if (quotaResetAt) {
      data.quota.resetsAt = quotaResetAt;
    }

    const remain = typeof data.quota.imagesRemaining === "number" ? data.quota.imagesRemaining : 0;

    const pass = data.tempPass && typeof data.tempPass === "object" ? data.tempPass : null;
    const passExpiresAt = normalizeTimestamp(pass?.expiresAt);
    if (pass && passExpiresAt && passExpiresAt.toMillis() > now.toMillis()) {
      allowed = true;
      reason = "tempPass";
    } else {
      const activated = Boolean(data.plan?.activated);
      if (activated && remain > 0) {
        allowed = true;
        reason = "quota";
        tx.update(ref, {
          "quota.imagesRemaining": remain - 1,
          "usage.generatedImages": (data.usage?.generatedImages ?? 0) + 1,
          "usage.lastGeneratedAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }
  });

  return { allowed, reason };
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!token) {
      return NextResponse.json({ ok: false, reason: "인증 토큰이 필요합니다." }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const { allowed } = await canGenerateAndConsume(decoded.uid);
    if (!allowed) {
      return NextResponse.json({ ok: false, reason: "limit reached or not activated" }, { status: 403 });
    }

    const payload = requestSchema.parse(await request.json());
    const apiKey = serverEnv.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          reason: "GEMINI_API_KEY 미설정",
          imageUrl: "/samples/sample-ballerina-after.svg"
        },
        { status: 200 }
      );
    }

    const requestedModel = typeof payload.options?.model === "string" ? payload.options.model : undefined;
    const primaryModel = requestedModel ?? DEFAULT_MODEL;

    let result = await callModel(primaryModel, payload, apiKey);

    if (
      !result.ok &&
      result.status === 404 &&
      isImageModel(primaryModel) &&
      (!requestedModel || requestedModel === DEFAULT_MODEL)
    ) {
      const fallbackResult = await callModel(FALLBACK_IMAGE_MODEL, payload, apiKey);
      if (fallbackResult.ok) {
        return NextResponse.json({ ok: true, base64Image: fallbackResult.base64Image, model: fallbackResult.modelId, fallback: true });
      }

      const combinedReason = `${result.reason} (fallback 모델 ${FALLBACK_IMAGE_MODEL} 시도 실패: ${fallbackResult.reason})`;
      result = {
        ok: false,
        reason: combinedReason,
        status: fallbackResult.status ?? result.status,
        modelId: primaryModel
      };
    }

    if (result.ok) {
      // Save successful generation to Firestore
      const imageId = generateId();
      const now = Timestamp.now();

      try {
        // Convert base64 to blob and upload to Firebase Storage
        const base64DataUrl = result.base64Image;
        // Extract base64 part from data URL (remove "data:image/png;base64," prefix)
        const base64Data = base64DataUrl.split(',')[1];
        const imageBuffer = Buffer.from(base64Data, 'base64');

        const bucket = getAdminStorage().bucket();
        const fileName = `users/${decoded.uid}/images/${imageId}.png`;
        const file = bucket.file(fileName);

        await file.save(imageBuffer, {
          metadata: {
            contentType: 'image/png',
            metadata: {
              firebaseStorageDownloadTokens: crypto.randomUUID(), // Firebase download token
            }
          },
        });

        // Get signed URL (valid for 1 year)
        // Use signed URL instead of makePublic() to avoid "Uniform bucket-level access" errors
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
        });

        const publicUrl = signedUrl;

        console.log(`🔍 Debug publicUrl: ${publicUrl} (length: ${publicUrl.length})`);
        console.log(`🔍 Debug base64DataUrl length: ${base64DataUrl.length}`);
        console.log(`🔍 Debug payload.options:`, JSON.stringify(payload.options).length, "bytes");

        const imageDocData = {
          mode: payload.mode,
          status: "completed",
          promptMeta: {
            rawPrompt: payload.prompt,
            refinedPrompt: payload.refinedPrompt || null,
            negativePrompt: payload.negativePrompt || null,
            aspectRatio: payload.options?.aspectRatio || "original"
          },
          imageUrl: publicUrl,
          originalImageUrl: null,
          thumbnailUrl: null,
          diff: null,
          metadata: filterLargeBase64FromOptions(payload.options || {}),
          model: result.modelId,
          costCredits: 1,
          createdAt: now,
          updatedAt: now,
          createdAtIso: now.toDate().toISOString(),
          updatedAtIso: now.toDate().toISOString()
        };

        console.log(`🔍 Debug imageDocData serialized length: ${JSON.stringify(imageDocData).length} bytes`);

        await getAdminDb()
          .collection("users")
          .doc(decoded.uid)
          .collection("images")
          .doc(imageId)
          .set(imageDocData);

        console.log(`💾 Image saved to Storage and Firestore: ${publicUrl}`);
      } catch (firestoreError) {
        console.error("Failed to save image to Firestore:", firestoreError);
        // Continue without failing the request
      }

      return NextResponse.json({ ok: true, base64Image: result.base64Image, model: result.modelId, id: imageId });
    }

    return NextResponse.json(
      {
        ok: false,
        reason: result.reason,
        imageUrl: "/samples/sample-ballerina-after.svg"
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("/api/generate error", error);
    if (error instanceof MissingServiceAccountKeyError) {
      return NextResponse.json(
        {
          ok: false,
          reason: "missing service account",
          imageUrl: "/samples/sample-ballerina-after.svg"
        },
        { status: 200 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : "알 수 없는 오류",
        imageUrl: "/samples/sample-ballerina-after.svg"
      },
      { status: 200 }
    );
  }
}

function buildPrompt(payload: z.infer<typeof requestSchema>, hasReferenceImage: boolean) {
  const segments = [payload.refinedPrompt || payload.prompt];

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



interface GeminiResponse {
  generatedImages?: Array<{
    image?: {
      mimeType?: string;
      data?: string;
    };
    revisedPrompt?: string;
  }>;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
    status?: string;
  };
}

type ModelResult = ModelSuccess | ModelError;

interface ModelSuccess {
  ok: true;
  base64Image: string;
  modelId: string;
}

interface ModelError {
  ok: false;
  reason: string;
  status?: number;
  modelId: string;
}

async function callModel(
  modelId: string,
  payload: z.infer<typeof requestSchema>,
  apiKey: string
): Promise<ModelResult> {
  const referenceSettings = getReferenceImageSettings(payload.options);

  const resolveReferenceSource = async (
    entry: ReferenceSource | null
  ): Promise<{ data: string; mimeType: string } | null> => {
    if (!entry) {
      return null;
    }

    if ('data' in entry) {
      return { data: entry.data, mimeType: entry.mimeType ?? DEFAULT_IMAGE_MIME };
    }

    if ('url' in entry) {
      try {
        return await fetchImageAsBase64(entry.url);
      } catch (error) {
        console.warn("Failed to fetch reference image", error);
        return null;
      }
    }

    return null;
  };

  let referenceImage = await resolveReferenceSource(referenceSettings.primary);
  const additionalReferences: Array<{ data: string; mimeType: string }> = [];

  for (const entry of referenceSettings.gallery) {
    const resolved = await resolveReferenceSource(entry);
    if (resolved) {
      additionalReferences.push(resolved);
    }
  }

  if (!referenceImage && additionalReferences.length) {
    referenceImage = additionalReferences.shift() ?? null;
  }

  const effectiveModelId = referenceImage && isImageModel(modelId) ? FALLBACK_IMAGE_MODEL : modelId;
  const useImagenEndpoint = isImageModel(effectiveModelId) && !referenceImage;
  const methodPath = useImagenEndpoint ? "generateImage" : "generateContent";
  const url = `${GEMINI_ENDPOINT}/${effectiveModelId}:${methodPath}?key=${apiKey}`;

  const promptText = buildPrompt(payload, Boolean(referenceImage || additionalReferences.length));

  const requestedOutputMime = getRequestedOutputMime(payload.options?.outputMimeType, useImagenEndpoint);
  const resolvedOutputMime = useImagenEndpoint ? requestedOutputMime ?? DEFAULT_IMAGE_MIME : undefined;
  const generationConfig = buildGenerationConfig(
    payload.options?.generationConfig,
    useImagenEndpoint ? undefined : requestedOutputMime
  );

  const contentParts: Array<Record<string, unknown>> = [{ text: promptText }];
  if (referenceImage) {
    contentParts.push({
      inlineData: {
        mimeType: referenceImage.mimeType ?? DEFAULT_IMAGE_MIME,
        data: referenceImage.data
      }
    });
  }
  for (const extraReference of additionalReferences) {
    contentParts.push({
      inlineData: {
        mimeType: extraReference.mimeType ?? DEFAULT_IMAGE_MIME,
        data: extraReference.data
      }
    });
  }

  const requestBody = useImagenEndpoint
    ? removeUndefined({
        prompt: { text: promptText },
        negativePrompt: payload.negativePrompt ? { text: payload.negativePrompt } : undefined,
        outputMimeType: resolvedOutputMime ?? DEFAULT_IMAGE_MIME,
        aspectRatio: payload.options?.aspectRatio,
        safetyFilterLevel: payload.options?.safetyFilterLevel,
        numberOfImages: payload.options?.numberOfImages ?? 1
      })
    : removeUndefined({
        contents: [
          {
            role: "user",
            parts: contentParts
          }
        ],
        safetySettings: payload.options?.safetySettings,
        generationConfig
      });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout - 이미지 생성 요청이 시간 초과되었습니다.');
    }
    throw error;
  }

  if (!response.ok) {
    const errorBody = await parseErrorBody(response);
    const reason =
      errorBody ??
      (response.status === 404
        ? `모델 "${modelId}" 을(를) 찾을 수 없습니다. Google AI Studio에서 모델 이름과 접근 권한을 다시 확인해주세요.`
        : `Gemini API error: ${response.status}`);
    console.error("Gemini API error", response.status, errorBody);
    return { ok: false, reason, status: response.status, modelId: effectiveModelId };
  }

  const data = (await response.json()) as GeminiResponse;
  const base64Image = extractBase64Image(data);

  if (!base64Image) {
    return {
      ok: false,
      reason: data.error?.message ?? data.error?.status ?? "이미지 데이터를 찾을 수 없습니다.",
      modelId: effectiveModelId
    };
  }

  return { ok: true, base64Image, modelId: effectiveModelId };
}

function extractBase64Image(response: GeminiResponse) {
  for (const item of response.generatedImages ?? []) {
    const mime = item.image?.mimeType ?? "image/png";
    if (item.image?.data) {
      return `data:${mime};base64,${item.image.data}`;
    }
  }

  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.mimeType?.startsWith("image/")) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
      if (part.text?.startsWith("data:image")) {
        return part.text;
      }
    }
  }
  return null;
}

type ReferenceSource = { data: string; mimeType?: string } | { url: string };

function getReferenceImageSettings(options: unknown): {
  primary: ReferenceSource | null;
  gallery: ReferenceSource[];
} {
  const normalizeStringEntry = (value: string): ReferenceSource | null => {
    if (!value) {
      return null;
    }

    if (value.startsWith("data:")) {
      const commaIndex = value.indexOf(',');
      if (commaIndex === -1) {
        return null;
      }
      const header = value.slice(5, commaIndex);
      const dataPart = value.slice(commaIndex + 1);
      const parts = header.split(';');
      const mimeType = parts[0] || DEFAULT_IMAGE_MIME;
      const isBase64 = parts.some(part => part.toLowerCase() === "base64");
      if (!isBase64) {
        console.warn("Data URL reference image provided without base64 encoding; skipping.");
        return null;
      }
      return { data: dataPart, mimeType };
    }

    return { url: value };
  };

  const normalizeEntry = (entry: unknown): ReferenceSource | null => {
    if (!entry) {
      return null;
    }

    if (typeof entry === "string") {
      return normalizeStringEntry(entry);
    }

    if (typeof entry === "object") {
      const objectEntry = entry as Record<string, unknown>;
      const data = typeof objectEntry.data === "string" ? objectEntry.data : undefined;
      const mimeType = typeof objectEntry.mimeType === "string" ? objectEntry.mimeType : undefined;
      const url = typeof objectEntry.url === "string" ? objectEntry.url : undefined;

      if (data) {
        if (data.startsWith("data:")) {
          return normalizeStringEntry(data);
        }
        return { data, mimeType };
      }

      if (url) {
        return normalizeStringEntry(url);
      }
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

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch reference image (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get("content-type") ?? DEFAULT_IMAGE_MIME;
  const data = Buffer.from(arrayBuffer).toString("base64");

  return { data, mimeType };
}

async function parseErrorBody(response: Response) {
  try {
    const cloneForJson = response.clone();
    const data = await cloneForJson.json();
    return data.error?.message ?? JSON.stringify(data);
  } catch (jsonError) {
    try {
      const text = await response.text();
      return text || null;
    } catch (textError) {
      console.error("Failed to parse Gemini error body", jsonError, textError);
      return null;
    }
  }
}

function removeUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as T;
}

function isImageModel(modelId: string) {
  return IMAGE_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix) || modelId.includes(`/${prefix}`));
}

function getRequestedOutputMime(mime: unknown, isImagenRequest: boolean) {
  if (typeof mime !== "string") {
    return undefined;
  }

  if (isImagenRequest) {
    return mime.startsWith("image/") ? mime : undefined;
  }

  return TEXT_RESPONSE_MIME_SET.has(mime) ? mime : undefined;
}

function buildGenerationConfig(rawConfig: unknown, requestedOutputMime: string | undefined) {
  const baseConfig =
    rawConfig && typeof rawConfig === "object"
      ? { ...(rawConfig as Record<string, unknown>) }
      : {};

  if (requestedOutputMime && TEXT_RESPONSE_MIME_SET.has(requestedOutputMime)) {
    baseConfig.responseMimeType = requestedOutputMime;
  }

  const cleaned = removeUndefined(baseConfig);
  return Object.keys(cleaned).length ? cleaned : undefined;
}
