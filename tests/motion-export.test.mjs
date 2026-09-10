import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mock, test } from "node:test";
import { promisify } from "node:util";

import sharp from "sharp";

import {
  buildExportBundle,
  buildMotionExportReview,
  buildTexturePackerAtlas,
  MotionExportBlockedError,
  sanitizeExportFilename
} from "@/lib/motion/export";
import { buildSetExportBundle } from "@/lib/motion/set-export";
import { createSet, updateSet } from "@/lib/motion/set-storage";
import {
  applyCandidateFrames,
  createProject,
  projectDir,
  rebuildProject,
  setReviewApproval
} from "@/lib/motion/storage";
import { createCandidate, updateCandidate } from "@/lib/motion/candidates";
import { exportMotion } from "../scripts/mcp-server.mjs";
import { findMotionServer } from "../scripts/motion-server-discovery.mjs";

const execFileAsync = promisify(execFile);

async function useTempDataDir(t) {
  const previous = process.env.SIONBANANA_DATA_DIR;
  const directory = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-motion-export-data-"));
  process.env.SIONBANANA_DATA_DIR = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.SIONBANANA_DATA_DIR;
    else process.env.SIONBANANA_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  });
}

async function asymmetricSheet() {
  const width = 9;
  const height = 2;
  const pixels = Buffer.alloc(width * height * 4);
  const colors = [
    [240, 20, 30],
    [20, 40, 220],
    [20, 40, 220],
    [20, 200, 80],
    [20, 200, 80],
    [20, 200, 80],
    [240, 210, 20],
    [240, 210, 20],
    [240, 210, 20]
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const color = colors[x];
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function createFixture(t, name = "Export fixture", initializeDataDir = true) {
  if (initializeDataDir) await useTempDataDir(t);
  return createProject({
    name,
    sheetBuffer: await asymmetricSheet(),
    sliceMode: "grid",
    grid: { cols: 3, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: { mode: "none", tolerance: 45, softness: 2, despill: false }
  });
}

async function persistProject(project) {
  await fs.writeFile(
    path.join(projectDir(project.id), "project.json"),
    `${JSON.stringify(project, null, 2)}\n`
  );
}

function approvedGridProject(project, approvedReasons = ["layout-not-validated"]) {
  return {
    ...project,
    reviewApproval: {
      approvedAtIso: "2026-09-08T00:00:00.000Z",
      approvedReasons,
      note: "fixture approval"
    }
  };
}

async function createHundredFrameFixture(t) {
  await useTempDataDir(t);
  const id = "motion-100-frame-gif";
  const framesDirectory = path.join(projectDir(id), "derived", "frames");
  await fs.mkdir(framesDirectory, { recursive: true });
  const frameBuffer = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 40, g: 120, b: 220, alpha: 1 }
    }
  })
    .png()
    .toBuffer();
  const indices = Array.from({ length: 100 }, (_, index) => index);
  await Promise.all(
    indices.map(index =>
      fs.writeFile(
        path.join(framesDirectory, `f${String(index + 1).padStart(2, "0")}.png`),
        frameBuffer
      )
    )
  );
  return {
    id,
    name: "Hundred frame GIF",
    createdAtIso: new Date().toISOString(),
    sourceImage: { path: "raw.png", width: 200, height: 2 },
    sliceMode: "grid",
    sliceConfidence: 1,
    layoutValidated: true,
    reviewApproval: null,
    grid: { cols: 100, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    canvas: { w: 2, h: 2 },
    matte: { mode: "none", tolerance: 45, softness: 2, despill: false },
    frames: indices.map(index => ({
      index,
      source: { x: index * 2, y: 0, w: 2, h: 2 },
      trim: { x: 0, y: 0, w: 2, h: 2 },
      pivot: { x: 1, y: 1 },
      flipX: false,
      excluded: false,
      durationMs: null
    })),
    animations: [
      { name: "long-loop", frameIndices: indices, fps: 12, loop: "loop" }
    ]
  };
}

async function unzipBuffer(zipPath, entry) {
  const { stdout } = await execFileAsync("/usr/bin/unzip", ["-p", zipPath, entry], {
    encoding: "buffer",
    maxBuffer: 4 * 1024 * 1024
  });
  return stdout;
}

async function unzipJson(zipPath, entry = "animation.json") {
  return JSON.parse((await unzipBuffer(zipPath, entry)).toString("utf8"));
}

async function unzipEntries(zipPath) {
  const { stdout } = await execFileAsync("/usr/bin/unzip", ["-Z1", zipPath]);
  return stdout.trim().split("\n");
}

function normalizedAtlasPivot(value, size) {
  if (size === 0) return 0.5;
  return Math.round(Math.min(1, Math.max(0, value / size)) * 10000) / 10000;
}

