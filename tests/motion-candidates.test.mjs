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
  readCandidate
} from "@/lib/motion/candidates";
import { createProject, projectDir, readAssetFile } from "@/lib/motion/storage";

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
