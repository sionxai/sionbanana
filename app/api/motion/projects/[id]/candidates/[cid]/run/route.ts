import { Buffer } from "node:buffer";

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { POST as generateImage } from "@/app/api/generate/route";
import { readImageById } from "@/lib/local/storage";
import {
  CandidateStorageError
} from "@/lib/motion/candidates";
import { codexEditImage, runCandidate } from "@/lib/motion/candidate-generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string; cid: string } };

class CandidateRunRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function errorResponse(error: unknown, context: string): Response {
  if (error instanceof CandidateStorageError || error instanceof CandidateRunRequestError) {
    return NextResponse.json({ ok: false, reason: error.message }, { status: error.status });
  }
  console.error(context, "Unexpected motion candidate generation failure");
  return NextResponse.json({ ok: false, reason: "Unable to generate motion candidate." }, { status: 500 });
}

function dataUrl(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function generateCandidateSheet(request: NextRequest, input: {
  prompt: string;
  references: Buffer[];
}): Promise<Buffer> {
  const [referenceImage, ...referenceGallery] = input.references;
  if (!referenceImage) throw new CandidateRunRequestError("Candidate generation requires a reference image.", 400);
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const generateRequest = new NextRequest(new URL("/api/generate", request.nextUrl.origin), {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt: input.prompt,
      mode: "create",
      options: {
        outputMimeType: "image/png",
        format: "png",
        count: 1,
        referenceImage: dataUrl(referenceImage),
        referenceGallery: referenceGallery.map(dataUrl)
      }
    })
  });
  const response = await generateImage(generateRequest);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CandidateRunRequestError("Image generation returned an unreadable response.", 502);
  }
  const result = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!response.ok || result.ok !== true) {
    throw new CandidateRunRequestError(
      typeof result.reason === "string" ? result.reason : "Candidate sheet generation failed.",
      response.status >= 400 && response.status < 500 ? response.status : 502
    );
  }
  if (typeof result.id !== "string" || !result.id) {
    throw new CandidateRunRequestError("Image generation did not return an image id.", 502);
  }
  const stored = await readImageById(result.id);
  if (!stored) {
    throw new CandidateRunRequestError("Generated candidate sheet could not be read from storage.", 502);
  }
  try {
    return await sharp(await streamToBuffer(stored.stream)).png().toBuffer();
  } catch (error) {
    throw new CandidateRunRequestError(
      error instanceof Error ? `Generated image is invalid: ${error.message}` : "Generated image is invalid.",
      502
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const candidate = await runCandidate(params.id, params.cid, {
      editImage: codexEditImage,
      generateSheet: input => generateCandidateSheet(request, input)
    });
    if (candidate.status === "failed") {
      return NextResponse.json(
        { ok: false, candidate, reason: candidate.reason ?? "Candidate generation failed." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, candidate });
  } catch (error) {
    return errorResponse(error, "/api/motion/projects/[id]/candidates/[cid]/run POST error");
  }
}
