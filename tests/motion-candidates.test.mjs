import assert from "node:assert/strict";
import { existsSync, promises as fs } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

import {
  CandidateStorageError,
  candidateFramePath,
  createCandidate,
  deleteCandidate,
  listCandidates,
  readCandidate,
  updateCandidate
} from "@/lib/motion/candidates";
import {
  applyCandidateFrames,
  createProject,
  projectDir,
  readAssetFile,
  readProject,
  revertFrameOverrides
} from "@/lib/motion/storage";

let hooksRegistered = false;

async function loadMotionRouteHandlers() {
  if (!hooksRegistered) {
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
    hooksRegistered = true;
  }
  const [candidates, candidate, apply, revert, cells] = await Promise.all([
    import("../app/api/motion/projects/[id]/candidates/route.ts"),
    import("../app/api/motion/projects/[id]/candidates/[cid]/route.ts"),
    import("../app/api/motion/projects/[id]/candidates/[cid]/apply/route.ts"),
    import("../app/api/motion/projects/[id]/revert/route.ts"),
    import("../app/api/motion/projects/[id]/cells/[index]/route.ts")
  ]);
  return { candidates, candidate, apply, revert, cells };
}

async function useTempDataDir(t) {
  const previous = process.env.SIONBANANA_DATA_DIR;
  const directory = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-motion-candidates-"));
  process.env.SIONBANANA_DATA_DIR = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.SIONBANANA_DATA_DIR;
    else process.env.SIONBANANA_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  });
}

