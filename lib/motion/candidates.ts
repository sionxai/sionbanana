import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {
  motionRoot,
  projectDir,
  readProject,
  withMotionProjectMutation
} from "@/lib/motion/storage";
import {
  candidateModeValues,
  parseCandidate,
  type Candidate
} from "@/lib/motion/types";

const CANDIDATE_ID_RE = /^[A-Za-z0-9-]+$/;
const CANDIDATE_FILE_RE = /^(?:frames|masks)\/f[0-9]{2,}\.png$/;

export class CandidateStorageError extends Error {
  readonly status: number;
  readonly code: "INVALID_ID" | "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT";

  constructor(
    code: CandidateStorageError["code"],
    message: string,
    status: number
  ) {
    super(message);
    this.name = "CandidateStorageError";
    this.code = code;
    this.status = status;
  }
}

type CandidateFrameInput = { index: number; image?: Buffer; mask?: Buffer };
type CreateCandidateInput = {
  mode: Candidate["mode"];
  frames: CandidateFrameInput[];
  instruction?: string | null;
  protect?: string[];
  cellAligned?: boolean;
  requiresReview?: boolean;
  reviewReasons?: string[];
};

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function assertCandidateId(candidateId: string): void {
  if (!CANDIDATE_ID_RE.test(candidateId)) {
    throw new CandidateStorageError("INVALID_ID", "Motion candidate was not found.", 404);
  }
}

function assertCandidateFile(relativePath: string): void {
  if (!CANDIDATE_FILE_RE.test(relativePath)) {
    throw new CandidateStorageError("INVALID_INPUT", "Invalid candidate file path.", 400);
  }
}

async function safeProjectDirectory(projectId: string): Promise<string> {
  await readProject(projectId);
  const directory = projectDir(projectId);
  try {
    const [root, realDirectory, entry] = await Promise.all([
      fs.realpath(motionRoot()),
      fs.realpath(directory),
      fs.lstat(directory)
    ]);
    if (entry.isSymbolicLink() || !entry.isDirectory() || path.dirname(realDirectory) !== root) {
      throw new CandidateStorageError("NOT_FOUND", `Motion project ${projectId} was not found.`, 404);
    }
    return realDirectory;
  } catch (error) {
    if (error instanceof CandidateStorageError) throw error;
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") {
      throw new CandidateStorageError("NOT_FOUND", `Motion project ${projectId} was not found.`, 404);
    }
    throw error;
  }
}

async function ensureDirectory(parent: string, name: string): Promise<string> {
  const directory = path.join(parent, name);
  try {
    await fs.mkdir(directory);
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
  }
  const entry = await fs.lstat(directory);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new CandidateStorageError("CONFLICT", "Candidate storage directory is invalid.", 409);
  }
  const realParent = await fs.realpath(parent);
  const realDirectory = await fs.realpath(directory);
  if (path.dirname(realDirectory) !== realParent) {
    throw new CandidateStorageError("CONFLICT", "Candidate storage directory is invalid.", 409);
  }
  return realDirectory;
}

async function candidatesDirectory(projectId: string, create: boolean): Promise<string | null> {
  const directory = await safeProjectDirectory(projectId);
  const target = path.join(directory, "candidates");
  if (create) return ensureDirectory(directory, "candidates");
  try {
    const entry = await fs.lstat(target);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new CandidateStorageError("NOT_FOUND", "Candidate storage was not found.", 404);
    }
    const realTarget = await fs.realpath(target);
    if (path.dirname(realTarget) !== directory) {
      throw new CandidateStorageError("NOT_FOUND", "Candidate storage was not found.", 404);
    }
    return realTarget;
  } catch (error) {
    if (error instanceof CandidateStorageError) throw error;
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") return null;
    throw error;
  }
}

async function candidateDirectory(projectId: string, candidateId: string): Promise<string> {
  assertCandidateId(candidateId);
  const root = await candidatesDirectory(projectId, false);
  if (!root) throw new CandidateStorageError("NOT_FOUND", "Motion candidate was not found.", 404);
  const directory = path.join(root, candidateId);
  try {
    const [entry, realDirectory] = await Promise.all([fs.lstat(directory), fs.realpath(directory)]);
    if (entry.isSymbolicLink() || !entry.isDirectory() || path.dirname(realDirectory) !== root) {
      throw new CandidateStorageError("NOT_FOUND", "Motion candidate was not found.", 404);
    }
    return realDirectory;
  } catch (error) {
    if (error instanceof CandidateStorageError) throw error;
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") {
      throw new CandidateStorageError("NOT_FOUND", "Motion candidate was not found.", 404);
    }
    throw error;
  }
}

