import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { getDataDir } from "@/lib/local/storage";
import {
  classifyCellFit,
  countOpaquePixels,
  computeCellPlacement,
  computeCellScale,
  inspectCellFit,
  type CellFitReport
} from "@/lib/motion/fit-check";
import {
  analyzeFrame,
  applyMatte,
  computeGrid,
  detectFrameRects,
  detectMirroredRows,
  detectRepeatedRows,
  normalizeFrames,
  packSheet,
  sliceFrames,
  type FrameAnalysis
} from "@/lib/motion/engine";
import {
  animationSchema,
  frameSchema,
  gridSpecSchema,
  matteSpecSchema,
  parseMotionProject,
  type Animation,
  type DuplicateDetection,
  type Frame,
  type FrameRect,
  type GridSpec,
  type MatteSpec,
  type MirrorDetection,
  type MotionProject,
  type NormalizePivotX,
  type NormalizePivotY,
  type NormalizeScale,
  type Pivot,
  type SliceMode
} from "@/lib/motion/types";

const PROJECT_ID_RE = /^[A-Za-z0-9-]+$/;
const ASSET_PATH_RE = /^(?:raw\.png|overrides\/f[0-9]{2,}\.png|candidates\/[A-Za-z0-9-]+\/(?:frames|masks)\/f[0-9]{2,}\.png|derived\/(?:sheet\.png|debug-contact\.png|frames\/f[0-9]{2,}\.png))$/;
const projectMutationScopes = new AsyncLocalStorage<Set<string>>();
const projectMutationTails = new Map<string, Promise<void>>();

export type MotionProjectSummary = {
  id: string;
  name: string;
  createdAtIso: string;
  frameCount: number;
  thumbnailPath: string;
};

export type MotionProjectPatch = Partial<
  Pick<
    MotionProject,
    | "sliceMode"
    | "normalizeScale"
    | "normalizePivotX"
    | "normalizePivotY"
    | "grid"
    | "matte"
    | "frames"
    | "animations"
  >
>;

export class MotionStorageError extends Error {
  readonly status: number;
  readonly code: "INVALID_ID" | "NOT_FOUND" | "INVALID_PATCH" | "CONFLICT" | "CONTENT_LOSS";

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

export async function withMotionProjectMutation<T>(
  id: string,
  operation: () => Promise<T>
): Promise<T> {
  assertProjectId(id);
  const active = projectMutationScopes.getStore();
  if (active?.has(id)) return operation();

  const previous = projectMutationTails.get(id) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>(resolve => {
    release = resolve;
  });
  projectMutationTails.set(id, tail);
  void tail.finally(() => {
    if (projectMutationTails.get(id) === tail) projectMutationTails.delete(id);
  });
  await previous.catch(() => undefined);
  const scope = new Set(active ?? []);
  scope.add(id);
  try {
    return await projectMutationScopes.run(scope, operation);
  } finally {
    release();
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
  // route는 keyColor를 항상 명시. 이 폴백은 keyColor 미지정 직접 호출용 레거시 최후 수단.
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
  fallbackName: string,
  defaultAnimation?: { fps?: number; loop?: Animation["loop"] }
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
      fps: defaultAnimation?.fps ?? 12,
      loop: defaultAnimation?.loop ?? "loop"
    }
  ];
}

