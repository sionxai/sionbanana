import assert from "node:assert/strict";
import { existsSync, promises as fs } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

import {
  analyzeFrame,
  applyMatte,
  computeGrid,
  detectFrameRects,
  normalizeFrames
} from "@/lib/motion/engine";
import { createProject, rebuildProject } from "@/lib/motion/storage";
import { matteSpecSchema, parseMotionProject } from "@/lib/motion/types";

let routeImportHooksRegistered = false;

async function loadMotionRouteHandlers() {
  if (!routeImportHooksRegistered) {
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === "next/server") {
          return nextResolve(
            pathToFileURL(path.resolve("node_modules/next/server.js")).href,
            context
          );
        }
        if (
          (specifier.startsWith("./") || specifier.startsWith("../")) &&
          context.parentURL?.startsWith("file:")
        ) {
          const absolutePath = path.resolve(
            path.dirname(fileURLToPath(context.parentURL)),
            specifier
          );
          if (!path.extname(absolutePath) && existsSync(`${absolutePath}.ts`)) {
            return nextResolve(pathToFileURL(`${absolutePath}.ts`).href, context);
          }
        }
        return nextResolve(specifier, context);
      }
    });
    routeImportHooksRegistered = true;
  }
  const [projectsRoute, projectRoute] = await Promise.all([
    import("../app/api/motion/projects/route.ts"),
    import("../app/api/motion/projects/[id]/route.ts")
  ]);
  return { POST: projectsRoute.POST, PATCH: projectRoute.PATCH };
}

async function useTempMotionData(t, prefix) {
  const previous = process.env.SIONBANANA_DATA_DIR;
  const directory = await fs.mkdtemp(path.join(tmpdir(), prefix));
  process.env.SIONBANANA_DATA_DIR = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.SIONBANANA_DATA_DIR;
    else process.env.SIONBANANA_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  });
}

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

async function twoFrameSheet() {
  return rgbaPng(60, 30, (data, set) => {
    for (let y = 0; y < 30; y += 1) {
      for (let x = 0; x < 60; x += 1) set(x, y, 255, 0, 255);
    }
    for (let y = 6; y < 25; y += 1) {
      for (let x = 4; x < 22; x += 1) set(x, y, 20, 80, 180);
      for (let x = 37; x < 56; x += 1) set(x, y, 20, 80, 180);
    }
  });
}

async function matteToRaw(input) {
  const matted = await applyMatte(input, {
    mode: "keyColor",
    keyColor: "#FF00FF",
    tolerance: 0,
    softness: 0,
    despill: false
  });
  const decoded = await sharp(matted).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: decoded.data, width: decoded.info.width, height: decoded.info.height };
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

test("detectFrameRects contains eight unequal frames that protrude beyond nominal cells", async () => {
  const shapes = [
    { x: 4, y: 10, w: 64, h: 42 },
    { x: 75, y: 4, w: 35, h: 56 },
    { x: 125, y: 15, w: 61, h: 40 },
    { x: 194, y: 7, w: 39, h: 49 },
    { x: 2, y: 81, w: 55, h: 45 },
    { x: 66, y: 75, w: 63, h: 50 },
    { x: 137, y: 85, w: 52, h: 40 },
    { x: 197, y: 73, w: 38, h: 57 }
  ];
  const input = await rgbaPng(240, 140, (data, set) => {
    for (let y = 0; y < 140; y += 1) {
      for (let x = 0; x < 240; x += 1) set(x, y, 255, 0, 255);
    }
    for (const shape of shapes) {
      for (let y = shape.y; y < shape.y + shape.h; y += 1) {
        for (let x = shape.x; x < shape.x + shape.w; x += 1) set(x, y, 30, 90, 180);
      }
    }
  });
  const raw = await matteToRaw(input);
  const detected = detectFrameRects(raw.data, raw, { expectedCols: 4, expectedRows: 2 });

  assert.equal(detected.rects.length, 8);
  assert.deepEqual([detected.cols, detected.rows, detected.confidence], [4, 2, 1]);
  for (let index = 0; index < shapes.length; index += 1) {
    const shape = shapes[index];
    const rect = detected.rects[index];
    assert.ok(rect.x <= shape.x && rect.y <= shape.y, `rect ${index} misses the top-left edge`);
    assert.ok(
      rect.x + rect.w >= shape.x + shape.w && rect.y + rect.h >= shape.y + shape.h,
      `rect ${index} misses the bottom-right edge`
    );
  }
});

