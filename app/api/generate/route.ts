import { Buffer } from "node:buffer";
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
import { saveImageBuffer, readImageById } from "@/lib/local/storage";

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

const DEFAULT_IMAGE_MIME = "image/png";
const MAX_REFERENCE_IMAGES = 8;

type ReferenceSource = { data: string; mimeType?: string } | { url: string };

export async function POST(request: NextRequest) {
  try {
    const payload = requestSchema.parse(await request.json());

    const referenceSettings = getReferenceImageSettings(payload.options);
    const referenceParts: CodexContentPart[] = [];

    const primary = await resolveReferenceSource(referenceSettings.primary);
    if (primary) {
      referenceParts.push({
        type: "input_image",
        image_url: `data:${primary.mimeType};base64,${primary.data}`
      });
    }

    for (const entry of referenceSettings.gallery) {
      if (referenceParts.length >= MAX_REFERENCE_IMAGES) break;
      const resolved = await resolveReferenceSource(entry);
      if (resolved) {
        referenceParts.push({
          type: "input_image",
          image_url: `data:${resolved.mimeType};base64,${resolved.data}`
        });
      }
    }

    const promptText = buildPrompt(payload, referenceParts.length > 0);

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
    for (const entry of settled) {
      if (entry.status === "fulfilled") {
        for (const img of entry.value.images) {
          allImages.push(img);
        }
      } else {
        const reason = entry.reason instanceof Error ? entry.reason.message : String(entry.reason);
        errors.push(reason);
      }
    }

    if (!allImages.length) {
      return NextResponse.json(
        {
          ok: false,
          reason: errors[0] || "Codex가 이미지를 반환하지 않았습니다.",
          imageUrl: "/samples/sample-ballerina-after.svg"
        },
        { status: 200 }
      );
    }

    const persisted = await Promise.all(
      allImages.map(async img => {
        const id = generateId();
        const buffer = Buffer.from(img.b64, "base64");
        let imageUrl = `data:${img.mimeType};base64,${img.b64}`;
        let storagePath: string | null = null;
        try {
          const saved = await saveImageBuffer(id, buffer, img.mimeType);
          imageUrl = `/api/images/${id}`;
          storagePath = saved.relativePath;
        } catch (saveError) {
          console.warn("/api/generate failed to persist image to disk", saveError);
        }
        return {
          id,
          imageUrl,
          base64Image: imageUrl.startsWith("/api/") ? null : imageUrl,
          storagePath,
          revisedPrompt: img.revisedPrompt ?? null,
          mimeType: img.mimeType
        };
      })
    );

    const primaryImage = persisted[0];
    return NextResponse.json({
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
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, reason: "유효하지 않은 입력입니다.", issues: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof CodexAuthError) {
      return NextResponse.json(
        { ok: false, reason: error.message, code: error.code },
        { status: 401 }
      );
    }
    if (error instanceof CodexResponseError) {
      console.error("/api/generate Codex error", error.status, error.body.slice(0, 500));
      return NextResponse.json(
        {
          ok: false,
          reason: `Codex 호출 실패 (${error.status})`,
          imageUrl: "/samples/sample-ballerina-after.svg"
        },
        { status: error.status === 401 ? 401 : 200 }
      );
    }
    console.error("/api/generate error", error);
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

function getReferenceImageSettings(options: unknown): {
  primary: ReferenceSource | null;
  gallery: ReferenceSource[];
} {
  const normalizeStringEntry = (value: string): ReferenceSource | null => {
    if (!value) return null;

    if (value.startsWith("data:")) {
      const commaIndex = value.indexOf(",");
      if (commaIndex === -1) return null;
      const header = value.slice(5, commaIndex);
      const dataPart = value.slice(commaIndex + 1);
      const parts = header.split(";");
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
    if (!entry) return null;
    if (typeof entry === "string") return normalizeStringEntry(entry);

    if (typeof entry === "object") {
      const objectEntry = entry as Record<string, unknown>;
      const data = typeof objectEntry.data === "string" ? objectEntry.data : undefined;
      const mimeType = typeof objectEntry.mimeType === "string" ? objectEntry.mimeType : undefined;
      const url = typeof objectEntry.url === "string" ? objectEntry.url : undefined;

      if (data) {
        if (data.startsWith("data:")) return normalizeStringEntry(data);
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
  entry: ReferenceSource | null
): Promise<{ data: string; mimeType: string } | null> {
  if (!entry) return null;

  if ("data" in entry) {
    return { data: entry.data, mimeType: entry.mimeType ?? DEFAULT_IMAGE_MIME };
  }

  if ("url" in entry) {
    try {
      return await fetchImageAsBase64(entry.url);
    } catch (error) {
      console.warn("Failed to fetch reference image", error);
      return null;
    }
  }

  return null;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  // 우리 로컬 라우트(/api/images/<id>)는 server-side fetch가 base URL을 모르면 실패한다.
  // 디스크에서 직접 읽어 buffer로 변환한다.
  const localMatch = url.match(/^\/api\/images\/([A-Za-z0-9_\-]+)/);
  if (localMatch) {
    const id = localMatch[1];
    const result = await readImageById(id);
    if (!result) throw new Error(`Reference image not found locally: ${id}`);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      result.stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      result.stream.on("end", () => resolve());
      result.stream.on("error", err => reject(err));
    });
    const data = Buffer.concat(chunks).toString("base64");
    return { data, mimeType: result.mimeType };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch reference image (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get("content-type") ?? DEFAULT_IMAGE_MIME;
  const data = Buffer.from(arrayBuffer).toString("base64");

  return { data, mimeType };
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
