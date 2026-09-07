import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  applyMotionCandidate,
  createMotionCandidate,
  createMotionSet,
  createMotion,
  exportMotionSet,
  getMotionCandidate,
  getMotionSet,
  getMotion,
  listMotionSets,
  listMotion,
  motionCandidateApplyInputSchema,
  motionCandidateCreateInputSchema,
  motionCandidateGetInputSchema,
  motionCandidateRevertInputSchema,
  motionCreateInputSchema,
  motionSetCreateInputSchema,
  motionSetExportInputSchema,
  motionSetGetInputSchema,
  motionSetListInputSchema,
  revertMotionFrames,
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

test("motion candidate schemas are strict, reject ambiguous sources, and register all four tools", async t => {
  const valid = {
    projectId: "motion-project-1",
    mode: "mask",
    frames: [{ index: 0, imageDataUrl: "data:image/png;base64,AA==" }]
  };
  const getValid = { projectId: "motion-project-1", candidateId: "cand-1" };
  const applyValid = { projectId: "motion-project-1", candidateId: "cand-1", frames: [0] };
  const revertValid = { projectId: "motion-project-1", frames: [0] };
  for (const [schema, input] of [
    [motionCandidateCreateInputSchema, valid],
    [motionCandidateGetInputSchema, getValid],
    [motionCandidateApplyInputSchema, applyValid],
    [motionCandidateRevertInputSchema, revertValid]
  ]) {
    assert.equal(schema.safeParse(input).success, true);
    assert.equal(schema.safeParse({ ...input, extra: true }).success, false);
  }
  for (const [schema, input] of [
    [motionCandidateCreateInputSchema, valid],
    [motionCandidateGetInputSchema, getValid]
  ]) {
    for (const waitMs of [0, 30_000]) assert.equal(schema.safeParse({ ...input, waitMs }).success, true);
    for (const waitMs of [-1, 30_001, 0.5]) assert.equal(schema.safeParse({ ...input, waitMs }).success, false);
  }
  for (const schema of [motionCandidateApplyInputSchema, motionCandidateRevertInputSchema]) {
    for (const frames of [[], [-1], [0.5]]) {
      assert.equal(schema.safeParse({ ...(schema === motionCandidateApplyInputSchema ? applyValid : revertValid), frames }).success, false);
    }
  }
  assert.equal(
    motionCandidateCreateInputSchema.safeParse({
      ...valid,
      frames: [{ index: 0, imagePath: "image.png", imageDataUrl: "data:image/png;base64,AA==" }]
    }).success,
    false
  );
  assert.equal(
    motionCandidateGetInputSchema.safeParse({ ...getValid, projectId: "../project" }).success,
    false
  );
  for (const name of [
    "create_motion_candidate",
    "get_motion_candidate",
    "apply_motion_candidate",
    "revert_motion_frames"
  ]) {
    assert.equal(TOOL_NAMES.includes(name), true, name);
  }

  const context = await motionFixture(t, true);
  context.fetchImpl = async () => {
    throw new Error("mock candidate tool must not fetch");
  };
  assert.deepEqual(await createMotionCandidate(valid, context), {
    ok: true,
    candidateId: "cand-mock",
    status: "pending",
    mocked: true
  });
});