async function buildArtifacts(input: {
  id: string;
  name: string;
  createdAtIso: string;
  raw: Buffer;
  sliceMode: SliceMode;
  normalizeScale: NormalizeScale;
  normalizePivotX: NormalizePivotX;
  normalizePivotY: NormalizePivotY;
  grid: GridSpec;
  matte: MatteSpec;
  controls: Frame[];
  controlsExplicit: boolean;
  autoFlipRows: boolean;
  previousMirrorDetection: MirrorDetection | null;
  autoExcludeRepeatedRows: boolean;
  previousDuplicateDetection: DuplicateDetection | null;
  reviewApproval: MotionProject["reviewApproval"];
  animations: Animation[];
  animationsExplicit: boolean;
  defaultAnimation?: { fps?: number; loop?: Animation["loop"] };
  overrides?: Map<number, Buffer>;
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
    const usesChoke = matte.mode !== "none" && matte.choke > 0;
    const detectionSheet = await applyMatte(
      input.raw,
      usesChoke ? { ...matte, choke: 0 } : matte
    );
    const decoded = await sharp(detectionSheet)
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
    const mattedSheet = usesChoke ? await applyMatte(input.raw, matte) : detectionSheet;
    sliced = await sliceFrames(mattedSheet, sourceRects);
  } else {
    sourceRects = computeGrid(metadata.width, metadata.height, grid);
    sliced = await sliceFrames(input.raw, sourceRects);
  }
  const controls = frameControls(input.controls, sourceRects.length, input.controlsExplicit);
  const matted =
    input.sliceMode === "auto"
      ? sliced
      : await Promise.all(sliced.map(buffer => applyMatte(buffer, matte)));
  let mirrorDetection = input.previousMirrorDetection;
  const autoFlipped = new Set<number>();
  if (input.autoFlipRows && !input.controlsExplicit) {
    const detected = await detectMirroredRows(matted, grid.cols);
    mirrorDetection = { enabled: true, rows: detected.rows };
    for (let row = 1; row < detected.rows.length; row += 1) {
      if (!detected.rows[row].mirrored) continue;
      const start = row * grid.cols;
      const end = Math.min(start + grid.cols, matted.length);
      for (let index = start; index < end; index += 1) {
        if (!controls.has(index)) autoFlipped.add(index);
      }
    }
  }
  const oriented = await Promise.all(
    matted.map(async (buffer, index) => {
      const control = controls.get(index);
      const flipX = control?.flipX ?? autoFlipped.has(index);
      return flipX ? sharp(buffer).flop().png().toBuffer() : buffer;
    })
  );
  for (const [index, override] of input.overrides ?? []) {
    if (index >= 0 && index < oriented.length) oriented[index] = override;
  }
  let duplicateDetection = input.previousDuplicateDetection;
  const autoExcluded = new Set<number>();
  if (input.autoExcludeRepeatedRows && !input.controlsExplicit) {
    const detected = await detectRepeatedRows(oriented, grid.cols);
    for (let row = 1; row < detected.rows.length; row += 1) {
      if (!detected.rows[row].repeated) continue;
      const start = row * grid.cols;
      const end = Math.min(start + grid.cols, oriented.length);
      for (let index = start; index < end; index += 1) {
        if (!controls.has(index)) autoExcluded.add(index);
      }
    }
    duplicateDetection = {
      enabled: true,
      rows: detected.rows,
      excludedFrames: [...autoExcluded]
    };
  }
  const prepared = await Promise.all(
    oriented.map(async (buffer, index) => {
      const analysis = await analyzeFrame(buffer);
      return { buf: buffer, ...analysis, sourceY: sourceRects[index].y };
    })
  );
  const normalized = await normalizeFrames(prepared, {
    normalizeScale: input.normalizeScale,
    normalizePivotX: input.normalizePivotX,
    normalizePivotY: input.normalizePivotY,
    rowSize: grid.cols
  });
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
      appliedScale: frame.appliedScale,
      flipX: control?.flipX ?? autoFlipped.has(index),
      excluded: control?.excluded ?? autoExcluded.has(index),
      durationMs: control?.durationMs ?? null,
      override: control?.override ?? null
    };
  });
  const animations = resolveAnimations(
    input.animations,
    frames.length,
    input.animationsExplicit,
    input.name,
    input.defaultAnimation
  );
  const project = parseMotionProject({
    id: input.id,
    name: input.name,
    createdAtIso: input.createdAtIso,
    sourceImage: { path: "raw.png", width: metadata.width, height: metadata.height },
    sliceMode: input.sliceMode,
    sliceConfidence,
    layoutValidated: input.sliceMode === "auto",
    normalizeScale: input.normalizeScale,
    normalizePivotX: input.normalizePivotX,
    normalizePivotY: input.normalizePivotY,
    grid,
    canvas: normalized.canvas,
    matte,
    mirrorDetection,
    duplicateDetection,
    reviewApproval: input.reviewApproval,
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
  normalizeScale?: NormalizeScale;
  normalizePivotX?: NormalizePivotX;
  normalizePivotY?: NormalizePivotY;
  autoFlipRows?: boolean;
  autoExcludeRepeatedRows?: boolean;
  defaultAnimation?: { fps?: number; loop?: "loop" | "pingpong" | "once" };
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
      normalizeScale: input.normalizeScale ?? "area",
      normalizePivotX: input.normalizePivotX ?? "centroid",
      normalizePivotY: input.normalizePivotY ?? "preserve",
      grid: input.grid,
      matte: input.matte,
      controls: [],
      controlsExplicit: false,
      autoFlipRows: input.autoFlipRows ?? false,
      previousMirrorDetection: null,
      autoExcludeRepeatedRows: input.autoExcludeRepeatedRows ?? false,
      previousDuplicateDetection: null,
      reviewApproval: null,
      animations: [],
      animationsExplicit: false,
      defaultAnimation: input.defaultAnimation
    });
    await installNewProject(directory, artifacts);
    return artifacts.project;
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function rebuildProjectUnlocked(
  id: string,
  patch: MotionProjectPatch
): Promise<MotionProject> {
  const current = await readProject(id);
  const directory = await safeExistingProjectDirectory(id);
  const raw = await fs.readFile(await safeProjectFile(directory, "raw.png", id));
  const sliceMode = patch.sliceMode ?? current.sliceMode;
  const normalizeScale = patch.normalizeScale ?? current.normalizeScale;
  const normalizePivotX = patch.normalizePivotX ?? current.normalizePivotX;
  const normalizePivotY = patch.normalizePivotY ?? current.normalizePivotY;
  const grid = gridSpecSchema.parse(patch.grid ?? current.grid);
  const matte = withDefaultKeyColor(matteSpecSchema.parse(patch.matte ?? current.matte));
  const controls = (patch.frames ?? current.frames).map(frame => frameSchema.parse(frame));
  const overrides = new Map<number, Buffer>();
  for (const frame of controls) {
    if (!frame.override) continue;
    try {
      overrides.set(frame.index, await readOverrideFile(directory, id, frame.index));
    } catch (error) {
      if (error instanceof MotionStorageError && error.code === "NOT_FOUND") {
        throw new MotionStorageError(
          "NOT_FOUND",
          `Frame override f${String(frame.index + 1).padStart(2, "0")} is missing.`,
          409
        );
      }
      throw error;
    }
  }
  const animations = (patch.animations ?? current.animations).map(animation =>
    animationSchema.parse(animation)
  );
  const artifacts = await buildArtifacts({
    id: current.id,
    name: current.name,
    createdAtIso: current.createdAtIso,
    raw,
    sliceMode,
    normalizeScale,
    normalizePivotX,
    normalizePivotY,
    grid,
    matte,
    controls,
    controlsExplicit: patch.frames !== undefined,
    autoFlipRows: false,
    previousMirrorDetection: current.mirrorDetection,
    autoExcludeRepeatedRows: false,
    previousDuplicateDetection: current.duplicateDetection,
    reviewApproval: current.reviewApproval,
    animations,
    animationsExplicit: patch.animations !== undefined,
    overrides
  });
  await replaceProject(directory, artifacts);
  return artifacts.project;
}

