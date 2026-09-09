import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  createVideo,
  createSionBananaMcpServer,
  getVideo,
  TOOL_NAMES,
  videoCreateInputSchema,
  videoGetInputSchema
} from "../scripts/mcp-server.mjs";
import {
  buildVideoPayload,
  normalizeConfig as normalizeVideoConfig,
  parseArgs as parseVideoArgs
} from "../scripts/agent-video.mjs";

const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+9sL5WQAAAABJRU5ErkJggg==",
  "base64"
);

async function videoFixture(t) {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sionbanana-video-mcp-"));
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sionbanana-video-repo-"));
  t.after(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
    await fs.rm(repoRoot, { recursive: true, force: true });
  });
  return { repoRoot, dataRoot };
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

  assert.deepEqual(result, {
    ok: true,
    jobId: result.jobId,
    status: "running",
    sourceImageId: "image_123"
  });
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

test("create_video registers an imagePath upload before recording its video job", async t => {
  const context = await videoFixture(t);
  const imagePath = path.join(context.repoRoot, "frames", "cut-1-last.png");
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.writeFile(imagePath, PNG_BUFFER);
  context.spawnImpl = () => ({ once() { return this; }, unref() {} });

  const result = await createVideo(
    {
      name: "cut 2 starting frame",
      source: { type: "upload", imagePath: "frames/cut-1-last.png" },
      prompt: "Continue from this exact frame."
    },
    context
  );

  assert.equal(result.ok, true);
  assert.match(result.sourceImageId, /^[a-z0-9]{1,19}$/);
  const bucket = new Date().toISOString().slice(0, 7);
  const imageDirectory = path.join(context.dataRoot, "images", bucket);
  const image = await fs.readFile(path.join(imageDirectory, `${result.sourceImageId}.png`));
  const thumbnail = await fs.readFile(path.join(imageDirectory, `${result.sourceImageId}.thumb.webp`));
  const metadata = JSON.parse(
    await fs.readFile(path.join(imageDirectory, `${result.sourceImageId}.json`), "utf8")
  );
  assert.equal(image.subarray(0, 8).equals(PNG_BUFFER.subarray(0, 8)), true);
  assert.equal(thumbnail.subarray(0, 4).toString("ascii"), "RIFF");
  assert.deepEqual(metadata, {
    mode: "upload",
    source: "mcp-video-upload",
    rawPrompt: "cut 2 starting frame",
    createdAtIso: metadata.createdAtIso,
    width: 1,
    height: 1,
    originalFileName: "cut-1-last.png"
  });
  assert.equal(Number.isFinite(Date.parse(metadata.createdAtIso)), true);

  const job = JSON.parse(
    await fs.readFile(path.join(context.dataRoot, "video-jobs", `${result.jobId}.json`), "utf8")
  );
  assert.equal(job.request.sourceImageId, result.sourceImageId);
});

test("create_video registers a dataUrl upload using safe fallback metadata", async t => {
  const context = await videoFixture(t);
  context.spawnImpl = () => ({ once() { return this; }, unref() {} });
  const result = await createVideo(
    {
      source: { type: "upload", dataUrl: `data:image/png;base64,${PNG_BUFFER.toString("base64")}` },
      prompt: "Animate the supplied frame."
    },
    context
  );

  assert.equal(result.ok, true);
  const bucket = new Date().toISOString().slice(0, 7);
  const imageDirectory = path.join(context.dataRoot, "images", bucket);
  await fs.access(path.join(imageDirectory, `${result.sourceImageId}.png`));
  await fs.access(path.join(imageDirectory, `${result.sourceImageId}.thumb.webp`));
  const metadata = JSON.parse(
    await fs.readFile(path.join(imageDirectory, `${result.sourceImageId}.json`), "utf8")
  );
  assert.equal(metadata.rawPrompt, "video source upload");
  assert.equal(metadata.originalFileName, "upload.png");
  const job = JSON.parse(
    await fs.readFile(path.join(context.dataRoot, "video-jobs", `${result.jobId}.json`), "utf8")
  );
  assert.equal(job.request.sourceImageId, result.sourceImageId);
});