function expectedAtlasFrame(frame) {
  return {
    frame: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: frame.w, h: frame.h },
    sourceSize: { w: frame.w, h: frame.h },
    pivot: {
      x: normalizedAtlasPivot(frame.pivot.x, frame.w),
      y: normalizedAtlasPivot(frame.pivot.y, frame.h)
    }
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("findMotionServer returns the preferred healthy 3002 server", async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    if (String(url).includes(":3002/")) return jsonResponse({ ok: true });
    if (String(url).includes(":3000/")) return jsonResponse({ ok: false }, 503);
    throw new Error(`unexpected URL: ${url}`);
  };

  assert.deepEqual(await findMotionServer(fetchImpl), {
    port: 3002,
    baseUrl: "http://localhost:3002"
  });
  assert.deepEqual(calls, ["http://localhost:3002/api/health"]);
});

test("findMotionServer scans from 3002 to 3000 in order", async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    return String(url).includes(":3000/")
      ? jsonResponse({ ok: true })
      : jsonResponse({ ok: false }, 503);
  };

  assert.deepEqual(await findMotionServer(fetchImpl), {
    port: 3000,
    baseUrl: "http://localhost:3000"
  });
  assert.deepEqual(calls, [
    "http://localhost:3002/api/health",
    "http://localhost:3000/api/health"
  ]);
});

test("findMotionServer throws with every failed port", async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    throw new Error("connection refused");
  };

  await assert.rejects(
    findMotionServer(fetchImpl),
    error => {
      assert.match(error.message, /^No healthy sionbanana server\. Tried /);
      assert.match(error.message, /3002: connection refused/);
      assert.match(error.message, /3005: connection refused/);
      return true;
    }
  );
  assert.equal(calls.length, 6);
});

test("exportMotion mock mode returns the documented shape", async () => {
  assert.deepEqual(
    await exportMotion({ projectId: "motion-project-1" }, { mock: true }),
    { ok: true, mocked: true, projectId: "motion-project-1" }
  );
});

test("exportMotion rejects a destPath containing traversal without copying", async t => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-motion-export-mcp-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source.zip");
  const destination = path.join(root, "copied.zip");
  await fs.writeFile(source, "fixture zip bytes");

  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith("/api/health")) return jsonResponse({ ok: true });
    if (value.includes("/export-file?")) {
      return jsonResponse({
        ok: true,
        zipPath: source,
        bytes: 17,
        sha256: "fixture-sha256",
        gifIncluded: false
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  };
  const result = await exportMotion(
    {
      projectId: "motion-project-1",
      includeGif: false,
      asBase64: false,
      destPath: "nested/../copied.zip"
    },
    { mock: false, fetchImpl, repoRoot: root }
  );

  assert.equal(result.ok, true);
  assert.match(result.destPathRejected, /must not contain '\.\.'/);
  assert.equal(Object.hasOwn(result, "copiedTo"), false);
  await assert.rejects(fs.stat(destination), error => error?.code === "ENOENT");
});

test("exportMotion copies a fixture ZIP to a safe destPath without hanging", async t => {
  const realTempRoot = await fs.realpath(tmpdir());
  const root = await fs.mkdtemp(path.join(realTempRoot, "sionbanana-motion-export-copy-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source.zip");
  const destination = path.join(root, "copied.zip");
  const fixture = Buffer.from("small fixture zip bytes for safe copy");
  await fs.writeFile(source, fixture);

  const fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith("/api/health")) return jsonResponse({ ok: true });
    if (value.includes("/export-file?")) {
      return jsonResponse({
        ok: true,
        zipPath: source,
        bytes: fixture.byteLength,
        sha256: "fixture-sha256",
        gifIncluded: false
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  let timeout;
  try {
    const result = await Promise.race([
      exportMotion(
        {
          projectId: "motion-project-1",
          includeGif: false,
          asBase64: false,
          destPath: destination
        },
        { mock: false, fetchImpl, repoRoot: root }
      ),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("exportMotion safe copy timed out")), 500);
      })
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.copiedTo, destination);
    assert.equal(Object.hasOwn(result, "destPathRejected"), false);
    assert.deepEqual(await fs.readFile(destination), fixture);
  } finally {
    clearTimeout(timeout);
  }
});

