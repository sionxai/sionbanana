import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";

import { POST as generateImage } from "@/app/api/generate/route";
import { readImageById } from "@/lib/local/storage";
import { buildSheetPrompt, type MotionActionPreset } from "@/lib/motion/prompt";
import {
  createProject,
  listProjects,
  MotionStorageError
} from "@/lib/motion/storage";
import {
  gridSpecSchema,
  matteSpecSchema,
  normalizeScaleValues,
  sliceModeValues
} from "@/lib/motion/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_DATA_URL_CHARS = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 128;
const MAX_REFERENCE_BYTES = 25 * 1024 * 1024;
const MAX_REFERENCE_DATA_CHARS = Math.ceil((MAX_REFERENCE_BYTES * 4) / 3) + 1024;

const actionSchema = z.enum(["walk", "run", "idle", "jump", "attack", "custom"]);
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

const sourceSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("generate"),
      prompt: z.string().trim().min(1).max(20_000),
      action: actionSchema.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal("reference"),
      prompt: z.string().trim().min(1).max(20_000),
      action: actionSchema.optional(),
      referenceImage: referenceSourceSchema
    })
    .strict(),
  z.object({ type: z.literal("upload"), dataUrl: z.string().min(1).max(MAX_DATA_URL_CHARS) }).strict()
]);

const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    sliceMode: z.enum(sliceModeValues).optional(),
    normalizeScale: z.enum(normalizeScaleValues).optional(),
    grid: gridSpecSchema,
    matte: matteSpecSchema.optional(),
    source: sourceSchema
  })
  .strict();

class MotionRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MotionRequestError";
    this.status = status;
  }
}

function requestError(error: unknown, context: string): Response {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, reason: error.issues[0]?.message ?? "Invalid request.", issues: error.issues },
      { status: 400 }
    );
  }
  if (error instanceof MotionRequestError || error instanceof MotionStorageError) {
    return NextResponse.json({ ok: false, reason: error.message }, { status: error.status });
  }
  console.error(context, error);
  return NextResponse.json(
    { ok: false, reason: error instanceof Error ? error.message : "Unknown motion project error." },
    { status: 500 }
  );
}

async function readRequestJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new MotionRequestError("Request body must be valid JSON.", 400);
    }
    throw error;
  }
}

function upstreamFailureStatus(status: number): number {
  return status >= 400 && status <= 599 ? status : 502;
}

function decodeUploadDataUrl(dataUrl: string): { buffer: Buffer; mimeType: "image/png" | "image/jpeg" } {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match || match[2].length === 0 || match[2].length % 4 !== 0) {
    throw new MotionRequestError("source.dataUrl must be a base64 PNG or JPEG data URL.", 400);
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new MotionRequestError("Uploaded image exceeds the 20MB limit.", 413);
  }
  return { buffer, mimeType: match[1] as "image/png" | "image/jpeg" };
}

async function normalizeUpload(dataUrl: string): Promise<Buffer> {
  const decoded = decodeUploadDataUrl(dataUrl);
  try {
    const metadata = await sharp(decoded.buffer).metadata();
    const expectedFormat = decoded.mimeType === "image/png" ? "png" : "jpeg";
    if (!metadata.width || !metadata.height || metadata.format !== expectedFormat) {
      throw new Error("Declared image type does not match the decoded image.");
    }
    return await sharp(decoded.buffer).png().toBuffer();
  } catch (error) {
    throw new MotionRequestError(
      error instanceof Error ? `Invalid uploaded image: ${error.message}` : "Invalid uploaded image.",
      400
    );
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function generateSheet(
  request: NextRequest,
  prompt: string,
  cols: number,
  rows: number,
  options: {
    action?: MotionActionPreset;
    referenceImage?: z.infer<typeof referenceSourceSchema>;
  } = {}
): Promise<Buffer> {
  const hasReference = options.referenceImage !== undefined;
  const sheetPrompt = buildSheetPrompt({
    description: prompt,
    cols,
    rows,
    hasReference,
    action: options.action
  });
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const generateRequest = new NextRequest(new URL("/api/generate", request.nextUrl.origin), {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt: sheetPrompt,
      mode: "create",
      options: {
        outputMimeType: "image/png",
        format: "png",
        count: 1,
        ...(hasReference ? { referenceImage: options.referenceImage } : {})
      }
    })
  });
  const response = await generateImage(generateRequest);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new MotionRequestError(
      "Image generation returned an unreadable response.",
      upstreamFailureStatus(response.status)
    );
  }
  const result = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!response.ok || result.ok !== true) {
    throw new MotionRequestError(
      typeof result.reason === "string" ? result.reason : "Sprite-sheet generation failed.",
      upstreamFailureStatus(response.status)
    );
  }
  if (typeof result.id !== "string" || !result.id) {
    throw new MotionRequestError("Image generation did not return an image id.", 502);
  }
  const stored = await readImageById(result.id);
  if (!stored) {
    throw new MotionRequestError("Generated sprite sheet could not be read from storage.", 502);
  }
  const buffer = await streamToBuffer(stored.stream);
  try {
    return await sharp(buffer).png().toBuffer();
  } catch (error) {
    throw new MotionRequestError(
      error instanceof Error ? `Generated image is invalid: ${error.message}` : "Generated image is invalid.",
      502
    );
  }
}

export async function GET(): Promise<Response> {
  try {
    return NextResponse.json({ ok: true, projects: await listProjects() });
  } catch (error) {
    return requestError(error, "/api/motion/projects GET error");
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const payload = createProjectSchema.parse(await readRequestJson(request));
    let sheetBuffer: Buffer;
    if (payload.source.type === "upload") {
      sheetBuffer = await normalizeUpload(payload.source.dataUrl);
    } else if (payload.source.type === "reference") {
      sheetBuffer = await generateSheet(
        request,
        payload.source.prompt,
        payload.grid.cols,
        payload.grid.rows,
        { action: payload.source.action, referenceImage: payload.source.referenceImage }
      );
    } else {
      sheetBuffer = await generateSheet(
        request,
        payload.source.prompt,
        payload.grid.cols,
        payload.grid.rows,
        { action: payload.source.action }
      );
    }
    const matte = matteSpecSchema.parse(
      payload.matte
        ? {
            ...payload.matte,
            ...(payload.matte.mode === "keyColor" && !payload.matte.keyColor
              ? { keyColor: "#FF00FF" }
              : {})
          }
        : { mode: "keyColor", keyColor: "#FF00FF", tolerance: 45, softness: 2, despill: true }
    );
    const project = await createProject({
      name: payload.name,
      sheetBuffer,
      sliceMode: payload.sliceMode ?? "auto",
      normalizeScale: payload.normalizeScale ?? "area",
      grid: payload.grid,
      matte
    });
    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (error) {
    return requestError(error, "/api/motion/projects POST error");
  }
}
