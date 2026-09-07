import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  createMotionSet,
  createMotion,
  exportMotionSet,
  getMotionSet,
  getMotion,
  listMotionSets,
  listMotion,
  motionCreateInputSchema,
  motionSetCreateInputSchema,
  motionSetExportInputSchema,
  motionSetGetInputSchema,
  motionSetListInputSchema,
  TOOL_NAMES
} from "../scripts/mcp-server.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function motionFixture(t, mock = false) {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sionbanana-motion-mcp-"));
  t.after(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
  });
  return {
    mock,
    repoRoot: REPO_ROOT,
    dataRoot
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("create_motion mock returns a running job without a worker", async t => {
  const context = await motionFixture(t, true);
  const result = await createMotion(
    {
      name: "mock walk",
      grid: { cols: 4, rows: 2 },
      source: {
        type: "generate",
        prompt: "banana mascot walking",
        subjectType: "character"
      },
      waitMs: 0
    },
    context
  );

  assert.equal(result.ok, true);
  assert.match(result.jobId, /^motion-job-[0-9]+-[0-9a-f-]+$/);
  assert.deepEqual(result, {
    ok: true,
    jobId: result.jobId,
    status: "running",
    mocked: true
  });
  await assert.rejects(fs.access(path.join(context.dataRoot, "motion-jobs")));
});

test("create_motion input accepts new presets and rejects unknown actions", () => {
  for (const action of ["reload", "getup"]) {
    const result = motionCreateInputSchema.safeParse({
      name: action,
      grid: { cols: 4, rows: 2 },
      source: { type: "generate", prompt: action, action }
    });
    assert.equal(result.success, true, action);
  }
  assert.equal(
    motionCreateInputSchema.safeParse({
      name: "dance",
      grid: { cols: 4, rows: 2 },
      source: { type: "generate", prompt: "dance", action: "dance" }
    }).success,
    false
  );
});

test("create_motion sends advanced motion controls to the route request body", async t => {
  const context = await motionFixture(t);
  context.spawnImpl = () => ({
    once() {
      return this;
    },
    unref() {}
  });
  const result = await createMotion(
    {
      name: "advanced reload",
      grid: { cols: 4, rows: 2 },
      source: { type: "generate", prompt: "reload", action: "reload" },
      advanced: {
        autoFlipRows: true,
        autoExcludeRepeatedRows: true,
        fps: 8,
        loop: "once"
      }
    },
    context
  );
  assert.equal(result.ok, true);
  const job = JSON.parse(
    await fs.readFile(path.join(context.dataRoot, "motion-jobs", `${result.jobId}.json`), "utf8")
  );
  assert.deepEqual(
    {
      autoFlipRows: job.request.autoFlipRows,
      autoExcludeRepeatedRows: job.request.autoExcludeRepeatedRows,
      fps: job.request.fps,
      loop: job.request.loop
    },
    {
      autoFlipRows: true,
      autoExcludeRepeatedRows: true,
      fps: 8,
      loop: "once"
    }
  );
});

test("get_motion resolves an expired running job without a worker", async t => {
  const context = await motionFixture(t);
  const jobId = "motion-job-expired";
  const jobPath = path.join(context.dataRoot, "motion-jobs", `${jobId}.json`);
  await writeJson(jobPath, {
    status: "running",
    createdAtIso: "2025-01-01T00:00:00.000Z",
    deadlineIso: "2025-01-01T00:00:01.000Z",
    request: {}
  });

  const result = await getMotion({ jobId, waitMs: 0 }, context);
  assert.equal(result.ok, true);
  assert.equal(result.status, "failed");
  assert.match(result.reason, /deadline exceeded/);

  const persisted = JSON.parse(await fs.readFile(jobPath, "utf8"));
  assert.equal(persisted.status, "failed");
  assert.match(persisted.reason, /worker may have died/);
});

test("get_motion fails a running job with an invalid deadline", async t => {
  const context = await motionFixture(t);
  const jobId = "motion-job-invalid-deadline";
  const jobPath = path.join(context.dataRoot, "motion-jobs", `${jobId}.json`);
  await writeJson(jobPath, {
    status: "running",
    createdAtIso: "2026-07-22T00:00:00.000Z",
    deadlineIso: "not-a-date",
    request: {}
  });

  const result = await getMotion({ jobId, waitMs: 0 }, context);
  assert.equal(result.ok, true);
  assert.equal(result.status, "failed");
  assert.match(result.reason, /invalid or missing deadlineIso/);

  const persisted = JSON.parse(await fs.readFile(jobPath, "utf8"));
  assert.equal(persisted.status, "failed");
  assert.match(persisted.reason, /refusing to leave job running/);
});

test("get_motion returns a ready project and absolute asset paths", async t => {
  const context = await motionFixture(t);
  const jobId = "motion-job-ready";
  const projectId = "motion-project-ready";
  const project = {
    id: projectId,
    name: "Ready walk",
    createdAtIso: "2026-07-22T00:00:00.000Z",
    sliceConfidence: 0.91,
    canvas: { w: 128, h: 128 },
    mirrorDetection: {
      enabled: true,
      rows: [{ mirrored: false, score: 0.1 }, { mirrored: true, score: 0.98 }]
    },
    duplicateDetection: {
      enabled: true,
      rows: [{ repeated: false, ratio: 0.1 }, { repeated: true, ratio: 0.99 }],
      excludedFrames: [2, 3]
    },
    frames: [{ index: 0 }, { index: 1 }]
  };
  await writeJson(path.join(context.dataRoot, "motion-jobs", `${jobId}.json`), {
    status: "ready",
    createdAtIso: "2026-07-22T00:00:00.000Z",
    deadlineIso: "2026-07-22T00:10:00.000Z",
    projectId,
    sliceConfidence: 0.91
  });
  await writeJson(path.join(context.dataRoot, "motion-assets", projectId, "project.json"), project);

  const result = await getMotion({ jobId, waitMs: 0 }, context);
  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.project, project);
  assert.deepEqual(result.mirrorDetection, { mirroredRows: [1] });
  assert.deepEqual(result.duplicateDetection, { repeatedRows: [1], excludedFrames: [2, 3] });
  assert.equal(result.sliceConfidence, 0.91);
  assert.equal(path.isAbsolute(result.paths.dir), true);
  assert.equal(path.isAbsolute(result.paths.sheet), true);
  assert.equal(path.isAbsolute(result.paths.project), true);
  assert.equal(result.paths.frames.length, 2);
  assert.equal(result.paths.frames.every(framePath => path.isAbsolute(framePath)), true);
});