test("animation.json uses the export schema and valid remapped frame indices", async t => {
  let project = await createFixture(t, "Schema animation");
  project = await rebuildProject(project.id, {
    animations: [
      { name: "walk", frameIndices: [0, 1, 2], fps: 8, loop: "loop" }
    ]
  });
  const bundle = await buildExportBundle(approvedGridProject(project), { includeGif: false });
  t.after(() => bundle.cleanup());
  const data = await unzipJson(bundle.zipPath);

  for (const key of ["name", "image", "frameWidth", "frameHeight", "frames", "animations", "meta"]) {
    assert.ok(Object.hasOwn(data, key), `missing ${key}`);
  }
  assert.equal(typeof data.name, "string");
  assert.equal(data.image, "sprite-sheet.png");
  assert.ok(Array.isArray(data.frames));
  assert.ok(Array.isArray(data.animations));
  assert.equal(data.frames.length, project.frames.filter(frame => !frame.excluded).length);
  assert.ok(Number.isInteger(data.frameWidth) && data.frameWidth > 0);
  assert.ok(Number.isInteger(data.frameHeight) && data.frameHeight > 0);
  for (const frame of data.frames) {
    for (const key of ["index", "x", "y", "w", "h", "pivot", "durationMs"]) {
      assert.ok(Object.hasOwn(frame, key), `frame missing ${key}`);
    }
    assert.ok(Number.isInteger(frame.pivot.x));
    assert.ok(Number.isInteger(frame.pivot.y));
  }
  for (const animation of data.animations) {
    for (const key of ["name", "frames", "fps", "loop"]) {
      assert.ok(Object.hasOwn(animation, key), `animation missing ${key}`);
    }
    assert.equal(typeof animation.name, "string");
    assert.ok(Array.isArray(animation.frames));
    assert.ok(Number.isSafeInteger(animation.fps) && animation.fps > 0);
    assert.ok(["loop", "pingpong", "once"].includes(animation.loop));
    for (const frameIndex of animation.frames) {
      assert.ok(Number.isSafeInteger(frameIndex));
      assert.ok(frameIndex >= 0 && frameIndex < data.frames.length);
    }
  }
  assert.equal(typeof data.meta, "object");
  for (const key of ["generator", "createdAtIso", "sourceProjectId"]) {
    assert.ok(Object.hasOwn(data.meta, key), `meta missing ${key}`);
  }
  assert.equal(data.meta.generator, "sionbanana-motion");
  assert.equal(typeof data.meta.createdAtIso, "string");
  assert.equal(new Date(data.meta.createdAtIso).toISOString(), data.meta.createdAtIso);
  assert.equal(typeof data.meta.sourceProjectId, "string");
  assert.equal(data.meta.sourceProjectId, project.id);
});

test("buildTexturePackerAtlas normalizes pivots and emits only contiguous frame tags", () => {
  const atlas = buildTexturePackerAtlas({
    sheetWidth: 24,
    sheetHeight: 20,
    frames: [
      { index: 5, x: 1, y: 2, w: 10, h: 20, pivot: { x: -3, y: 30 } },
      { index: 6, x: 11, y: 2, w: 10, h: 20, pivot: { x: 5, y: 10 } },
      { index: 7, x: 0, y: 0, w: 0, h: 0, pivot: { x: 999, y: -999 } },
      { index: 9, x: 21, y: 2, w: 1, h: 1, pivot: { x: 0.123456, y: 0.987654 } }
    ],
    animations: [
      { name: "loop", frames: [5, 6, 7], loop: "loop" },
      { name: "ping", frames: [5, 6], loop: "pingpong" },
      { name: "once", frames: [9], loop: "once" },
      { name: "repeated", frames: [5, 5], loop: "loop" },
      { name: "gapped", frames: [5, 7], loop: "loop" },
      { name: "reverse", frames: [7, 6], loop: "loop" },
      { name: "empty", frames: [], loop: "loop" }
    ]
  });

  assert.deepEqual(Object.keys(atlas.frames), ["5", "6", "7", "9"]);
  assert.deepEqual(atlas.frames["5"].pivot, { x: 0, y: 1 });
  assert.deepEqual(atlas.frames["7"], {
    frame: { x: 0, y: 0, w: 0, h: 0 },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: 0, h: 0 },
    sourceSize: { w: 0, h: 0 },
    pivot: { x: 0.5, y: 0.5 }
  });
  assert.deepEqual(atlas.frames["9"].pivot, { x: 0.1235, y: 0.9877 });
  assert.deepEqual(atlas.meta, {
    app: "sionbanana-motion",
    version: "1.0",
    image: "sprite-sheet.png",
    format: "RGBA8888",
    size: { w: 24, h: 20 },
    scale: "1",
    frameTags: [
      { name: "loop", from: 5, to: 7, direction: "forward" },
      { name: "ping", from: 5, to: 6, direction: "pingpong" },
      { name: "once", from: 9, to: 9, direction: "forward" }
    ]
  });
});