async function safeCandidateFile(directory: string, relativePath: string): Promise<string> {
  assertCandidateFile(relativePath);
  const segments = relativePath.split("/");
  let current = directory;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    try {
      const entry = await fs.lstat(current);
      if (entry.isSymbolicLink()) {
        throw new CandidateStorageError("NOT_FOUND", "Candidate file was not found.", 404);
      }
      if (index < segments.length - 1 && !entry.isDirectory()) {
        throw new CandidateStorageError("NOT_FOUND", "Candidate file was not found.", 404);
      }
      if (index === segments.length - 1 && !entry.isFile()) {
        throw new CandidateStorageError("NOT_FOUND", "Candidate file was not found.", 404);
      }
    } catch (error) {
      if (error instanceof CandidateStorageError) throw error;
      if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") {
        throw new CandidateStorageError("NOT_FOUND", "Candidate file was not found.", 404);
      }
      throw error;
    }
  }
  const realFile = await fs.realpath(current);
  if (!realFile.startsWith(`${directory}${path.sep}`)) {
    throw new CandidateStorageError("NOT_FOUND", "Candidate file was not found.", 404);
  }
  return realFile;
}

async function atomicWrite(target: string, data: Buffer | string): Promise<void> {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, data, { flag: "wx" });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function normalizePng(buffer: Buffer, label: string): Promise<Buffer> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) throw new Error("image has no dimensions");
    return await sharp(buffer).ensureAlpha().png().toBuffer();
  } catch {
    throw new CandidateStorageError("INVALID_INPUT", `${label} must be a decodable image.`, 400);
  }
}

function candidateFrameName(index: number): string {
  return `f${String(index + 1).padStart(2, "0")}.png`;
}

async function readCandidateJson(directory: string): Promise<Candidate> {
  try {
    const jsonPath = path.join(directory, "candidate.json");
    const entry = await fs.lstat(jsonPath);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new CandidateStorageError("NOT_FOUND", "Motion candidate was not found.", 404);
    }
    const realJson = await fs.realpath(jsonPath);
    if (path.dirname(realJson) !== directory) {
      throw new CandidateStorageError("NOT_FOUND", "Motion candidate was not found.", 404);
    }
    const stored = JSON.parse(await fs.readFile(realJson, "utf8"));
    const hasStoredReviewRequirement =
      typeof stored === "object" && stored !== null && Object.prototype.hasOwnProperty.call(stored, "requiresReview");
    const candidate = parseCandidate(stored);
    if (hasStoredReviewRequirement) return candidate;

    const reviewReasons = [
      ...(candidate.metrics?.layoutFallback === "grid" ? ["layout-fallback-grid"] : []),
      ...(typeof candidate.metrics?.sliceConfidence === "number" && candidate.metrics.sliceConfidence < 1
        ? ["low-slice-confidence"]
        : [])
    ];
    return {
      ...candidate,
      requiresReview: reviewReasons.length > 0,
      reviewReasons
    };
  } catch (error) {
    if (error instanceof CandidateStorageError) throw error;
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") {
      throw new CandidateStorageError("NOT_FOUND", "Motion candidate was not found.", 404);
    }
    throw error;
  }
}

