import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import sharp from "sharp";

import { computeGrid, sliceFrames } from "@/lib/motion/engine";
import { resolveVideoPath } from "@/lib/local/storage";
import {
  analyzeVideoFrames, buildContactSheet, buildSheetFromVideo, composeFrameSheet,
  detectActiveSegment, detectLoopPeriod, extractVideoFrames, ffmpegAvailability,
  frameSignature, probeVideoFile, selectFrameIndices, selectVideoRange, signatureDistance
} from "@/lib/motion/video-frames";

const runFile = promisify(execFile);
const matte = { mode: "keyColor", keyColor: "#00FF00", tolerance: 45, softness: 2, despill: true, choke: 1 };

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-video-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("loop detection selects period 22 with noise and excludes the first lag boundary", () => {
  const sigs = Array.from({ length: 121 }, (_, i) => Float32Array.from(
    Array.from({ length: 12 }, (_, j) => 100 + 50 * Math.sin(2 * Math.PI * (i / 22 + j / 12)) + i * 0.001)
  ));
  const loop = detectLoopPeriod(sigs);
  assert.equal(loop.period, 22);
  assert.ok(loop.closureError < signatureDistance(sigs[0], sigs[1]));
  assert.ok(loop.candidates.every(candidate => candidate.period !== 6));
  assert.equal(detectLoopPeriod(sigs.slice(0, 13)), null);
  // With a monotonic sequence every score increases: the first lag would be a false minimum.
  assert.equal(detectLoopPeriod(Array.from({ length: 121 }, (_, i) => Float32Array.of(i))), null);
  // Restrict the search to the descending side of the waveform, through its period minimum.
  assert.equal(detectLoopPeriod(sigs, { minLag: 12, maxLag: 22 }).period, 22);
  assert.equal(detectLoopPeriod(Array.from({ length: 121 }, () => Float32Array.of(3))), null);
});

test("active segment detects the moving interior and ignores stationary tails", () => {
  const sigs = Array.from({ length: 121 }, (_, i) => Float32Array.of(i <= 20 ? 0 : i < 90 ? (i - 20) * 3 : 207));
  const segment = detectActiveSegment(sigs);
  assert.equal(segment.start, 20);
  assert.ok(segment.end >= 89 && segment.end <= 91);
  assert.equal(segment.threshold, 0.6);
  assert.equal(detectActiveSegment([Float32Array.of(0), Float32Array.of(0)]), null);
  assert.equal(detectActiveSegment([]), null);
});

test("frame selection preserves loop and oneshot endpoints and rejects invalid ranges", () => {
  const input = { frameCount: 48, count: 6, range: { start: 4, end: 16 } };
  assert.deepEqual(selectFrameIndices({ ...input, mode: "loop" }), [4, 6, 8, 10, 12, 14]);
  assert.deepEqual(selectFrameIndices({ ...input, mode: "oneshot" }), [4, 6, 8, 11, 13, 15]);
  assert.deepEqual(selectFrameIndices({ ...input, mode: "oneshot", count: 1 }), [4]);
  for (const patch of [{ count: 13 }, { count: 0 }, { range: { start: -1, end: 12 } }, { range: { start: 2, end: 49 } }, { range: { start: 4, end: 4 } }]) {
    assert.throws(() => selectFrameIndices({ ...input, mode: "loop", ...patch }), { code: "INVALID_RANGE", status: 400 });
  }
  const segment = { start: 20, end: 90, threshold: 0.6 };
  assert.deepEqual(selectVideoRange({ mode: "loop", loop: null, segment }), { start: 20, end: 90 });
  assert.throws(() => selectVideoRange({ mode: "oneshot", loop: null, segment: null }), { code: "NO_MOTION" });
  assert.throws(() => selectVideoRange({ mode: "loop", loop: null, segment, start: 0 }), { code: "INVALID_RANGE" });
});

test("composed sheet round-trips exact cell pixels and contact tiles keep dimensions", async t => {
  const directory = await temporaryDirectory(t);
  const paths = [];
  for (const [index, color] of ["#FF0000", "#00FF00", "#0000FF"].entries()) {
    const file = path.join(directory, `${index}.png`);
    await fs.writeFile(file, await sharp({ create: { width: 24, height: 16, channels: 4, background: color } }).png().toBuffer());
    paths.push(file);
  }
  const { sheet, cols, cellWidth, cellHeight } = await composeFrameSheet(paths, [0, 1, 2]);
  assert.equal(cols, 3);
  assert.equal(cellWidth, 24);
  assert.equal(cellHeight, 16);
  assert.equal((await sharp(sheet).metadata()).width, 72);
  const slices = await sliceFrames(sheet, computeGrid(72, 16, { cols: 3, rows: 1 }));
  for (let i = 0; i < slices.length; i += 1) {
    assert.deepEqual(await sharp(slices[i]).raw().toBuffer(), await sharp(paths[i]).raw().toBuffer());
  }
  const contact = await buildContactSheet(paths, { tileHeight: 32 });
  const metadata = await sharp(contact).metadata();
  assert.equal(metadata.width, 144);
  assert.equal(metadata.height, 32);
  const twoRows = await sharp(await buildContactSheet(Array(18).fill(paths[0]), { maxTiles: 18, tileHeight: 16 })).metadata();
  assert.equal(twoRows.width, 9 * 24);
  assert.equal(twoRows.height, 32);
  const signature = await frameSignature(await fs.readFile(paths[1]), matte);
  assert.equal(signature.length, 48 * 32);
  assert.ok(signature.every(value => value === 0));
});

