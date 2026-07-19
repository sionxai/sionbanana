import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import {
  analyzeFrame,
  applyMatte,
  computeGrid,
  normalizeFrames
} from "@/lib/motion/engine";

function assertNoOverlap(rects) {
  for (let first = 0; first < rects.length; first += 1) {
    for (let second = first + 1; second < rects.length; second += 1) {
      const a = rects[first];
      const b = rects[second];
      const overlaps =
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      assert.equal(overlaps, false, `rectangles ${first} and ${second} overlap`);
    }
  }
}

async function rgbaPng(width, height, paint) {
  const data = Buffer.alloc(width * height * 4);
  paint(data, (x, y, red, green, blue, alpha = 255) => {
    const offset = (y * width + x) * 4;
    data[offset] = red;
    data[offset + 1] = green;
    data[offset + 2] = blue;
    data[offset + 3] = alpha;
  });
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("computeGrid distributes 1774x887 remainder pixels without gaps or overlap", () => {
  const rects = computeGrid(1774, 887, {
    cols: 4,
    rows: 2,
    gutter: 0,
    remainderPolicy: "distribute"
  });

  assert.equal(rects.length, 8);
  assert.deepEqual(rects.slice(0, 4).map(rect => rect.w), [444, 444, 443, 443]);
  assert.equal(rects.slice(0, 4).reduce((sum, rect) => sum + rect.w, 0), 1774);
  assert.equal(rects[0].h + rects[4].h, 887);
  assertNoOverlap(rects);
  assert.ok(rects.every(rect => rect.x + rect.w <= 1774 && rect.y + rect.h <= 887));
});

test("computeGrid crop uses equal cells and drops only right and bottom remainder", () => {
  const rects = computeGrid(1774, 887, {
    cols: 4,
    rows: 2,
    gutter: 0,
    remainderPolicy: "crop"
  });

  assert.ok(rects.every(rect => rect.w === 443 && rect.h === 443));
  assert.equal(Math.max(...rects.map(rect => rect.x + rect.w)), 1772);
  assert.equal(Math.max(...rects.map(rect => rect.y + rect.h)), 886);
  assertNoOverlap(rects);
});

test("computeGrid accounts for gutter only between cells and stays in bounds", () => {
  const rects = computeGrid(20, 11, {
    cols: 3,
    rows: 2,
    gutter: 2,
    remainderPolicy: "distribute"
  });

  assert.deepEqual(rects.slice(0, 3).map(rect => [rect.x, rect.w]), [
    [0, 6],
    [8, 5],
    [15, 5]
  ]);
  assert.equal(rects[3].y, 7);
  assert.equal(rects[0].y + rects[0].h + 2, rects[3].y);
  assertNoOverlap(rects);
  assert.ok(rects.every(rect => rect.x + rect.w <= 20 && rect.y + rect.h <= 11));
});

test("analyzeFrame bases pivot on the main silhouette instead of corner noise", async () => {
  const input = await rgbaPng(40, 40, (data, set) => {
    for (let y = 8; y <= 27; y += 1) {
      for (let x = 10; x <= 29; x += 1) set(x, y, 30, 40, 50);
    }
    set(39, 39, 30, 40, 50);
  });

  const analysis = await analyzeFrame(input);
  assert.deepEqual(analysis.trim, { x: 10, y: 8, w: 30, h: 32 });
  assert.equal(analysis.pivot.x, 20);
  assert.ok(analysis.pivot.y >= 26 && analysis.pivot.y <= 27);
});

test("applyMatte edgeFlood removes connected white background but preserves enclosed white", async () => {
  const input = await rgbaPng(12, 12, (data, set) => {
    for (let y = 0; y < 12; y += 1) {
      for (let x = 0; x < 12; x += 1) set(x, y, 255, 255, 255);
    }
    for (let y = 3; y <= 8; y += 1) {
      for (let x = 3; x <= 8; x += 1) set(x, y, 180, 20, 20);
    }
    for (let y = 5; y <= 6; y += 1) {
      for (let x = 5; x <= 6; x += 1) set(x, y, 255, 255, 255);
    }
  });

  const output = await applyMatte(input, {
    mode: "edgeFlood",
    keyColor: "#FFFFFF",
    tolerance: 0,
    softness: 0,
    despill: false
  });
  const { data } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * 12 + x) * 4 + 3];

  assert.equal(alphaAt(0, 0), 0);
  assert.equal(alphaAt(3, 3), 255);
  assert.equal(alphaAt(5, 5), 255);
});

test("normalizeFrames aligns three differently sized and positioned frames to one pivot", async () => {
  const inputs = await Promise.all([
    rgbaPng(22, 20, (data, set) => {
      for (let y = 4; y <= 15; y += 1) for (let x = 4; x <= 12; x += 1) set(x, y, 20, 80, 180);
    }),
    rgbaPng(28, 24, (data, set) => {
      for (let y = 2; y <= 19; y += 1) for (let x = 10; x <= 22; x += 1) set(x, y, 20, 80, 180);
    }),
    rgbaPng(18, 25, (data, set) => {
      for (let y = 8; y <= 21; y += 1) for (let x = 2; x <= 15; x += 1) set(x, y, 20, 80, 180);
    })
  ]);

  const normalized = await normalizeFrames(inputs);
  assert.equal(new Set(normalized.frames.map(frame => `${frame.pivot.x},${frame.pivot.y}`)).size, 1);
  for (const frame of normalized.frames) {
    const metadata = await sharp(frame.buf).metadata();
    assert.deepEqual([metadata.width, metadata.height], [normalized.canvas.w, normalized.canvas.h]);
    assert.ok(frame.trim.x >= 2 && frame.trim.y >= 2);
    assert.ok(frame.trim.x + frame.trim.w <= normalized.canvas.w - 2);
    assert.ok(frame.trim.y + frame.trim.h <= normalized.canvas.h - 2);
  }
});