async function createCandidateUnlocked(projectId: string, input: CreateCandidateInput): Promise<Candidate> {
  const project = await readProject(projectId);
  if (!candidateModeValues.includes(input.mode)) {
    throw new CandidateStorageError("INVALID_INPUT", "Candidate mode is invalid.", 400);
  }
  if (!Array.isArray(input.frames) || input.frames.length === 0) {
    throw new CandidateStorageError("INVALID_INPUT", "Candidate must include at least one frame.", 400);
  }
  if (input.mode === "strip" && input.frames.length > 6) {
    throw new CandidateStorageError("INVALID_INPUT", "Strip candidates support at most six frames.", 400);
  }
  const indices = new Set<number>();
  for (const [position, frame] of input.frames.entries()) {
    if (!Number.isInteger(frame.index) || frame.index < 0 || frame.index >= project.frames.length) {
      throw new CandidateStorageError("INVALID_INPUT", `Frame index ${frame.index} is outside this project.`, 400);
    }
    if (indices.has(frame.index)) {
      throw new CandidateStorageError("INVALID_INPUT", `Candidate contains duplicate frame index ${frame.index}.`, 400);
    }
    indices.add(frame.index);
    if (input.mode === "upload" && !frame.image) {
      throw new CandidateStorageError("INVALID_INPUT", "Upload candidates require an image for every frame.", 400);
    }
    if (input.mode === "strip" && position > 0 && frame.index !== input.frames[position - 1].index + 1) {
      throw new CandidateStorageError(
        "INVALID_INPUT",
        "Strip candidate frame indices must be consecutive and ascending.",
        400
      );
    }
  }
  const instruction = input.instruction === undefined ? null : input.instruction;
  if (instruction !== null && (typeof instruction !== "string" || instruction.length > 4000)) {
    throw new CandidateStorageError("INVALID_INPUT", "Candidate instruction is invalid.", 400);
  }
  const protect = input.protect ?? [];
  if (!Array.isArray(protect) || protect.some(value => typeof value !== "string" || !value.trim() || value.trim().length > 200)) {
    throw new CandidateStorageError("INVALID_INPUT", "Candidate protect values are invalid.", 400);
  }
  const cellAligned = input.cellAligned ?? false;
  if (typeof cellAligned !== "boolean") {
    throw new CandidateStorageError("INVALID_INPUT", "Candidate cell alignment is invalid.", 400);
  }
  const requiresReview = input.requiresReview ?? false;
  if (typeof requiresReview !== "boolean") {
    throw new CandidateStorageError("INVALID_INPUT", "Candidate review requirement is invalid.", 400);
  }
  const reviewReasons = input.reviewReasons ?? [];
  if (
    !Array.isArray(reviewReasons) ||
    reviewReasons.some(reason => typeof reason !== "string" || reason.length === 0)
  ) {
    throw new CandidateStorageError("INVALID_INPUT", "Candidate review reasons are invalid.", 400);
  }

  const candidates = await candidatesDirectory(projectId, true);
  const id = `cand-${Date.now()}-${randomUUID()}`;
  const directory = path.join(candidates!, id);
  await fs.mkdir(directory);
  try {
    const realDirectory = await fs.realpath(directory);
    if (path.dirname(realDirectory) !== candidates) {
      throw new CandidateStorageError("CONFLICT", "Candidate storage directory is invalid.", 409);
    }
    const framesDirectory = await ensureDirectory(realDirectory, "frames");
    const masksDirectory = await ensureDirectory(realDirectory, "masks");
    const candidateFrames: Candidate["frames"] = [];
    for (const frame of input.frames) {
      const name = candidateFrameName(frame.index);
      let file: string | null = null;
      let mask: string | null = null;
      if (frame.image) {
        await atomicWrite(path.join(framesDirectory, name), await normalizePng(frame.image, "Candidate image"));
        file = `frames/${name}`;
      }
      if (frame.mask) {
        const normalizedMask = await normalizePng(frame.mask, "Candidate mask");
        const metadata = await sharp(normalizedMask).metadata();
        const cell = project.frames[frame.index].source;
        if (metadata.width !== cell.w || metadata.height !== cell.h) {
          throw new CandidateStorageError(
            "INVALID_INPUT",
            `mask size must match the cell (${cell.w}x${cell.h})`,
            400
          );
        }
        await atomicWrite(path.join(masksDirectory, name), normalizedMask);
        mask = `masks/${name}`;
      }
      candidateFrames.push({ index: frame.index, file, mask });
    }
    const now = new Date().toISOString();
    const candidate = parseCandidate({
      id,
      projectId,
      mode: input.mode,
      status: input.mode === "upload" ? "ready" : "pending",
      frames: candidateFrames,
      instruction,
      protect: protect.map(value => value.trim()),
      cellAligned,
      requiresReview,
      reviewReasons,
      baseline: candidateFrames.map(frame => ({
        index: frame.index,
        overrideCandidateId: project.frames[frame.index].override?.candidateId ?? null
      })),
      reason: null,
      createdAtIso: now,
      updatedAtIso: now,
      appliedAtIso: null,
      metrics: null
    });
    await atomicWrite(path.join(realDirectory, "candidate.json"), `${JSON.stringify(candidate, null, 2)}\n`);
    return candidate;
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function createCandidate(projectId: string, input: CreateCandidateInput): Promise<Candidate> {
  return withMotionProjectMutation(projectId, () => createCandidateUnlocked(projectId, input));
}

export async function readCandidate(projectId: string, candidateId: string): Promise<Candidate> {
  const candidate = await readCandidateJson(await candidateDirectory(projectId, candidateId));
  if (candidate.id !== candidateId || candidate.projectId !== projectId) {
    throw new CandidateStorageError("NOT_FOUND", "Motion candidate was not found.", 404);
  }
  return candidate;
}

export async function listCandidates(projectId: string): Promise<Array<Pick<Candidate, "id" | "mode" | "status" | "createdAtIso" | "appliedAtIso"> & { frames: number[] }>> {
  const root = await candidatesDirectory(projectId, false);
  if (!root) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const candidates = [] as Array<Pick<Candidate, "id" | "mode" | "status" | "createdAtIso" | "appliedAtIso"> & { frames: number[] }>;
  for (const entry of entries) {
    if (!entry.isDirectory() || !CANDIDATE_ID_RE.test(entry.name)) continue;
    const candidate = await readCandidate(projectId, entry.name);
    candidates.push({
      id: candidate.id,
      mode: candidate.mode,
      status: candidate.status,
      frames: candidate.frames.map(frame => frame.index),
      createdAtIso: candidate.createdAtIso,
      appliedAtIso: candidate.appliedAtIso
    });
  }
  return candidates.sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso));
}

