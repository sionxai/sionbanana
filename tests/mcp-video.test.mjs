import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createVideo,
  getVideo,
  TOOL_NAMES,
  videoCreateInputSchema,
  videoGetInputSchema
} from "../scripts/mcp-server.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function videoFixture(t) {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sionbanana-video-mcp-"));
  t.after(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
  });
  return { repoRoot: REPO_ROOT, dataRoot };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test("create_video records a strict imageId request and starts a detached worker", async t => {
  const context = await videoFixture(t);
  const calls = [];
  context.spawnImpl = (...args) => {
    calls.push(args);
    return {
      once(eventName) {
        assert.equal(eventName, "error");
        return this;
      },
      unref() {}
    };
  };

  const result = await createVideo(
    {
      name: "banana video",
      source: { type: "imageId", imageId: "image_123" },
      prompt: "The banana mascot waves.",
      duration: "4",
      resolution: "720p",
      aspectRatio: "16:9",
      model: "grok-imagine-video",
      waitMs: 0
    },
    context
  );

  assert.deepEqual(result, { ok: true, jobId: result.jobId, status: "running" });
  assert.match(result.jobId, /^video-job-[0-9]+-[0-9a-f-]+$/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], process.execPath);
  assert.deepEqual(calls[0][1].slice(-1), [result.jobId]);
  assert.equal(calls[0][2].detached, true);
  assert.equal(calls[0][2].stdio, "ignore");

  const job = JSON.parse(
    await fs.readFile(path.join(context.dataRoot, "video-jobs", `${result.jobId}.json`), "utf8")
  );
  assert.equal(job.status, "running");
  assert.equal(job.name, "banana video");
  assert.equal(Date.parse(job.deadlineIso) > Date.parse(job.createdAtIso), true);
  assert.deepEqual(job.request, {
    sourceImageId: "image_123",
    prompt: "The banana mascot waves.",
    duration: 4,
    resolution: "720p",
    aspectRatio: "16:9",
    model: "grok-imagine-video"
  });
});

test("video schemas reject unknown fields, traversal ids, and unsupported source variants", () => {
  assert.equal(
    videoCreateInputSchema.safeParse({
      source: { type: "imageId", imageId: "image_123", extra: true },
      prompt: "animate",
      unexpected: true
    }).success,
    false
  );
  assert.equal(
    videoCreateInputSchema.safeParse({
      source: { type: "imageId", imageId: "../image" },
      prompt: "animate"
    }).success,
    false
  );
  assert.equal(
    videoCreateInputSchema.safeParse({
      source: { type: "upload", imageId: "image_123" },
      prompt: "animate"
    }).success,
    false
  );
  assert.equal(videoGetInputSchema.safeParse({ jobId: "video-job", extra: true }).success, false);
});

test("get_video polls a running job to a verified ready video without base64", async t => {
  const context = await videoFixture(t);
  const jobId = "video-job-ready";
  const videoPath = path.join(context.dataRoot, "videos", "2026-08", "video-ready.mp4");
  const contents = Buffer.from("verified video fixture");
  const jobPath = path.join(context.dataRoot, "video-jobs", `${jobId}.json`);
  const running = {
    status: "running",
    createdAtIso: new Date().toISOString(),
    deadlineIso: new Date(Date.now() + 30_000).toISOString(),
    request: { sourceImageId: "image_123", prompt: "animate" }
  };
  await writeJson(jobPath, running);
  await fs.mkdir(path.dirname(videoPath), { recursive: true });
  await fs.writeFile(videoPath, contents);

  const expectedSha256 = createHash("sha256").update(contents).digest("hex");
  const timer = setTimeout(() => {
    writeJson(jobPath, {
      ...running,
      status: "ready",
      finishedAtIso: new Date().toISOString(),
      videoPath,
      bytes: contents.byteLength,
      contentType: "video/mp4",
      sha256: expectedSha256
    }).catch(error => t.diagnostic(error.message));
  }, 20);
  t.after(() => clearTimeout(timer));

  const result = await getVideo({ jobId, waitMs: 1_000 }, context);
  assert.deepEqual(result, {
    ok: true,
    jobId,
    status: "ready",
    videoPath,
    bytes: contents.byteLength,
    contentType: "video/mp4",
    sha256: expectedSha256
  });
  assert.equal("base64" in result, false);
});

test("get_video changes an expired running job to failed", async t => {
  const context = await videoFixture(t);
  const jobId = "video-job-expired";
  const jobPath = path.join(context.dataRoot, "video-jobs", `${jobId}.json`);
  await writeJson(jobPath, {
    status: "running",
    createdAtIso: "2025-01-01T00:00:00.000Z",
    deadlineIso: "2025-01-01T00:00:01.000Z",
    request: {}
  });

  const result = await getVideo({ jobId, waitMs: 0 }, context);
  assert.equal(result.ok, true);
  assert.equal(result.status, "failed");
  assert.match(result.reason, /deadline exceeded/);

  const persisted = JSON.parse(await fs.readFile(jobPath, "utf8"));
  assert.equal(persisted.status, "failed");
  assert.match(persisted.reason, /worker may have died/);
});

test("get_video returns a failed job reason with the server code and reason intact", async t => {
  const context = await videoFixture(t);
  const jobId = "video-job-server-failed";
  await writeJson(path.join(context.dataRoot, "video-jobs", `${jobId}.json`), {
    status: "failed",
    createdAtIso: new Date().toISOString(),
    deadlineIso: new Date(Date.now() + 30_000).toISOString(),
    reason: "http-429: rate_limit_exceeded: Retry after 60 seconds",
    errorCode: "rate_limit_exceeded",
    errorReason: "Retry after 60 seconds"
  });

  assert.deepEqual(await getVideo({ jobId, waitMs: 0 }, context), {
    ok: true,
    jobId,
    status: "failed",
    reason: "http-429: rate_limit_exceeded: Retry after 60 seconds"
  });
});

test("TOOL_NAMES exposes create_video and get_video", () => {
  assert.equal(TOOL_NAMES.includes("create_video"), true);
  assert.equal(TOOL_NAMES.includes("get_video"), true);
});
