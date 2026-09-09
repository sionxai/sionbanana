import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

import { applyMatte } from "@/lib/motion/engine";
import { type MatteSpec, type VideoProvenance } from "@/lib/motion/types";

export type VideoFrameMode = "loop" | "oneshot";
const errorStatuses = {
  FFMPEG_UNAVAILABLE: 503, VIDEO_NOT_FOUND: 404, PROBE_FAILED: 502,
  EXTRACT_FAILED: 502, NO_MOTION: 422, INVALID_RANGE: 400, TOO_LONG: 413
} as const;

export class VideoFramesError extends Error {
  readonly code: keyof typeof errorStatuses;
  readonly status: number;

  constructor(code: keyof typeof errorStatuses, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "VideoFramesError";
    this.code = code;
    this.status = errorStatuses[code];
  }
}

const runFile = promisify(execFile);
const availabilityCache = new Map<string, Promise<boolean>>();
function executable(kind: "ffmpeg" | "ffprobe"): string {
  return process.env[kind === "ffmpeg" ? "SIONBANANA_FFMPEG" : "SIONBANANA_FFPROBE"] || kind;
}

function available(file: string): Promise<boolean> {
  let result = availabilityCache.get(file);
  if (!result) {
    result = runFile(file, ["-version"], { timeout: 10_000, maxBuffer: 1024 * 1024 })
      .then(() => true, () => false);
    availabilityCache.set(file, result);
  }
  return result;
}

export async function ffmpegAvailability(): Promise<{ ffmpeg: boolean; ffprobe: boolean }> {
  const [ffmpeg, ffprobe] = await Promise.all([
    available(executable("ffmpeg")), available(executable("ffprobe"))
  ]);
  return { ffmpeg, ffprobe };
}

async function requireExecutable(kind: "ffmpeg" | "ffprobe"): Promise<string> {
  const file = executable(kind);
  if (!await available(file)) {
    throw new VideoFramesError("FFMPEG_UNAVAILABLE", `${kind} is unavailable. Install ffmpeg or configure SIONBANANA_${kind.toUpperCase()}.`);
  }
  return file;
}