async function updateCandidateUnlocked(
  projectId: string,
  candidateId: string,
  mutator: (candidate: Candidate) => Candidate
): Promise<Candidate> {
  const directory = await candidateDirectory(projectId, candidateId);
  const current = await readCandidate(projectId, candidateId);
  const updated = parseCandidate({
    ...mutator(current),
    id: candidateId,
    projectId,
    createdAtIso: current.createdAtIso,
    updatedAtIso: new Date().toISOString()
  });
  await atomicWrite(path.join(directory, "candidate.json"), `${JSON.stringify(updated, null, 2)}\n`);
  return updated;
}

export async function updateCandidate(
  projectId: string,
  candidateId: string,
  mutator: (candidate: Candidate) => Candidate
): Promise<Candidate> {
  return withMotionProjectMutation(projectId, () =>
    updateCandidateUnlocked(projectId, candidateId, mutator)
  );
}

async function deleteCandidateUnlocked(projectId: string, candidateId: string): Promise<void> {
  const candidate = await readCandidate(projectId, candidateId);
  if (candidate.status === "running") {
    throw new CandidateStorageError("CONFLICT", "Running candidates cannot be deleted.", 409);
  }
  const directory = await candidateDirectory(projectId, candidateId);
  await fs.rm(directory, { recursive: true, force: false });
}

export async function deleteCandidate(projectId: string, candidateId: string): Promise<void> {
  return withMotionProjectMutation(projectId, () => deleteCandidateUnlocked(projectId, candidateId));
}

export async function candidateFramePath(
  projectId: string,
  candidateId: string,
  index: number
): Promise<string> {
  if (!Number.isInteger(index) || index < 0) {
    throw new CandidateStorageError("INVALID_ID", "Candidate frame was not found.", 404);
  }
  const candidate = await readCandidate(projectId, candidateId);
  const frame = candidate.frames.find(value => value.index === index);
  if (!frame?.file) throw new CandidateStorageError("NOT_FOUND", "Candidate frame was not found.", 404);
  return safeCandidateFile(await candidateDirectory(projectId, candidateId), frame.file);
}

async function writeCandidateFrameUnlocked(
  projectId: string,
  candidateId: string,
  index: number,
  buffer: Buffer
): Promise<Candidate> {
  if (!Number.isInteger(index) || index < 0) {
    throw new CandidateStorageError("INVALID_INPUT", "Candidate frame index is invalid.", 400);
  }
  const directory = await candidateDirectory(projectId, candidateId);
  const candidate = await readCandidate(projectId, candidateId);
  if (!candidate.frames.some(frame => frame.index === index)) {
    throw new CandidateStorageError("NOT_FOUND", "Candidate frame was not found.", 404);
  }
  const frames = await ensureDirectory(directory, "frames");
  const name = candidateFrameName(index);
  await atomicWrite(path.join(frames, name), await normalizePng(buffer, "Candidate image"));
  return updateCandidate(projectId, candidateId, current => ({
    ...current,
    frames: current.frames.map(frame =>
      frame.index === index ? { ...frame, file: `frames/${name}` } : frame
    )
  }));
}

export async function writeCandidateFrame(
  projectId: string,
  candidateId: string,
  index: number,
  buffer: Buffer
): Promise<Candidate> {
  return withMotionProjectMutation(projectId, () =>
    writeCandidateFrameUnlocked(projectId, candidateId, index, buffer)
  );
}
