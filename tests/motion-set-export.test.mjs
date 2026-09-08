import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

import { buildSetExportBundle } from "@/lib/motion/set-export";
import { createSet, updateSet } from "@/lib/motion/set-storage";
import { createProject, projectDir, setReviewApproval } from "@/lib/motion/storage";

const execFileAsync = promisify(execFile);
let routeImportHooksRegistered = false;

async function useTempDataDir(t) {
  const previous = process.env.SIONBANANA_DATA_DIR;
  const directory = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-motion-set-export-"));
  process.env.SIONBANANA_DATA_DIR = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.SIONBANANA_DATA_DIR;
    else process.env.SIONBANANA_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  });
}

async function loadSetExportRoute() {
  if (!routeImportHooksRegistered) {
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === "next/server") {
          return nextResolve(pathToFileURL(path.resolve("node_modules/next/server.js")).href, context);
        }
        if (
          (specifier.startsWith("./") || specifier.startsWith("../")) &&
          context.parentURL?.startsWith("file:")
        ) {
          const absolutePath = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
          if (!path.extname(absolutePath) && existsSync(`${absolutePath}.ts`)) {
            return nextResolve(pathToFileURL(`${absolutePath}.ts`).href, context);
          }
        }
        return nextResolve(specifier, context);
      }
    });
    routeImportHooksRegistered = true;
  }
  return import("../app/api/motion/sets/[id]/export-file/route.ts");
}