test("create_video rejects invalid video upload sources", async t => {
  const context = await videoFixture(t);
  const insideNotImage = path.join(context.repoRoot, "not-image.bin");
  const insideImage = path.join(context.repoRoot, "image.png");
  const symlinkPath = path.join(context.repoRoot, "image-link.png");
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sionbanana-video-outside-"));
  t.after(async () => {
    await fs.rm(outsideRoot, { recursive: true, force: true });
  });
  await fs.writeFile(insideNotImage, "not an image");
  await fs.writeFile(insideImage, PNG_BUFFER);
  await fs.writeFile(path.join(outsideRoot, "outside.png"), PNG_BUFFER);
  await fs.symlink(insideImage, symlinkPath);

  const baseInput = { prompt: "animate" };
  const missing = await createVideo({ ...baseInput, source: { type: "upload" } }, context);
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /must include dataUrl or imagePath/);

  const tooLarge = await createVideo(
    {
      ...baseInput,
      source: {
        type: "upload",
        dataUrl: `data:image/png;base64,${Buffer.alloc(8 * 1024 * 1024 + 1).toString("base64")}`
      }
    },
    context
  );
  assert.equal(tooLarge.ok, false);
  assert.match(tooLarge.reason, /8MB limit/);

  const notImage = await createVideo(
    { ...baseInput, source: { type: "upload", imagePath: "not-image.bin" } },
    context
  );
  assert.equal(notImage.ok, false);
  assert.match(notImage.reason, /PNG or JPEG/);

  const outside = await createVideo(
    { ...baseInput, source: { type: "upload", imagePath: path.join(outsideRoot, "outside.png") } },
    context
  );
  assert.equal(outside.ok, false);
  assert.match(outside.reason, /stay inside repoRoot/);

  const symlink = await createVideo(
    { ...baseInput, source: { type: "upload", imagePath: "image-link.png" } },
    context
  );
  assert.equal(symlink.ok, false);
  assert.match(symlink.reason, /regular, non-symbolic-link/);
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

test("create_video records optional last-frame and reference image ids", async t => {
  const context = await videoFixture(t);
  context.spawnImpl = () => ({ once() { return this; }, unref() {} });

  const result = await createVideo(
    {
      name: "banana transition",
      source: { type: "imageId", imageId: "image_first" },
      lastFrame: { type: "imageId", imageId: "image_last" },
      referenceImages: [
        { type: "imageId", imageId: "image_ref_1" },
        { type: "imageId", imageId: "image_ref_2" }
      ],
      prompt: "Interpolate the banana mascot."
    },
    context
  );

  assert.deepEqual(result, {
    ok: true,
    jobId: result.jobId,
    status: "running",
    sourceImageId: "image_first",
    lastFrameImageId: "image_last",
    referenceImageIds: ["image_ref_1", "image_ref_2"]
  });
  const job = JSON.parse(
    await fs.readFile(path.join(context.dataRoot, "video-jobs", `${result.jobId}.json`), "utf8")
  );
  assert.deepEqual(job.request, {
    sourceImageId: "image_first",
    lastFrameImageId: "image_last",
    referenceImageIds: ["image_ref_1", "image_ref_2"],
    prompt: "Interpolate the banana mascot."
  });
});

test("create_video accepts reference-only input and omits a source image id", async t => {
  const context = await videoFixture(t);
  context.spawnImpl = () => ({ once() { return this; }, unref() {} });

  const result = await createVideo(
    {
      referenceImages: [{ type: "imageId", imageId: "image_ref_1" }],
      prompt: "Keep the character consistent."
    },
    context
  );
  assert.equal(result.ok, true);
  assert.equal("sourceImageId" in result, false);
  assert.deepEqual(result.referenceImageIds, ["image_ref_1"]);
  const job = JSON.parse(
    await fs.readFile(path.join(context.dataRoot, "video-jobs", `${result.jobId}.json`), "utf8")
  );
  assert.equal("sourceImageId" in job.request, false);
  assert.deepEqual(job.request.referenceImageIds, ["image_ref_1"]);
});

test("create_video returns optional frame ids in mock mode", async t => {
  const context = { ...(await videoFixture(t)), mock: true };
  const result = await createVideo(
    {
      source: { type: "imageId", imageId: "image_first" },
      lastFrame: { type: "imageId", imageId: "image_last" },
      referenceImages: [{ type: "imageId", imageId: "image_ref_1" }],
      prompt: "Mock a frame transition."
    },
    context
  );
  assert.equal(result.ok, true);
  assert.equal(result.sourceImageId, "image_first");
  assert.equal(result.lastFrameImageId, "image_last");
  assert.deepEqual(result.referenceImageIds, ["image_ref_1"]);
  assert.equal(result.mocked, true);
});

test("create_video preserves optional frame ids after a wait", async t => {
  const context = await videoFixture(t);
  context.spawnImpl = () => ({ once() { return this; }, unref() {} });
  const result = await createVideo(
    {
      source: { type: "imageId", imageId: "image_first" },
      lastFrame: { type: "imageId", imageId: "image_last" },
      referenceImages: [{ type: "imageId", imageId: "image_ref_1" }],
      prompt: "Wait for a frame transition.",
      waitMs: 1
    },
    context
  );
  assert.equal(result.ok, true);
  assert.equal(result.sourceImageId, "image_first");
  assert.equal(result.lastFrameImageId, "image_last");
  assert.deepEqual(result.referenceImageIds, ["image_ref_1"]);
});

test("create_video schemas keep frame-reference acceptance and discovery in sync", async t => {
  const server = createSionBananaMcpServer();
  const client = new Client({ name: "sionbanana-video-schema-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const registeredSchema = server._registeredTools.create_video.inputSchema;
  const inputs = [
    {
      source: { type: "imageId", imageId: "image_first" },
      lastFrame: { type: "imageId", imageId: "image_last" },
      referenceImages: [{ type: "imageId", imageId: "image_ref_1" }],
      prompt: "Animate."
    },
    { referenceImages: [{ type: "imageId", imageId: "image_ref_1" }], prompt: "Animate." },
    { prompt: "Animate." },
    {
      source: { type: "imageId", imageId: "image_first" },
      referenceImages: Array.from({ length: 4 }, (_, index) => ({
        type: "imageId",
        imageId: `image_ref_${index + 1}`
      })),
      prompt: "Animate."
    }
  ];

  for (const input of inputs) {
    assert.equal(registeredSchema.safeParse(input).success, videoCreateInputSchema.safeParse(input).success);
  }

  const listedTool = (await client.listTools()).tools.find(tool => tool.name === "create_video");
  assert.ok(listedTool);
  assert.equal(typeof listedTool.inputSchema.properties.source, "object");
  assert.equal(typeof listedTool.inputSchema.properties.lastFrame, "object");
  assert.equal(typeof listedTool.inputSchema.properties.referenceImages, "object");
  assert.equal(listedTool.inputSchema.properties.referenceImages.maxItems, 3);
  assert.equal(listedTool.inputSchema.additionalProperties, false);
});

test("create_video rejects missing required source/reference input and too many references", async t => {
  const context = await videoFixture(t);
  const missing = await createVideo({ prompt: "Animate." }, context);
  assert.equal(missing.ok, false);
  const tooMany = await createVideo(
    {
      source: { type: "imageId", imageId: "image_first" },
      referenceImages: Array.from({ length: 4 }, (_, index) => ({
        type: "imageId",
        imageId: `image_ref_${index + 1}`
      })),
      prompt: "Animate."
    },
    context
  );
  assert.equal(tooMany.ok, false);
});

test("agent-video parses optional frame ids and builds a reference-only payload", () => {
  const config = normalizeVideoConfig(
    parseVideoArgs(["--reference-ids", "image_ref_1, image_ref_2", "--last-frame-id", "image_last", "--prompt", "Animate."])
  );
  assert.deepEqual(buildVideoPayload(config), {
    prompt: "Animate.",
    lastFrameImageId: "image_last",
    referenceImageIds: ["image_ref_1", "image_ref_2"]
  });
  assert.throws(
    () => normalizeVideoConfig({ sourceId: "image_first", referenceIds: "image_ref_1,,image_ref_2", prompt: "Animate." }),
    /comma-separated/
  );
  assert.throws(
    () => normalizeVideoConfig({ sourceId: "image_first", referenceIds: "a,b,c,d", prompt: "Animate." }),
    /at most 3/
  );
  assert.throws(() => normalizeVideoConfig({ prompt: "Animate." }), /source-id or --reference-ids/);
});

test("agent-video keeps legacy source-only config payloads valid", () => {
  assert.deepEqual(
    buildVideoPayload({
      sourceId: "image_first",
      prompt: "Animate.",
      duration: null,
      resolution: null,
      aspect: null,
      model: null
    }),
    { sourceImageId: "image_first", prompt: "Animate." }
  );
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