test("list_motion enumerates jobs and projects", async t => {
  const context = await motionFixture(t);
  const jobId = "motion-job-listed";
  const projectId = "motion-project-listed";
  await writeJson(path.join(context.dataRoot, "motion-jobs", `${jobId}.json`), {
    status: "ready",
    createdAtIso: new Date().toISOString(),
    deadlineIso: new Date(Date.now() + 60_000).toISOString(),
    projectId
  });
  await writeJson(path.join(context.dataRoot, "motion-assets", projectId, "project.json"), {
    id: projectId,
    name: "Listed motion",
    createdAtIso: "2026-07-22T00:00:00.000Z",
    frames: []
  });

  const result = await listMotion({ limit: 20 }, context);
  assert.equal(result.ok, true);
  assert.deepEqual(result.jobs, [
    {
      jobId,
      status: "ready",
      projectId,
      createdAtIso: result.jobs[0].createdAtIso
    }
  ]);
  assert.deepEqual(result.projects, [
    {
      id: projectId,
      name: "Listed motion",
      createdAtIso: "2026-07-22T00:00:00.000Z",
      dir: path.join(context.dataRoot, "motion-assets", projectId)
    }
  ]);
});

test("get_motion rejects traversal in jobId", async t => {
  const context = await motionFixture(t);
  const result = await getMotion({ jobId: "../motion-job", waitMs: 0 }, context);
  assert.deepEqual(result, {
    ok: false,
    reason: "invalid jobId"
  });
});