test("single export includes a TexturePacker atlas that preserves animation playback data", async t => {
  let project = await createFixture(t, "TexturePacker single export");
  project = await rebuildProject(project.id, {
    animations: [
      { name: "walk", frameIndices: [0, 1, 2], fps: 8, loop: "loop" },
      { name: "ping", frameIndices: [0, 1, 2], fps: 9, loop: "pingpong" },
      { name: "once", frameIndices: [1], fps: 10, loop: "once" },
      { name: "repeated", frameIndices: [0, 1, 0, 1], fps: 11, loop: "loop" },
      { name: "gapped", frameIndices: [0, 2], fps: 12, loop: "loop" },
      { name: "reverse", frameIndices: [2, 1], fps: 13, loop: "loop" },
      { name: "empty", frameIndices: [], fps: 14, loop: "loop" }
    ]
  });
  const bundle = await buildExportBundle(approvedGridProject(project), { includeGif: false });
  t.after(() => bundle.cleanup());

  const animation = await unzipJson(bundle.zipPath);
  const atlas = await unzipJson(bundle.zipPath, "sprite-sheet.json");
  const entries = await unzipEntries(bundle.zipPath);
  const sheetMetadata = await sharp(
    await unzipBuffer(bundle.zipPath, "sprite-sheet.png")
  ).metadata();

  assert.deepEqual(Object.keys(atlas), ["frames", "meta"]);
  assert.deepEqual(Object.keys(atlas.frames), animation.frames.map(frame => String(frame.index)));
  for (const frame of animation.frames) {
    const atlasFrame = atlas.frames[String(frame.index)];
    assert.deepEqual(atlasFrame, expectedAtlasFrame(frame));
    assert.ok(atlasFrame.pivot.x >= 0 && atlasFrame.pivot.x <= 1);
    assert.ok(atlasFrame.pivot.y >= 0 && atlasFrame.pivot.y <= 1);
  }
  assert.deepEqual(Object.keys(atlas.meta), [
    "app",
    "version",
    "image",
    "format",
    "size",
    "scale",
    "frameTags"
  ]);
  assert.equal(atlas.meta.app, "sionbanana-motion");
  assert.equal(atlas.meta.version, "1.0");
  assert.equal(atlas.meta.image, "sprite-sheet.png");
  assert.equal(atlas.meta.format, "RGBA8888");
  assert.equal(atlas.meta.scale, "1");
  assert.deepEqual(atlas.meta.size, { w: sheetMetadata.width, h: sheetMetadata.height });
  assert.deepEqual(atlas.meta.frameTags, [
    { name: "walk", from: 0, to: 2, direction: "forward" },
    { name: "ping", from: 0, to: 2, direction: "pingpong" },
    { name: "once", from: 1, to: 1, direction: "forward" }
  ]);
  assert.deepEqual(
    animation.animations,
    project.animations.map(candidate => ({
      name: candidate.name,
      frames: candidate.frameIndices,
      fps: candidate.fps,
      loop: candidate.loop
    }))
  );
  assert.deepEqual(
    animation.animations.find(candidate => candidate.name === "repeated").frames,
    [0, 1, 0, 1]
  );
  assert.equal(atlas.meta.frameTags.some(tag => tag.name === "repeated"), false);
  assert.ok(entries.includes("sprite-sheet.json"));
  assert.equal(entries[entries.indexOf("animation.json") + 1], "sprite-sheet.json");
  const readme = (await unzipBuffer(bundle.zipPath, "README.txt")).toString("utf8");
  assert.ok(
    readme.includes(
      "sprite-sheet.json is a TexturePacker JSON Hash atlas (Phaser load.atlas, PixiJS) with normalized per-frame pivots; animation.json stays authoritative for playback order, fps and loop."
    )
  );
});

test("motion exports block unapproved review issues and record explicit approval", async t => {
  const gridProject = await createFixture(t, "Grid review export");
  const originalMkdtemp = fs.mkdtemp.bind(fs);
  const originalWriteFile = fs.writeFile.bind(fs);
  let temporaryDirectories = 0;
  let atlasWrites = 0;
  const mkdtempMock = mock.method(fs, "mkdtemp", async (...args) => {
    temporaryDirectories += 1;
    return originalMkdtemp(...args);
  });
  const writeFileMock = mock.method(fs, "writeFile", async (...args) => {
    if (String(args[0]).endsWith("sprite-sheet.json")) atlasWrites += 1;
    return originalWriteFile(...args);
  });
  try {
    await assert.rejects(
      buildExportBundle(gridProject, { includeGif: false }),
      error =>
        error instanceof MotionExportBlockedError &&
        error.status === 409 &&
        error.review.outstandingIssues.includes("layout-not-validated")
    );
  } finally {
    mkdtempMock.mock.restore();
    writeFileMock.mock.restore();
  }
  assert.equal(temporaryDirectories, 0);
  assert.equal(atlasWrites, 0);

  const approvedProject = await setReviewApproval(gridProject.id, {
    reasons: ["layout-not-validated"],
    note: "previewed"
  });
  const gridBundle = await buildExportBundle(approvedProject, { includeGif: false });
  t.after(() => gridBundle.cleanup());
  const gridExport = await unzipJson(gridBundle.zipPath);

  assert.deepEqual(gridExport.meta.review, {
    sliceMode: "grid",
    layoutValidated: false,
    sliceConfidence: null,
    issues: ["layout-not-validated"],
    blockingIssues: [],
    approvableIssues: ["layout-not-validated"],
    outstandingIssues: [],
    approval: approvedProject.reviewApproval,
    requiresReview: false
  });

  const inspectedProject = {
    ...gridProject,
    sliceMode: "auto",
    layoutValidated: true,
    sliceConfidence: 1,
    reviewApproval: null
  };
  const inspectedBundle = await buildExportBundle(inspectedProject, { includeGif: false });
  t.after(() => inspectedBundle.cleanup());
  const inspectedExport = await unzipJson(inspectedBundle.zipPath);
  assert.deepEqual(inspectedExport.meta.review, {
    sliceMode: "auto",
    layoutValidated: true,
    sliceConfidence: 1,
    issues: [],
    blockingIssues: [],
    approvableIssues: [],
    outstandingIssues: [],
    approval: null,
    requiresReview: false
  });
});