async function requireVideo(filePath: string): Promise<string> {
  const absolute = path.resolve(filePath);
  try {
    const stat = await fs.lstat(absolute);
    if (stat.isFile() && !stat.isSymbolicLink()) return absolute;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  throw new VideoFramesError("VIDEO_NOT_FOUND", "Stored video was not found.");
}

export async function probeVideoFile(filePath: string): Promise<{
  width: number; height: number; fps: number; frameCount: number; durationSec: number;
}> {
  const binary = await requireExecutable("ffprobe");
  const file = await requireVideo(filePath);
  try {
    const { stdout } = await runFile(binary, [
      "-v", "error", "-select_streams", "v:0", "-show_entries",
      "stream=width,height,r_frame_rate,nb_frames,duration", "-of", "json", file
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    const stream = JSON.parse(stdout).streams?.[0];
    const [numerator, denominator = "1"] = String(stream?.r_frame_rate).split("/");
    const fps = Number(numerator) / Number(denominator);
    const width = Number(stream?.width);
    const height = Number(stream?.height);
    const reportedCount = Number(stream?.nb_frames);
    const frameCount = Number.isInteger(reportedCount) && reportedCount > 0 ? reportedCount : 0;
    const reportedDuration = Number(stream?.duration);
    const durationSec = Number.isFinite(reportedDuration) && reportedDuration > 0
      ? reportedDuration : frameCount / fps;
    if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || !Number.isFinite(fps) || fps <= 0) {
      throw new Error("Video stream has invalid dimensions or frame rate.");
    }
    // A missing nb_frames is represented as zero until extraction supplies the actual count.
    return { width, height, fps, frameCount, durationSec };
  } catch (error) {
    throw new VideoFramesError("PROBE_FAILED", "Unable to probe the stored video.", { cause: error });
  }
}

export async function extractVideoFrames(filePath: string, outDir: string, opts: { maxFrames?: number } = {}): Promise<string[]> {
  const maxFrames = opts.maxFrames ?? 720;
  if (!Number.isSafeInteger(maxFrames) || maxFrames < 1) {
    throw new VideoFramesError("INVALID_RANGE", "maxFrames must be a positive integer.");
  }
  const binary = await requireExecutable("ffmpeg");
  const file = await requireVideo(filePath);
  const directory = path.resolve(outDir);
  try {
    await fs.mkdir(directory, { recursive: true });
    // Decode one extra frame to detect overflow without extracting an unbounded video.
    await runFile(binary, [
      "-v", "error", "-y", "-i", file, "-map", "0:v:0", "-fps_mode", "passthrough",
      "-frames:v", String(maxFrames + 1), path.join(directory, "%04d.png")
    ], { timeout: 120_000, maxBuffer: 1024 * 1024 });
    const frames = (await fs.readdir(directory)).filter(name => /^\d{4,}\.png$/.test(name))
      .sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
    if (frames.length > maxFrames) {
      throw new VideoFramesError("TOO_LONG", `Video exceeds the ${maxFrames}-frame limit.`);
    }
    if (frames.length === 0) throw new Error("Video contains no decoded frames.");
    return frames.map(name => path.join(directory, name));
  } catch (error) {
    if (error instanceof VideoFramesError) throw error;
    throw new VideoFramesError("EXTRACT_FAILED", "Unable to extract video frames.", { cause: error });
  }
}

export async function frameSignature(png: Buffer, matte: MatteSpec): Promise<Float32Array> {
  const matted = await applyMatte(png, matte);
  const raw = await sharp(matted).flatten({ background: "#000000" })
    .resize(48, 48, { fit: "inside" }).greyscale().raw().toBuffer();
  return Float32Array.from(raw);
}

export function signatureDistance(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || a.length !== b.length) throw new RangeError("Signatures must have the same nonzero length.");
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

export function detectLoopPeriod(sigs: Float32Array[], opts: { minLag?: number; maxLag?: number } = {}): {
  period: number; start: number; closureError: number; candidates: Array<{ period: number; score: number }>;
} | null {
  const minLag = opts.minLag ?? 6;
  const maxLag = Math.min(opts.maxLag ?? 60, Math.floor(sigs.length / 2));
  if (!Number.isInteger(minLag) || minLag < 1 || !Number.isInteger(maxLag)) throw new RangeError("Lags must be positive integers.");
  if (sigs.length < 2 * minLag + 2 || maxLag <= minLag) return null;
  const scores: Array<{ period: number; score: number }> = [];
  for (let period = minLag; period <= maxLag; period += 1) {
    let sum = 0;
    for (let i = 0; i + period < sigs.length; i += 1) sum += signatureDistance(sigs[i], sigs[i + period]);
    scores.push({ period, score: sum / (sigs.length - period) });
  }
  const candidates = scores.filter((value, k) => k > 0 && value.score < scores[k - 1].score &&
    (k === scores.length - 1 || value.score <= scores[k + 1].score));
  if (candidates.length === 0) return null;
  const { period } = candidates.reduce((best, item) => item.score < best.score ? item : best);
  let start = 0;
  let closureError = Infinity;
  for (let s = 0; s + period < sigs.length; s += 1) {
    const distance = signatureDistance(sigs[s], sigs[s + period]);
    if (distance < closureError) { start = s; closureError = distance; }
  }
  return { period, start, closureError, candidates };
}

export function detectActiveSegment(sigs: Float32Array[]): { start: number; end: number; threshold: number } | null {
  if (sigs.length < 2) return null;
  const adj = sigs.slice(1).map((sig, i) => signatureDistance(sigs[i], sig));
  const sorted = [...adj].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.25)];
  const threshold = Math.max(2 * noiseFloor, 0.6);
  const start = adj.findIndex(value => value > threshold);
  if (start < 0) return null;
  let last = adj.length - 1;
  while (adj[last] <= threshold) last -= 1;
  return { start, end: last + 1, threshold };
}

export function selectFrameIndices(input: {
  frameCount: number; count: number; mode: VideoFrameMode; range: { start: number; end: number };
}): number[] {
  const { frameCount, count, mode, range: { start, end } } = input;
  const len = end - start;
  if (![frameCount, count, start, end].every(Number.isSafeInteger) || frameCount < 1 || count < 1 ||
      start < 0 || end > frameCount || len < count || (mode !== "loop" && mode !== "oneshot")) {
    throw new VideoFramesError("INVALID_RANGE", "Frame range and count must select existing video frames.");
  }
  return Array.from({ length: count }, (_, k) => start + (mode === "loop"
    ? Math.round(k * len / count) : count === 1 ? 0 : Math.round(k * (len - 1) / (count - 1))));
}

export async function composeFrameSheet(framePaths: string[], indices: number[]): Promise<{
  sheet: Buffer; cols: number; cellWidth: number; cellHeight: number;
}> {
  if (indices.length === 0 || indices.some(i => !Number.isInteger(i) || i < 0 || i >= framePaths.length)) {
    throw new VideoFramesError("INVALID_RANGE", "Sheet indices must select existing frames.");
  }
  const { width: cellWidth, height: cellHeight } = await sharp(framePaths[indices[0]]).metadata();
  if (!cellWidth || !cellHeight) throw new VideoFramesError("EXTRACT_FAILED", "Invalid frame dimensions.");
  const layers = [];
  for (const [column, index] of indices.entries()) {
    const metadata = await sharp(framePaths[index]).metadata();
    if (metadata.width !== cellWidth || metadata.height !== cellHeight) {
      throw new VideoFramesError("EXTRACT_FAILED", "Video frames must have equal dimensions.");
    }
    layers.push({ input: framePaths[index], left: column * cellWidth, top: 0 });
  }
  const sheet = await sharp({ create: {
    width: cellWidth * indices.length, height: cellHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 }
  } }).composite(layers).png().toBuffer();
  return { sheet, cols: indices.length, cellWidth, cellHeight };
}