test("motion set schemas are strict and TOOL_NAMES exposes all four set tools", () => {
  const input = {
    name: "Banana actions",
    base: { description: "A banana hero", reference: { type: "imageId", imageId: "banana-source" } },
    common: { cols: 2, rows: 2 },
    members: [{ action: "walk" }]
  };
  assert.equal(motionSetCreateInputSchema.safeParse(input).success, true);
  assert.equal(motionSetCreateInputSchema.safeParse({ ...input, unexpected: true }).success, false);
  assert.equal(motionSetGetInputSchema.safeParse({ setId: "motion-set-1" }).success, true);
  assert.equal(motionSetGetInputSchema.safeParse({ setId: "../motion-set" }).success, false);
  assert.equal(motionSetListInputSchema.safeParse({}).success, true);
  assert.equal(motionSetListInputSchema.safeParse({ limit: 1 }).success, false);
  assert.equal(
    motionSetExportInputSchema.safeParse({ setId: "motion-set-1", includeGif: false }).success,
    true
  );
  for (const name of ["create_motion_set", "get_motion_set", "list_motion_sets", "export_motion_set"]) {
    assert.equal(TOOL_NAMES.includes(name), true, name);
  }
});

test("create_motion_set resolves imageId and upload references into the sets POST body", async t => {
  const context = await motionFixture(t);
  const imageId = "banana-source";
  const png = await sharp({
    create: { width: 2, height: 2, channels: 4, background: { r: 240, g: 210, b: 50, alpha: 1 } }
  })
    .png()
    .toBuffer();
  await fs.mkdir(path.join(context.dataRoot, "images", "2026-09"), { recursive: true });
  await fs.writeFile(path.join(context.dataRoot, "images", "2026-09", `${imageId}.png`), png);
  const requests = [];
  context.fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith("/api/health")) return jsonResponse({ ok: true });
    if (value.endsWith("/api/motion/sets") && options.method === "POST") {
      const request = JSON.parse(options.body);
      requests.push(request);
      return jsonResponse({
        ok: true,
        set: {
          id: `motion-set-${requests.length}`,
          status: "pending",
          members: request.members.map(member => ({ action: member.action, status: "pending" }))
        }
      }, 201);
    }
    throw new Error(`unexpected URL: ${value}`);
  };
  const common = { cols: 2, rows: 2, fps: 12 };
  const imageIdResult = await createMotionSet(
    {
      name: "Image id actions",
      base: { description: "A banana hero", reference: { type: "imageId", imageId } },
      common,
      members: [{ action: "walk" }],
      start: false
    },
    context
  );
  const uploadResult = await createMotionSet(
    {
      name: "Upload actions",
      base: {
        description: "A banana hero",
        reference: { type: "upload", dataUrl: `data:image/png;base64,${png.toString("base64")}` }
      },
      common,
      members: [{ action: "jump" }]
    },
    context
  );
  assert.deepEqual(imageIdResult, {
    ok: true,
    setId: "motion-set-1",
    status: "pending",
    members: [{ action: "walk", status: "pending" }]
  });
  assert.equal(uploadResult.ok, true);
  assert.equal(requests.length, 2);
  assert.match(requests[0].base.referenceImage, /^data:image\/png;base64,/);
  assert.match(requests[1].base.referenceImage, /^data:image\/png;base64,/);
  assert.equal(requests[0].start, false);
  assert.equal(Object.hasOwn(requests[1], "start"), false);
  assert.equal(Object.hasOwn(requests[0].base, "reference"), false);
});

