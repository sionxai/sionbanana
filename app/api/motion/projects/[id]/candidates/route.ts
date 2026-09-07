import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";

import {
  CandidateStorageError,
  createCandidate,
  listCandidates
} from "@/lib/motion/candidates";
import { spawnCandidateWorker } from "@/lib/motion/candidate-generate";
import { MotionStorageError } from "@/lib/motion/storage";
import { candidateModeValues } from "@/lib/motion/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_DATA_URL_CHARS = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 128;

const payloadSchema = z
  .object({
    mode: z.enum(candidateModeValues),
    frames: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            image: z.string().min(1).max(MAX_DATA_URL_CHARS).optional(),
            mask: z.string().min(1).max(MAX_DATA_URL_CHARS).optional()
          })
          .strict()
      )
      .min(1),
    instruction: z.string().max(4000).nullable().optional(),
    protect: z.array(z.string().trim().min(1).max(200)).optional(),
    start: z.boolean().default(true)
  })
  .strict();

class CandidateRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CandidateRequestError";
    this.status = status;
  }
}

function errorResponse(error: unknown, context: string): Response {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, reason: error.issues[0]?.message ?? "Invalid request.", issues: error.issues },
      { status: 400 }
    );
  }
  if (
    error instanceof CandidateRequestError ||
    error instanceof CandidateStorageError ||
    error instanceof MotionStorageError
  ) {
    return NextResponse.json({ ok: false, reason: error.message }, { status: error.status });
  }
  console.error(context, "Unexpected motion candidate failure");
  return NextResponse.json({ ok: false, reason: "Unable to process motion candidate." }, { status: 500 });
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw new CandidateRequestError("Request body must be valid JSON.", 400);
    throw error;
  }
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match || match[1].length === 0 || match[1].length % 4 !== 0) {
    throw new CandidateRequestError("Image data must be a base64 PNG or JPEG data URL.", 400);
  }
  const buffer = Buffer.from(match[1], "base64");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new CandidateRequestError("Uploaded image exceeds the 20MB limit.", 413);
  }
  return buffer;
}

async function normalizeDataUrl(dataUrl: string): Promise<Buffer> {
  const match = /^data:(image\/(?:png|jpeg));base64,/.exec(dataUrl);
  const buffer = decodeDataUrl(dataUrl);
  try {
    const metadata = await sharp(buffer).metadata();
    const expected = match?.[1] === "image/png" ? "png" : "jpeg";
    if (!metadata.width || !metadata.height || metadata.format !== expected) {
      throw new Error("Declared image type does not match the decoded image.");
    }
    return sharp(buffer).ensureAlpha().png().toBuffer();
  } catch (error) {
    throw new CandidateRequestError(
      error instanceof Error ? `Invalid uploaded image: ${error.message}` : "Invalid uploaded image.",
      400
    );
  }
}

type RouteContext = { params: { id: string } };
type RouteDeps = { spawnCandidateWorker?: typeof spawnCandidateWorker };

export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    return NextResponse.json({ ok: true, candidates: await listCandidates(params.id) });
  } catch (error) {
    return errorResponse(error, "/api/motion/projects/[id]/candidates GET error");
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
  deps: RouteDeps = {}
): Promise<Response> {
  try {
    const payload = payloadSchema.parse(await readJson(request));
    const frames = await Promise.all(
      payload.frames.map(async frame => ({
        index: frame.index,
        ...(frame.image ? { image: await normalizeDataUrl(frame.image) } : {}),
        ...(frame.mask ? { mask: await normalizeDataUrl(frame.mask) } : {})
      }))
    );
    const candidate = await createCandidate(params.id, {
      mode: payload.mode,
      frames,
      instruction: payload.instruction,
      protect: payload.protect
    });
    if (payload.mode !== "upload" && payload.start !== false) {
      (deps.spawnCandidateWorker ?? spawnCandidateWorker)(params.id, candidate.id, request.nextUrl.origin);
    }
    return NextResponse.json({ ok: true, candidate }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "/api/motion/projects/[id]/candidates POST error");
  }
}