test("detectFrameRects handles irregular horizontal gaps", async () => {
  const input = await rgbaPng(120, 40, (data, set) => {
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 120; x += 1) set(x, y, 255, 0, 255);
    }
    for (const [start, end] of [[3, 13], [20, 35], [51, 61], [84, 99]]) {
      for (let y = 8; y < 30; y += 1) {
        for (let x = start; x < end; x += 1) set(x, y, 20, 120, 210);
      }
    }
  });
  const raw = await matteToRaw(input);
  const detected = detectFrameRects(raw.data, raw, { expectedCols: 4, expectedRows: 1 });

  assert.equal(detected.rects.length, 4);
  assert.deepEqual([detected.cols, detected.rows], [4, 1]);
});

test("detectFrameRects removes components below minAreaRatio", async () => {
  const input = await rgbaPng(100, 50, (data, set) => {
    for (let y = 0; y < 50; y += 1) {
      for (let x = 0; x < 100; x += 1) set(x, y, 255, 0, 255);
    }
    for (let y = 10; y < 25; y += 1) {
      for (let x = 5; x < 20; x += 1) set(x, y, 40, 80, 200);
      for (let x = 70; x < 88; x += 1) set(x, y, 40, 80, 200);
    }
    set(50, 45, 40, 80, 200);
  });
  const raw = await matteToRaw(input);
  const detected = detectFrameRects(raw.data, raw, {
    expectedCols: 2,
    expectedRows: 1,
    minAreaRatio: 0.002
  });

  assert.equal(detected.rects.length, 2);
});

test("detectFrameRects reports low confidence when expected grid does not match", async () => {
  const data = Buffer.alloc(80 * 30 * 4);
  for (let y = 5; y < 24; y += 1) {
    for (const [start, end] of [[4, 24], [50, 73]]) {
      for (let x = start; x < end; x += 1) data[(y * 80 + x) * 4 + 3] = 255;
    }
  }

  const detected = detectFrameRects(data, { width: 80, height: 30 }, {
    expectedCols: 4,
    expectedRows: 2
  });
  assert.equal(detected.confidence, 0.3);
});

test("parseMotionProject treats projects without slicing fields as legacy grid mode", () => {
  const input = {
    id: "legacy-motion",
    name: "Legacy",
    createdAtIso: "2026-07-19T00:00:00.000Z",
    sourceImage: { path: "raw.png", width: 100, height: 50 },
    grid: { cols: 2, rows: 1 },
    canvas: { w: 20, h: 20 },
    matte: { mode: "none" },
    frames: [],
    animations: []
  };
  const project = parseMotionProject(input);

  assert.equal(project.sliceMode, "grid");
  assert.equal(project.sliceConfidence, 1);
  assert.equal(parseMotionProject({ ...input, sliceMode: undefined }).sliceMode, "grid");
  assert.equal(
    parseMotionProject({ ...input, sliceConfidence: undefined }).sliceConfidence,
    1
  );
  assert.throws(() => parseMotionProject({ ...input, sliceMode: null }));
  assert.throws(() => parseMotionProject({ ...input, sliceConfidence: null }));
});

test("new projects default to auto slicing and rebuild patches preserve the mode", async t => {
  await useTempMotionData(t, "sionbanana-motion-slice-default-");
  const sheetBuffer = await twoFrameSheet();
  const project = await createProject({
    name: "Auto default",
    sheetBuffer,
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: {
      mode: "keyColor",
      keyColor: "#FF00FF",
      tolerance: 0,
      softness: 0,
      despill: false
    }
  });
  assert.equal(project.sliceMode, "auto");

  const rebuilt = await rebuildProject(project.id, {
    matte: { ...project.matte, tolerance: 1 }
  });
  assert.equal(rebuilt.sliceMode, "auto");
});

