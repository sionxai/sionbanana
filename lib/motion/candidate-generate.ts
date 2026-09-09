import "server-only";

import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import path from "node:path";
import sharp from "sharp";

import { callCodexResponses, getLastObservedImageBackend } from "@/lib/codex-fetch";
import {
  CandidateStorageError,
  readCandidate,
  updateCandidate,
  writeCandidateFrame
} from "@/lib/motion/candidates";
import {
  applyMatte,
  computeGrid,
  detectFrameRects,
  sliceFrames
} from "@/lib/motion/engine";
import { buildSheetPrompt } from "@/lib/motion/prompt";
import {
  readAssetFile,
  readOrientedCell,
  readProject,
  withMotionProjectMutation
} from "@/lib/motion/storage";
import type { Candidate } from "@/lib/motion/types";

const FRAME_RETRY_COUNT = 1;
const FRAME_GENERATION_TIMEOUT_MS = 120_000;
const RUNNING_GRACE_MS = 60_000;
const MASK_COMPOSITE_FEATHER = 2;

export type CandidateGenerateDeps = {
  editImage: (input: { image: Buffer; mask: Buffer; prompt: string }) => Promise<Buffer>;
  generateSheet: (input: { prompt: string; references: Buffer[] }) => Promise<Buffer>;
  now?: () => Date;
};

export type StripPlan = {
  anchorBefore: number | null;
  anchorAfter: number | null;
  cells: number;
  cols: number;
  rows: number;
};

type RunningCandidate = { candidate: Candidate; startedAtIso: string; shouldRun: boolean };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

async function readProjectAsset(projectId: string, relativePath: string): Promise<Buffer> {
  const asset = await readAssetFile(projectId, relativePath);
  if (!asset) throw new Error(`Motion asset is missing: ${relativePath}`);
  return streamToBuffer(asset.stream);
}

