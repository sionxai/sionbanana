import "server-only";

import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { getDataDir } from "@/lib/local/storage";
import {
  analyzeFrame,
  applyMatte,
  computeGrid,
  detectFrameRects,
  normalizeFrames,
  packSheet,
  sliceFrames
} from "@/lib/motion/engine";
import {
  animationSchema,
  frameSchema,
  gridSpecSchema,
  matteSpecSchema,
  parseMotionProject,
  type Animation,
  type Frame,
  type GridSpec,
  type MatteSpec,
  type MotionProject,
  type SliceMode
} from "@/lib/motion/types";

const PROJECT_ID_RE = /^[A-Za-z0-9-]+$/;
const ASSET_PATH_RE = /^(?:raw\.png|derived\/(?:sheet\.png|debug-contact\.png|frames\/f[0-9]{2,}\.png))$/;

export type MotionProjectSummary = {
  id: string;
  name: string;
  createdAtIso: string;
  frameCount: number;
  thumbnailPath: string;
};

export type MotionProjectPatch = Partial<
  Pick<MotionProject, "sliceMode" | "grid" | "matte" | "frames" | "animations">
>;

export class MotionStorageError extends Error {
  readonly status: number;
  readonly code: "INVALID_ID" | "NOT_FOUND" | "INVALID_PATCH";

  constructor(
    code: MotionStorageError["code"],
    message: string,
    status: number
  ) {
    super(message);
    this.name = "MotionStorageError";
    this.code = code;
    this.status = status;
  }
}

type BuildArtifacts = {
  project: MotionProject;
  sheet: Buffer;
  debugContact: Buffer;
  frames: Buffer[];
};

