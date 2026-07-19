import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mock, test } from "node:test";

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
  assert.match(prompt, /#FF00FF/);
  assert.match(prompt, /4 columns by 2 rows/);
  assert.match(prompt, /same direction/i);
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