function runningStartedAt(candidate: Candidate): string | null {
  const value = candidate.metrics?.startedAtIso;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function isFreshRunningCandidate(candidate: Candidate, now: Date): boolean {
  const startedAtIso = runningStartedAt(candidate) ?? candidate.updatedAtIso;
  const startedAt = Date.parse(startedAtIso);
  if (Number.isNaN(startedAt)) return false;
  const staleAfter = candidate.frames.length * FRAME_GENERATION_TIMEOUT_MS + RUNNING_GRACE_MS;
  return now.getTime() - startedAt <= staleAfter;
}

async function claimCandidate(
  projectId: string,
  candidateId: string,
  now: () => Date
): Promise<RunningCandidate> {
  let shouldRun = false;
  let startedAtIso = "";
  const candidate = await updateCandidate(projectId, candidateId, current => {
    if (current.mode === "upload") {
      throw new CandidateStorageError("CONFLICT", "Upload candidates cannot be generated.", 409);
    }
    if (current.status === "ready") {
      if (current.appliedAtIso) {
        throw new CandidateStorageError("CONFLICT", "Applied candidates cannot be generated again.", 409);
      }
      return current;
    }
    if (current.status === "running" && isFreshRunningCandidate(current, now())) {
      throw new CandidateStorageError("CONFLICT", "Candidate generation is already running.", 409);
    }

    shouldRun = true;
    startedAtIso = now().toISOString();
    return {
      ...current,
      status: "running",
      reason: null,
      metrics: { startedAtIso }
    };
  });
  return { candidate, startedAtIso, shouldRun };
}

async function assertClaim(projectId: string, candidateId: string, startedAtIso: string): Promise<void> {
  const current = await readCandidate(projectId, candidateId);
  if (current.status !== "running" || runningStartedAt(current) !== startedAtIso) {
    throw new CandidateStorageError("CONFLICT", "Candidate generation was superseded by a newer run.", 409);
  }
}

async function finishClaim(
  projectId: string,
  candidateId: string,
  startedAtIso: string,
  input: {
    status: "ready" | "failed";
    reason: string | null;
    metrics: Record<string, unknown> | null;
    cellAligned?: boolean;
    requiresReview?: boolean;
    reviewReasons?: string[];
  }
): Promise<Candidate> {
  return updateCandidate(projectId, candidateId, current => {
    if (current.status !== "running" || runningStartedAt(current) !== startedAtIso) return current;
    return {
      ...current,
      status: input.status,
      reason: input.reason,
      metrics: input.metrics,
      ...(input.cellAligned === undefined ? {} : { cellAligned: input.cellAligned }),
      ...(input.requiresReview === undefined ? {} : { requiresReview: input.requiresReview }),
      ...(input.reviewReasons === undefined ? {} : { reviewReasons: input.reviewReasons })
    };
  });
}

async function writeClaimedFrame(
  projectId: string,
  candidateId: string,
  startedAtIso: string,
  index: number,
  buffer: Buffer
): Promise<void> {
  await withMotionProjectMutation(projectId, async () => {
    await assertClaim(projectId, candidateId, startedAtIso);
    await writeCandidateFrame(projectId, candidateId, index, buffer);
    await assertClaim(projectId, candidateId, startedAtIso);
  });
}

// CEO 실측(2026-09-07, 4회 대조): "transparent (editable) area of the mask" 같은 표현을 쓰면 모델이
// 이미지의 투명 배경을 편집 대상으로 오해해 전체를 다시 그린다(마스크 안/밖 차 114/114, 배경 불투명화).
// 마스크는 도구 파라미터로만 전달하고 프롬프트에서는 언급하지 않으며, 보존 대상을 직접 열거해야 한다
// (같은 마스크로 31/19, 좁은 마스크로 16/10까지 개선).
export function buildMaskEditPrompt(input: {
  instruction: string | null;
  protect: string[];
  backgroundHex?: string | null;
}): string {
  const protect = input.protect.length ? ` Keep ${input.protect.join(", ")} exactly as they are.` : "";
  // 실측: 편집 결과는 항상 불투명하게 돌아온다. 투명을 요구하는 대신 원본과 같은 평면 크로마 배경을
  // 유지시키고, 저장 직전에 프로젝트 매트로 다시 키잉한다.
  const background = input.backgroundHex
    ? ` The background must stay one flat solid ${input.backgroundHex} chroma color with no scenery, gradient or shadow.`
    : " Do not add or paint any background.";
  return `Edit this sprite frame: ${
    input.instruction ?? "fix the drawing where it is wrong"
  }. Change nothing else — the face, hair, clothing, pose, proportions, scale, colors and outline style must stay pixel-identical.${protect}${background}`;
}

export function buildStripPlan(input: {
  frameCount: number;
  start: number;
  end: number;
}): StripPlan {
  if (
    !Number.isInteger(input.frameCount) ||
    input.frameCount < 1 ||
    !Number.isInteger(input.start) ||
    !Number.isInteger(input.end) ||
    input.start < 0 ||
    input.end < input.start ||
    input.end >= input.frameCount
  ) {
    throw new RangeError("Invalid strip frame range.");
  }
  const anchorBefore = input.start > 0 ? input.start - 1 : null;
  const anchorAfter = input.end + 1 < input.frameCount ? input.end + 1 : null;
  const cells = input.end - input.start + 1 + Number(anchorBefore !== null) + Number(anchorAfter !== null);
  return cells <= 4
    ? { anchorBefore, anchorAfter, cells, cols: cells, rows: 1 }
    : { anchorBefore, anchorAfter, cells, cols: Math.ceil(cells / 2), rows: 2 };
}

export function buildStripPrompt(input: {
  plan: StripPlan;
  instruction: string | null;
  protect: string[];
  subjectType: "character" | "object";
}): string {
  const anchorCount = Number(input.plan.anchorBefore !== null) + Number(input.plan.anchorAfter !== null);
  const middleCount = input.plan.cells - anchorCount;
  const frames: string[] = [];
  if (input.plan.anchorBefore !== null) {
    frames.push("EXACTLY the pose shown in reference image 2 (anchor), reproduced unchanged at the same scale");
  }
  for (let index = 0; index < middleCount; index += 1) {
    frames.push(
      `in-between pose ${index + 1} of ${middleCount} continuing the motion from the anchor before to the anchor after${
        input.instruction ? `, ${input.instruction}` : ""
      }`
    );
  }
  if (input.plan.anchorAfter !== null) {
    const referenceNumber = input.plan.anchorBefore === null ? 2 : 3;
    frames.push(
      `EXACTLY the pose shown in reference image ${referenceNumber} (anchor), reproduced unchanged at the same scale`
    );
  }
  while (frames.length < input.plan.cols * input.plan.rows) {
    frames.push("leave this unused cell completely empty with only the chroma background");
  }

  const protect = input.protect.length
    ? ` Keep ${input.protect.join(", ")} unchanged in every cell.`
    : "";
  const description =
    "the exact same character as the reference images (reference 1 is the full motion sheet of this character). " +
    "Cells must not touch each other: leave clear empty chroma background between figures and keep each figure fully inside its own cell. " +
    `${input.instruction ?? ""}${protect}`;
  return buildSheetPrompt({
    description,
    cols: input.plan.cols,
    rows: input.plan.rows,
    frames,
    hasReference: true,
    subjectType: input.subjectType
  });
}

export async function autoMaskFromCell(cell: Buffer): Promise<Buffer> {
  const source = await sharp(cell).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = source.info.width;
  let minY = source.info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < source.info.height; y += 1) {
    for (let x = 0; x < source.info.width; x += 1) {
      if (source.data[(y * source.info.width + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const mask = Buffer.alloc(source.info.width * source.info.height * 4, 0);
  for (let offset = 3; offset < mask.length; offset += 4) mask[offset] = 255;
  if (maxX >= minX && maxY >= minY) {
    const left = Math.max(0, minX - 4);
    const top = Math.max(0, minY - 4);
    const right = Math.min(source.info.width - 1, maxX + 4);
    const bottom = Math.min(source.info.height - 1, maxY + 4);
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        mask[(y * source.info.width + x) * 4 + 3] = 0;
      }
    }
  }
  return sharp(mask, {
    raw: { width: source.info.width, height: source.info.height, channels: 4 }
  })
    .png()
    .toBuffer();
}

/**
 * 편집 결과에서 마스크 안쪽만 취하고 바깥은 원본 픽셀을 그대로 쓴다.
 * mask 알파 0 = 편집 영역, 255 = 보존 영역. feather는 경계 혼합 반경(px).
 */
export async function compositeInsideMask(input: {
  original: Buffer;
  edited: Buffer;
  mask: Buffer;
  feather?: number;
}): Promise<Buffer> {
  const original = await sharp(input.original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!original.info.width || !original.info.height || original.info.channels !== 4) {
    throw new Error("Original image must decode to RGBA pixels.");
  }
  const mask = await sharp(input.mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (mask.info.width !== original.info.width || mask.info.height !== original.info.height) {
    throw new RangeError("Mask dimensions must match the original image.");
  }
  if (mask.info.channels !== 4) throw new Error("Mask image must decode to RGBA pixels.");

  const edited = await sharp(input.edited)
    .resize(original.info.width, original.info.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (edited.info.channels !== 4) throw new Error("Edited image must decode to RGBA pixels.");

  const feather = input.feather ?? MASK_COMPOSITE_FEATHER;
  if (!Number.isFinite(feather) || feather < 0) {
    throw new RangeError("Mask feather must be a non-negative finite number.");
  }

  const pixelCount = original.info.width * original.info.height;
  const weights = Buffer.alloc(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    weights[index] = 255 - mask.data[index * 4 + 3];
  }
  if (feather > 0) {
    const blurred = await sharp(weights, {
      raw: { width: original.info.width, height: original.info.height, channels: 1 }
    })
      .blur(feather)
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let index = 0; index < pixelCount; index += 1) {
      // 보존 알파 255는 페더가 번져도 원본 RGBA 바이트를 반드시 유지한다.
      weights[index] = mask.data[index * 4 + 3] === 255 ? 0 : blurred.data[index * blurred.info.channels];
    }
  }

  const composite = Buffer.alloc(pixelCount * 4);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    if (mask.data[offset + 3] === 255) {
      original.data.copy(composite, offset, offset, offset + 4);
      continue;
    }
    const weight = weights[index] / 255;
    const originalAlpha = original.data[offset + 3] / 255;
    const editedAlpha = edited.data[offset + 3] / 255;
    const outputAlpha = originalAlpha * (1 - weight) + editedAlpha * weight;
    composite[offset + 3] = Math.round(outputAlpha * 255);
    for (let channel = 0; channel < 3; channel += 1) {
      composite[offset + channel] = outputAlpha > 0
        ? Math.round(
            (original.data[offset + channel] * originalAlpha * (1 - weight) +
              edited.data[offset + channel] * editedAlpha * weight) /
              outputAlpha
          )
        : 0;
    }
  }
  return sharp(composite, {
    raw: { width: original.info.width, height: original.info.height, channels: 4 }
  })
    .png()
    .toBuffer();
}

async function readCandidateMask(
  projectId: string,
  candidate: Candidate,
  index: number,
  cell: { buffer: Buffer; width: number; height: number }
): Promise<Buffer> {
  const frame = candidate.frames.find(value => value.index === index);
  if (!frame?.mask) return autoMaskFromCell(cell.buffer);
  const mask = await readProjectAsset(projectId, `candidates/${candidate.id}/${frame.mask}`);
  const metadata = await sharp(mask).metadata();
  if (metadata.width !== cell.width || metadata.height !== cell.height) {
    throw new Error(`Mask for frame ${index + 1} does not match the source cell size.`);
  }
  return mask;
}

async function runMaskCandidate(
  projectId: string,
  candidate: Candidate,
  startedAtIso: string,
  deps: CandidateGenerateDeps
): Promise<Record<string, unknown>> {
  let retries = 0;
  let imageBackend: { model?: string; quality?: string; size?: string } | undefined;
  const project = await readProject(projectId);
  const backgroundHex =
    project.matte.mode === "keyColor" && project.matte.keyColor ? project.matte.keyColor : null;
  const prompt = buildMaskEditPrompt({
    instruction: candidate.instruction,
    protect: candidate.protect,
    backgroundHex
  });
  for (const frame of candidate.frames) {
    try {
      await assertClaim(projectId, candidate.id, startedAtIso);
      const cell = await readOrientedCell(projectId, frame.index);
      const mask = await readCandidateMask(projectId, candidate, frame.index, cell);
      // 투명 셀을 그대로 보내면 모델이 배경을 임의로 채운다. 키 컬러 위에 합성해 보내고 결과를 다시 키잉한다.
      const source = backgroundHex
        ? await sharp(cell.buffer).flatten({ background: backgroundHex }).png().toBuffer()
        : cell.buffer;
      let generated: Buffer | null = null;
      let failure: unknown;
      for (let attempt = 0; attempt <= FRAME_RETRY_COUNT; attempt += 1) {
        try {
          const edited = await deps.editImage({ image: source, mask, prompt });
          const observed = getLastObservedImageBackend();
          imageBackend =
            observed &&
            (observed.model !== undefined || observed.quality !== undefined || observed.size !== undefined)
              ? { model: observed.model, quality: observed.quality, size: observed.size }
              : undefined;
          const keyed = backgroundHex ? await applyMatte(edited, project.matte) : edited;
          generated = await compositeInsideMask({
            original: cell.buffer,
            edited: keyed,
            mask,
            feather: MASK_COMPOSITE_FEATHER
          });
          break;
        } catch (error) {
          failure = error;
          if (attempt < FRAME_RETRY_COUNT) retries += 1;
        }
      }
      if (!generated) throw new Error(errorMessage(failure));
      const generatedMetadata = await sharp(generated).metadata();
      if (generatedMetadata.width !== cell.width || generatedMetadata.height !== cell.height) {
        throw new Error(`Generated frame ${frame.index + 1} does not match the source cell size.`);
      }
      await writeClaimedFrame(projectId, candidate.id, startedAtIso, frame.index, generated);
    } catch (error) {
      if (error instanceof CandidateStorageError && error.code === "CONFLICT") throw error;
      throw new Error(`Frame ${frame.index + 1} edit failed: ${errorMessage(error)}`);
    }
  }
  return {
    mode: "mask",
    frames: candidate.frames.length,
    retries,
    maskComposite: true,
    feather: MASK_COMPOSITE_FEATHER,
    ...(imageBackend ? { imageBackend } : {})
  };
}

async function runStripCandidate(
  projectId: string,
  candidate: Candidate,
  startedAtIso: string,
  deps: CandidateGenerateDeps
): Promise<Record<string, unknown>> {
  const indices = candidate.frames.map(frame => frame.index);
  const start = indices[0];
  const end = indices[indices.length - 1];
  if (
    indices.some((index, position) => position > 0 && index !== indices[position - 1] + 1) ||
    start === undefined ||
    end === undefined
  ) {
    throw new CandidateStorageError("INVALID_INPUT", "Strip candidate frame indices must be consecutive and ascending.", 400);
  }
  const project = await readProject(projectId);
  const plan = buildStripPlan({ frameCount: project.frames.length, start, end });
  if (plan.anchorBefore === null && plan.anchorAfter === null) {
    throw new Error("strip mode needs a neighboring frame outside the range");
  }
  const anchorIndices = [plan.anchorBefore, plan.anchorAfter].filter(
    (index): index is number => index !== null
  );
  const anchors = await Promise.all(anchorIndices.map(index => readOrientedCell(projectId, index)));
  const references = [await readProjectAsset(projectId, "derived/sheet.png"), ...anchors.map(anchor => anchor.buffer)];
  const subjectType = project.matte.keyColor?.toUpperCase() === "#00FF00" ? "character" : "object";
  const prompt = buildStripPrompt({
    plan,
    instruction: candidate.instruction,
    protect: candidate.protect,
    subjectType
  });

  let attempts = 0;
  let lastSheet: Buffer | null = null;
  let lastDetection: ReturnType<typeof detectFrameRects> | null = null;
  let acceptedFrames: Buffer[] | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assertClaim(projectId, candidate.id, startedAtIso);
    attempts += 1;
    const generated = await deps.generateSheet({ prompt, references });
    const matted = await applyMatte(generated, project.matte);
    const raw = await sharp(matted).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const detection = detectFrameRects(raw.data, raw.info, {
      expectedCols: plan.cols,
      expectedRows: plan.rows
    });
    lastSheet = matted;
    lastDetection = detection;
    if (detection.rects.length === plan.cells && detection.confidence === 1) {
      acceptedFrames = await sliceFrames(matted, detection.rects);
      break;
    }
  }
  if (!lastSheet || !lastDetection) throw new Error("Strip generation did not return a sheet.");

  let layoutFallback: "grid" | undefined;
  if (!acceptedFrames) {
    const metadata = await sharp(lastSheet).metadata();
    if (!metadata.width || !metadata.height) throw new Error("Unable to determine generated strip dimensions.");
    acceptedFrames = await sliceFrames(
      lastSheet,
      computeGrid(metadata.width, metadata.height, {
        cols: plan.cols,
        rows: plan.rows,
        gutter: 0,
        remainderPolicy: "distribute"
      })
    );
    layoutFallback = "grid";
  }

  const middleStart = plan.anchorBefore === null ? 0 : 1;
  const middleFrames = acceptedFrames.slice(middleStart, middleStart + indices.length);
  if (middleFrames.length !== indices.length) throw new Error("Generated strip is missing candidate frames.");
  for (const [position, frame] of middleFrames.entries()) {
    await writeClaimedFrame(projectId, candidate.id, startedAtIso, indices[position], frame);
  }
  return {
    mode: "strip",
    attempts,
    sliceConfidence: lastDetection.confidence,
    cols: plan.cols,
    rows: plan.rows,
    anchors: { before: plan.anchorBefore, after: plan.anchorAfter },
    ...(layoutFallback ? { layoutFallback } : {})
  };
}

export async function codexEditImage(input: {
  image: Buffer;
  mask: Buffer;
  prompt: string;
}): Promise<Buffer> {
  const result = await callCodexResponses({
    mode: "image",
    input: [
      {
        role: "system",
        content:
          "You edit images for the user using the image_generation tool. Use the supplied image as the source to edit. Do not narrate; just produce the image."
      },
      {
        role: "user",
        content: [
          { type: "input_image", image_url: dataUrl(input.image) },
          { type: "input_text", text: input.prompt }
        ]
      }
    ],
    imageOptions: {
      quality: "medium",
      size: "auto",
      output_format: "png",
      input_image_mask: dataUrl(input.mask)
    }
  });
  const image = result.images[0];
  if (!image?.b64) throw new Error("Image edit did not return an image.");
  return Buffer.from(image.b64, "base64");
}

export async function runCandidate(
  projectId: string,
  candidateId: string,
  deps: CandidateGenerateDeps
): Promise<Candidate> {
  const now = deps.now ?? (() => new Date());
  const claimed = await claimCandidate(projectId, candidateId, now);
  if (!claimed.shouldRun) return claimed.candidate;
  try {
    const metrics =
      claimed.candidate.mode === "mask"
        ? await runMaskCandidate(projectId, claimed.candidate, claimed.startedAtIso, deps)
        : await runStripCandidate(projectId, claimed.candidate, claimed.startedAtIso, deps);
    const reviewReasons =
      claimed.candidate.mode === "strip"
        ? [
            ...(metrics.layoutFallback === "grid" ? ["layout-fallback-grid"] : []),
            ...(typeof metrics.sliceConfidence === "number" && metrics.sliceConfidence < 1
              ? ["low-slice-confidence"]
              : [])
          ]
        : [];
    return finishClaim(projectId, candidateId, claimed.startedAtIso, {
      status: "ready",
      reason: null,
      metrics,
      ...(claimed.candidate.mode === "mask" ? { cellAligned: true } : {}),
      requiresReview: reviewReasons.length > 0,
      reviewReasons
    });
  } catch (error) {
    return finishClaim(projectId, candidateId, claimed.startedAtIso, {
      status: "failed",
      reason: errorMessage(error),
      metrics: null
    });
  }
}

export function spawnCandidateWorker(
  projectId: string,
  candidateId: string,
  baseUrl: string,
  spawnImpl: typeof spawn = spawn
): void {
  const workerPath = path.join(process.cwd(), "scripts", "motion-candidate-worker.mjs");
  spawnImpl(process.execPath, [workerPath, projectId, candidateId, baseUrl], {
    detached: true,
    stdio: "ignore",
    env: process.env
  }).unref();
}