function assertProjectId(id: string): void {
  if (!PROJECT_ID_RE.test(id)) {
    throw new MotionStorageError(
      "INVALID_ID",
      "Motion project id must contain only letters, numbers, and hyphens.",
      400
    );
  }
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export function motionRoot(): string {
  return path.join(getDataDir(), "motion-assets");
}

export function projectDir(id: string): string {
  assertProjectId(id);
  const root = path.resolve(motionRoot());
  const candidate = path.resolve(root, id);
  if (path.dirname(candidate) !== root) {
    throw new MotionStorageError("INVALID_ID", "Invalid motion project path.", 400);
  }
  return candidate;
}

function withDefaultKeyColor(matte: MatteSpec): MatteSpec {
  return matteSpecSchema.parse({
    ...matte,
    ...(matte.mode === "keyColor" && !matte.keyColor ? { keyColor: "#FF00FF" } : {})
  });
}

function makeDebugOverlay(
  width: number,
  height: number,
  packedRects: Frame["source"][],
  frames: Array<{ trim: Frame["trim"]; pivot: Frame["pivot"] }>
): Buffer {
  const lines: string[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    const packed = packedRects[index];
    const frame = frames[index];
    const trimX = packed.x + frame.trim.x;
    const trimY = packed.y + frame.trim.y;
    const pivotX = packed.x + frame.pivot.x;
    const pivotY = packed.y + frame.pivot.y;
    lines.push(
      `<rect x="${trimX + 0.5}" y="${trimY + 0.5}" width="${Math.max(0, frame.trim.w - 1)}" height="${Math.max(0, frame.trim.h - 1)}" fill="none" stroke="#ff3355" stroke-width="1"/>`,
      `<line x1="${pivotX - 6}" y1="${pivotY}" x2="${pivotX + 6}" y2="${pivotY}" stroke="#00e5ff" stroke-width="1"/>`,
      `<line x1="${pivotX}" y1="${pivotY - 6}" x2="${pivotX}" y2="${pivotY + 6}" stroke="#00e5ff" stroke-width="1"/>`
    );
  }
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${lines.join("")}</svg>`
  );
}

function frameControls(frames: Frame[], frameCount: number, explicit: boolean): Map<number, Frame> {
  if (explicit && frames.length !== frameCount) {
    throw new MotionStorageError(
      "INVALID_PATCH",
      `Explicit frames must contain exactly ${frameCount} entries.`,
      400
    );
  }
  const controls = new Map<number, Frame>();
  for (const candidate of frames) {
    const frame = frameSchema.parse(candidate);
    if (frame.index >= frameCount) {
      if (!explicit) continue;
      throw new MotionStorageError(
        "INVALID_PATCH",
        `Frame index ${frame.index} is outside the rebuilt grid.`,
        400
      );
    }
    if (controls.has(frame.index)) {
      throw new MotionStorageError("INVALID_PATCH", `Duplicate frame index ${frame.index}.`, 400);
    }
    controls.set(frame.index, frame);
  }
  if (explicit && controls.size !== frameCount) {
    throw new MotionStorageError(
      "INVALID_PATCH",
      `Explicit frames must include every index from 0 through ${frameCount - 1} exactly once.`,
      400
    );
  }
  return controls;
}

function resolveAnimations(
  animations: Animation[],
  frameCount: number,
  explicit: boolean,
  fallbackName: string
): Animation[] {
  const parsed = animations.map(animation => animationSchema.parse(animation));
  if (explicit) {
    for (const animation of parsed) {
      for (const index of animation.frameIndices) {
        if (index >= frameCount) {
          throw new MotionStorageError(
            "INVALID_PATCH",
            `Animation ${animation.name} references missing frame ${index}.`,
            400
          );
        }
      }
    }
    return parsed;
  }

  const compatible = parsed.map(animation => ({
    ...animation,
    frameIndices: animation.frameIndices.filter(index => index < frameCount)
  }));
  if (compatible.some(animation => animation.frameIndices.length > 0)) {
    return compatible;
  }
  return [
    {
      name: fallbackName,
      frameIndices: Array.from({ length: frameCount }, (_, index) => index),
      fps: 12,
      loop: "loop"
    }
  ];
}

async function buildArtifacts(input: {
  id: string;
  name: string;
  createdAtIso: string;
  raw: Buffer;
  sliceMode: SliceMode;
  grid: GridSpec;
  matte: MatteSpec;
  controls: Frame[];
  controlsExplicit: boolean;
  animations: Animation[];
  animationsExplicit: boolean;
}): Promise<BuildArtifacts> {
  const requestedGrid = gridSpecSchema.parse(input.grid);
  const matte = withDefaultKeyColor(input.matte);
  const metadata = await sharp(input.raw).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to determine raw sprite-sheet dimensions.");
  }

  let grid = requestedGrid;
  let sliceConfidence = 1;
  let sourceRects: Frame["source"][];
  let sliced: Buffer[];
  if (input.sliceMode === "auto") {
    const mattedSheet = await applyMatte(input.raw, matte);
    const decoded = await sharp(mattedSheet)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const detected = detectFrameRects(
      decoded.data,
      { width: decoded.info.width, height: decoded.info.height },
      { expectedCols: requestedGrid.cols, expectedRows: requestedGrid.rows }
    );
    if (detected.rects.length === 0) {
      throw new Error("Automatic frame detection found no foreground frames.");
    }
    sourceRects = detected.rects;
    sliceConfidence = detected.confidence;
    grid = gridSpecSchema.parse({
      ...requestedGrid,
      cols: detected.cols,
      rows: detected.rows
    });
    sliced = await sliceFrames(mattedSheet, sourceRects);
  } else {
    sourceRects = computeGrid(metadata.width, metadata.height, grid);
    sliced = await sliceFrames(input.raw, sourceRects);
  }
  const controls = frameControls(input.controls, sourceRects.length, input.controlsExplicit);
  const prepared = await Promise.all(
    sliced.map(async (buffer, index) => {
      const control = controls.get(index);
      const oriented = control?.flipX ? await sharp(buffer).flop().png().toBuffer() : buffer;
      const matted = input.sliceMode === "auto" ? oriented : await applyMatte(oriented, matte);
      const analysis = await analyzeFrame(matted);
      return { buf: matted, ...analysis };
    })
  );
  const normalized = await normalizeFrames(prepared);
  const packed = await packSheet(normalized.frames, { cols: grid.cols });
  const packedMetadata = await sharp(packed.buf).metadata();
  if (!packedMetadata.width || !packedMetadata.height) {
    throw new Error("Unable to determine derived sprite-sheet dimensions.");
  }

  const frames = normalized.frames.map((frame, index) => {
    const control = controls.get(index);
    return {
      index,
      source: sourceRects[index],
      trim: frame.trim,
      pivot: frame.pivot,
      flipX: control?.flipX ?? false,
      excluded: control?.excluded ?? false,
      durationMs: control?.durationMs ?? null
    };
  });
  const animations = resolveAnimations(
    input.animations,
    frames.length,
    input.animationsExplicit,
    input.name
  );
  const project = parseMotionProject({
    id: input.id,
    name: input.name,
    createdAtIso: input.createdAtIso,
    sourceImage: { path: "raw.png", width: metadata.width, height: metadata.height },
    sliceMode: input.sliceMode,
    sliceConfidence,
    grid,
    canvas: normalized.canvas,
    matte,
    frames,
    animations
  });
  const overlay = makeDebugOverlay(
    packedMetadata.width,
    packedMetadata.height,
    packed.rects,
    normalized.frames
  );
  const debugContact = await sharp(packed.buf)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .png()
    .toBuffer();

  return {
    project,
    sheet: packed.buf,
    debugContact,
    frames: normalized.frames.map(frame => frame.buf)
  };
}

async function writeDerived(directory: string, artifacts: BuildArtifacts): Promise<void> {
  const framesDirectory = path.join(directory, "frames");
  await fs.mkdir(framesDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(directory, "sheet.png"), artifacts.sheet, { flag: "wx" }),
    fs.writeFile(path.join(directory, "debug-contact.png"), artifacts.debugContact, { flag: "wx" }),
    ...artifacts.frames.map((buffer, index) =>
      fs.writeFile(
        path.join(framesDirectory, `f${String(index + 1).padStart(2, "0")}.png`),
        buffer,
        { flag: "wx" }
      )
    )
  ]);
}

async function writeJsonTemp(target: string, project: MotionProject): Promise<string> {
  const temp = path.join(path.dirname(target), `.project-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, `${JSON.stringify(project, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    return temp;
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function installNewProject(directory: string, artifacts: BuildArtifacts): Promise<void> {
  const staging = path.join(directory, `.derived-${randomUUID()}.tmp`);
  const target = path.join(directory, "derived");
  let projectTemp: string | null = null;
  try {
    await writeDerived(staging, artifacts);
    projectTemp = await writeJsonTemp(path.join(directory, "project.json"), artifacts.project);
    await fs.rename(staging, target);
    await fs.rename(projectTemp, path.join(directory, "project.json"));
    projectTemp = null;
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    if (projectTemp) await fs.rm(projectTemp, { force: true }).catch(() => undefined);
  }
}

async function replaceProject(directory: string, artifacts: BuildArtifacts): Promise<void> {
  const staging = path.join(directory, `.derived-${randomUUID()}.tmp`);
  const derived = path.join(directory, "derived");
  const backup = path.join(directory, `.derived-backup-${randomUUID()}.tmp`);
  const jsonTarget = path.join(directory, "project.json");
  let projectTemp: string | null = null;
  let oldMoved = false;
  let newInstalled = false;

  try {
    await writeDerived(staging, artifacts);
    projectTemp = await writeJsonTemp(jsonTarget, artifacts.project);
    await fs.rename(derived, backup);
    oldMoved = true;
    await fs.rename(staging, derived);
    newInstalled = true;
    await fs.rename(projectTemp, jsonTarget);
    projectTemp = null;
    oldMoved = false;
    await fs.rm(backup, { recursive: true, force: true }).catch(cleanupError => {
      console.warn(
        "[motion-storage] unable to remove derived backup",
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      );
    });
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (newInstalled) {
      await fs.rm(derived, { recursive: true, force: true }).catch(rollbackError => {
        rollbackErrors.push(rollbackError);
      });
    }
    if (oldMoved) {
      await fs.rename(backup, derived).catch(rollbackError => {
        rollbackErrors.push(rollbackError);
      });
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "Motion project replacement and rollback failed.");
    }
    throw error;
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    if (projectTemp) await fs.rm(projectTemp, { force: true }).catch(() => undefined);
  }
}

async function createUniqueProjectDirectory(): Promise<{ id: string; directory: string }> {
  await fs.mkdir(motionRoot(), { recursive: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = `motion-${Date.now()}-${randomUUID()}`;
    const directory = projectDir(id);
    try {
      await fs.mkdir(directory);
      return { id, directory };
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
  }
  throw new Error("Unable to allocate a unique motion project id.");
}

export async function createProject(input: {
  name: string;
  sheetBuffer: Buffer;
  sliceMode?: SliceMode;
  grid: GridSpec;
  matte: MatteSpec;
}): Promise<MotionProject> {
  const name = input.name.trim();
  if (!name) throw new TypeError("Motion project name must not be empty.");
  const rawMetadata = await sharp(input.sheetBuffer).metadata();
  if (!rawMetadata.width || !rawMetadata.height) {
    throw new TypeError("sheetBuffer must be a decodable image.");
  }

  const { id, directory } = await createUniqueProjectDirectory();
  try {
    await fs.writeFile(path.join(directory, "raw.png"), input.sheetBuffer, { flag: "wx" });
    const artifacts = await buildArtifacts({
      id,
      name,
      createdAtIso: new Date().toISOString(),
      raw: input.sheetBuffer,
      sliceMode: input.sliceMode ?? "auto",
      grid: input.grid,
      matte: input.matte,
      controls: [],
      controlsExplicit: false,
      animations: [],
      animationsExplicit: false
    });
    await installNewProject(directory, artifacts);
    return artifacts.project;
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function rebuildProject(
  id: string,
  patch: MotionProjectPatch
): Promise<MotionProject> {
  const current = await readProject(id);
  const directory = await safeExistingProjectDirectory(id);
  const raw = await fs.readFile(await safeProjectFile(directory, "raw.png", id));
  const sliceMode = patch.sliceMode ?? current.sliceMode;
  const grid = gridSpecSchema.parse(patch.grid ?? current.grid);
  const matte = withDefaultKeyColor(matteSpecSchema.parse(patch.matte ?? current.matte));
  const controls = (patch.frames ?? current.frames).map(frame => frameSchema.parse(frame));
  const animations = (patch.animations ?? current.animations).map(animation =>
    animationSchema.parse(animation)
  );
  const artifacts = await buildArtifacts({
    id: current.id,
    name: current.name,
    createdAtIso: current.createdAtIso,
    raw,
    sliceMode,
    grid,
    matte,
    controls,
    controlsExplicit: patch.frames !== undefined,
    animations,
    animationsExplicit: patch.animations !== undefined
  });
  await replaceProject(directory, artifacts);
  return artifacts.project;
}

export async function listProjects(): Promise<MotionProjectSummary[]> {
  let entries;
  try {
    entries = await fs.readdir(motionRoot(), { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    throw error;
  }

  const projects: MotionProjectSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !PROJECT_ID_RE.test(entry.name)) continue;
    const project = await readProject(entry.name);
    projects.push({
      id: project.id,
      name: project.name,
      createdAtIso: project.createdAtIso,
      frameCount: project.frames.length,
      thumbnailPath: `/api/motion/projects/${encodeURIComponent(project.id)}/asset/derived/frames/f01.png`
    });
  }
  return projects.sort((first, second) => second.createdAtIso.localeCompare(first.createdAtIso));
}

export async function readProject(id: string): Promise<MotionProject> {
  const directory = await safeExistingProjectDirectory(id);
  const file = await safeProjectFile(directory, "project.json", id);
  try {
    const raw = await fs.readFile(file, "utf8");
    return parseMotionProject(JSON.parse(raw));
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new MotionStorageError("NOT_FOUND", `Motion project ${id} was not found.`, 404);
    }
    throw error;
  }
}

export async function deleteProject(id: string): Promise<void> {
  const directory = await safeExistingProjectDirectory(id);
  try {
    await fs.rm(directory, { recursive: true, force: false });
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new MotionStorageError("NOT_FOUND", `Motion project ${id} was not found.`, 404);
    }
    throw error;
  }
}

export async function readAssetFile(
  id: string,
  relPath: string
): Promise<{ stream: ReturnType<typeof createReadStream>; mimeType: string; bytes: number } | null> {
  let directory: string;
  try {
    directory = await safeExistingProjectDirectory(id);
  } catch (error) {
    if (error instanceof MotionStorageError) return null;
    throw error;
  }
  const normalized = relPath.replaceAll("\\", "/");
  if (!ASSET_PATH_RE.test(normalized)) return null;

  const candidate = path.resolve(directory, ...normalized.split("/"));
  if (!candidate.startsWith(`${directory}${path.sep}`)) return null;
  try {
    const segments = normalized.split("/");
    let current = directory;
    let bytes: number | null = null;
    for (let index = 0; index < segments.length; index += 1) {
      current = path.join(current, segments[index]);
      const entry = await fs.lstat(current);
      if (entry.isSymbolicLink()) return null;
      if (index < segments.length - 1 && !entry.isDirectory()) return null;
      if (index === segments.length - 1) {
        if (!entry.isFile()) return null;
        bytes = entry.size;
      }
    }
    const realCandidate = await fs.realpath(candidate);
    if (bytes === null || !realCandidate.startsWith(`${directory}${path.sep}`)) return null;
    return {
      stream: createReadStream(candidate),
      mimeType: "image/png",
      bytes
    };
  } catch (error) {
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") return null;
    throw error;
  }
}

async function safeExistingProjectDirectory(id: string): Promise<string> {
  const directory = projectDir(id);
  try {
    const entry = await fs.lstat(directory);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new MotionStorageError("NOT_FOUND", `Motion project ${id} was not found.`, 404);
    }
    const [realRoot, realDirectory] = await Promise.all([
      fs.realpath(motionRoot()),
      fs.realpath(directory)
    ]);
    if (path.dirname(realDirectory) !== realRoot) {
      throw new MotionStorageError("NOT_FOUND", `Motion project ${id} was not found.`, 404);
    }
    return realDirectory;
  } catch (error) {
    if (error instanceof MotionStorageError) throw error;
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") {
      throw new MotionStorageError("NOT_FOUND", `Motion project ${id} was not found.`, 404);
    }
    throw error;
  }
}

async function safeProjectFile(directory: string, fileName: string, id: string): Promise<string> {
  const candidate = path.join(directory, fileName);
  try {
    const entry = await fs.lstat(candidate);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new MotionStorageError("NOT_FOUND", `Motion project ${id} was not found.`, 404);
    }
    const realCandidate = await fs.realpath(candidate);
    if (path.dirname(realCandidate) !== directory) {
      throw new MotionStorageError("NOT_FOUND", `Motion project ${id} was not found.`, 404);
    }
    return realCandidate;
  } catch (error) {
    if (error instanceof MotionStorageError) throw error;
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") {
      throw new MotionStorageError("NOT_FOUND", `Motion project ${id} was not found.`, 404);
    }
    throw error;
  }
}
