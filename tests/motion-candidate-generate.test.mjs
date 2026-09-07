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
  createCandidate,
  readCandidate
} from "@/lib/motion/candidates";
import { createProject, projectDir, readOrientedCell } from "@/lib/motion/storage";
import { runCandidateWorker } from "../scripts/motion-candidate-worker.mjs";

let hooksRegistered = false;
let candidateGenerateModule;

function installHooks() {
  if (hooksRegistered) return;
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
  hooksRegistered = true;
}

async function candidateGenerate() {
  installHooks();
  candidateGenerateModule ??= import("../lib/motion/candidate-generate.ts");
  return candidateGenerateModule;
}

async function useTempDataDir(t) {
  const previous = process.env.SIONBANANA_DATA_DIR;
  const directory = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-motion-candidate-generate-"));
  process.env.SIONBANANA_DATA_DIR = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.SIONBANANA_DATA_DIR;
    else process.env.SIONBANANA_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  });
}

async function gammaCell(color = [20, 80, 180]) {
  const width = 48;
  const height = 48;
  const pixels = Buffer.alloc(width * height * 4);
  const set = (x, y) => {
    const offset = (y * width + x) * 4;
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
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function sheetWithCells(cellCount, cols = cellCount, rows = 1) {
  const width = cols * 48;
  const height = rows * 48;
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 255;
    pixels[offset + 1] = 0;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = 255;
  }
  const cells = await Promise.all(
    Array.from({ length: cellCount }, (_, index) => gammaCell([20 + index * 15, 80, 180]))
  );
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .composite(
      cells.map((input, index) => ({
        input,
        left: (index % cols) * 48,
        top: Math.floor(index / cols) * 48
      }))
    )
    .png()
    .toBuffer();
}

async function projectForCandidates(frameCount = 2) {
  return createProject({
    name: "Candidate generation gamma",
    sheetBuffer: await sheetWithCells(frameCount),
    sliceMode: "grid",
    grid: { cols: frameCount, rows: 1, gutter: 0, remainderPolicy: "distribute" },
    matte: { mode: "keyColor", keyColor: "#FF00FF", tolerance: 0, softness: 0, despill: false, choke: 0 }
  });
}

function workerResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("buildStripPlan selects adjacent anchors and a two-row layout when needed", async () => {
  const { buildStripPlan } = await candidateGenerate();
  assert.deepEqual(buildStripPlan({ frameCount: 8, start: 4, end: 7 }), {
    anchorBefore: 3,
    anchorAfter: null,
    cells: 5,
    cols: 3,
    rows: 2
  });
  assert.deepEqual(buildStripPlan({ frameCount: 8, start: 0, end: 1 }), {
    anchorBefore: null,
    anchorAfter: 2,
    cells: 3,
    cols: 3,
    rows: 1
  });
  assert.deepEqual(buildStripPlan({ frameCount: 8, start: 0, end: 7 }), {
    anchorBefore: null,
    anchorAfter: null,
    cells: 8,
    cols: 4,
    rows: 2
  });
});

test("candidate prompts include editable-mask protection, anchors, and separated strip cells", async () => {
  const { buildMaskEditPrompt, buildStripPlan, buildStripPrompt } = await candidateGenerate();
  const mask = buildMaskEditPrompt({ instruction: "repair the hand", protect: ["hat", "sword"] });
  // 마스크는 도구 파라미터로만 전달한다. 프롬프트가 마스크·투명 영역을 언급하면 모델이 배경을
  // 편집 대상으로 오해해 전체를 다시 그린다(CEO 실측 2026-09-07).
  assert.doesNotMatch(mask, /mask|editable area/i);
  assert.match(mask, /repair the hand/);
  assert.match(mask, /Keep hat, sword exactly as they are/);
  assert.match(mask, /outline style must stay pixel-identical/);
  assert.match(mask, /Do not add or paint any background/);
  // 키 컬러가 있는 프로젝트에서는 배경을 그 색으로 유지시키고 저장 직전에 다시 키잉한다.
  const keyed = buildMaskEditPrompt({ instruction: "repair the hand", protect: [], backgroundHex: "#00FF00" });
  assert.match(keyed, /flat solid #00FF00 chroma color/);
  assert.doesNotMatch(keyed, /mask|editable area/i);
  const strip = buildStripPrompt({
    plan: buildStripPlan({ frameCount: 4, start: 1, end: 2 }),
    instruction: "smooth the jump",
    protect: ["face"],
    subjectType: "object"
  });
  assert.match(strip, /Cells must not touch each other/);
  assert.match(strip, /reference image 2 \(anchor\)/);
  assert.match(strip, /reference image 3 \(anchor\)/);
  assert.match(strip, /Keep face unchanged/);
});

test("autoMaskFromCell makes only the alpha bounding box plus margin editable", async () => {
  const { autoMaskFromCell } = await candidateGenerate();
  const mask = await autoMaskFromCell(await gammaCell());
  const raw = await sharp(mask).raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => raw.data[(y * raw.info.width + x) * 4 + 3];
  assert.equal(alphaAt(0, 0), 255);
  assert.equal(alphaAt(6, 4), 0);
  assert.equal(alphaAt(34, 44), 0);
});

test("compositeInsideMask preserves mask exteriors exactly and rejects mismatched masks", async () => {
  const { compositeInsideMask } = await candidateGenerate();
  const width = 4;
  const height = 2;
  const originalPixels = Buffer.alloc(width * height * 4);
  const maskPixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (x < width / 2) {
        originalPixels[offset + 2] = 255;
        originalPixels[offset + 3] = 255;
        maskPixels[offset + 3] = 255;
      }
    }
  }
  const original = await sharp(originalPixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const edited = await sharp({
    create: { width: width * 2, height: height * 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } }
  })
    .png()
    .toBuffer();
  const mask = await sharp(maskPixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const composite = await compositeInsideMask({ original, edited, mask, feather: 0 });
  const raw = await sharp(composite).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([raw.info.width, raw.info.height], [width, height]);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const pixel = [...raw.data.subarray(offset, offset + 4)];
      if (x < width / 2) {
        assert.deepEqual(pixel, [...originalPixels.subarray(offset, offset + 4)]);
      } else {
        assert.deepEqual(pixel, [255, 0, 0, 255]);
      }
    }
  }
  await assert.rejects(
    compositeInsideMask({
      original,
      edited,
      mask: await sharp({ create: { width: width + 1, height, channels: 4, background: "black" } }).png().toBuffer()
    }),
    RangeError
  );

  const hiddenOriginal = await sharp(Buffer.from([13, 17, 23, 0]), {
    raw: { width: 1, height: 1, channels: 4 }
  })
    .png()
    .toBuffer();
  const hiddenMask = await sharp(Buffer.from([0, 0, 0, 255]), {
    raw: { width: 1, height: 1, channels: 4 }
  })
    .png()
    .toBuffer();
  const hiddenComposite = await compositeInsideMask({ original: hiddenOriginal, edited, mask: hiddenMask });
  assert.deepEqual([...await sharp(hiddenOriginal).ensureAlpha().raw().toBuffer()], [13, 17, 23, 0]);
  assert.deepEqual([...await sharp(hiddenComposite).ensureAlpha().raw().toBuffer()], [13, 17, 23, 0]);

  const featherMaskPixels = Buffer.alloc(7 * 4);
  for (let x = 0; x < 3; x += 1) featherMaskPixels[x * 4 + 3] = 255;
  const featherComposite = await compositeInsideMask({
    original: await sharp({ create: { width: 7, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer(),
    edited: await sharp({ create: { width: 7, height: 1, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(),
    mask: await sharp(featherMaskPixels, { raw: { width: 7, height: 1, channels: 4 } }).png().toBuffer()
  });
  const featherRaw = await sharp(featherComposite).ensureAlpha().raw().toBuffer();
  assert.ok(featherRaw[3 * 4 + 3] > 0 && featherRaw[3 * 4 + 3] < 255);

  const blended = await compositeInsideMask({
    original: await sharp(Buffer.from([0, 0, 255, 128]), { raw: { width: 1, height: 1, channels: 4 } }).png().toBuffer(),
    edited: await sharp(Buffer.from([255, 0, 0, 255]), { raw: { width: 1, height: 1, channels: 4 } }).png().toBuffer(),
    mask: await sharp(Buffer.from([0, 0, 0, 128]), { raw: { width: 1, height: 1, channels: 4 } }).png().toBuffer(),
    feather: 0
  });
  assert.deepEqual([...await sharp(blended).ensureAlpha().raw().toBuffer()], [169, 0, 86, 191]);
});

test("mask candidates use oriented cells and stored masks, then persist a ready frame", async t => {
  await useTempDataDir(t);
  const { runCandidate } = await candidateGenerate();
  const project = await projectForCandidates();
  const storedMaskPixels = Buffer.alloc(48 * 48 * 4);
  for (let y = 0; y < 48; y += 1) {
    for (let x = 0; x < 24; x += 1) storedMaskPixels[(y * 48 + x) * 4 + 3] = 255;
  }
  const storedMask = await sharp(storedMaskPixels, { raw: { width: 48, height: 48, channels: 4 } }).png().toBuffer();
  const candidate = await createCandidate(project.id, {
    mode: "mask",
    frames: [{ index: 1, mask: storedMask }],
    instruction: "repair the arm",
    protect: ["face"]
  });
  const calls = [];
  const result = await runCandidate(project.id, candidate.id, {
    editImage: async input => {
      calls.push(input);
      return gammaCell([200, 50, 30]);
    },
    generateSheet: async () => {
      throw new Error("strip generation must not be called");
    }
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(await sharp(calls[0].image).metadata().then(meta => [meta.width, meta.height]), [48, 48]);
  assert.deepEqual(await sharp(calls[0].mask).metadata().then(meta => [meta.width, meta.height]), [48, 48]);
  assert.match(calls[0].prompt, /repair the arm/);
  assert.match(calls[0].prompt, /Keep face exactly as they are/);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.metrics, { mode: "mask", frames: 1, retries: 0, maskComposite: true, feather: 2 });
  const candidateFrame = path.join(projectDir(project.id), "candidates", candidate.id, "frames", "f02.png");
  assert.equal(existsSync(candidateFrame), true);
  const [original, generated] = await Promise.all([
    readOrientedCell(project.id, 1).then(cell => sharp(cell.buffer).ensureAlpha().raw().toBuffer()),
    sharp(await fs.readFile(candidateFrame)).ensureAlpha().raw().toBuffer()
  ]);
  for (let y = 0; y < 48; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      const offset = (y * 48 + x) * 4;
      assert.deepEqual([...generated.subarray(offset, offset + 4)], [...original.subarray(offset, offset + 4)]);
    }
  }
});

test("mask candidates derive a mask when absent and retry one failed image edit", async t => {
  await useTempDataDir(t);
  const { runCandidate } = await candidateGenerate();
  const project = await projectForCandidates();
  const candidate = await createCandidate(project.id, { mode: "mask", frames: [{ index: 0 }] });
  const calls = [];
  let attempts = 0;
  const result = await runCandidate(project.id, candidate.id, {
    editImage: async input => {
      calls.push(input);
      attempts += 1;
      if (attempts === 1) throw new Error("temporary image failure");
      return gammaCell();
    },
    generateSheet: async () => {
      throw new Error("unexpected strip call");
    }
  });
  const mask = await sharp(calls[0].mask).raw().toBuffer({ resolveWithObject: true });
  assert.equal(mask.data[3], 255);
  assert.equal(mask.data[(4 * mask.info.width + 6) * 4 + 3], 0);
  assert.equal(calls.length, 2);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.metrics, { mode: "mask", frames: 1, retries: 1, maskComposite: true, feather: 2 });
});

test("mask candidates record a frame-specific failure after the second failed edit", async t => {
  await useTempDataDir(t);
  const { runCandidate } = await candidateGenerate();
  const project = await projectForCandidates();
  const candidate = await createCandidate(project.id, { mode: "mask", frames: [{ index: 0 }] });
  let calls = 0;
  const result = await runCandidate(project.id, candidate.id, {
    editImage: async () => {
      calls += 1;
      throw new Error("upstream failed");
    },
    generateSheet: async () => {
      throw new Error("unexpected strip call");
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "failed");
  assert.match(result.reason, /Frame 1 edit failed: upstream failed/);
  assert.equal((await readCandidate(project.id, candidate.id)).status, "failed");
});

test("strip candidates keep anchors as references and save only middle cells", async t => {
  await useTempDataDir(t);
  const { runCandidate } = await candidateGenerate();
  const project = await projectForCandidates(4);
  const candidate = await createCandidate(project.id, {
    mode: "strip",
    frames: [{ index: 1 }, { index: 2 }],
    instruction: "continue the motion"
  });
  const calls = [];
  const result = await runCandidate(project.id, candidate.id, {
    editImage: async () => {
      throw new Error("unexpected mask call");
    },
    generateSheet: async input => {
      calls.push(input);
      return sheetWithCells(4);
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].references.length, 3);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.metrics, {
    mode: "strip",
    attempts: 1,
    sliceConfidence: 1,
    cols: 4,
    rows: 1,
    anchors: { before: 0, after: 3 }
  });
  const framesDirectory = path.join(projectDir(project.id), "candidates", candidate.id, "frames");
  assert.equal(existsSync(path.join(framesDirectory, "f02.png")), true);
  assert.equal(existsSync(path.join(framesDirectory, "f03.png")), true);
  assert.equal(existsSync(path.join(framesDirectory, "f01.png")), false);
  assert.equal(existsSync(path.join(framesDirectory, "f04.png")), false);
});

test("strip candidates retry failed automatic slicing up to three attempts", async t => {
  await useTempDataDir(t);
  const { runCandidate } = await candidateGenerate();
  const project = await projectForCandidates(4);
  const candidate = await createCandidate(project.id, { mode: "strip", frames: [{ index: 1 }, { index: 2 }] });
  const badSheet = await sheetWithCells(3);
  let calls = 0;
  const result = await runCandidate(project.id, candidate.id, {
    editImage: async () => {
      throw new Error("unexpected mask call");
    },
    generateSheet: async () => {
      calls += 1;
      return calls < 3 ? badSheet : sheetWithCells(4);
    }
  });
  assert.equal(calls, 3);
  assert.equal(result.status, "ready");
  assert.equal(result.metrics.attempts, 3);
  assert.equal("layoutFallback" in result.metrics, false);
});

test("strip candidates use a grid fallback after three failed automatic slices", async t => {
  await useTempDataDir(t);
  const { runCandidate } = await candidateGenerate();
  const project = await projectForCandidates(4);
  const candidate = await createCandidate(project.id, { mode: "strip", frames: [{ index: 1 }, { index: 2 }] });
  const badSheet = await sheetWithCells(3);
  let calls = 0;
  const result = await runCandidate(project.id, candidate.id, {
    editImage: async () => {
      throw new Error("unexpected mask call");
    },
    generateSheet: async () => {
      calls += 1;
      return badSheet;
    }
  });
  assert.equal(calls, 3);
  assert.equal(result.status, "ready");
  assert.equal(result.metrics.layoutFallback, "grid");
  assert.equal(existsSync(path.join(projectDir(project.id), "candidates", candidate.id, "frames", "f02.png")), true);
  assert.equal(existsSync(path.join(projectDir(project.id), "candidates", candidate.id, "frames", "f03.png")), true);
});

test("strip candidates keep row-major middle cells when an odd strip leaves an unused grid cell", async t => {
  await useTempDataDir(t);
  const { runCandidate } = await candidateGenerate();
  const project = await projectForCandidates(8);
  const candidate = await createCandidate(project.id, {
    mode: "strip",
    frames: [{ index: 4 }, { index: 5 }, { index: 6 }, { index: 7 }]
  });
  const result = await runCandidate(project.id, candidate.id, {
    editImage: async () => {
      throw new Error("unexpected mask call");
    },
    generateSheet: async () => sheetWithCells(5, 3, 2)
  });
  assert.equal(result.status, "ready");
  assert.equal(result.metrics.cols, 3);
  assert.equal(result.metrics.rows, 2);
  for (const name of ["f05.png", "f06.png", "f07.png", "f08.png"]) {
    assert.equal(existsSync(path.join(projectDir(project.id), "candidates", candidate.id, "frames", name)), true);
  }
});

test("callCodexResponses sends an image mask to the image-generation tool", async t => {
  installHooks();
  const { callCodexResponses } = await import("../lib/codex-fetch.ts");
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    const response = {
      output: [{ type: "image_generation_call", result: "aGVsbG8=", output_format: "png" }],
      status: "completed"
    };
    return new Response(`event: response.completed\ndata: ${JSON.stringify({ response })}\n\n`, {
      headers: { "content-type": "text/event-stream" }
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const result = await callCodexResponses({
    mode: "image",
    input: [{ role: "user", content: "edit it" }],
    imageOptions: { input_image_mask: "data:image/png;base64,bWFzaw==" }
  });
  assert.deepEqual(requestBody.tools[0].input_image_mask, {
    image_url: "data:image/png;base64,bWFzaw=="
  });
  assert.equal(result.images[0].b64, "aGVsbG8=");
});

test("candidate worker performs one run request and reports HTTP and network errors", async () => {
  const calls = [];
  const success = await runCandidateWorker({
    projectId: "project-worker",
    candidateId: "candidate-worker",
    baseUrl: "http://localhost/",
    fetchImpl: async (...args) => {
      calls.push(args);
      return workerResponse({ ok: true, candidate: { id: "candidate-worker" } });
    }
  });
  assert.deepEqual(success, { ok: true, status: 200 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "http://localhost/api/motion/projects/project-worker/candidates/candidate-worker/run");
  assert.equal(calls[0][1].method, "POST");

  const httpError = await runCandidateWorker({
    projectId: "project-worker",
    candidateId: "candidate-worker",
    baseUrl: "http://localhost",
    fetchImpl: async () => workerResponse({ ok: false, reason: "generation failed" }, 502)
  });
  assert.deepEqual(httpError, { ok: false, status: 502, reason: "generation failed" });

  const networkError = await runCandidateWorker({
    projectId: "project-worker",
    candidateId: "candidate-worker",
    baseUrl: "http://localhost",
    fetchImpl: async () => {
      throw new Error("network unavailable");
    }
  });
  assert.deepEqual(networkError, { ok: false, status: 0, reason: "network unavailable" });
});

test("spawnCandidateWorker uses the injected detached worker spawn implementation", async () => {
  const { spawnCandidateWorker } = await candidateGenerate();
  const calls = [];
  let unrefCalled = false;
  spawnCandidateWorker(
    "project-worker",
    "candidate-worker",
    "http://localhost",
    (...args) => {
      calls.push(args);
      return { unref: () => { unrefCalled = true; } };
    }
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], process.execPath);
  assert.match(calls[0][1][0], /scripts\/motion-candidate-worker\.mjs$/);
  assert.deepEqual(calls[0][1].slice(1), ["project-worker", "candidate-worker", "http://localhost"]);
  assert.equal(calls[0][2].detached, true);
  assert.equal(calls[0][2].stdio, "ignore");
  assert.equal(unrefCalled, true);
});

test("candidate POST starts mask workers unless start is false", async t => {
  await useTempDataDir(t);
  installHooks();
  const { NextRequest } = await import("next/server");
  const candidates = await import("../app/api/motion/projects/[id]/candidates/route.ts");
  const project = await projectForCandidates();
  const calls = [];
  const request = body =>
    new NextRequest("http://localhost/api/motion/projects/id/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  const started = await candidates.POST(
    request({ mode: "mask", frames: [{ index: 0 }] }),
    { params: { id: project.id } },
    { spawnCandidateWorker: (...args) => calls.push(args) }
  );
  assert.equal(started.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], project.id);
  assert.match(calls[0][1], /^cand-/);
  assert.equal(calls[0][2], "http://localhost");

  const stopped = await candidates.POST(
    request({ mode: "mask", frames: [{ index: 1 }], start: false }),
    { params: { id: project.id } },
    { spawnCandidateWorker: (...args) => calls.push(args) }
  );
  assert.equal(stopped.status, 201);
  assert.equal(calls.length, 1);
});

test("failed mask candidates may be rerun and become ready", async t => {
  await useTempDataDir(t);
  const { runCandidate } = await candidateGenerate();
  const project = await projectForCandidates();
  const candidate = await createCandidate(project.id, { mode: "mask", frames: [{ index: 0 }] });
  const failed = await runCandidate(project.id, candidate.id, {
    editImage: async () => {
      throw new Error("first run failed");
    },
    generateSheet: async () => sheetWithCells(2)
  });
  assert.equal(failed.status, "failed");
  const rerun = await runCandidate(project.id, candidate.id, {
    editImage: async () => gammaCell(),
    generateSheet: async () => sheetWithCells(2)
  });
  assert.equal(rerun.status, "ready");
  assert.equal(rerun.metrics.mode, "mask");
});

test("stale running candidates are claimed by a new run", async t => {
  await useTempDataDir(t);
  const { runCandidate } = await candidateGenerate();
  const project = await projectForCandidates();
  const candidate = await createCandidate(project.id, { mode: "mask", frames: [{ index: 0 }] });
  const startedAt = new Date("2026-01-01T00:00:00.000Z");
  await (await import("@/lib/motion/candidates")).updateCandidate(project.id, candidate.id, current => ({
    ...current,
    status: "running",
    metrics: { startedAtIso: startedAt.toISOString() }
  }));
  const rerun = await runCandidate(project.id, candidate.id, {
    editImage: async () => gammaCell(),
    generateSheet: async () => sheetWithCells(2),
    now: () => new Date("2026-01-01T00:03:00.001Z")
  });
  assert.equal(rerun.status, "ready");
});

test("full-range strips and tampered saved masks fail without generating a candidate frame", async t => {
  await useTempDataDir(t);
  const { runCandidate } = await candidateGenerate();
  const project = await projectForCandidates();
  const fullRange = await createCandidate(project.id, {
    mode: "strip",
    frames: [{ index: 0 }, { index: 1 }]
  });
  let stripCalls = 0;
  const stripResult = await runCandidate(project.id, fullRange.id, {
    editImage: async () => gammaCell(),
    generateSheet: async () => {
      stripCalls += 1;
      return sheetWithCells(2);
    }
  });
  assert.equal(stripResult.status, "failed");
  assert.match(stripResult.reason, /strip mode needs a neighboring frame outside the range/);
  assert.equal(stripCalls, 0);

  const maskCandidate = await createCandidate(project.id, {
    mode: "mask",
    frames: [{ index: 0, mask: await gammaCell() }]
  });
  await fs.writeFile(
    path.join(projectDir(project.id), "candidates", maskCandidate.id, "masks", "f01.png"),
    await sharp({ create: { width: 8, height: 8, channels: 4, background: "black" } }).png().toBuffer()
  );
  let editCalls = 0;
  const maskResult = await runCandidate(project.id, maskCandidate.id, {
    editImage: async () => {
      editCalls += 1;
      return gammaCell();
    },
    generateSheet: async () => sheetWithCells(2)
  });
  assert.equal(maskResult.status, "failed");
  assert.match(maskResult.reason, /Frame 1 edit failed: Mask for frame 1 does not match/);
  assert.equal(editCalls, 0);
});

test("fresh running candidates conflict instead of starting a second generation", async t => {
  await useTempDataDir(t);
  const { runCandidate } = await candidateGenerate();
  const project = await projectForCandidates();
  const candidate = await createCandidate(project.id, { mode: "mask", frames: [{ index: 0 }] });
  const running = await import("@/lib/motion/candidates");
  await running.updateCandidate(project.id, candidate.id, current => ({
    ...current,
    status: "running",
    metrics: { startedAtIso: new Date().toISOString() }
  }));
  await assert.rejects(
    runCandidate(project.id, candidate.id, {
      editImage: async () => gammaCell(),
      generateSheet: async () => sheetWithCells(2)
    }),
    error => error instanceof CandidateStorageError && error.status === 409
  );
});