async function solidFrame(width, height, color, pixel) {
  const pixels = Buffer.alloc(width * height * 4);
  const offset = (pixel.y * width + pixel.x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = 255;
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function seedProject({ name, canvas, frames, animations, frameImages }) {
  const sheetBuffer = await solidFrame(canvas.w, canvas.h, [1, 1, 1], { x: 0, y: 0 });
  const created = await createProject({
    name,
    sheetBuffer,
    sliceMode: "grid",
    normalizeScale: "none",
    normalizePivotX: "foot",
    normalizePivotY: "preserve",
    grid: { cols: 1, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: { mode: "none", tolerance: 45, softness: 2, despill: false }
  });
  const project = { ...created, canvas, frames, animations };
  const framesDirectory = path.join(projectDir(created.id), "derived", "frames");
  await fs.writeFile(path.join(projectDir(created.id), "project.json"), `${JSON.stringify(project, null, 2)}\n`);
  await Promise.all(
    frameImages.map((image, index) =>
      fs.writeFile(path.join(framesDirectory, `f${String(index + 1).padStart(2, "0")}.png`), image)
    )
  );
  // 이 픽스처는 고정 격자라 SB WO-018 내보내기 게이트의 승인 대상이 된다.
  // 이 파일이 검증하는 것은 캔버스 정렬과 라우트 스트리밍이지 게이트가 아니므로,
  // 어서션을 낮추지 않고 실제 승인 경로를 한 번 거쳐 통과시킨다.
  const approved = await setReviewApproval(created.id, {
    reasons: ["layout-not-validated"],
    note: "fixture approval"
  });
  return { ...project, reviewApproval: approved.reviewApproval };
}

function frame(index, pivot, trim, excluded = false, durationMs = null) {
  return {
    index,
    source: { x: 0, y: 0, w: 1, h: 1 },
    trim: { x: 0, y: 0, w: 1, h: trim },
    pivot,
    appliedScale: 1,
    flipX: false,
    excluded,
    durationMs
  };
}

async function extractZip(zipPath, t) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-motion-set-unzip-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await execFileAsync("/usr/bin/unzip", ["-o", zipPath, "-d", directory], {
    maxBuffer: 4 * 1024 * 1024
  });
  return directory;
}

async function rgbaAt(buffer, x, y) {
  const decoded = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * decoded.info.width + x) * 4;
  return [...decoded.data.subarray(offset, offset + 4)];
}

async function readyFixture(t) {
  await useTempDataDir(t);
  const walk = await seedProject({
    name: "Walk source",
    canvas: { w: 4, h: 6 },
    frames: [
      frame(0, { x: 1, y: 4 }, 5, false, 80),
      frame(1, { x: 1, y: 3 }, 2, true, 90),
      frame(2, { x: 1, y: 6 }, 3, false, 100)
    ],
    animations: [{ name: "walk-source", frameIndices: [0, 1, 2], fps: 9, loop: "pingpong" }],
    frameImages: [
      await solidFrame(4, 6, [240, 20, 30], { x: 0, y: 1 }),
      await solidFrame(4, 6, [20, 20, 20], { x: 0, y: 2 }),
      await solidFrame(4, 6, [20, 200, 80], { x: 0, y: 3 })
    ]
  });
  const jump = await seedProject({
    name: "Jump source",
    canvas: { w: 6, h: 8 },
    frames: [
      frame(0, { x: 3, y: 5 }, 7, false, 120),
      frame(1, { x: 3, y: 7 }, 5, false, 140)
    ],
    animations: [{ name: "jump-source", frameIndices: [0, 1], fps: 7, loop: "once" }],
    frameImages: [
      await solidFrame(6, 8, [20, 40, 220], { x: 0, y: 0 }),
      await solidFrame(6, 8, [140, 20, 220], { x: 1, y: 1 })
    ]
  });
  const initial = await createSet({
    name: "Banana action set",
    base: { description: "A banana hero" },
    common: { cols: 2, rows: 2, fps: 12 },
    members: [{ action: "walk" }, { action: "jump" }]
  });
  const set = await updateSet(initial.id, current => ({
    ...current,
    status: "ready",
    members: current.members.map(member => ({
      ...member,
      status: "ready",
      projectId: member.action === "walk" ? walk.id : jump.id,
      reason: null,
      finishedAtIso: new Date().toISOString()
    }))
  }));
  return { set, walk, jump };
}

test("buildSetExportBundle aligns ready members onto one canvas and omits excluded frames", async t => {
  const { set, walk, jump } = await readyFixture(t);
  const bundle = await buildSetExportBundle(set, { includeGif: false });
  t.after(() => bundle.cleanup());
  const extracted = await extractZip(bundle.zipPath, t);

  const animation = JSON.parse(await fs.readFile(path.join(extracted, "animation.json"), "utf8"));
  assert.equal(animation.frameWidth, 6);
  assert.equal(animation.frameHeight, 8);
  assert.deepEqual(
    animation.frames.map(frame => [frame.index, frame.x, frame.y, frame.pivot, frame.action, frame.durationMs]),
    [
      [0, 0, 0, { x: 3, y: 6 }, "walk", 80],
      [1, 6, 0, { x: 3, y: 6 }, "walk", 100],
      [2, 0, 8, { x: 3, y: 6 }, "jump", 120],
      [3, 6, 8, { x: 3, y: 6 }, "jump", 140]
    ]
  );
  assert.deepEqual(animation.animations, [
    { name: "walk", label: "이동", frames: [0, 1], fps: 9, loop: "pingpong" },
    { name: "jump", label: "점프", frames: [2, 3], fps: 7, loop: "once" }
  ]);
  assert.deepEqual(animation.meta.sourceProjectIds, { walk: walk.id, jump: jump.id });
  assert.deepEqual(animation.meta.sizeReport, {
    walk: { frameHeightMedian: 4 },
    jump: { frameHeightMedian: 6 }
  });

  const walkFrames = path.join(extracted, "frames", "walk");
  await fs.access(path.join(walkFrames, "f01.png"));
  await fs.access(path.join(walkFrames, "f02.png"));
  await assert.rejects(fs.access(path.join(walkFrames, "f03.png")), { code: "ENOENT" });
  assert.deepEqual(await rgbaAt(await fs.readFile(path.join(walkFrames, "f01.png")), 2, 2), [240, 20, 30, 255]);
  assert.deepEqual(await rgbaAt(await fs.readFile(path.join(walkFrames, "f02.png")), 2, 4), [20, 200, 80, 255]);

  const sheet = await fs.readFile(path.join(extracted, "sprite-sheet.png"));
  const metadata = await sharp(sheet).metadata();
  assert.equal(metadata.width, 12);
  assert.equal(metadata.height, 16);
  assert.deepEqual(await rgbaAt(sheet, 2, 2), [240, 20, 30, 255]);
  assert.deepEqual(await rgbaAt(sheet, 8, 4), [20, 200, 80, 255]);
  assert.deepEqual(await rgbaAt(sheet, 0, 8), [20, 40, 220, 255]);
  assert.deepEqual(await rgbaAt(sheet, 5, 15), [0, 0, 0, 0]);
  const readme = await fs.readFile(path.join(extracted, "README.txt"), "utf8");
  assert.match(readme, /Scale normalization is not applied/);
});

test("buildSetExportBundle rejects zero ready members and all-excluded ready members", async t => {
  await useTempDataDir(t);
  const empty = await createSet({
    name: "Empty set",
    base: { description: "A banana hero" },
    common: { cols: 1, rows: 1 },
    members: [{ action: "idle" }]
  });
  await assert.rejects(
    buildSetExportBundle(empty, { includeGif: false }),
    /Motion set export requires at least one ready member\./
  );

  const project = await seedProject({
    name: "Excluded source",
    canvas: { w: 2, h: 2 },
    frames: [frame(0, { x: 1, y: 1 }, 1, true)],
    animations: [{ name: "idle", frameIndices: [0], fps: 12, loop: "loop" }],
    frameImages: [await solidFrame(2, 2, [1, 2, 3], { x: 0, y: 0 })]
  });
  const ready = await updateSet(empty.id, current => ({
    ...current,
    members: current.members.map(member => ({
      ...member,
      status: "ready",
      projectId: project.id,
      finishedAtIso: new Date().toISOString()
    }))
  }));
  await assert.rejects(
    buildSetExportBundle(ready, { includeGif: false }),
    /Motion set export requires at least one non-excluded frame for idle\./
  );
});

test("motion set export route streams ZIPs and returns 409 for sets without ready members", async t => {
  const { set } = await readyFixture(t);
  const { GET } = await loadSetExportRoute();
  const { NextRequest } = await import("next/server");
  const exported = await GET(
    new NextRequest(`http://localhost/api/motion/sets/${set.id}/export-file?gif=0`),
    { params: { id: set.id } }
  );
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get("Content-Type"), "application/zip");
  assert.match(exported.headers.get("Content-Disposition") ?? "", /-motion-set\.zip"$/);
  assert.ok((await exported.arrayBuffer()).byteLength > 0);

  const empty = await createSet({
    name: "No ready set",
    base: { description: "A banana hero" },
    common: { cols: 1, rows: 1 },
    members: [{ action: "idle" }]
  });
  const unavailable = await GET(
    new NextRequest(`http://localhost/api/motion/sets/${empty.id}/export-file?gif=0`),
    { params: { id: empty.id } }
  );
  assert.equal(unavailable.status, 409);
  assert.deepEqual(await unavailable.json(), {
    ok: false,
    reason: "Motion set export requires at least one ready member."
  });

  for (const [query, reason] of [
    ["gif=2", "gif must be either 0 or 1."],
    ["fps=0", "fps must be a positive integer."],
    ["scale=0", "scale must be greater than zero."],
    ["scale=not-a-number", "scale must be a positive number."]
  ]) {
    const invalid = await GET(
      new NextRequest(`http://localhost/api/motion/sets/${set.id}/export-file?${query}`),
      { params: { id: set.id } }
    );
    assert.equal(invalid.status, 400, query);
    assert.deepEqual(await invalid.json(), { ok: false, reason });
  }

  const missing = await GET(
    new NextRequest("http://localhost/api/motion/sets/missing-set/export-file?gif=0"),
    { params: { id: "missing-set" } }
  );
  assert.equal(missing.status, 404);
  const missingBody = await missing.json();
  assert.equal(missingBody.ok, false);
  assert.match(missingBody.reason, /Motion set missing-set was not found\./);
});