export async function analyzeVideoFrames(input: { videoPath: string; matte: MatteSpec; maxFrames?: number }) {
  await Promise.all([requireExecutable("ffmpeg"), requireExecutable("ffprobe")]);
  const directory = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-video-frames-"));
  const cleanup = () => fs.rm(directory, { recursive: true, force: true });
  try {
    const probe = await probeVideoFile(input.videoPath);
    const framePaths = await extractVideoFrames(input.videoPath, directory, { maxFrames: input.maxFrames });
    probe.frameCount = framePaths.length;
    if (!probe.durationSec) probe.durationSec = framePaths.length / probe.fps;
    const sigs: Float32Array[] = [];
    for (const frame of framePaths) sigs.push(await frameSignature(await fs.readFile(frame), input.matte));
    return { probe, framePaths, sigs, loop: detectLoopPeriod(sigs), segment: detectActiveSegment(sigs), cleanup };
  } catch (error) {
    try { await cleanup(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Video analysis and temporary-frame cleanup failed.");
    }
    throw error;
  }
}

export function selectVideoRange(input: {
  mode: VideoFrameMode; loop: ReturnType<typeof detectLoopPeriod>; segment: ReturnType<typeof detectActiveSegment>;
  start?: number; end?: number;
}): { start: number; end: number } {
  if ((input.start === undefined) !== (input.end === undefined)) {
    throw new VideoFramesError("INVALID_RANGE", "start and end must be supplied together.");
  }
  if (input.start !== undefined && input.end !== undefined) return { start: input.start, end: input.end };
  if (input.mode === "loop" && input.loop) return { start: input.loop.start, end: input.loop.start + input.loop.period };
  if (input.segment) return { start: input.segment.start, end: input.segment.end };
  throw new VideoFramesError("NO_MOTION", "No motion was detected. Supply an explicit frame range.");
}

export async function buildSheetFromVideo(input: {
  videoId: string; videoPath: string; matte: MatteSpec; count: number; mode: VideoFrameMode; start?: number; end?: number;
}): Promise<{ sheet: Buffer; cols: number; cellWidth: number; cellHeight: number; provenance: VideoProvenance }> {
  const analysis = await analyzeVideoFrames(input);
  try {
    const range = selectVideoRange({ ...analysis, mode: input.mode, start: input.start, end: input.end });
    const indices = selectFrameIndices({ frameCount: analysis.probe.frameCount, count: input.count, mode: input.mode, range });
    const composed = await composeFrameSheet(analysis.framePaths, indices);
    const { fps, frameCount, width, height } = analysis.probe;
    return { ...composed, provenance: {
      videoId: input.videoId, sourceFps: fps, frameCount, width, height, mode: input.mode,
      period: analysis.loop?.period ?? null, segment: range, frameIndices: indices,
      derivedFps: Math.max(1, Math.min(60, Math.round(input.count * fps / (range.end - range.start))))
    } };
  } finally {
    await analysis.cleanup();
  }
}

export async function buildContactSheet(framePaths: string[], opts: { maxTiles?: number; tileHeight?: number } = {}): Promise<Buffer> {
  const maxTiles = opts.maxTiles ?? 16;
  const tileHeight = opts.tileHeight ?? 160;
  if (!Number.isSafeInteger(maxTiles) || maxTiles < 1 || !Number.isSafeInteger(tileHeight) || tileHeight < 1) {
    throw new VideoFramesError("INVALID_RANGE", "Contact-sheet dimensions must be positive integers.");
  }
  const count = Math.min(maxTiles, framePaths.length);
  const indices = selectFrameIndices({ frameCount: framePaths.length, count, mode: "oneshot", range: { start: 0, end: framePaths.length } });
  const tiles = [];
  for (const index of indices) tiles.push(await sharp(framePaths[index]).resize({ height: tileHeight }).png().toBuffer());
  const metadata = await sharp(tiles[0]).metadata();
  const width = metadata.width!;
  const cols = count > 16 ? Math.ceil(count / 2) : count;
  return sharp({ create: {
    width: cols * width, height: Math.ceil(count / cols) * tileHeight, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  } }).composite(tiles.map((tile, i) => ({ input: tile, left: (i % cols) * width, top: Math.floor(i / cols) * tileHeight }))).png().toBuffer();
}