test("real lavfi video builds six frames from a 12-frame cycle or asserts unavailable tools", async t => {
  const directory = await temporaryDirectory(t);
  const videoPath = path.join(directory, "loop.mp4");
  const availability = await ffmpegAvailability();
  if (!availability.ffmpeg || !availability.ffprobe) {
    assert.ok(availability.ffmpeg === false || availability.ffprobe === false);
    await assert.rejects(buildSheetFromVideo({ videoId: "loop", videoPath, matte, count: 6, mode: "loop" }), { code: "FFMPEG_UNAVAILABLE", status: 503 });
    return;
  }
  const inside = "between(X,8+2*mod(N,12),19+2*mod(N,12))*between(Y,16,31)";
  await runFile(process.env.SIONBANANA_FFMPEG || "ffmpeg", [
    "-v", "error", "-y", "-f", "lavfi", "-i",
    `nullsrc=s=64x48:r=24,geq=r='255*(${inside})':g='255*(1-(${inside}))':b=0`,
    "-frames:v", "48", "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p", videoPath
  ]);
  const probe = await probeVideoFile(videoPath);
  assert.deepEqual({ width: probe.width, height: probe.height, fps: probe.fps, frameCount: probe.frameCount }, { width: 64, height: 48, fps: 24, frameCount: 48 });
  const result = await buildSheetFromVideo({ videoId: "loop", videoPath, matte, count: 6, mode: "loop" });
  assert.equal(result.provenance.period, 12);
  assert.equal(result.provenance.frameIndices.length, 6);
  assert.equal(result.provenance.derivedFps, 12);
  assert.equal((await sharp(result.sheet).metadata()).width, 6 * 64);
  const analysis = await analyzeVideoFrames({ videoPath, matte });
  const extractedDirectory = path.dirname(analysis.framePaths[0]);
  try { assert.equal(analysis.framePaths.length, 48); } finally { await analysis.cleanup(); }
  await assert.rejects(fs.access(extractedDirectory), { code: "ENOENT" });
  const before = new Set((await fs.readdir(tmpdir())).filter(name => name.startsWith("sionbanana-video-frames-")));
  await assert.rejects(analyzeVideoFrames({ videoPath, matte, maxFrames: 47 }), { code: "TOO_LONG", status: 413 });
  const after = (await fs.readdir(tmpdir())).filter(name => name.startsWith("sionbanana-video-frames-") && !before.has(name));
  assert.deepEqual(after, []);
  await assert.rejects(buildSheetFromVideo({ videoId: "loop", videoPath, matte, count: 6, mode: "oneshot", start: 0, end: 4 }), { code: "INVALID_RANGE" });
});

test("unavailable executables have stable status and missing or corrupt videos have explicit codes", async t => {
  const directory = await temporaryDirectory(t);
  const previous = { ffmpeg: process.env.SIONBANANA_FFMPEG, ffprobe: process.env.SIONBANANA_FFPROBE };
  process.env.SIONBANANA_FFMPEG = path.join(directory, "missing-ffmpeg");
  process.env.SIONBANANA_FFPROBE = path.join(directory, "missing-ffprobe");
  try {
    assert.deepEqual(await ffmpegAvailability(), { ffmpeg: false, ffprobe: false });
    await assert.rejects(buildSheetFromVideo({ videoId: "missing", videoPath: path.join(directory, "missing.mp4"), matte, count: 6, mode: "loop" }), { code: "FFMPEG_UNAVAILABLE", status: 503 });
  } finally {
    for (const key of ["ffmpeg", "ffprobe"]) {
      const variable = `SIONBANANA_${key.toUpperCase()}`;
      if (previous[key] === undefined) delete process.env[variable];
      else process.env[variable] = previous[key];
    }
  }
  const availability = await ffmpegAvailability();
  if (availability.ffprobe) {
    await assert.rejects(probeVideoFile(path.join(directory, "missing.mp4")), { code: "VIDEO_NOT_FOUND", status: 404 });
    const corrupt = path.join(directory, "corrupt.mp4");
    await fs.writeFile(corrupt, "invalid video");
    await assert.rejects(probeVideoFile(corrupt), { code: "PROBE_FAILED", status: 502 });
    if (availability.ffmpeg) await assert.rejects(extractVideoFrames(corrupt, path.join(directory, "frames")), { code: "EXTRACT_FAILED", status: 502 });
  }
});

test("resolveVideoPath only resolves stored regular files and rejects symlinks and traversal", async t => {
  const directory = await temporaryDirectory(t);
  const previous = process.env.SIONBANANA_DATA_DIR;
  process.env.SIONBANANA_DATA_DIR = directory;
  t.after(() => {
    if (previous === undefined) delete process.env.SIONBANANA_DATA_DIR;
    else process.env.SIONBANANA_DATA_DIR = previous;
  });
  const bucket = path.join(directory, "videos", "2026-09");
  await fs.mkdir(bucket, { recursive: true });
  const video = path.join(bucket, "saved_video-1.mp4");
  await fs.writeFile(video, "fixture");
  await fs.symlink(video, path.join(bucket, "linked.mp4"));
  assert.equal(await resolveVideoPath("saved_video-1"), video);
  assert.equal(await resolveVideoPath("linked"), null);
  assert.equal(await resolveVideoPath("../saved_video-1"), null);
  assert.equal(await resolveVideoPath("missing"), null);
  await fs.mkdir(path.join(bucket, "directory.mp4"));
  assert.equal(await resolveVideoPath("directory"), null);
  const externalBucket = path.join(directory, "outside");
  await fs.mkdir(externalBucket);
  await fs.writeFile(path.join(externalBucket, "outside.mp4"), "fixture");
  await fs.symlink(externalBucket, path.join(directory, "videos", "linked-bucket"));
  assert.equal(await resolveVideoPath("outside"), null);
});