async function gammaCell(color = [20, 80, 180]) {
  const pixels = Buffer.alloc(48 * 48 * 4);
  const set = (x, y) => {
    const offset = (y * 48 + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
  };
  for (let y = 8; y <= 40; y += 1) {
    for (let x = 10; x <= 14; x += 1) set(x, y);
  }
  for (let y = 8; y <= 12; y += 1) {
    for (let x = 14; x <= 30; x += 1) set(x, y);
  }
  return sharp(pixels, { raw: { width: 48, height: 48, channels: 4 } }).png().toBuffer();
}

async function readAssetBuffer(projectId, relativePath) {
  const asset = await readAssetFile(projectId, relativePath);
  assert.ok(asset);
  const chunks = [];
  for await (const chunk of asset.stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function projectForCandidates(frameCount = 2) {
  const width = frameCount * 48;
  const magenta = Buffer.alloc(width * 48 * 4);
  for (let offset = 0; offset < magenta.length; offset += 4) {
    magenta[offset] = 255;
    magenta[offset + 1] = 0;
    magenta[offset + 2] = 255;
    magenta[offset + 3] = 255;
  }
  const cell = await gammaCell();
  const sheet = await sharp(magenta, { raw: { width, height: 48, channels: 4 } })
    .composite(Array.from({ length: frameCount }, (_, index) => ({ input: cell, left: index * 48, top: 0 })))
    .png()
    .toBuffer();
  return createProject({
    name: "Candidate gamma",
    sheetBuffer: sheet,
    sliceMode: "grid",
    grid: { cols: frameCount, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: { mode: "keyColor", keyColor: "#FF00FF", tolerance: 0, softness: 0, despill: false, choke: 0 }
  });
}

test("candidate storage validates modes, stores assets, sorts summaries, and guards deletes", async t => {
  await useTempDataDir(t);
  const project = await projectForCandidates();
  const upload = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 1, image: await gammaCell([200, 50, 30]) }]
  });
  assert.equal(upload.status, "ready");
  assert.equal(existsSync(path.join(projectDir(project.id), "candidates", upload.id, "candidate.json")), true);
  assert.equal(existsSync(path.join(projectDir(project.id), "candidates", upload.id, "frames", "f02.png")), true);
  const uploadFrames = path.join(projectDir(project.id), "candidates", upload.id, "frames");
  await fs.rm(uploadFrames, { recursive: true });
  await fs.symlink("../masks", uploadFrames, "dir");
  await assert.rejects(candidateFramePath(project.id, upload.id, 1), error => error?.status === 404);

  const mask = await createCandidate(project.id, {
    mode: "mask",
    frames: [{ index: 0, mask: await gammaCell() }]
  });
  assert.equal(mask.status, "pending");
  assert.equal(existsSync(path.join(projectDir(project.id), "candidates", mask.id, "masks", "f01.png")), true);
  const maskDirectory = path.join(projectDir(project.id), "candidates", mask.id, "masks");
  await fs.rm(maskDirectory, { recursive: true });
  await fs.symlink("../frames", maskDirectory, "dir");
  assert.equal(await readAssetFile(project.id, `candidates/${mask.id}/masks/f01.png`), null);
  await assert.rejects(
    createCandidate(project.id, {
      mode: "mask",
      frames: [{ index: 0, mask: await sharp({ create: { width: 8, height: 8, channels: 4, background: "black" } }).png().toBuffer() }]
    }),
    error => error instanceof CandidateStorageError && error.status === 400 && /mask size/.test(error.message)
  );
  await assert.rejects(
    createCandidate(project.id, { mode: "strip", frames: [{ index: 1 }, { index: 0 }] }),
    error => error instanceof CandidateStorageError && error.status === 400
  );
  await assert.rejects(
    createCandidate(project.id, { mode: "strip", frames: Array.from({ length: 7 }, (_, index) => ({ index })) }),
    error => error instanceof CandidateStorageError && error.status === 400
  );
  const stripProject = await projectForCandidates(6);
  const strip = await createCandidate(stripProject.id, {
    mode: "strip",
    frames: Array.from({ length: 6 }, (_, index) => ({ index }))
  });
  assert.equal(strip.status, "pending");
  await assert.rejects(
    createCandidate(project.id, { mode: "mask", frames: [{ index: 2 }] }),
    error => error instanceof CandidateStorageError && error.status === 400
  );

  const maskJson = path.join(projectDir(project.id), "candidates", mask.id, "candidate.json");
  const older = JSON.parse(await fs.readFile(maskJson, "utf8"));
  older.createdAtIso = "2000-01-01T00:00:00.000Z";
  await fs.writeFile(maskJson, `${JSON.stringify(older)}\n`);
  const summaries = await listCandidates(project.id);
  assert.deepEqual(summaries.map(value => value.id), [upload.id, mask.id]);
  assert.equal((await readCandidate(project.id, upload.id)).id, upload.id);
  await assert.rejects(deleteCandidate(project.id, "cand-missing"), error => error?.status === 404);

  older.status = "running";
  await fs.writeFile(maskJson, `${JSON.stringify(older)}\n`);
  await assert.rejects(deleteCandidate(project.id, mask.id), error => error?.status === 409);
  older.status = "pending";
  await fs.writeFile(maskJson, `${JSON.stringify(older)}\n`);
  await deleteCandidate(project.id, mask.id);
  assert.equal(existsSync(path.join(projectDir(project.id), "candidates", mask.id)), false);
});

