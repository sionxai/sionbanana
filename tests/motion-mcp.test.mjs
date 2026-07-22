import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createMotion,
  getMotion,
  listMotion,
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

test("TOOL_NAMES exposes all motion MCP tools", () => {
  assert.equal(TOOL_NAMES.includes("create_motion"), true);
  assert.equal(TOOL_NAMES.includes("get_motion"), true);
  assert.equal(TOOL_NAMES.includes("list_motion"), true);
});