test("motion export fit review issues use the included frame index", async t => {
  const project = await createFixture(t, "Fit review export");
  project.frames[0].excluded = true;
  project.frames[1].override = {
    candidateId: "cand-fit-review",
    mode: "upload",
    appliedAtIso: "2026-09-08T00:00:00.000Z",
    instruction: null,
    fit: {
      verdict: "review",
      reasons: ["content-loss"],
      lostPixels: 4,
      touchesEdge: ["left"]
    }
  };
  project.reviewApproval = {
    approvedAtIso: "2026-09-08T00:00:00.000Z",
    approvedReasons: ["layout-not-validated", "frame-1-content-loss"],
    note: null
  };
  const bundle = await buildExportBundle(project, { includeGif: false });
  t.after(() => bundle.cleanup());
  const exported = await unzipJson(bundle.zipPath);

  assert.ok(exported.meta.review.issues.includes("layout-not-validated"));
  assert.ok(exported.meta.review.issues.includes("frame-1-content-loss"));
  assert.equal(exported.meta.review.issues.includes("frame-2-content-loss"), false);
});

test("alignment outliers use compact export numbers, remain approvable, and honor review offsets", async t => {
  const project = await createFixture(t, "Alignment review export");
  const reviewProject = {
    ...project,
    sliceMode: "grid",
    layoutValidated: true,
    sliceConfidence: 1,
    reviewApproval: null,
    frames: project.frames.map((frame, index) => ({ ...frame, excluded: index === 0 })),
    alignment: {
      anchor: "foot",
      cellWidth: 3,
      medianAnchorX: 1,
      deviations: [null, 0, 40],
      threshold: 24,
      outliers: [2]
    }
  };
  await persistProject(reviewProject);
  const included = reviewProject.frames.filter(frame => !frame.excluded);
  const initialReview = buildMotionExportReview(reviewProject, included);
  assert.deepEqual(initialReview.approvableIssues, ["frame-2-alignment-outlier"]);
  assert.deepEqual(initialReview.outstandingIssues, ["frame-2-alignment-outlier"]);
  assert.deepEqual(
    buildMotionExportReview(reviewProject, included, 4).outstandingIssues,
    ["frame-6-alignment-outlier"]
  );

  await assert.rejects(
    buildExportBundle(reviewProject, { includeGif: false }),
    error =>
      error instanceof MotionExportBlockedError &&
      error.status === 409 &&
      error.review.blockingIssues.length === 0 &&
      error.review.issues.includes("frame-2-alignment-outlier") &&
      error.review.outstandingIssues.includes("frame-2-alignment-outlier")
  );

  const approved = await setReviewApproval(project.id, {
    reasons: ["frame-2-alignment-outlier"],
    note: "alignment previewed"
  });
  const approvedReview = buildMotionExportReview(
    approved,
    approved.frames.filter(frame => !frame.excluded)
  );
  assert.deepEqual(approvedReview.outstandingIssues, []);
  assert.deepEqual(approved.reviewApproval?.approvedReasons, ["frame-2-alignment-outlier"]);
});

test("candidate review reasons survive application, require approval, and are exported with approval metadata", async t => {
  await useTempDataDir(t);
  const foreground = await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: { r: 240, g: 210, b: 20, alpha: 1 }
    }
  })
    .png()
    .toBuffer();
  const interiorCell = await sharp({
    create: {
      width: 48,
      height: 48,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: foreground, left: 16, top: 16 }])
    .png()
    .toBuffer();
  const project = await createProject({
    name: "Candidate review export",
    sheetBuffer: interiorCell,
    sliceMode: "grid",
    grid: { cols: 1, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: { mode: "none", tolerance: 45, softness: 2, despill: false }
  });
  const candidate = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 0, image: interiorCell }]
  });
  await updateCandidate(project.id, candidate.id, value => ({
    ...value,
    requiresReview: true,
    reviewReasons: ["low-slice-confidence"]
  }));
  const applied = await applyCandidateFrames(project.id, candidate.id);
  assert.equal(applied.frames[0].override?.fit, undefined);
  assert.deepEqual(applied.frames[0].override?.review?.reasons, ["low-slice-confidence"]);
  assert.equal(applied.frames[0].override?.review?.candidateId, candidate.id);

  let blocked;
  try {
    await buildExportBundle(applied, { includeGif: false });
  } catch (error) {
    blocked = error;
  }
  assert.ok(blocked instanceof MotionExportBlockedError);
  assert.ok(blocked.review.outstandingIssues.includes("frame-1-low-slice-confidence"));

  const approved = await setReviewApproval(project.id, {
    reasons: blocked.review.approvableIssues,
    note: "candidate previewed"
  });
  const bundle = await buildExportBundle(approved, { includeGif: false });
  t.after(() => bundle.cleanup());
  const exported = await unzipJson(bundle.zipPath);
  assert.deepEqual(exported.meta.review.approval, approved.reviewApproval);
  assert.equal(exported.meta.review.outstandingIssues.length, 0);
});