export async function rebuildProject(
  id: string,
  patch: MotionProjectPatch
): Promise<MotionProject> {
  return withMotionProjectMutation(id, () => rebuildProjectUnlocked(id, patch));
}

async function writeProjectJson(directory: string, project: MotionProject): Promise<void> {
  const target = path.join(directory, "project.json");
  let temporary: string | null = await writeJsonTemp(target, project);
  let operationError: unknown = null;
  try {
    await fs.rename(temporary, target);
    temporary = null;
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    if (temporary) {
      try {
        await fs.rm(temporary, { force: true });
      } catch (cleanupError) {
        if (operationError) {
          throw new AggregateError(
            [operationError, cleanupError],
            "Motion review approval update and temporary-file cleanup failed."
          );
        }
        throw cleanupError;
      }
    }
  }
}

export async function setReviewApproval(
  id: string,
  input: { reasons: string[]; note?: string | null } | null
): Promise<MotionProject> {
  return withMotionProjectMutation(id, async () => {
    const current = await readProject(id);
    const directory = await safeExistingProjectDirectory(id);
    if (input === null) {
      const project = parseMotionProject({ ...current, reviewApproval: null });
      await writeProjectJson(directory, project);
      return project;
    }

    const { buildMotionExportReview } = await import("@/lib/motion/export");
    const review = buildMotionExportReview(
      current,
      current.frames.filter(frame => !frame.excluded)
    );
    if (review.blockingIssues.length > 0) {
      const frames = review.blockingIssues
        .map(issue => issue.match(/^frame-(\d+)-/)?.[1])
        .filter((frame): frame is string => frame !== undefined);
      throw new MotionStorageError(
        "CONTENT_LOSS",
        `내용 손실이 기록된 프레임은 승인으로 해제할 수 없습니다. 해당 프레임을 되돌리고 후보를 다시 만드세요. (프레임 ${frames.join(", ") || "?"})`,
        409
      );
    }

    const requested = new Set(input.reasons);
    const missing = review.approvableIssues.filter(reason => !requested.has(reason));
    if (missing.length > 0) {
      throw new MotionStorageError(
        "CONFLICT",
        `현재 미결 검토 사유를 모두 승인해야 합니다: ${review.approvableIssues.join(", ")}`,
        409
      );
    }

    const project = parseMotionProject({
      ...current,
      reviewApproval: {
        approvedAtIso: new Date().toISOString(),
        // Store only the issues observed now so later issues cannot be pre-approved.
        approvedReasons: review.approvableIssues,
        note: input.note ?? null
      }
    });
    await writeProjectJson(directory, project);
    return project;
  });
}