test("create_motion_candidate maps validated repo uploads into the candidate API body", async t => {
  const context = await motionFixture(t);
  const repoRoot = path.join(context.dataRoot, "repo");
  context.repoRoot = repoRoot;
  const image = await sharp({
    create: { width: 2, height: 2, channels: 4, background: { r: 250, g: 220, b: 40, alpha: 1 } }
  })
    .png()
    .toBuffer();
  const mask = await sharp({
    create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } }
  })
    .png()
    .toBuffer();
  await fs.mkdir(repoRoot, { recursive: true });
  await fs.writeFile(path.join(repoRoot, "image.png"), image);
  await fs.writeFile(path.join(repoRoot, "mask.png"), mask);
  const outsidePath = path.join(context.dataRoot, "outside.png");
  await fs.writeFile(outsidePath, image);
  await fs.writeFile(path.join(repoRoot, "invalid.png"), Buffer.from("not an image"));
  const oversizedPath = path.join(repoRoot, "oversized.png");
  await fs.writeFile(oversizedPath, Buffer.from([0]));
  await fs.truncate(oversizedPath, 8 * 1024 * 1024 + 1);
  await fs.symlink(context.dataRoot, path.join(repoRoot, "outside-link"));

  let fetchCalls = 0;
  context.fetchImpl = async () => {
    fetchCalls += 1;
    throw new Error("outside upload must fail before server discovery");
  };
  const rejectBeforeFetch = async (frames, expectedReason) => {
    const result = await createMotionCandidate({ projectId: "motion-project-1", mode: "upload", frames }, context);
    assert.equal(result.ok, false);
    assert.match(result.reason, expectedReason);
  };
  await rejectBeforeFetch([{ index: 0, imagePath: outsidePath }], /imagePath must stay inside repoRoot/);
  await rejectBeforeFetch(
    [{ index: 0, imagePath: "image.png", maskPath: outsidePath }],
    /maskPath must stay inside repoRoot/
  );
  await rejectBeforeFetch([{ index: 0, imagePath: "invalid.png" }], /PNG or JPEG image/);
  await rejectBeforeFetch([{ index: 0, imagePath: "oversized.png" }], /exceeds the 8MB limit/);
  await rejectBeforeFetch([{ index: 0, imagePath: "outside-link/outside.png" }], /stay inside repoRoot/);
  assert.equal(fetchCalls, 0);

  let request;
  context.fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith("/api/health")) return jsonResponse({ ok: true });
    if (value.endsWith("/api/motion/projects/motion-project-1/candidates") && options.method === "POST") {
      request = JSON.parse(options.body);
      return jsonResponse(
        {
          ok: true,
          candidate: {
            id: "cand-1",
            projectId: "motion-project-1",
            status: "pending",
            frames: [{ index: 0, file: null, mask: "masks/f01.png" }]
          }
        },
        201
      );
    }
    throw new Error(`unexpected URL: ${value}`);
  };
  assert.deepEqual(
    await createMotionCandidate(
      {
        projectId: "motion-project-1",
        mode: "mask",
        frames: [{ index: 0, imagePath: "image.png", maskPath: "mask.png" }],
        instruction: "Repair the arm",
        protect: ["face"],
        waitMs: 0
      },
      context
    ),
    { ok: true, candidateId: "cand-1", status: "pending" }
  );
  assert.deepEqual(request, {
    mode: "mask",
    frames: [
      {
        index: 0,
        image: `data:image/png;base64,${image.toString("base64")}`,
        mask: `data:image/png;base64,${mask.toString("base64")}`
      }
    ],
    instruction: "Repair the arm",
    protect: ["face"]
  });
});

test("create_motion_candidate polls terminal failures and returns persistent pending at its deadline", async t => {
  const context = await motionFixture(t);
  const projectId = "motion-project-1";
  const candidateId = "cand-1";
  const postBodies = [];
  const events = [];
  let status = "failed";
  let getCalls = 0;
  context.fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith("/api/health")) {
      events.push("health");
      return jsonResponse({ ok: true });
    }
    if (value.endsWith(`/api/motion/projects/${projectId}/candidates`) && options.method === "POST") {
      events.push("post");
      postBodies.push(JSON.parse(options.body));
      return jsonResponse({
        ok: true,
        candidate: { id: candidateId, projectId, status: "pending", frames: [{ index: 0, file: null, mask: null }] }
      });
    }
    if (value.endsWith(`/api/motion/projects/${projectId}/candidates/${candidateId}`)) {
      events.push("get");
      getCalls += 1;
      return jsonResponse({
        ok: true,
        candidate: {
          id: candidateId,
          projectId,
          status,
          reason: status === "failed" ? "generation-error" : null,
          metrics: null,
          frames: [{ index: 0, file: null, mask: null }]
        }
      });
    }
    throw new Error(`unexpected URL: ${value}`);
  };
  const input = {
    projectId,
    mode: "upload",
    frames: [{ index: 0, imageDataUrl: "data:image/png;base64,AA==" }],
    waitMs: 1
  };
  assert.deepEqual(await createMotionCandidate(input, context), {
    ok: true,
    candidateId,
    status: "failed",
    reason: "generation-error"
  });
  assert.deepEqual(events, ["health", "post", "get"]);

  status = "pending";
  events.length = 0;
  getCalls = 0;
  assert.deepEqual(await createMotionCandidate(input, context), {
    ok: true,
    candidateId,
    status: "pending"
  });
  assert.deepEqual(events.slice(0, 3), ["health", "post", "get"]);
  assert.ok(getCalls >= 1);
  for (const body of postBodies) {
    assert.equal(Object.hasOwn(body, "waitMs"), false);
    assert.equal(Object.hasOwn(body, "projectId"), false);
  }
});