test("legacy unknown layouts and recorded content loss remain blocked by the export gate", async t => {
  const project = await createFixture(t, "Legacy export review");
  const legacy = {
    ...project,
    sliceMode: "auto",
    layoutValidated: null,
    reviewApproval: null
  };
  await assert.rejects(
    buildExportBundle(legacy, { includeGif: false }),
    error =>
      error instanceof MotionExportBlockedError &&
      error.review.outstandingIssues.includes("layout-validation-unknown")
  );

  const contentLoss = {
    ...legacy,
    layoutValidated: true,
    reviewApproval: {
      approvedAtIso: "2026-09-08T00:00:00.000Z",
      approvedReasons: ["frame-1-content-loss-allowed"],
      note: "attempted approval"
    },
    frames: legacy.frames.map((frame, index) =>
      index === 0
        ? {
            ...frame,
            override: {
              candidateId: "cand-content-loss",
              mode: "upload",
              appliedAtIso: "2026-09-08T00:00:00.000Z",
              instruction: null,
              fit: {
                verdict: "review",
                reasons: ["content-loss-allowed"],
                lostPixels: 3,
                touchesEdge: ["left"]
              }
            }
          }
        : frame
    )
  };
  await assert.rejects(
    buildExportBundle(contentLoss, { includeGif: false }),
    error =>
      error instanceof MotionExportBlockedError &&
      error.review.blockingIssues.includes("frame-1-content-loss-allowed")
  );
});

test("motion set exports block an unapproved member before creating a temporary bundle", async t => {
  const project = await createFixture(t, "Set review export");
  const initial = await createSet({
    name: "Set review export",
    base: { description: "A banana hero" },
    common: { cols: 3, rows: 1, fps: 12 },
    members: [{ action: "idle" }]
  });
  const set = await updateSet(initial.id, current => ({
    ...current,
    status: "ready",
    members: current.members.map(member => ({
      ...member,
      status: "ready",
      projectId: project.id,
      finishedAtIso: "2026-09-08T00:00:00.000Z"
    }))
  }));
  const originalMkdtemp = fs.mkdtemp.bind(fs);
  const originalWriteFile = fs.writeFile.bind(fs);
  let temporaryDirectories = 0;
  let atlasWrites = 0;
  const mkdtempMock = mock.method(fs, "mkdtemp", async (...args) => {
    temporaryDirectories += 1;
    return originalMkdtemp(...args);
  });
  const writeFileMock = mock.method(fs, "writeFile", async (...args) => {
    if (String(args[0]).endsWith("sprite-sheet.json")) atlasWrites += 1;
    return originalWriteFile(...args);
  });
  try {
    await assert.rejects(
      buildSetExportBundle(set, { includeGif: false }),
      error =>
        error instanceof MotionExportBlockedError &&
        error.status === 409 &&
        error.review.outstandingIssues.includes("idle:layout-not-validated")
    );
  } finally {
    mkdtempMock.mock.restore();
    writeFileMock.mock.restore();
  }
  assert.equal(temporaryDirectories, 0);
  assert.equal(atlasWrites, 0);
});

test("motion set review issues use global frame indices in the export gate", async t => {
  await useTempDataDir(t);
  const idle = await createFixture(t, "Idle set review", false);
  const walk = await createFixture(t, "Walk set review", false);
  await persistProject({ ...idle, sliceMode: "auto", layoutValidated: true, sliceConfidence: 1 });
  await persistProject({
    ...walk,
    sliceMode: "auto",
    layoutValidated: true,
    sliceConfidence: 1,
    frames: walk.frames.map(frame => {
      if (frame.index === 0) return { ...frame, excluded: true };
      if (frame.index !== 1) return frame;
      return {
        ...frame,
        override: {
          candidateId: "cand-set-fit-review",
          mode: "upload",
          appliedAtIso: "2026-09-08T00:00:00.000Z",
          instruction: null,
          fit: {
            verdict: "review",
            reasons: ["content-loss"],
            lostPixels: 4,
            touchesEdge: ["left"]
          }
        }
      };
    })
  });
  const initial = await createSet({
    name: "Mixed set review",
    base: { description: "A banana hero" },
    common: { cols: 3, rows: 1, fps: 12 },
    members: [{ action: "idle" }, { action: "walk" }]
  });
  const set = await updateSet(initial.id, current => ({
    ...current,
    status: "ready",
    members: current.members.map(member => ({
      ...member,
      status: "ready",
      projectId: member.action === "idle" ? idle.id : walk.id,
      finishedAtIso: "2026-09-08T00:00:00.000Z"
    }))
  }));
  await assert.rejects(
    buildSetExportBundle(set, { includeGif: false }),
    error =>
      error instanceof MotionExportBlockedError &&
      error.review.outstandingIssues.includes("walk:frame-4-content-loss")
  );
});

