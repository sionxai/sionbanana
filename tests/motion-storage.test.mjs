import assert from "node:assert/strict";
import { existsSync, promises as fs } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { mock, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

import { buildSheetPrompt } from "@/lib/motion/prompt";
import {
  createProject,
  deleteProject,
  motionRoot,
  projectDir,
  readAssetFile,
  readProject,
  rebuildProject
} from "@/lib/motion/storage";
import { parseMotionProject } from "@/lib/motion/types";

let routeImportHooksRegistered = false;

async function loadMotionRouteHandlers() {
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
  return import("../app/api/motion/projects/route.ts");
}

async function useTempDataDir(t) {
  const previous = process.env.SIONBANANA_DATA_DIR;
  const directory = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-motion-storage-"));
  process.env.SIONBANANA_DATA_DIR = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.SIONBANANA_DATA_DIR;
    else process.env.SIONBANANA_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function testSheet() {
  const width = 12;
  const height = 6;
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 255;
    pixels[offset + 1] = 0;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = 255;
  }
  for (const x of [2, 3, 8, 9]) {
    for (let y = 2; y <= 4; y += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = 20;
      pixels[offset + 1] = 80;
      pixels[offset + 2] = 180;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function mirroredGammaSheet() {
  const width = 96;
  const height = 96;
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 255;
    pixels[offset + 1] = 0;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = 255;
  }
  const set = (x, y) => {
    const offset = (y * width + x) * 4;
    pixels[offset] = 20;
    pixels[offset + 1] = 80;
    pixels[offset + 2] = 180;
  };
  const drawGamma = (originX, originY, y0, flipped) => {
    const draw = (x, y) => set(originX + (flipped ? 47 - x : x), originY + y);
    for (let y = 8; y <= 40; y += 1) {
      for (let x = 10; x <= 14; x += 1) draw(x, y);
    }
    for (let y = y0; y <= y0 + 4; y += 1) {
      for (let x = 14; x <= 30; x += 1) draw(x, y);
    }
  };
  drawGamma(0, 0, 8, false);
  drawGamma(48, 0, 16, false);
  drawGamma(0, 48, 8, true);
  drawGamma(48, 48, 16, true);
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function repeatedGammaSheet() {
  const width = 96;
  const height = 96;
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 255;
    pixels[offset + 1] = 0;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = 255;
  }
  const set = (x, y) => {
    const offset = (y * width + x) * 4;
    pixels[offset] = 20;
    pixels[offset + 1] = 80;
    pixels[offset + 2] = 180;
  };
  const drawGamma = (originX, originY, y0) => {
    for (let y = 8; y <= 40; y += 1) {
      for (let x = 10; x <= 14; x += 1) set(originX + x, originY + y);
    }
    for (let y = y0; y <= y0 + 4; y += 1) {
      for (let x = 14; x <= 30; x += 1) set(originX + x, originY + y);
    }
  };
  drawGamma(0, 0, 8);
  drawGamma(48, 0, 16);
  drawGamma(0, 48, 8);
  drawGamma(48, 48, 16);
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function gammaMatte() {
  return {
    mode: "keyColor",
    keyColor: "#FF00FF",
    tolerance: 0,
    softness: 0,
    despill: false,
    choke: 0
  };
}

test("projectDir rejects traversal, absolute paths, and special characters", () => {
  assert.throws(() => projectDir("../escape"), /letters, numbers, and hyphens/);
  assert.throws(() => projectDir("/absolute"), /letters, numbers, and hyphens/);
  assert.throws(() => projectDir("bad_name"), /letters, numbers, and hyphens/);
});

test("readAssetFile allows derived sheet and rejects traversal", async t => {
  await useTempDataDir(t);
  const id = "asset-test";
  const derived = path.join(projectDir(id), "derived");
  await fs.mkdir(derived, { recursive: true });
  await fs.writeFile(path.join(derived, "sheet.png"), await testSheet());

  const allowed = await readAssetFile(id, "derived/sheet.png");
  assert.ok(allowed);
  assert.equal(allowed.mimeType, "image/png");
  allowed.stream.destroy();
  assert.equal(await readAssetFile(id, "../../.env"), null);
});

test("readAssetFile rejects symlinks at whitelisted asset paths", async t => {
  await useTempDataDir(t);
  const id = "linked-assets";
  const directory = projectDir(id);
  await fs.mkdir(path.join(directory, "derived"), { recursive: true });
  await fs.writeFile(path.join(directory, "project.json"), '{"secret":"must-not-be-served"}\n');
  await fs.symlink("project.json", path.join(directory, "raw.png"), "file");
  await fs.symlink("../project.json", path.join(directory, "derived", "sheet.png"), "file");

  assert.equal(await readAssetFile(id, "raw.png"), null);
  assert.equal(await readAssetFile(id, "derived/sheet.png"), null);
});

test("project directory symlinks cannot expose or delete external assets", async t => {
  await useTempDataDir(t);
  const external = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-motion-external-"));
  t.after(() => fs.rm(external, { recursive: true, force: true }));
  await fs.mkdir(path.join(external, "derived"), { recursive: true });
  const externalSheet = path.join(external, "derived", "sheet.png");
  await fs.writeFile(externalSheet, await testSheet());
  await fs.mkdir(motionRoot(), { recursive: true });
  const id = "linked-project";
  await fs.symlink(external, projectDir(id), "dir");

  assert.equal(await readAssetFile(id, "derived/sheet.png"), null);
  await assert.rejects(readProject(id), error => error?.status === 404);
  await assert.rejects(deleteProject(id), error => error?.status === 404);
  assert.equal((await fs.stat(externalSheet)).isFile(), true);
});

test("buildSheetPrompt includes chroma key, grid dimensions, and one direction", () => {
  const prompt = buildSheetPrompt({
    description: "a small fox running",
    cols: 4,
    rows: 2
  });
  assert.match(prompt, /#00FF00/);
  assert.doesNotMatch(prompt, /#FF00FF/);
  assert.match(prompt, /4 columns by 2 rows/);
  assert.match(prompt, /facing the same way as row 1/i);
  assert.match(prompt, /Do not mirror/i);
});

test("failed project.json rename preserves the previous project atomically", async t => {
  await useTempDataDir(t);
  const project = await createProject({
    name: "Atomic fox",
    sheetBuffer: await testSheet(),
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: {
      mode: "keyColor",
      keyColor: "#FF00FF",
      tolerance: 30,
      softness: 2,
      despill: true
    }
  });
  const jsonPath = path.join(await fs.realpath(projectDir(project.id)), "project.json");
  const before = await fs.readFile(jsonPath, "utf8");
  const originalRename = fs.rename.bind(fs);
  let observedTempRename = false;
  const renameMock = mock.method(fs, "rename", async (source, target) => {
    if (target === jsonPath) {
      observedTempRename = path.basename(String(source)).startsWith(".project-");
      throw Object.assign(new Error("injected project.json rename failure"), { code: "EIO" });
    }
    return originalRename(source, target);
  });

  try {
    await assert.rejects(
      rebuildProject(project.id, {
        matte: {
          mode: "keyColor",
          keyColor: "#FF00FF",
          tolerance: 20,
          softness: 1,
          despill: true
        }
      }),
      /injected project\.json rename failure/
    );
  } finally {
    renameMock.mock.restore();
  }

  assert.equal(observedTempRename, true);
  assert.equal(await fs.readFile(jsonPath, "utf8"), before);
  assert.equal(motionRoot(), path.join(process.env.SIONBANANA_DATA_DIR, "motion-assets"));
});

test("explicit frame patches must cover every grid index exactly once", async t => {
  await useTempDataDir(t);
  const project = await createProject({
    name: "Frame validation fox",
    sheetBuffer: await testSheet(),
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: {
      mode: "keyColor",
      keyColor: "#FF00FF",
      tolerance: 30,
      softness: 2,
      despill: true
    }
  });
  const [first, second] = project.frames;
  const invalidPatches = [
    [first],
    [first, { ...second, index: first.index }],
    [first, { ...second, index: 2 }]
  ];

  for (const frames of invalidPatches) {
    await assert.rejects(
      rebuildProject(project.id, { frames }),
      error => error?.status === 400
    );
  }
});

test("autoFlipRows corrects a mirrored grid row and records the detection", async t => {
  await useTempDataDir(t);
  const project = await createProject({
    name: "Mirrored gamma",
    sheetBuffer: await mirroredGammaSheet(),
    sliceMode: "grid",
    autoFlipRows: true,
    grid: { cols: 2, rows: 2, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  });

  assert.deepEqual(project.frames.map(frame => frame.flipX), [false, false, true, true]);
  assert.equal(project.mirrorDetection?.enabled, true);
  assert.equal(project.mirrorDetection?.rows[1].mirrored, true);

  const derived = await fs.readFile(path.join(projectDir(project.id), "derived", "frames", "f03.png"));
  const { data, info } = await sharp(derived).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const blueRows = Array.from({ length: info.height }, (_, y) => {
    const xs = [];
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset] === 20 && data[offset + 1] === 80 && data[offset + 2] === 180) xs.push(x);
    }
    return xs;
  }).filter(xs => xs.length > 0);
  const widestBlueRow = blueRows.reduce((widest, xs) => (xs.length > widest.length ? xs : widest));
  const stemBlueRow = blueRows.reduce((narrowest, xs) =>
    xs.length < narrowest.length ? xs : narrowest
  );
  const stemCenter = (stemBlueRow[0] + stemBlueRow.at(-1)) / 2;
  const leftExtension = stemCenter - widestBlueRow[0];
  const rightExtension = widestBlueRow.at(-1) - stemCenter;
  assert.ok(Math.max(...widestBlueRow) > info.width / 2);
  assert.ok(rightExtension > leftExtension, "the horizontal arm must extend right of the stem");
});

test("autoFlipRows is opt-in for direct storage creation", async t => {
  await useTempDataDir(t);
  const project = await createProject({
    name: "Uncorrected gamma",
    sheetBuffer: await mirroredGammaSheet(),
    sliceMode: "grid",
    grid: { cols: 2, rows: 2, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  });

  assert.deepEqual(project.frames.map(frame => frame.flipX), [false, false, false, false]);
  assert.equal(project.mirrorDetection, null);
});

test("rebuilds preserve prior auto flip controls and mirror detection", async t => {
  await useTempDataDir(t);
  const project = await createProject({
    name: "Preserved mirrored gamma",
    sheetBuffer: await mirroredGammaSheet(),
    sliceMode: "grid",
    autoFlipRows: true,
    grid: { cols: 2, rows: 2, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  });
  const rebuilt = await rebuildProject(project.id, {
    matte: { ...project.matte, tolerance: 1 }
  });

  assert.deepEqual(rebuilt.frames.map(frame => frame.flipX), project.frames.map(frame => frame.flipX));
  assert.deepEqual(rebuilt.mirrorDetection, project.mirrorDetection);
});

test("explicit frame controls override automatic flips while preserving the prior detection", async t => {
  await useTempDataDir(t);
  const project = await createProject({
    name: "Explicit gamma controls",
    sheetBuffer: await mirroredGammaSheet(),
    sliceMode: "grid",
    autoFlipRows: true,
    grid: { cols: 2, rows: 2, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  });
  const rebuilt = await rebuildProject(project.id, {
    frames: project.frames.map(frame => ({ ...frame, flipX: false }))
  });

  assert.ok(rebuilt.frames.every(frame => frame.flipX === false));
  assert.deepEqual(rebuilt.mirrorDetection, project.mirrorDetection);
});

test("parseMotionProject supplies null mirrorDetection for legacy project JSON", () => {
  const legacyProject = {
    id: "legacy-mirror",
    name: "Legacy mirror",
    createdAtIso: "2026-08-20T00:00:00.000Z",
    sourceImage: { path: "raw.png", width: 48, height: 48 },
    grid: { cols: 1, rows: 1 },
    canvas: { w: 48, h: 48 },
    matte: { mode: "none" },
    frames: [],
    animations: []
  };
  const project = parseMotionProject(legacyProject);

  assert.equal(project.mirrorDetection, null);
  assert.equal(parseMotionProject({ ...legacyProject, mirrorDetection: undefined }).mirrorDetection, null);
});

test("motion project upload routes default autoFlipRows off and accept an explicit opt-in", async t => {
  await useTempDataDir(t);
  const { POST } = await loadMotionRouteHandlers();
  const sheet = await mirroredGammaSheet();
  const requestBody = autoFlipRows => ({
    name: `Route mirrored gamma ${autoFlipRows}`,
    sliceMode: "grid",
    grid: { cols: 2, rows: 2, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte(),
    ...(autoFlipRows === undefined ? {} : { autoFlipRows }),
    source: { type: "upload", dataUrl: `data:image/png;base64,${sheet.toString("base64")}` }
  });

  const defaultResponse = await POST(
    new Request("http://localhost/api/motion/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody(undefined))
    })
  );
  const defaultBody = await defaultResponse.json();
  assert.equal(defaultResponse.status, 201);
  assert.equal(defaultBody.project.mirrorDetection, null);

  const enabledResponse = await POST(
    new Request("http://localhost/api/motion/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody(true))
    })
  );
  const enabledBody = await enabledResponse.json();
  assert.equal(enabledResponse.status, 201);
  assert.equal(enabledBody.project.mirrorDetection.enabled, true);
  assert.equal(enabledBody.project.mirrorDetection.rows[1].mirrored, true);
});

test("autoExcludeRepeatedRows excludes cloned rows and rebuilds preserve its metadata", async t => {
  await useTempDataDir(t);
  const project = await createProject({
    name: "Repeated gamma",
    sheetBuffer: await repeatedGammaSheet(),
    sliceMode: "grid",
    autoFlipRows: true,
    autoExcludeRepeatedRows: true,
    grid: { cols: 2, rows: 2, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  });

  assert.deepEqual(project.frames.map(frame => frame.excluded), [false, false, true, true]);
  assert.equal(project.duplicateDetection?.enabled, true);
  assert.equal(project.duplicateDetection?.rows[1].repeated, true);
  assert.deepEqual(project.duplicateDetection?.excludedFrames, [2, 3]);

  const rebuilt = await rebuildProject(project.id, {
    matte: { ...project.matte, tolerance: 1 }
  });
  assert.deepEqual(rebuilt.frames.map(frame => frame.excluded), [false, false, true, true]);
  assert.deepEqual(rebuilt.mirrorDetection, project.mirrorDetection);
  assert.deepEqual(rebuilt.duplicateDetection, project.duplicateDetection);

  const explicit = await rebuildProject(project.id, {
    frames: project.frames.map(frame => ({ ...frame, excluded: false }))
  });
  assert.ok(explicit.frames.every(frame => frame.excluded === false));
  assert.deepEqual(explicit.duplicateDetection, project.duplicateDetection);
});

test("autoExcludeRepeatedRows is opt-in and legacy projects receive null detection", async t => {
  await useTempDataDir(t);
  const createInput = {
    name: "Unexcluded gamma",
    sheetBuffer: await repeatedGammaSheet(),
    sliceMode: "grid",
    grid: { cols: 2, rows: 2, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  };
  const omitted = await createProject(createInput);
  const disabled = await createProject({ ...createInput, autoExcludeRepeatedRows: false });
  assert.ok(omitted.frames.every(frame => frame.excluded === false));
  assert.ok(disabled.frames.every(frame => frame.excluded === false));
  assert.equal(omitted.duplicateDetection, null);
  assert.equal(disabled.duplicateDetection, null);

  const legacyProject = {
    id: "legacy-duplicate",
    name: "Legacy duplicate",
    createdAtIso: "2026-09-07T00:00:00.000Z",
    sourceImage: { path: "raw.png", width: 48, height: 48 },
    grid: { cols: 1, rows: 1 },
    canvas: { w: 48, h: 48 },
    matte: { mode: "none" },
    frames: [],
    animations: []
  };
  assert.equal(parseMotionProject(legacyProject).duplicateDetection, null);
  assert.equal(
    parseMotionProject({ ...legacyProject, duplicateDetection: undefined }).duplicateDetection,
    null
  );
});

test("motion project uploads only exclude repeated rows after an explicit opt-in", async t => {
  await useTempDataDir(t);
  const { POST } = await loadMotionRouteHandlers();
  const sheet = await repeatedGammaSheet();
  const requestBody = autoExcludeRepeatedRows => ({
    name: `Route repeated gamma ${autoExcludeRepeatedRows}`,
    sliceMode: "grid",
    grid: { cols: 2, rows: 2, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte(),
    ...(autoExcludeRepeatedRows === undefined ? {} : { autoExcludeRepeatedRows }),
    source: { type: "upload", dataUrl: `data:image/png;base64,${sheet.toString("base64")}` }
  });

  const defaultResponse = await POST(
    new Request("http://localhost/api/motion/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody(undefined))
    })
  );
  const defaultBody = await defaultResponse.json();
  assert.equal(defaultResponse.status, 201);
  assert.equal(defaultBody.project.duplicateDetection, null);

  const enabledResponse = await POST(
    new Request("http://localhost/api/motion/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody(true))
    })
  );
  const enabledBody = await enabledResponse.json();
  assert.equal(enabledResponse.status, 201);
  assert.deepEqual(enabledBody.project.frames.map(frame => frame.excluded), [false, false, true, true]);
  assert.equal(enabledBody.project.duplicateDetection.enabled, true);
  assert.deepEqual(enabledBody.project.duplicateDetection.excludedFrames, [2, 3]);
});
