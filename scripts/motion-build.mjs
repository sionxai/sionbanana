#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import {
  analyzeFrame,
  applyMatte,
  computeGrid,
  detectFrameRects,
  normalizeFrames,
  packSheet,
  sliceFrames
} from "../lib/motion/engine.ts";
import {
  gridSpecSchema,
  matteSpecSchema,
  parseMotionProject
} from "../lib/motion/types.ts";

function readArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    if (!(key in options)) options[key] = value;
    else throw new Error(`Duplicate option: --${key}`);
    index += 1;
  }
  return options;
}

function parseInteger(value, optionName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${optionName} must be an integer.`);
  }
  return parsed;
}

function parseFlipRows(value, rowCount) {
  if (value === undefined) return new Set();
  const rows = new Set();
  for (const part of value.split(",")) {
    const row = parseInteger(part.trim(), "flip-rows");
    if (row < 1 || row > rowCount) {
      throw new Error(`--flip-rows entries must be between 1 and ${rowCount}.`);
    }
    rows.add(row);
  }
  return rows;
}

function makeDebugOverlay(width, height, packedRects, frames) {
  const lines = [];
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

async function main() {
  const args = readArgs(process.argv.slice(2));
  for (const required of ["input", "cols", "rows"]) {
    if (!args[required]) throw new Error(`--${required} is required.`);
  }

  const inputPath = path.resolve(args.input);
  const outDir = path.resolve(args.out ?? "motion-out");
  const requestedGrid = gridSpecSchema.parse({
    cols: parseInteger(args.cols, "cols"),
    rows: parseInteger(args.rows, "rows")
  });
  const sliceMode = args.slice ?? "auto";
  if (sliceMode !== "auto" && sliceMode !== "grid") {
    throw new Error("--slice must be auto or grid.");
  }
  const normalizeScale = args.scale ?? "area";
  if (normalizeScale !== "none" && normalizeScale !== "height" && normalizeScale !== "area") {
    throw new Error("--scale must be none, height, or area.");
  }
  const mode = args.matte ?? "edgeFlood";
  const matte = matteSpecSchema.parse({
    mode,
    ...(args.key ? { keyColor: args.key } : mode === "keyColor" ? { keyColor: "#FFFFFF" } : {}),
    ...(args.tolerance ? { tolerance: parseInteger(args.tolerance, "tolerance") } : {})
  });
  const sheetBuf = await readFile(inputPath);
  const metadata = await sharp(sheetBuf).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to determine input image dimensions.");
  }

  let grid = requestedGrid;
  let sliceConfidence = 1;
  let sourceRects;
  let sliced;
  if (sliceMode === "auto") {
    const mattedSheet = await applyMatte(sheetBuf, matte);
    const decoded = await sharp(mattedSheet)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const detected = detectFrameRects(
      decoded.data,
      { width: decoded.info.width, height: decoded.info.height },
      { expectedCols: requestedGrid.cols, expectedRows: requestedGrid.rows }
    );
    if (detected.cols !== requestedGrid.cols || detected.rows !== requestedGrid.rows) {
      process.stderr.write(
        `Warning: detected ${detected.cols}x${detected.rows}, requested ${requestedGrid.cols}x${requestedGrid.rows}.\n`
      );
    }
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
    sliced = await sliceFrames(sheetBuf, sourceRects);
  }
  const flipRows = parseFlipRows(args["flip-rows"], grid.rows);
  const prepared = await Promise.all(
    sliced.map(async (buf, index) => {
      const row = Math.floor(index / grid.cols) + 1;
      const oriented = flipRows.has(row) ? await sharp(buf).flop().png().toBuffer() : buf;
      const matted = sliceMode === "auto" ? oriented : await applyMatte(oriented, matte);
      const analysis = await analyzeFrame(matted);
      return { buf: matted, ...analysis };
    })
  );
  const normalized = await normalizeFrames(prepared, { normalizeScale });
  const packed = await packSheet(normalized.frames, { cols: grid.cols });
  const packedMetadata = await sharp(packed.buf).metadata();
  if (!packedMetadata.width || !packedMetadata.height) {
    throw new Error("Unable to determine packed-sheet dimensions.");
  }

  const basename = path.basename(inputPath, path.extname(inputPath));
  const project = parseMotionProject({
    id: `${basename}-motion`,
    name: basename,
    createdAtIso: new Date().toISOString(),
    sourceImage: {
      path: args.input,
      width: metadata.width,
      height: metadata.height
    },
    sliceMode,
    sliceConfidence,
    normalizeScale,
    grid,
    canvas: normalized.canvas,
    matte,
    frames: normalized.frames.map((frame, index) => ({
      index,
      source: sourceRects[index],
      trim: frame.trim,
      pivot: frame.pivot,
      appliedScale: frame.appliedScale,
      flipX: flipRows.has(Math.floor(index / grid.cols) + 1),
      excluded: false,
      durationMs: null
    })),
    animations: [
      {
        name: basename,
        frameIndices: normalized.frames.map((_, index) => index),
        fps: 12,
        loop: "loop"
      }
    ]
  });
  const overlay = makeDebugOverlay(
    packedMetadata.width,
    packedMetadata.height,
    packed.rects,
    normalized.frames
  );
  const debugContact = await sharp(packed.buf).composite([{ input: overlay, left: 0, top: 0 }]).png().toBuffer();

  const framesDir = path.join(outDir, "frames");
  await mkdir(framesDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outDir, "sheet.png"), packed.buf),
    writeFile(path.join(outDir, "animation.json"), `${JSON.stringify(project, null, 2)}\n`),
    writeFile(path.join(outDir, "debug-contact.png"), debugContact),
    ...normalized.frames.map((frame, index) =>
      writeFile(path.join(framesDir, `f${String(index + 1).padStart(2, "0")}.png`), frame.buf)
    )
  ]);

  process.stdout.write(
    `Built ${normalized.frames.length} frames at ${normalized.canvas.w}x${normalized.canvas.h} in ${outDir}\n`
  );
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