test("motion set exports atlas tags with global frame ranges for unequal clean actions", async t => {
  await useTempDataDir(t);
  const idle = await createFixture(t, "Clean idle set review", false);
  const walk = await createFixture(t, "Clean walk set review", false);
  await persistProject({
    ...idle,
    sliceMode: "auto",
    layoutValidated: true,
    sliceConfidence: 1,
    animations: [{ name: "idle-source", frameIndices: [0, 1, 2], fps: 8, loop: "loop" }]
  });
  await persistProject({
    ...walk,
    sliceMode: "auto",
    layoutValidated: true,
    sliceConfidence: 1,
    frames: walk.frames.map(frame => ({ ...frame, excluded: frame.index === 2 })),
    animations: [{ name: "walk-source", frameIndices: [0, 1], fps: 9, loop: "pingpong" }]
  });
  const initial = await createSet({
    name: "Clean set review",
    base: { description: "A banana hero" },
    common: { cols: 3, rows: 1, fps: 12 },
    members: [{ action: "idle" }, { action: "walk" }]
  });
  const set = await updateSet(initial.id, current => ({
    ...current,
    status: "ready",
    members: current.members.map(member => ({
      ...member,
      status: "ready",
      projectId: member.action === "idle" ? idle.id : walk.id,
      finishedAtIso: "2026-09-08T00:00:00.000Z"
    }))
  }));
  const bundle = await buildSetExportBundle(set, { includeGif: false });
  t.after(() => bundle.cleanup());
  const animation = await unzipJson(bundle.zipPath);
  const atlas = await unzipJson(bundle.zipPath, "sprite-sheet.json");
  const entries = await unzipEntries(bundle.zipPath);
  const sheetMetadata = await sharp(
    await unzipBuffer(bundle.zipPath, "sprite-sheet.png")
  ).metadata();

  assert.equal(animation.meta.review.idle.requiresReview, false);
  assert.equal(animation.meta.review.walk.requiresReview, false);
  assert.equal(animation.meta.requiresReview, false);
  assert.deepEqual(
    animation.animations.map(candidate => ({ name: candidate.name, frames: candidate.frames })),
    [
      { name: "idle", frames: [0, 1, 2] },
      { name: "walk", frames: [3, 4] }
    ]
  );
  assert.deepEqual(
    animation.frames.map(frame => ({ index: frame.index, x: frame.x, y: frame.y })),
    [
      { index: 0, x: 0, y: 0 },
      { index: 1, x: animation.frameWidth, y: 0 },
      { index: 2, x: animation.frameWidth * 2, y: 0 },
      { index: 3, x: 0, y: animation.frameHeight },
      { index: 4, x: animation.frameWidth, y: animation.frameHeight }
    ]
  );
  assert.deepEqual(Object.keys(atlas.frames), animation.frames.map(frame => String(frame.index)));
  for (const frame of animation.frames) {
    assert.deepEqual(atlas.frames[String(frame.index)], expectedAtlasFrame(frame));
  }
  const expectedPivot = {
    x: normalizedAtlasPivot(animation.frames[0].pivot.x, animation.frameWidth),
    y: normalizedAtlasPivot(animation.frames[0].pivot.y, animation.frameHeight)
  };
  assert.ok(
    animation.frames.every(
      frame =>
        frame.pivot.x === animation.frames[0].pivot.x &&
        frame.pivot.y === animation.frames[0].pivot.y
    )
  );
  assert.ok(
    Object.values(atlas.frames).every(
      frame => frame.pivot.x === expectedPivot.x && frame.pivot.y === expectedPivot.y
    )
  );
  assert.deepEqual(atlas.meta.frameTags, [
    { name: "idle", from: 0, to: 2, direction: "forward" },
    { name: "walk", from: 3, to: 4, direction: "pingpong" }
  ]);
  assert.deepEqual(atlas.meta.size, { w: sheetMetadata.width, h: sheetMetadata.height });
  assert.ok(entries.includes("sprite-sheet.json"));
  assert.equal(entries[entries.indexOf("animation.json") + 1], "sprite-sheet.json");
  const readme = (await unzipBuffer(bundle.zipPath, "README.txt")).toString("utf8");
  assert.ok(
    readme.includes(
      "sprite-sheet.json is a TexturePacker JSON Hash atlas (Phaser load.atlas, PixiJS) with normalized per-frame pivots; animation.json stays authoritative for playback order, fps and loop."
    )
  );
});