type OverrideSnapshot = { index: number; buffer: Buffer | null };

function overrideName(index: number): string {
  return `f${String(index + 1).padStart(2, "0")}.png`;
}

async function overridesDirectory(
  directory: string,
  id: string,
  create: boolean
): Promise<string | null> {
  const target = path.join(directory, "overrides");
  try {
    if (create) await fs.mkdir(target);
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
  }
  try {
    const entry = await fs.lstat(target);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new MotionStorageError("NOT_FOUND", `Motion project ${id} was not found.`, 404);
    }
    const realDirectory = await fs.realpath(target);
    if (path.dirname(realDirectory) !== directory) {
      throw new MotionStorageError("NOT_FOUND", `Motion project ${id} was not found.`, 404);
    }
    return realDirectory;
  } catch (error) {
    if (error instanceof MotionStorageError) throw error;
    if (!create && (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR")) return null;
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") {
      throw new MotionStorageError("NOT_FOUND", `Motion project ${id} was not found.`, 404);
    }
    throw error;
  }
}

async function readOverrideFile(directory: string, id: string, index: number): Promise<Buffer> {
  const overrides = await overridesDirectory(directory, id, false);
  if (!overrides) {
    throw new MotionStorageError("NOT_FOUND", `Frame override ${overrideName(index)} was not found.`, 404);
  }
  const target = path.join(overrides, overrideName(index));
  try {
    const entry = await fs.lstat(target);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new MotionStorageError("NOT_FOUND", `Frame override ${overrideName(index)} was not found.`, 404);
    }
    const realFile = await fs.realpath(target);
    if (path.dirname(realFile) !== overrides) {
      throw new MotionStorageError("NOT_FOUND", `Frame override ${overrideName(index)} was not found.`, 404);
    }
    return await fs.readFile(realFile);
  } catch (error) {
    if (error instanceof MotionStorageError) throw error;
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") {
      throw new MotionStorageError("NOT_FOUND", `Frame override ${overrideName(index)} was not found.`, 404);
    }
    throw error;
  }
}