test("candidate, apply, revert, and cell routes expose the upload override flow", async t => {
  await useTempDataDir(t);
  const project = await projectForCandidates();
  const { candidates, candidate, apply, revert, cells } = await loadMotionRouteHandlers();
  const image = await gammaCell([200, 50, 30]);
  const created = await candidates.POST(
    new Request("http://localhost/api/motion/projects/id/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "upload",
        frames: [{ index: 1, image: `data:image/png;base64,${image.toString("base64")}` }]
      })
    }),
    { params: { id: project.id } }
  );
  const createdBody = await created.json();
  assert.equal(created.status, 201);
  assert.equal(createdBody.candidate.status, "ready");

  const listed = await candidates.GET(new Request("http://localhost"), { params: { id: project.id } });
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).candidates.length, 1);

  const applied = await apply.POST(
    new Request("http://localhost", { method: "POST", body: "{}" }),
    { params: { id: project.id, cid: createdBody.candidate.id } }
  );
  assert.equal(applied.status, 200);
  assert.equal((await applied.json()).project.frames[1].override.candidateId, createdBody.candidate.id);

  const cell = await cells.GET(new Request("http://localhost"), { params: { id: project.id, index: "1" } });
  assert.equal(cell.status, 200);
  assert.equal(cell.headers.get("content-type"), "image/png");
  assert.match(cell.headers.get("x-cell-trim"), /^\d+,\d+,\d+,\d+$/);
  assert.match(cell.headers.get("x-cell-pivot"), /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/);

  const reverted = await revert.POST(
    new Request("http://localhost", { method: "POST", body: JSON.stringify({ frames: [1] }) }),
    { params: { id: project.id } }
  );
  assert.equal(reverted.status, 200);
  assert.equal((await reverted.json()).project.frames[1].override, null);

  const badCandidate = await candidate.GET(new Request("http://localhost"), {
    params: { id: project.id, cid: "../bad" }
  });
  assert.equal(badCandidate.status, 404);
  const badIndex = await cells.GET(new Request("http://localhost"), { params: { id: project.id, index: "one" } });
  assert.equal(badIndex.status, 404);
});

test("candidate baselines reject changed frames before writes, allow scoped and forced applies, and support legacy candidates", async t => {
  await useTempDataDir(t);
  const project = await projectForCandidates();
  const candidateA = await createCandidate(project.id, {
    mode: "upload",
    frames: [
      { index: 0, image: await gammaCell([210, 40, 30]) },
      { index: 1, image: await gammaCell([210, 40, 30]) }
    ]
  });
  const candidateB = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 1, image: await gammaCell([30, 210, 40]) }]
  });
  assert.deepEqual(candidateA.baseline, [
    { index: 0, overrideCandidateId: null },
    { index: 1, overrideCandidateId: null }
  ]);

  await applyCandidateFrames(project.id, candidateB.id);
  const basedOnB = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 1, image: await gammaCell([40, 30, 210]) }]
  });
  assert.deepEqual(basedOnB.baseline, [{ index: 1, overrideCandidateId: candidateB.id }]);

  const overrideFrameOne = path.join(projectDir(project.id), "overrides", "f01.png");
  const overrideFrameTwo = path.join(projectDir(project.id), "overrides", "f02.png");
  const overrideFrameTwoBeforeConflict = await fs.readFile(overrideFrameTwo);

  await assert.rejects(
    applyCandidateFrames(project.id, candidateA.id),
    error => error?.status === 409 && error?.code === "CONFLICT" && /프레임 2번/.test(error.message)
  );
  assert.equal(existsSync(overrideFrameOne), false);
  assert.deepEqual(await fs.readFile(overrideFrameTwo), overrideFrameTwoBeforeConflict);
  const afterConflict = await readProject(project.id);
  assert.equal(afterConflict.frames[0].override, null);
  assert.equal(afterConflict.frames[1].override?.candidateId, candidateB.id);

  const subset = await applyCandidateFrames(project.id, candidateA.id, [0]);
  assert.equal(subset.frames[0].override?.candidateId, candidateA.id);
  assert.equal(subset.frames[1].override?.candidateId, candidateB.id);
  await assert.rejects(
    applyCandidateFrames(project.id, candidateA.id, [1]),
    error => error?.status === 409 && /프레임 2번/.test(error.message)
  );
  const forced = await applyCandidateFrames(project.id, candidateA.id, [1], { force: true });
  assert.equal(forced.frames[1].override?.candidateId, candidateA.id);
  await assert.rejects(
    applyCandidateFrames(project.id, basedOnB.id),
    error => error?.status === 409 && /프레임 2번/.test(error.message)
  );

  const basedOnA = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 0, image: await gammaCell([30, 40, 210]) }]
  });
  assert.deepEqual(basedOnA.baseline, [{ index: 0, overrideCandidateId: candidateA.id }]);
  await revertFrameOverrides(project.id, [0]);
  await assert.rejects(
    applyCandidateFrames(project.id, basedOnA.id),
    error => error?.status === 409 && /프레임 1번/.test(error.message)
  );

  const legacyCandidates = await Promise.all([
    createCandidate(project.id, {
      mode: "upload",
      frames: [{ index: 1, image: await gammaCell([220, 150, 20]) }]
    }),
    createCandidate(project.id, {
      mode: "upload",
      frames: [{ index: 1, image: await gammaCell([20, 150, 220]) }]
    })
  ]);
  await revertFrameOverrides(project.id, [1]);
  for (const [position, legacy] of legacyCandidates.entries()) {
    const legacyPath = path.join(projectDir(project.id), "candidates", legacy.id, "candidate.json");
    const legacyJson = JSON.parse(await fs.readFile(legacyPath, "utf8"));
    if (position === 0) delete legacyJson.baseline;
    else legacyJson.baseline = [];
    await fs.writeFile(legacyPath, `${JSON.stringify(legacyJson)}\n`);
    assert.deepEqual((await readCandidate(project.id, legacy.id)).baseline, []);
    const legacyApplied = await applyCandidateFrames(project.id, legacy.id);
    assert.equal(legacyApplied.frames[1].override?.candidateId, legacy.id);
  }
});