test("excluded frames are omitted and flipX pixels remain baked after reindexing", async t => {
  const initial = await createFixture(t, "Flip and exclude");
  const project = await rebuildProject(initial.id, {
    frames: initial.frames.map(frame => ({
      ...frame,
      flipX: frame.index === 0,
      excluded: frame.index === 1
    })),
    animations: [
      { name: "bounce", frameIndices: [0, 1, 2, 0], fps: 10, loop: "pingpong" }
    ]
  });
  const bundle = await buildExportBundle(approvedGridProject(project), { includeGif: false });
  t.after(() => bundle.cleanup());

  const data = await unzipJson(bundle.zipPath);
  assert.deepEqual(data.frames.map(frame => frame.index), [0, 1]);
  assert.deepEqual(data.animations[0].frames, [0, 1, 0]);
  const entries = await unzipEntries(bundle.zipPath);
  assert.ok(entries.includes("frames/f01.png"));
  assert.ok(entries.includes("frames/f02.png"));
  assert.ok(!entries.includes("frames/f03.png"));

  const decoded = await sharp(await unzipBuffer(bundle.zipPath, "frames/f01.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const opaque = [];
  for (let y = 0; y < decoded.info.height; y += 1) {
    for (let x = 0; x < decoded.info.width; x += 1) {
      const offset = (y * decoded.info.width + x) * 4;
      if (decoded.data[offset + 3] > 0) {
        opaque.push({
          x,
          red: decoded.data[offset],
          blue: decoded.data[offset + 2]
        });
      }
    }
  }
  const minX = Math.min(...opaque.map(pixel => pixel.x));
  const maxX = Math.max(...opaque.map(pixel => pixel.x));
  const left = opaque.find(pixel => pixel.x === minX);
  const right = opaque.find(pixel => pixel.x === maxX);
  assert.ok(left.blue > left.red, "flipped frame should have blue pixels on the left");
  assert.ok(right.red > right.blue, "flipped frame should have red pixels on the right");
});

test("export filename sanitization blocks traversal, spaces, quotes, and Korean-only names", () => {
  const values = [
    sanitizeExportFilename("../ unsafe name 한글", "motion-123"),
    sanitizeExportFilename("한글 이름", "motion-123"),
    sanitizeExportFilename(" .. / \r\n\" ", "motion-123")
  ];
  assert.deepEqual(values, ["unsafe-name", "motion-123", "motion-123"]);
  for (const value of values) assert.match(value, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test("buildExportBundle creates a non-empty ZIP and cleanup removes its temporary root", async t => {
  const project = await createFixture(t, "ZIP cleanup");
  const bundle = await buildExportBundle(approvedGridProject(project), { includeGif: false });
  const temporaryRoot = path.dirname(bundle.zipPath);
  try {
    const stat = await fs.stat(bundle.zipPath);
    assert.equal(stat.isFile(), true);
    assert.ok(stat.size > 0);
  } finally {
    await bundle.cleanup();
  }
  await assert.rejects(fs.stat(temporaryRoot), error => error?.code === "ENOENT");
  await bundle.cleanup();
});

test("README collapses animation-name whitespace and stays at nine lines", async t => {
  const initial = await createFixture(t, "README line count");
  const project = await rebuildProject(initial.id, {
    animations: [
      { name: "walk\r\n   cycle\tfast", frameIndices: [0, 1, 2], fps: 9, loop: "once" }
    ]
  });
  const bundle = await buildExportBundle(approvedGridProject(project), { includeGif: false });
  t.after(() => bundle.cleanup());

  const readme = (await unzipBuffer(bundle.zipPath, "README.txt")).toString("utf8");
  const lines = readme.trimEnd().split("\n");
  assert.equal(lines.length, 9);
  assert.ok(lines.includes("Primary animation: walk cycle fast; default FPS: 9."));
  assert.ok(lines.every(line => !line.includes("\r")));
});

test("100-frame export uses the minimum-two-digit sequence and produces a GIF", async t => {
  try {
    await fs.access("/opt/homebrew/bin/ffmpeg");
  } catch {
    t.skip("ffmpeg is unavailable in this environment");
    return;
  }
  const project = await createHundredFrameFixture(t);
  const bundle = await buildExportBundle(project, { includeGif: true });
  t.after(() => bundle.cleanup());

  const entries = await unzipEntries(bundle.zipPath);
  assert.ok(entries.includes("frames/f100.png"));
  assert.ok(entries.includes("preview.gif"));
  assert.ok((await unzipBuffer(bundle.zipPath, "preview.gif")).length > 0);
  const readmeLines = (await unzipBuffer(bundle.zipPath, "README.txt"))
    .toString("utf8")
    .trimEnd()
    .split("\n");
  assert.equal(readmeLines.length, 9);
});
