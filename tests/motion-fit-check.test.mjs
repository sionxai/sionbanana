import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import { analyzeFrame } from "@/lib/motion/engine";
import {
  classifyCellFit,
  computeCellPlacement,
  computeCellScale,
  inspectCellFit
} from "@/lib/motion/fit-check";
import { fitToCell } from "@/lib/motion/storage";

async function solidPng(width, height, left, top, rectWidth, rectHeight) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = top; y < top + rectHeight; y += 1) {
    for (let x = left; x < left + rectWidth; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 30;
      data[offset + 1] = 90;
      data[offset + 2] = 180;
      data[offset + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

const cell = (width = 20, height = 20, trimHeight = 10, pivot = { x: 10, y: 14 }) => ({
  width,
  height,
  trim: { x: 0, y: 0, w: 10, h: trimHeight },
  pivot
});

async function opaqueBounds(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset + 3] <= 16) continue;
    const pixel = offset / info.channels;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

test("inspectCellFit blocks opaque content that overflows a cell horizontally", async () => {
  const candidate = await solidPng(40, 10, 0, 0, 40, 10);
  const analysis = await analyzeFrame(candidate);
  const report = await inspectCellFit(candidate, cell(20, 20, 10, { x: 10, y: 9 }), analysis);

  assert.ok(report.lostPixels > 0);
  assert.ok(report.lostByEdge.right > 0);
  assert.deepEqual(classifyCellFit(report), { verdict: "blocked", reasons: ["content-loss"] });
});

test("inspectCellFit marks lossless boundary contact for review", async () => {
  const candidate = await solidPng(20, 10, 0, 0, 20, 10);
  const analysis = await analyzeFrame(candidate);
  const report = await inspectCellFit(candidate, cell(20, 20, 10, { x: 10, y: 9 }), analysis);

  assert.equal(report.lostPixels, 0);
  assert.notEqual(report.touchesEdge.length, 0);
  assert.deepEqual(classifyCellFit(report), { verdict: "review", reasons: ["boundary-touch"] });
});

test("inspectCellFit accepts content with space on every side", async () => {
  const candidate = await solidPng(10, 10, 0, 0, 10, 10);
  const analysis = await analyzeFrame(candidate);
  const report = await inspectCellFit(candidate, cell(), analysis);

  assert.deepEqual(report.touchesEdge, []);
  assert.deepEqual(classifyCellFit(report), { verdict: "ok" });
});

test("inspectCellFit reports an empty source without throwing", async () => {
  const candidate = await solidPng(20, 20, 0, 0, 0, 0);
  const analysis = await analyzeFrame(candidate);
  const report = await inspectCellFit(candidate, cell(), analysis);

  assert.equal(report.sourceEmpty, true);
  // 빈 후보라도 셀 크기는 실제 값을 보고해야 한다 (0,0은 보고 오류였다).
  assert.deepEqual(report.cellSize, { width: 20, height: 20 });
  assert.deepEqual(classifyCellFit(report), { verdict: "blocked", reasons: ["empty-source"] });
});

test("maxLostPixels permits a bounded loss before boundary classification", async () => {
  const candidate = await solidPng(40, 10, 0, 0, 40, 10);
  const analysis = await analyzeFrame(candidate);
  const report = await inspectCellFit(candidate, cell(20, 20, 10, { x: 10, y: 9 }), analysis);
  const verdict = classifyCellFit(report, { maxLostPixels: report.lostPixels });

  assert.notEqual(verdict.verdict, "blocked");
});

test("inspectCellFit counts a lost corner once overall and once for each crossed edge", async () => {
  const candidate = await solidPng(40, 40, 0, 0, 40, 40);
  const analysis = await analyzeFrame(candidate);
  const report = await inspectCellFit(candidate, cell(20, 20, 40, { x: 10, y: 20 }), analysis);

  const edgeTotal = Object.values(report.lostByEdge).reduce((sum, count) => sum + count, 0);
  assert.ok(report.lostPixels > 0);
  assert.ok(report.lostByEdge.left > 0);
  assert.ok(report.lostByEdge.right > 0);
  assert.ok(report.lostByEdge.top > 0);
  assert.ok(report.lostByEdge.bottom > 0);
  assert.ok(edgeTotal > report.lostPixels);
});

test("placement arithmetic predicts fitToCell's opaque destination rectangle", async () => {
  const candidate = await solidPng(10, 10, 0, 0, 10, 10);
  const spec = cell();
  const analysis = await analyzeFrame(candidate);
  const scale = computeCellScale(spec, analysis);
  const placement = computeCellPlacement(spec, analysis, { width: 10, height: 10 });
  const fitted = await fitToCell(candidate, spec, analysis);
  const bounds = await opaqueBounds(fitted);

  assert.equal(scale, 1);
  assert.deepEqual(bounds, {
    minX: placement.destinationLeft,
    minY: placement.destinationTop,
    maxX: placement.destinationLeft + placement.copyWidth - 1,
    maxY: placement.destinationTop + placement.copyHeight - 1
  });
});

test("computeCellScale clamps height-based scaling", () => {
  assert.equal(computeCellScale(cell(20, 20, 100), { trim: { x: 0, y: 0, w: 10, h: 10 }, pivot: { x: 0, y: 0 }, centroid: { x: 0 } }), 4);
  assert.equal(computeCellScale(cell(20, 20, 1), { trim: { x: 0, y: 0, w: 10, h: 10 }, pivot: { x: 0, y: 0 }, centroid: { x: 0 } }), 0.25);
});