test("motion projects POST defaults an omitted sliceMode to auto", async t => {
  await useTempMotionData(t, "sionbanana-motion-post-default-");
  const { POST } = await loadMotionRouteHandlers();
  const sheetBuffer = await twoFrameSheet();
  const response = await POST(
    new Request("http://localhost/api/motion/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "POST auto default",
        grid: { cols: 2, rows: 1 },
        matte: {
          mode: "keyColor",
          keyColor: "#FF00FF",
          tolerance: 0,
          softness: 0,
          despill: false
        },
        source: {
          type: "upload",
          dataUrl: `data:image/png;base64,${sheetBuffer.toString("base64")}`
        }
      })
    })
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.equal(body.project.sliceMode, "auto");
});

test("motion project PATCH preserves grid sliceMode when the body omits sliceMode", async t => {
  await useTempMotionData(t, "sionbanana-motion-patch-preserve-");
  const project = await createProject({
    name: "PATCH grid preserve",
    sheetBuffer: await twoFrameSheet(),
    sliceMode: "grid",
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: {
      mode: "keyColor",
      keyColor: "#FF00FF",
      tolerance: 0,
      softness: 0,
      despill: false
    }
  });
  const { PATCH } = await loadMotionRouteHandlers();
  const response = await PATCH(
    new Request(`http://localhost/api/motion/projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matte: { ...project.matte, tolerance: 1 } })
    }),
    { params: { id: project.id } }
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.project.sliceMode, "grid");
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

test("applyMatte magenta despill preserves peach skin pixels in the soft alpha band", async () => {
  const input = await rgbaPng(5, 5, (data, set) => {
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) set(x, y, 255, 0, 255);
    }
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) set(x, y, 240, 190, 170);
    }
  });

  const output = await applyMatte(input, {
    mode: "keyColor",
    keyColor: "#FF00FF",
    tolerance: 45,
    softness: 10,
    despill: true
  });
  const { data } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const center = (2 * 5 + 2) * 4;
  const actual = [data[center], data[center + 1], data[center + 2]];
  const expected = [240, 190, 170];

  assert.ok(data[center + 3] > 0 && data[center + 3] < 255);
  assert.ok(actual[1] <= actual[0], `green ${actual[1]} must not exceed red ${actual[0]}`);
  assert.ok(
    actual.every((channel, index) => Math.abs(channel - expected[index]) <= 2),
    `skin channel drift exceeded 2: ${actual.join(",")}`
  );
});

test("applyMatte despill leaves fully opaque interior RGB byte-identical", async () => {
  const input = await rgbaPng(3, 3, (data, set) => {
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) set(x, y, 255, 0, 255);
    }
    set(1, 1, 20, 80, 180);
  });
  const matte = {
    mode: "keyColor",
    keyColor: "#FF00FF",
    tolerance: 45,
    softness: 10
  };

  const [withDespill, withoutDespill] = await Promise.all([
    applyMatte(input, { ...matte, despill: true }),
    applyMatte(input, { ...matte, despill: false })
  ]);
  const [withData, withoutData] = await Promise.all([
    sharp(withDespill).ensureAlpha().raw().toBuffer(),
    sharp(withoutDespill).ensureAlpha().raw().toBuffer()
  ]);
  const center = (1 * 3 + 1) * 4;

  assert.equal(withData[center + 3], 255);
  assert.deepEqual(
    [...withData.subarray(center, center + 3)],
    [...withoutData.subarray(center, center + 3)]
  );
});

test("applyMatte derives green despill from the key hue without changing red or blue", async () => {
  const input = await rgbaPng(1, 1, (data, set) => set(0, 0, 60, 220, 80));
  const output = await applyMatte(input, {
    mode: "keyColor",
    keyColor: "#00FF00",
    tolerance: 20,
    softness: 10,
    despill: true
  });
  const data = await sharp(output).ensureAlpha().raw().toBuffer();

  assert.ok(data[3] > 0 && data[3] < 255);
  assert.equal(data[0], 60);
  assert.ok(data[1] >= 80 && data[1] < 220);
  assert.equal(data[2], 80);
});

test("matteSpecSchema defaults despill off and preserves explicit saved values", () => {
  assert.equal(matteSpecSchema.parse({ mode: "none" }).despill, false);
  assert.equal(matteSpecSchema.parse({ mode: "none", despill: true }).despill, true);
  assert.equal(matteSpecSchema.parse({ mode: "none", despill: false }).despill, false);
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
