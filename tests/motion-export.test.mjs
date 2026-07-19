import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import sharp from "sharp";

import { buildExportBundle, sanitizeExportFilename } from "@/lib/motion/export";
import { createProject, projectDir, rebuildProject } from "@/lib/motion/storage";

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

async function createFixture(t, name = "Export fixture") {
  await useTempDataDir(t);
  return createProject({
    name,
    sheetBuffer: await asymmetricSheet(),
    sliceMode: "grid",
    grid: { cols: 3, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: { mode: "none", tolerance: 45, softness: 2, despill: false }
  });
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

async function unzipJson(zipPath) {
  return JSON.parse((await unzipBuffer(zipPath, "animation.json")).toString("utf8"));
}

async function unzipEntries(zipPath) {
  const { stdout } = await execFileAsync("/usr/bin/unzip", ["-Z1", zipPath]);
  return stdout.trim().split("\n");
}

test("animation.json uses the export schema and valid remapped frame indices", async t => {
  let project = await createFixture(t, "Schema animation");
  project = await rebuildProject(project.id, {
    animations: [
      { name: "walk", frameIndices: [0, 1, 2], fps: 8, loop: "loop" }
    ]
  });
  const bundle = await buildExportBundle(project, { includeGif: false });
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
  const bundle = await buildExportBundle(project, { includeGif: false });
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
  const bundle = await buildExportBundle(project, { includeGif: false });
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

test("README collapses animation-name whitespace and stays at eight lines", async t => {
  const initial = await createFixture(t, "README line count");
  const project = await rebuildProject(initial.id, {
    animations: [
      { name: "walk\r\n   cycle\tfast", frameIndices: [0, 1, 2], fps: 9, loop: "once" }
    ]
  });
  const bundle = await buildExportBundle(project, { includeGif: false });
  t.after(() => bundle.cleanup());

  const readme = (await unzipBuffer(bundle.zipPath, "README.txt")).toString("utf8");
  const lines = readme.trimEnd().split("\n");
  assert.equal(lines.length, 8);
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
  assert.equal(readmeLines.length, 8);
});
