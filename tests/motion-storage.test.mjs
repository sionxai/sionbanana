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
  applyCandidateFrames,
  createProject,
  deleteProject,
  fitToCell,
  motionRoot,
  projectDir,
  readAssetFile,
  readOrientedCell,
  readProject,
  rebuildProject,
  revertFrameOverrides,
  setReviewApproval
} from "@/lib/motion/storage";
import { createCandidate, readCandidate, updateCandidate } from "@/lib/motion/candidates";
import { analyzeFrame } from "@/lib/motion/engine";
import { parseMotionProject } from "@/lib/motion/types";

let routeImportHooksRegistered = false;

function installMotionModuleHooks() {
  if (!routeImportHooksRegistered) {
    const authStub = `data:text/javascript,${encodeURIComponent(
      'export class CodexAuthError extends Error {}; export async function getCodexAuth() { return { accessToken: "test-token", accountId: "test-account" }; }'
    )}`;
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === "./codex-oauth" && context.parentURL?.endsWith("/lib/codex-fetch.ts")) {
          return { url: authStub, shortCircuit: true };
        }
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
}

async function loadMotionRouteHandlers() {
  installMotionModuleHooks();
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

async function fourCellGammaStrip() {
  const width = 48;
  const height = 12;
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 255;
    pixels[offset + 1] = 0;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = 255;
  }
  for (let cell = 0; cell < 4; cell += 1) {
    for (let y = 3; y < 9; y += 1) {
      for (let x = cell * 12 + 3; x < cell * 12 + 9; x += 1) {
        const offset = (y * width + x) * 4;
        pixels[offset] = 20;
        pixels[offset + 1] = 80;
        pixels[offset + 2] = 180;
      }
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

test("projects record whether their layout was validated and retain unknown legacy project JSON", async t => {
  await useTempDataDir(t);
  const input = {
    sheetBuffer: await testSheet(),
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  };
  const gridProject = await createProject({ name: "Grid layout validation", sliceMode: "grid", ...input });
  const autoProject = await createProject({ name: "Auto layout validation", sliceMode: "auto", ...input });

  assert.equal(gridProject.layoutValidated, false);
  assert.equal(autoProject.layoutValidated, true);
  assert.equal((await rebuildProject(autoProject.id, { sliceMode: "grid" })).layoutValidated, false);

  const legacyProject = {
    id: "legacy-layout-validation",
    name: "Legacy layout validation",
    createdAtIso: "2026-09-08T00:00:00.000Z",
    sourceImage: { path: "raw.png", width: 12, height: 6 },
    grid: { cols: 2, rows: 1 },
    canvas: { w: 6, h: 6 },
    matte: { mode: "none" },
    frames: [],
    animations: []
  };
  assert.equal(parseMotionProject(legacyProject).layoutValidated, null);
  assert.equal(parseMotionProject({ ...legacyProject, sliceMode: "auto" }).layoutValidated, null);
  assert.equal(
    parseMotionProject({ ...legacyProject, sliceMode: "grid", layoutValidated: true }).layoutValidated,
    true
  );
});

test("review approval requires every outstanding issue, rejects content loss, and survives rebuild", async t => {
  await useTempDataDir(t);
  const project = await createProject({
    name: "Review approval",
    sheetBuffer: await testSheet(),
    sliceMode: "grid",
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  });

  await assert.rejects(
    setReviewApproval(project.id, { reasons: [] }),
    error => error?.code === "CONFLICT" && error?.status === 409
  );
  const approved = await setReviewApproval(project.id, {
    reasons: ["layout-not-validated"],
    note: "previewed"
  });
  assert.deepEqual(approved.reviewApproval?.approvedReasons, ["layout-not-validated"]);
  assert.equal(approved.reviewApproval?.note, "previewed");
  const rebuilt = await rebuildProject(project.id, { matte: { ...project.matte, tolerance: 1 } });
  assert.deepEqual(rebuilt.reviewApproval, approved.reviewApproval);

  await fs.writeFile(
    path.join(projectDir(project.id), "project.json"),
    `${JSON.stringify(
      {
        ...rebuilt,
        frames: rebuilt.frames.map((frame, index) =>
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
                    lostPixels: 1,
                    touchesEdge: ["left"]
                  }
                }
              }
            : frame
        )
      },
      null,
      2
    )}\n`
  );
  await assert.rejects(
    setReviewApproval(project.id, { reasons: ["layout-not-validated"] }),
    error => error?.code === "CONTENT_LOSS" && error?.status === 409
  );
});

test("candidate review flags persist, update, and reflect strip layout quality without changing status", async t => {
  await useTempDataDir(t);
  installMotionModuleHooks();
  const { runCandidate } = await import("../lib/motion/candidate-generate.ts");
  const project = await createProject({
    name: "Candidate layout review",
    sheetBuffer: await mirroredGammaSheet(),
    sliceMode: "grid",
    grid: { cols: 2, rows: 2, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  });
  const manual = await createCandidate(project.id, { mode: "mask", frames: [{ index: 0 }] });
  assert.equal(manual.requiresReview, false);
  assert.deepEqual(manual.reviewReasons, []);
  await updateCandidate(project.id, manual.id, candidate => ({
    ...candidate,
    requiresReview: true,
    reviewReasons: ["manual-review"]
  }));
  assert.deepEqual((await readCandidate(project.id, manual.id)).reviewReasons, ["manual-review"]);

  const accepted = await createCandidate(project.id, {
    mode: "strip",
    frames: [{ index: 1 }, { index: 2 }]
  });
  const acceptedResult = await runCandidate(project.id, accepted.id, {
    editImage: async () => {
      throw new Error("mask generation is not expected");
    },
    generateSheet: async () => fourCellGammaStrip()
  });
  assert.equal(acceptedResult.status, "ready");
  assert.equal(acceptedResult.requiresReview, false);
  assert.deepEqual(acceptedResult.reviewReasons, []);

  const fallback = await createCandidate(project.id, {
    mode: "strip",
    frames: [{ index: 1 }, { index: 2 }]
  });
  const fallbackResult = await runCandidate(project.id, fallback.id, {
    editImage: async () => {
      throw new Error("mask generation is not expected");
    },
    generateSheet: async () => testSheet()
  });
  assert.equal(fallbackResult.status, "ready");
  assert.equal(fallbackResult.requiresReview, true);
  assert.deepEqual(fallbackResult.reviewReasons, ["layout-fallback-grid", "low-slice-confidence"]);

  const mask = await createCandidate(project.id, { mode: "mask", frames: [{ index: 0 }] });
  const maskResult = await runCandidate(project.id, mask.id, {
    editImage: async () => (await readOrientedCell(project.id, 0)).buffer,
    generateSheet: async () => {
      throw new Error("strip generation is not expected");
    }
  });
  assert.equal(maskResult.status, "ready");
  assert.equal(maskResult.requiresReview, false);
  assert.deepEqual(maskResult.reviewReasons, []);
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

test("createProject applies provided default animation values to its fallback animation", async t => {
  await useTempDataDir(t);
  const project = await createProject({
    name: "One-shot default",
    sheetBuffer: await testSheet(),
    defaultAnimation: { loop: "once" },
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  });

  assert.equal(project.animations[0].loop, "once");
  assert.equal(project.animations[0].fps, 12);
});

test("motion project upload routes default and preserve requested animation settings", async t => {
  await useTempDataDir(t);
  const { POST } = await loadMotionRouteHandlers();
  const sheet = await testSheet();
  const requestBody = animation => ({
    name: `Upload animation ${animation?.loop ?? "default"}`,
    sliceMode: "grid",
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte(),
    ...animation,
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
  assert.equal(defaultBody.project.animations[0].loop, "loop");
  assert.equal(defaultBody.project.animations[0].fps, 12);

  const requestedResponse = await POST(
    new Request("http://localhost/api/motion/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody({ loop: "once", fps: 8 }))
    })
  );
  const requestedBody = await requestedResponse.json();
  assert.equal(requestedResponse.status, 201);
  assert.equal(requestedBody.project.animations[0].loop, "once");
  assert.equal(requestedBody.project.animations[0].fps, 8);
});

test("motion project generation rejects grids larger than twelve frames before generating", async () => {
  const { POST } = await loadMotionRouteHandlers();
  const response = await POST(
    new Request("http://localhost/api/motion/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Too many generated frames",
        grid: { cols: 4, rows: 4 },
        source: { type: "generate", prompt: "a banana mascot runs", action: "run" }
      })
    })
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.reason, /at most 12 frames/);
});

async function gammaCell(color, scale = 1) {
  const width = 48 * scale;
  const height = 48 * scale;
  const pixels = Buffer.alloc(width * height * 4);
  const set = (x, y) => {
    const offset = (y * width + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
  };
  for (let y = 8 * scale; y <= 40 * scale; y += 1) {
    for (let x = 10 * scale; x <= 14 * scale; x += 1) set(x, y);
  }
  for (let y = 8 * scale; y <= 12 * scale; y += 1) {
    for (let x = 14 * scale; x <= 30 * scale; x += 1) set(x, y);
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function twoCellGammaSheet() {
  const left = await gammaCell([20, 80, 180]);
  const right = await gammaCell([20, 80, 180]);
  const magenta = Buffer.alloc(96 * 48 * 4);
  for (let offset = 0; offset < magenta.length; offset += 4) {
    magenta[offset] = 255;
    magenta[offset + 1] = 0;
    magenta[offset + 2] = 255;
    magenta[offset + 3] = 255;
  }
  return sharp(magenta, { raw: { width: 96, height: 48, channels: 4 } })
    .composite([{ input: left, left: 0, top: 0 }, { input: right, left: 48, top: 0 }])
    .png()
    .toBuffer();
}

async function includesColor(buffer, color) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset] === color[0] && data[offset + 1] === color[1] && data[offset + 2] === color[2]) return true;
  }
  return false;
}

test("legacy frames receive null overrides and oriented cells preserve the source cell contract", async t => {
  await useTempDataDir(t);
  const legacy = parseMotionProject({
    id: "legacy-override",
    name: "Legacy override",
    createdAtIso: "2026-09-07T00:00:00.000Z",
    sourceImage: { path: "raw.png", width: 48, height: 48 },
    grid: { cols: 1, rows: 1 },
    canvas: { w: 48, h: 48 },
    matte: { mode: "none" },
    frames: [{
      index: 0,
      source: { x: 0, y: 0, w: 48, h: 48 },
      trim: { x: 0, y: 0, w: 0, h: 0 },
      pivot: { x: 0, y: 0 }
    }],
    animations: []
  });
  assert.equal(legacy.frames[0].override, null);

  const project = await createProject({
    name: "Oriented gamma",
    sheetBuffer: await twoCellGammaSheet(),
    sliceMode: "grid",
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  });
  const cell = await readOrientedCell(project.id, 1);
  assert.equal(cell.width, project.frames[1].source.w);
  assert.equal(cell.height, project.frames[1].source.h);
  assert.equal(cell.trim.h > 0, true);
  const transparent = await sharp(cell.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(transparent.data[3], 0);

  const flipped = await rebuildProject(project.id, {
    frames: project.frames.map(frame => ({ ...frame, flipX: frame.index === 1 }))
  });
  const flippedCell = await readOrientedCell(project.id, 1);
  const expectedFlipped = await sharp(cell.buffer).flop().ensureAlpha().raw().toBuffer();
  const actualFlipped = await sharp(flippedCell.buffer).ensureAlpha().raw().toBuffer();
  assert.deepEqual(actualFlipped, expectedFlipped);
  assert.equal(flipped.frames[1].flipX, true);
});

test("candidate application fits, persists, rebuilds, and reverts frame overrides", async t => {
  await useTempDataDir(t);
  const project = await createProject({
    name: "Override gamma",
    sheetBuffer: await twoCellGammaSheet(),
    sliceMode: "grid",
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  });
  const original = await readOrientedCell(project.id, 1);
  const emptyCandidate = await sharp({
    create: { width: 48, height: 48, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).png().toBuffer();
  await assert.rejects(
    fitToCell(emptyCandidate, original, await analyzeFrame(emptyCandidate)),
    RangeError
  );
  const oversized = await gammaCell([200, 50, 30], 2);
  const fitted = await fitToCell(oversized, original, await analyzeFrame(oversized));
  const fittedAnalysis = await analyzeFrame(fitted);
  assert.ok(Math.abs(fittedAnalysis.trim.h - original.trim.h) <= 1);
  assert.ok(Math.abs(fittedAnalysis.pivot.x - original.pivot.x) <= 1);
  assert.ok(Math.abs(fittedAnalysis.pivot.y - original.pivot.y) <= 1);

  const before = await fs.readFile(path.join(projectDir(project.id), "derived", "frames", "f01.png"));
  const rawBefore = await fs.readFile(path.join(projectDir(project.id), "raw.png"));
  const candidate = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 1, image: await gammaCell([200, 50, 30]) }],
    instruction: "replace the second frame"
  });
  await updateCandidate(project.id, candidate.id, value => ({
    ...value,
    requiresReview: true,
    reviewReasons: ["low-slice-confidence"]
  }));
  const applied = await applyCandidateFrames(project.id, candidate.id);
  assert.equal(applied.frames[1].override?.candidateId, candidate.id);
  assert.deepEqual(applied.frames[1].override?.review, {
    candidateId: candidate.id,
    reasons: ["low-slice-confidence"],
    recordedAtIso: applied.frames[1].override?.appliedAtIso
  });
  assert.equal(existsSync(path.join(projectDir(project.id), "overrides", "f02.png")), true);
  assert.equal(
    await includesColor(await fs.readFile(path.join(projectDir(project.id), "derived", "frames", "f02.png")), [200, 50, 30]),
    true
  );
  assert.deepEqual(await fs.readFile(path.join(projectDir(project.id), "derived", "frames", "f01.png")), before);
  assert.deepEqual(await fs.readFile(path.join(projectDir(project.id), "raw.png")), rawBefore);

  const rebuilt = await rebuildProject(project.id, { matte: { ...project.matte, tolerance: 1 } });
  assert.equal(rebuilt.frames[1].override?.candidateId, candidate.id);
  const explicit = await rebuildProject(project.id, { frames: rebuilt.frames.map(frame => ({ ...frame })) });
  assert.equal(explicit.frames[1].override?.candidateId, candidate.id);

  const reverted = await revertFrameOverrides(project.id, [1]);
  assert.equal(reverted.frames[1].override, null);
  assert.equal(existsSync(path.join(projectDir(project.id), "overrides", "f02.png")), false);
  assert.equal(
    await includesColor(await fs.readFile(path.join(projectDir(project.id), "derived", "frames", "f02.png")), [20, 80, 180]),
    true
  );
  assert.deepEqual(await fs.readFile(path.join(projectDir(project.id), "raw.png")), rawBefore);

  await applyCandidateFrames(project.id, candidate.id);
  await fs.rm(path.join(projectDir(project.id), "overrides", "f02.png"));
  await assert.rejects(rebuildProject(project.id, { matte: { ...project.matte, tolerance: 2 } }), error => error?.status === 409);
});

test("override apply and revert restore prior artifacts when atomic commits fail", async t => {
  await useTempDataDir(t);
  const project = await createProject({
    name: "Atomic overrides",
    sheetBuffer: await twoCellGammaSheet(),
    sliceMode: "grid",
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  });
  const original = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 1, image: await gammaCell([200, 50, 30]) }]
  });
  await applyCandidateFrames(project.id, original.id);
  const replacement = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 1, image: await gammaCell([40, 170, 20]) }]
  });
  // macOS tmpdir is a symlink (/var -> /private/var); storage renames use realpaths, so the
  // mock must compare against the resolved path or it silently never fires (same as the
  // "failed project.json rename" test above).
  const directory = await fs.realpath(projectDir(project.id));
  const jsonPath = path.join(directory, "project.json");
  const candidateJsonPath = path.join(directory, "candidates", replacement.id, "candidate.json");
  const trackedPaths = [
    path.join(directory, "raw.png"),
    jsonPath,
    path.join(directory, "derived", "sheet.png"),
    path.join(directory, "derived", "frames", "f02.png"),
    path.join(directory, "overrides", "f02.png"),
    candidateJsonPath
  ];
  const before = await Promise.all(trackedPaths.map(file => fs.readFile(file)));
  const assertRestored = async () => {
    const after = await Promise.all(trackedPaths.map(file => fs.readFile(file)));
    assert.deepEqual(after, before);
  };
  const originalRename = fs.rename.bind(fs);

  const projectRenameMock = mock.method(fs, "rename", async (source, target) => {
    if (target === jsonPath) {
      assert.match(path.basename(String(source)), /^\.project-/);
      throw Object.assign(new Error("injected project.json rename failure"), { code: "EIO" });
    }
    return originalRename(source, target);
  });
  try {
    await assert.rejects(applyCandidateFrames(project.id, replacement.id), /injected project\.json rename failure/);
  } finally {
    projectRenameMock.mock.restore();
  }
  await assertRestored();

  const candidateRenameMock = mock.method(fs, "rename", async (source, target) => {
    if (target === candidateJsonPath) {
      assert.match(path.basename(String(source)), /^\.candidate\.json-/);
      throw Object.assign(new Error("injected candidate.json rename failure"), { code: "EIO" });
    }
    return originalRename(source, target);
  });
  try {
    await assert.rejects(applyCandidateFrames(project.id, replacement.id), /injected candidate\.json rename failure/);
  } finally {
    candidateRenameMock.mock.restore();
  }
  await assertRestored();

  const revertRenameMock = mock.method(fs, "rename", async (source, target) => {
    if (target === jsonPath) {
      assert.match(path.basename(String(source)), /^\.project-/);
      throw Object.assign(new Error("injected revert project.json rename failure"), { code: "EIO" });
    }
    return originalRename(source, target);
  });
  try {
    await assert.rejects(revertFrameOverrides(project.id, [1]), /injected revert project\.json rename failure/);
  } finally {
    revertRenameMock.mock.restore();
  }
  await assertRestored();
});

test("override directories reject symlinks before an override rebuild", async t => {
  await useTempDataDir(t);
  const project = await createProject({
    name: "Linked override",
    sheetBuffer: await twoCellGammaSheet(),
    sliceMode: "grid",
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: gammaMatte()
  });
  const candidate = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 1, image: await gammaCell([200, 50, 30]) }]
  });
  await applyCandidateFrames(project.id, candidate.id);
  const overrides = path.join(projectDir(project.id), "overrides");
  await fs.rm(overrides, { recursive: true });
  await fs.symlink("candidates", overrides, "dir");
  await assert.rejects(
    rebuildProject(project.id, { matte: { ...project.matte, tolerance: 1 } }),
    error => error?.status === 409
  );
});