test("candidate apply route returns conflicts and forwards force", async t => {
  await useTempDataDir(t);
  const project = await projectForCandidates();
  const { apply } = await loadMotionRouteHandlers();
  const candidateA = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 0, image: await gammaCell([200, 40, 30]) }]
  });
  const candidateB = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 0, image: await gammaCell([30, 200, 40]) }]
  });
  await applyCandidateFrames(project.id, candidateB.id);

  const conflict = await apply.POST(
    new Request("http://localhost", { method: "POST", body: JSON.stringify({ frames: [0] }) }),
    { params: { id: project.id, cid: candidateA.id } }
  );
  assert.equal(conflict.status, 409);
  assert.match((await conflict.json()).reason, /프레임 1번/);

  const forced = await apply.POST(
    new Request("http://localhost", { method: "POST", body: JSON.stringify({ frames: [0], force: true }) }),
    { params: { id: project.id, cid: candidateA.id } }
  );
  assert.equal(forced.status, 200);
  assert.equal((await forced.json()).project.frames[0].override.candidateId, candidateA.id);
});

test("cell-aligned candidates preserve unchanged derived RGBA pixels when a sparse edit changes its bounding box", async t => {
  await useTempDataDir(t);
  const target = await gammaCell();
  const targetRaw = await sharp(target).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const anchorPixels = Buffer.from(targetRaw.data);
  const anchorOffset = (4 * targetRaw.info.width + 10) * 4;
  anchorPixels[anchorOffset] = 20;
  anchorPixels[anchorOffset + 1] = 80;
  anchorPixels[anchorOffset + 2] = 180;
  anchorPixels[anchorOffset + 3] = 255;
  const anchor = await sharp(anchorPixels, {
    raw: { width: targetRaw.info.width, height: targetRaw.info.height, channels: 4 }
  }).png().toBuffer();
  const sheet = await sharp({
    create: { width: 96, height: 48, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } }
  })
    .composite([{ input: anchor, left: 0, top: 0 }, { input: target, left: 48, top: 0 }])
    .png()
    .toBuffer();
  const project = await createProject({
    name: "Cell-aligned sparse edit",
    sheetBuffer: sheet,
    sliceMode: "grid",
    grid: { cols: 2, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: { mode: "keyColor", keyColor: "#FF00FF", tolerance: 0, softness: 0, despill: false, choke: 0 },
    normalizeScale: "none",
    normalizePivotX: "foot",
    normalizePivotY: "pin"
  });
  const before = await sharp(await readAssetBuffer(project.id, "derived/frames/f02.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sparsePixels = Buffer.from(targetRaw.data);
  const sparseOffset = (6 * targetRaw.info.width + 10) * 4;
  assert.equal(sparsePixels[sparseOffset + 3], 0);
  sparsePixels[sparseOffset] = 200;
  sparsePixels[sparseOffset + 1] = 50;
  sparsePixels[sparseOffset + 2] = 30;
  sparsePixels[sparseOffset + 3] = 255;
  const sparseEdit = await sharp(sparsePixels, {
    raw: { width: targetRaw.info.width, height: targetRaw.info.height, channels: 4 }
  }).png().toBuffer();
  const candidate = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 1, image: sparseEdit }],
    cellAligned: true
  });
  const applied = await applyCandidateFrames(project.id, candidate.id);
  const after = await sharp(await readAssetBuffer(project.id, "derived/frames/f02.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual([after.info.width, after.info.height], [before.info.width, before.info.height]);
  const changedPixels = [];
  for (let offset = 0; offset < before.data.length; offset += 4) {
    if (!before.data.subarray(offset, offset + 4).equals(after.data.subarray(offset, offset + 4))) {
      changedPixels.push(offset / 4);
    }
  }
  const expectedChangedPixel = applied.frames[1].trim.y * after.info.width + applied.frames[1].trim.x;
  assert.deepEqual(changedPixels, [expectedChangedPixel]);
  const expectedOffset = expectedChangedPixel * 4;
  assert.deepEqual([...after.data.subarray(expectedOffset, expectedOffset + 4)], [200, 50, 30, 255]);
});