test("create_motion_set rejects an oversized imageId before contacting the motion server", async t => {
  const context = await motionFixture(t);
  const imageId = "oversized-source";
  const imagePath = path.join(context.dataRoot, "images", "2026-09", `${imageId}.png`);
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.writeFile(imagePath, Buffer.from([0]));
  await fs.truncate(imagePath, 8 * 1024 * 1024 + 1);
  let fetchCalls = 0;
  context.fetchImpl = async () => {
    fetchCalls += 1;
    throw new Error("fetch must not run for an oversized imageId");
  };

  const result = await createMotionSet(
    {
      name: "Oversized image",
      base: { description: "A banana hero", reference: { type: "imageId", imageId } },
      common: { cols: 1, rows: 1 },
      members: [{ action: "idle" }]
    },
    context
  );

  assert.equal(result.ok, false);
  assert.match(result.reason, /imageId source exceeds the 8MB limit/);
  assert.equal(fetchCalls, 0);
});

test("get_motion_set reads ready project effective frames and row metadata", async t => {
  const context = await motionFixture(t);
  const projectId = "motion-ready-set-project";
  await writeJson(path.join(context.dataRoot, "motion-assets", projectId, "project.json"), {
    id: projectId,
    frames: [{ excluded: false }, { excluded: true }, { excluded: false }],
    mirrorDetection: { rows: [{ mirrored: false }, { mirrored: true }] },
    duplicateDetection: { rows: [{ repeated: true }, { repeated: false }] }
  });
  context.fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith("/api/health")) return jsonResponse({ ok: true });
    if (value.endsWith("/api/motion/sets/motion-set-ready")) {
      return jsonResponse({
        ok: true,
        set: {
          id: "motion-set-ready",
          status: "partial",
          members: [
            { action: "walk", status: "ready", projectId, reason: null },
            { action: "jump", status: "failed", projectId: null, reason: "generation-error" }
          ]
        }
      });
    }
    throw new Error(`unexpected URL: ${value}`);
  };
  assert.deepEqual(await getMotionSet({ setId: "motion-set-ready" }, context), {
    ok: true,
    setId: "motion-set-ready",
    status: "partial",
    members: [
      {
        action: "walk",
        status: "ready",
        projectId,
        reason: null,
        effectiveFrames: 2,
        repeatedRows: [0],
        mirroredRows: [1]
      },
      { action: "jump", status: "failed", projectId: null, reason: "generation-error" }
    ]
  });
});

test("list_motion_sets preserves the API summary and export_motion_set persists streamed ZIP data", async t => {
  const context = await motionFixture(t);
  const summary = {
    id: "motion-set-listed",
    name: "Listed set",
    createdAtIso: "2026-09-07T00:00:00.000Z",
    updatedAtIso: "2026-09-07T00:00:00.000Z",
    status: "ready",
    members: [{ action: "walk", status: "ready", projectId: "motion-project-1" }]
  };
  const zip = Buffer.from("fixture motion set zip bytes");
  context.fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith("/api/health")) return jsonResponse({ ok: true });
    if (value.endsWith("/api/motion/sets")) return jsonResponse({ ok: true, sets: [summary] });
    if (value.includes("/api/motion/sets/motion-set-listed/export-file?gif=0")) {
      return new Response(zip, { headers: { "content-type": "application/zip" } });
    }
    throw new Error(`unexpected URL: ${value}`);
  };
  assert.deepEqual(await listMotionSets({}, context), { ok: true, sets: [summary] });
  const exported = await exportMotionSet(
    { setId: "motion-set-listed", includeGif: false, asBase64: true },
    context
  );
  assert.equal(exported.ok, true);
  assert.deepEqual(await fs.readFile(exported.zipPath), zip);
  assert.equal(exported.base64, zip.toString("base64"));
});

test("TOOL_NAMES exposes all motion MCP tools", () => {
  assert.equal(TOOL_NAMES.includes("create_motion"), true);
  assert.equal(TOOL_NAMES.includes("get_motion"), true);
  assert.equal(TOOL_NAMES.includes("list_motion"), true);
});