async function snapshotOverride(
  directory: string,
  id: string,
  index: number
): Promise<OverrideSnapshot> {
  try {
    return { index, buffer: await readOverrideFile(directory, id, index) };
  } catch (error) {
    if (error instanceof MotionStorageError && error.code === "NOT_FOUND") {
      const overrides = await overridesDirectory(directory, id, true);
      const target = path.join(overrides!, overrideName(index));
      try {
        await fs.lstat(target);
      } catch (statError) {
        if (errorCode(statError) === "ENOENT") return { index, buffer: null };
        throw statError;
      }
    }
    throw error;
  }
}

async function writeOverrideFile(
  directory: string,
  id: string,
  index: number,
  buffer: Buffer
): Promise<void> {
  const overrides = await overridesDirectory(directory, id, true);
  const target = path.join(overrides!, overrideName(index));
  try {
    const existing = await fs.lstat(target);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new MotionStorageError("NOT_FOUND", `Frame override ${overrideName(index)} was not found.`, 404);
    }
  } catch (error) {
    if (error instanceof MotionStorageError) throw error;
    if (errorCode(error) !== "ENOENT") throw error;
  }
  const temporary = path.join(overrides!, `.${overrideName(index)}-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, buffer, { flag: "wx" });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function removeOverrideFile(directory: string, id: string, index: number): Promise<void> {
  const overrides = await overridesDirectory(directory, id, false);
  if (!overrides) return;
  const target = path.join(overrides, overrideName(index));
  try {
    const entry = await fs.lstat(target);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new MotionStorageError("NOT_FOUND", `Frame override ${overrideName(index)} was not found.`, 404);
    }
    await fs.rm(target);
  } catch (error) {
    if (error instanceof MotionStorageError) throw error;
    if (errorCode(error) === "ENOENT") return;
    throw error;
  }
}

async function restoreOverrideSnapshots(
  directory: string,
  id: string,
  snapshots: OverrideSnapshot[]
): Promise<void> {
  for (const snapshot of snapshots) {
    if (snapshot.buffer) {
      await writeOverrideFile(directory, id, snapshot.index, snapshot.buffer);
    } else {
      await removeOverrideFile(directory, id, snapshot.index);
    }
  }
}

function resolveOverrideIndices(
  frameIndices: number[] | undefined,
  available: number[],
  frameCount: number
): number[] {
  const selected = frameIndices ?? available;
  if (selected.length === 0) {
    throw new MotionStorageError("INVALID_PATCH", "At least one frame index is required.", 400);
  }
  const unique = new Set<number>();
  for (const index of selected) {
    if (!Number.isInteger(index) || index < 0 || index >= frameCount || unique.has(index)) {
      throw new MotionStorageError("INVALID_PATCH", "Frame indices must be unique project frame indices.", 400);
    }
    if (!available.includes(index)) {
      throw new MotionStorageError("INVALID_PATCH", `Candidate does not include frame ${index}.`, 400);
    }
    unique.add(index);
  }
  return [...unique];
}

export async function readOrientedCell(
  id: string,
  index: number
): Promise<{ buffer: Buffer; width: number; height: number; trim: FrameRect; pivot: Pivot }> {
  const project = await readProject(id);
  if (!Number.isInteger(index) || index < 0 || index >= project.frames.length) {
    throw new MotionStorageError("NOT_FOUND", "Motion frame was not found.", 404);
  }
  const directory = await safeExistingProjectDirectory(id);
  const raw = await fs.readFile(await safeProjectFile(directory, "raw.png", id));
  const frame = project.frames[index];
  const [sliced] = await sliceFrames(raw, [frame.source]);
  const matted = await applyMatte(sliced, withDefaultKeyColor(project.matte));
  const buffer = frame.flipX ? await sharp(matted).flop().png().toBuffer() : matted;
  const analysis = await analyzeFrame(buffer);
  return {
    buffer,
    width: frame.source.w,
    height: frame.source.h,
    trim: analysis.trim,
    pivot: analysis.pivot
  };
}

export async function fitToCell(
  candidate: Buffer,
  cell: { width: number; height: number; trim: FrameRect; pivot: Pivot },
  analysis: FrameAnalysis
): Promise<Buffer> {
  if (analysis.trim.w < 1 || analysis.trim.h < 1) {
    throw new RangeError("Candidate must contain a non-empty foreground bounding box.");
  }
  const scale = computeCellScale(cell, analysis);
  const crop = await sharp(candidate)
    .extract({
      left: analysis.trim.x,
      top: analysis.trim.y,
      width: analysis.trim.w,
      height: analysis.trim.h
    })
    .resize({
      width: Math.max(1, Math.round(analysis.trim.w * scale)),
      height: Math.max(1, Math.round(analysis.trim.h * scale)),
      kernel: sharp.kernel.lanczos3
    })
    .png()
    .toBuffer();
  const metadata = await sharp(crop).metadata();
  const cropWidth = metadata.width!;
  const cropHeight = metadata.height!;
  const {
    sourceLeft,
    sourceTop,
    destinationLeft,
    destinationTop,
    copyWidth,
    copyHeight
  } = computeCellPlacement(cell, analysis, { width: cropWidth, height: cropHeight });
  const canvas = sharp({
    create: { width: cell.width, height: cell.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  });
  if (copyWidth < 1 || copyHeight < 1) return canvas.png().toBuffer();
  const visible = await sharp(crop)
    .extract({ left: sourceLeft, top: sourceTop, width: copyWidth, height: copyHeight })
    .png()
    .toBuffer();
  return canvas.composite([{ input: visible, left: destinationLeft, top: destinationTop }]).png().toBuffer();
}

type CandidateApplyOptions = {
  force?: boolean;
  allowContentLoss?: boolean;
  intentionalEmptyFrames?: number[];
  maxLostPixels?: number;
};

type RecordedFit = {
  verdict: "review";
  reasons: string[];
  lostPixels: number;
  touchesEdge: CellFitReport["touchesEdge"];
};

type PreparedCandidateFrame = {
  candidateBuffer: Buffer;
  cell: Awaited<ReturnType<typeof readOrientedCell>>;
  intentionalEmpty: boolean;
  fit?: RecordedFit;
};

function contentLossMessage(index: number, report: CellFitReport): string {
  const edges: Array<[keyof CellFitReport["lostByEdge"], string]> = [
    ["left", "좌측"],
    ["right", "우측"],
    ["top", "상단"],
    ["bottom", "하단"]
  ];
  const edgeSummary = edges
    .filter(([edge]) => report.lostByEdge[edge] > 0)
    .map(([edge, label]) => `${label} ${report.lostByEdge[edge]}`)
    .join(", ");
  return `프레임 ${index + 1}번은 셀에 맞추면 내용 ${report.lostPixels}픽셀이 잘립니다${edgeSummary ? `(${edgeSummary})` : ""}. 셀을 벗어나는 부분을 줄여 후보를 다시 만들거나, 손실을 감수하려면 allowContentLoss로 적용하세요.`;
}

function emptySourceMessage(index: number): string {
  return `프레임 ${index + 1}번 후보에 그려진 내용이 없습니다. 의도한 소멸 프레임이면 intentionalEmptyFrames에 ${index}(0-based 인덱스)를 넣어 적용하세요.`;
}

function blockedFitMessage(index: number, report: CellFitReport, reason: string): string {
  if (reason === "content-loss") return contentLossMessage(index, report);
  if (reason === "placement-empty") {
    return `프레임 ${index + 1}번은 셀에 맞추면 남는 내용이 없어 빈 프레임이 됩니다. 적용할 수 없습니다.`;
  }
  return emptySourceMessage(index);
}

async function applyCandidateFramesUnlocked(
  id: string,
  candidateId: string,
  frameIndices?: number[],
  options: CandidateApplyOptions = {}
): Promise<MotionProject> {
  const candidates = await import("@/lib/motion/candidates");
  const candidate = await candidates.readCandidate(id, candidateId);
  if (candidate.status !== "ready") {
    throw new MotionStorageError("INVALID_PATCH", "Candidate must be ready before it can be applied.", 409);
  }
  const current = await readProject(id);
  const indices = resolveOverrideIndices(
    frameIndices,
    candidate.frames.map(frame => frame.index),
    current.frames.length
  );
  const conflicts = indices.filter(index => {
    const expected = candidate.baseline.find(entry => entry.index === index)?.overrideCandidateId;
    const actual = current.frames[index].override?.candidateId ?? null;
    return expected !== undefined && expected !== actual;
  });
  if (conflicts.length > 0 && options.force !== true) {
    throw new MotionStorageError(
      "CONFLICT",
      `프레임 ${conflicts.map(index => index + 1).join(", ")}번은 이 후보를 만든 뒤 다른 후보(또는 되돌리기)로 바뀌었습니다. force로 덮어쓰거나 후보를 다시 만드세요.`,
      409
    );
  }

  const prepared = new Map<number, PreparedCandidateFrame>();
  const blockedMessages: string[] = [];
  const intentionalEmptyFrames = new Set(options.intentionalEmptyFrames ?? []);
  for (const index of indices) {
    const source = await candidates.candidateFramePath(id, candidateId, index);
    const candidateBuffer = await fs.readFile(source);
    const cell = await readOrientedCell(id, index);
    if (candidate.cellAligned) {
      const metadata = await sharp(candidateBuffer).metadata();
      if (metadata.width !== cell.width || metadata.height !== cell.height) {
        throw new MotionStorageError(
          "INVALID_PATCH",
          `셀 정렬 후보 프레임 ${index + 1}의 크기가 원본 셀과 다릅니다.`,
          409
        );
      }
      if ((await countOpaquePixels(candidateBuffer)) === 0) {
        if (intentionalEmptyFrames.has(index)) {
          prepared.set(index, {
            candidateBuffer,
            cell,
            intentionalEmpty: true,
            fit: {
              verdict: "review",
              reasons: ["intentional-empty"],
              lostPixels: 0,
              touchesEdge: []
            }
          });
        } else {
          blockedMessages.push(emptySourceMessage(index));
        }
        continue;
      }
      prepared.set(index, { candidateBuffer, cell, intentionalEmpty: false });
      continue;
    }

    const report = await inspectCellFit(candidateBuffer, cell, await analyzeFrame(candidateBuffer));
    const verdict = classifyCellFit(report, { maxLostPixels: options.maxLostPixels });
    if (verdict.verdict === "blocked") {
      const reason = verdict.reasons[0];
      if (reason === "empty-source" && intentionalEmptyFrames.has(index)) {
        prepared.set(index, {
          candidateBuffer,
          cell,
          intentionalEmpty: true,
          fit: {
            verdict: "review",
            reasons: ["intentional-empty"],
            lostPixels: report.lostPixels,
            touchesEdge: report.touchesEdge
          }
        });
        continue;
      }
      if (reason === "content-loss" && options.allowContentLoss === true) {
        prepared.set(index, {
          candidateBuffer,
          cell,
          intentionalEmpty: false,
          fit: {
            verdict: "review",
            reasons: ["content-loss-allowed"],
            lostPixels: report.lostPixels,
            touchesEdge: report.touchesEdge
          }
        });
        continue;
      }
      blockedMessages.push(blockedFitMessage(index, report, reason));
      continue;
    }

    prepared.set(index, {
      candidateBuffer,
      cell,
      intentionalEmpty: false,
      fit:
        verdict.verdict === "review"
          ? {
              verdict: "review",
              reasons: verdict.reasons,
              lostPixels: report.lostPixels,
              touchesEdge: report.touchesEdge
            }
          : undefined
    });
  }
  if (blockedMessages.length > 0) {
    throw new MotionStorageError("CONTENT_LOSS", blockedMessages.join(" "), 409);
  }

  const directory = await safeExistingProjectDirectory(id);
  const snapshots: OverrideSnapshot[] = [];
  let rebuilt = false;
  try {
    const frames = current.frames.map(frame => ({ ...frame }));
    const appliedAtIso = new Date().toISOString();
    for (const index of indices) {
      const preparedFrame = prepared.get(index)!;
      // 셀 정렬 결과를 재정렬하면 보존 영역도 리샘플되므로 생성 좌표를 그대로 적용한다.
      const fitted = preparedFrame.intentionalEmpty
        ? await sharp({
            create: {
              width: preparedFrame.cell.width,
              height: preparedFrame.cell.height,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
          })
            .png()
            .toBuffer()
        : candidate.cellAligned
          ? await sharp(preparedFrame.candidateBuffer).ensureAlpha().png().toBuffer()
          : await fitToCell(
              preparedFrame.candidateBuffer,
              preparedFrame.cell,
              await analyzeFrame(preparedFrame.candidateBuffer)
            );
      snapshots.push(await snapshotOverride(directory, id, index));
      await writeOverrideFile(directory, id, index, fitted);
      frames[index] = {
        ...frames[index],
        override: {
          candidateId,
          mode: candidate.mode,
          appliedAtIso,
          instruction: candidate.instruction,
          ...(preparedFrame.fit ? { fit: preparedFrame.fit } : {}),
          ...(candidate.requiresReview && candidate.reviewReasons.length > 0
            ? {
                review: {
                  candidateId,
                  reasons: candidate.reviewReasons,
                  recordedAtIso: appliedAtIso
                }
              }
            : {})
        }
      };
    }
    const project = await rebuildProject(id, { frames });
    rebuilt = true;
    await candidates.updateCandidate(id, candidateId, value => ({
      ...value,
      appliedAtIso: new Date().toISOString()
    }));
    return project;
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    await restoreOverrideSnapshots(directory, id, snapshots).catch(rollbackError => {
      rollbackErrors.push(rollbackError);
    });
    if (rebuilt) {
      await rebuildProject(id, { frames: current.frames }).catch(rollbackError => {
        rollbackErrors.push(rollbackError);
      });
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "Candidate apply and rollback failed.");
    }
    throw error;
  }
}

export async function applyCandidateFrames(
  id: string,
  candidateId: string,
  frameIndices?: number[],
  options: CandidateApplyOptions = {}
): Promise<MotionProject> {
  return withMotionProjectMutation(id, () =>
    applyCandidateFramesUnlocked(id, candidateId, frameIndices, options)
  );
}

async function revertFrameOverridesUnlocked(
  id: string,
  frameIndices?: number[]
): Promise<MotionProject> {
  const current = await readProject(id);
  const active = current.frames.filter(frame => frame.override).map(frame => frame.index);
  const indices = resolveOverrideIndices(frameIndices, active, current.frames.length);
  const directory = await safeExistingProjectDirectory(id);
  const snapshots: OverrideSnapshot[] = [];
  try {
    const frames = current.frames.map(frame => ({ ...frame }));
    for (const index of indices) {
      snapshots.push(await snapshotOverride(directory, id, index));
      await removeOverrideFile(directory, id, index);
      frames[index] = { ...frames[index], override: null };
    }
    return await rebuildProject(id, { frames });
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    await restoreOverrideSnapshots(directory, id, snapshots).catch(rollbackError => {
      rollbackErrors.push(rollbackError);
    });
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "Override revert and rollback failed.");
    }
    throw error;
  }
}

/**
 * 오버라이드를 제거해 최초 원본으로 되돌린다. 직전 후보 상태로 돌아가지 않는다.
 */
export async function revertFrameOverrides(
  id: string,
  frameIndices?: number[]
): Promise<MotionProject> {
  return withMotionProjectMutation(id, () => revertFrameOverridesUnlocked(id, frameIndices));
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