test("cell-aligned candidates reject a later mismatched frame and restore prior overrides", async t => {
  await useTempDataDir(t);
  const project = await projectForCandidates();
  const candidate = await createCandidate(project.id, {
    mode: "upload",
    frames: [
      { index: 0, image: await gammaCell([200, 50, 30]) },
      { index: 1, image: await sharp(await gammaCell([30, 200, 50])).resize(24, 24).png().toBuffer() }
    ],
    cellAligned: true
  });
  const overrides = path.join(projectDir(project.id), "overrides");
  await assert.rejects(
    applyCandidateFrames(project.id, candidate.id),
    error =>
      error?.status === 409 &&
      error?.code === "INVALID_PATCH" &&
      error?.message === "셀 정렬 후보 프레임 2의 크기가 원본 셀과 다릅니다."
  );
  assert.equal(existsSync(path.join(overrides, "f01.png")), false);
  assert.equal(existsSync(path.join(overrides, "f02.png")), false);
  const after = await readProject(project.id);
  assert.equal(after.frames[0].override, null);
  assert.equal(after.frames[1].override, null);
});

test("default and legacy candidates keep cell alignment disabled, while updates persist it", async t => {
  await useTempDataDir(t);
  const project = await projectForCandidates();
  const legacy = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 0, image: await gammaCell([200, 50, 30]) }]
  });
  assert.equal(legacy.cellAligned, false);
  const legacyPath = path.join(projectDir(project.id), "candidates", legacy.id, "candidate.json");
  const legacyJson = JSON.parse(await fs.readFile(legacyPath, "utf8"));
  delete legacyJson.cellAligned;
  await fs.writeFile(legacyPath, `${JSON.stringify(legacyJson)}\n`);
  assert.equal((await readCandidate(project.id, legacy.id)).cellAligned, false);

  const updated = await updateCandidate(project.id, legacy.id, current => ({ ...current, cellAligned: true }));
  assert.equal(updated.cellAligned, true);
  assert.equal(JSON.parse(await fs.readFile(legacyPath, "utf8")).cellAligned, true);

  const resized = await createCandidate(project.id, {
    mode: "upload",
    frames: [{ index: 1, image: await sharp(await gammaCell([30, 200, 50])).resize(96, 96).png().toBuffer() }]
  });
  assert.equal(resized.cellAligned, false);
  await applyCandidateFrames(project.id, resized.id);
  const override = await sharp(await fs.readFile(path.join(projectDir(project.id), "overrides", "f02.png"))).metadata();
  assert.deepEqual([override.width, override.height], [48, 48]);
});