test("get_motion_candidate polls and returns canonical ready paths without trusting API file paths", async t => {
  const context = await motionFixture(t);
  const projectId = "motion-project-1";
  const candidateId = "cand-1";
  const framesDirectory = path.join(
    context.dataRoot,
    "motion-assets",
    projectId,
    "candidates",
    candidateId,
    "frames"
  );
  await fs.mkdir(framesDirectory, { recursive: true });
  await fs.writeFile(path.join(framesDirectory, "f01.png"), Buffer.from("candidate frame"));
  const framePath = await fs.realpath(path.join(framesDirectory, "f01.png"));

  let getCalls = 0;
  context.fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith("/api/health")) return jsonResponse({ ok: true });
    if (value.endsWith(`/api/motion/projects/${projectId}/candidates/${candidateId}`)) {
      getCalls += 1;
      return jsonResponse({
        ok: true,
        candidate: {
          id: candidateId,
          projectId,
          status: getCalls <= 2 ? "pending" : "ready",
          reason: null,
          metrics: { generated: 1 },
          frames: [{ index: 0, file: "../../outside.png", mask: null }]
        }
      });
    }
    throw new Error(`unexpected URL: ${value}`);
  };
  assert.deepEqual(await getMotionCandidate({ projectId, candidateId, waitMs: 0 }, context), {
    ok: true,
    status: "pending",
    reason: null,
    frames: [{ index: 0 }],
    metrics: { generated: 1 }
  });
  assert.deepEqual(await getMotionCandidate({ projectId, candidateId, waitMs: 600 }, context), {
    ok: true,
    status: "ready",
    reason: null,
    frames: [{ index: 0, path: framePath }],
    metrics: { generated: 1 }
  });

  const replacementFrames = path.join(context.dataRoot, "replacement-frames");
  await fs.mkdir(replacementFrames);
  await fs.writeFile(path.join(replacementFrames, "f01.png"), Buffer.from("outside candidate frame"));
  await fs.rm(framesDirectory, { recursive: true, force: true });
  await fs.symlink(replacementFrames, framesDirectory);
  const escaped = await getMotionCandidate({ projectId, candidateId, waitMs: 0 }, context);
  assert.equal(escaped.ok, false);
  assert.match(escaped.reason, /motion candidate frames directory must stay inside its candidate/);
});

test("get_motion_candidate binds the response candidate id and preserves failure reasons", async t => {
  const context = await motionFixture(t);
  const projectId = "motion-project-1";
  let responseCandidateId = "cand-other";
  context.fetchImpl = async url => {
    const value = String(url);
    if (value.endsWith("/api/health")) return jsonResponse({ ok: true });
    if (value.endsWith(`/api/motion/projects/${projectId}/candidates/cand-1`)) {
      return jsonResponse({
        ok: true,
        candidate: {
          id: responseCandidateId,
          projectId,
          status: "failed",
          reason: "generation-error",
          metrics: null,
          frames: [{ index: 1, file: null, mask: null }]
        }
      });
    }
    throw new Error(`unexpected URL: ${value}`);
  };
  const mismatched = await getMotionCandidate({ projectId, candidateId: "cand-1" }, context);
  assert.equal(mismatched.ok, false);
  assert.match(mismatched.reason, /motion candidate response was incomplete/);

  responseCandidateId = "cand-1";
  assert.deepEqual(await getMotionCandidate({ projectId, candidateId: "cand-1" }, context), {
    ok: true,
    status: "failed",
    reason: "generation-error",
    frames: [{ index: 1 }],
    metrics: null
  });
});

test("apply and revert candidate tools omit optional selections and project active overrides", async t => {
  const context = await motionFixture(t);
  const projectId = "motion-project-1";
  const candidateId = "cand-1";
  const requests = [];
  let applyResponseId = projectId;
  let revertResponseId = projectId;
  context.fetchImpl = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith("/api/health")) return jsonResponse({ ok: true });
    if (value.endsWith(`/api/motion/projects/${projectId}/candidates/${candidateId}/apply`)) {
      requests.push(JSON.parse(options.body));
      return jsonResponse({
        ok: true,
        project: {
          id: applyResponseId,
          frames: [{ index: 0, override: null }, { index: 1, override: { candidateId } }]
        }
      });
    }
    if (value.endsWith(`/api/motion/projects/${projectId}/revert`)) {
      requests.push(JSON.parse(options.body));
      return jsonResponse({
        ok: true,
        project: { id: revertResponseId, frames: [{ index: 0, override: null }, { index: 1, override: null }] }
      });
    }
    throw new Error(`unexpected URL: ${value}`);
  };
  assert.deepEqual(await applyMotionCandidate({ projectId, candidateId }, context), {
    ok: true,
    projectId,
    overriddenFrames: [1],
    paths: {
      sheet: path.join(context.dataRoot, "motion-assets", projectId, "derived", "sheet.png"),
      frames: [
        path.join(context.dataRoot, "motion-assets", projectId, "derived", "frames", "f01.png"),
        path.join(context.dataRoot, "motion-assets", projectId, "derived", "frames", "f02.png")
      ]
    }
  });
  for (const invalidProjectId of [undefined, "motion-project-other"]) {
    applyResponseId = invalidProjectId;
    const invalid = await applyMotionCandidate({ projectId, candidateId }, context);
    assert.equal(invalid.ok, false);
    assert.match(invalid.reason, /motion candidate project response was incomplete/);
  }

  assert.deepEqual(await revertMotionFrames({ projectId, frames: [1] }, context), {
    ok: true,
    projectId,
    remainingOverrides: []
  });
  for (const invalidProjectId of [undefined, "motion-project-other"]) {
    revertResponseId = invalidProjectId;
    const invalid = await revertMotionFrames({ projectId, frames: [1] }, context);
    assert.equal(invalid.ok, false);
    assert.match(invalid.reason, /motion candidate project response was incomplete/);
  }
  assert.deepEqual(requests, [{}, {}, {}, { frames: [1] }, { frames: [1] }, { frames: [1] }]);
});
