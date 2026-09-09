import assert from "node:assert/strict";
import { existsSync, promises as fs } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FALLBACK_GROK_VIDEO_MODEL,
  generateGrokVideo,
  GrokVideoError,
  maxDurationForGrokVideoModel,
  resolveDefaultGrokVideoModel,
  supportsFrameReferences
} from "@/lib/grok-video";
import { saveImageBuffer } from "@/lib/local/storage";

let routeImportHooksRegistered = false;

async function loadVideoRouteHandlers() {
  if (!routeImportHooksRegistered) {
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
    routeImportHooksRegistered = true;
  }
  return import("../app/api/video/route.ts");
}

async function useTempDataDir(t) {
  const previous = process.env.SIONBANANA_DATA_DIR;
  const directory = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-grok-video-model-"));
  process.env.SIONBANANA_DATA_DIR = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.SIONBANANA_DATA_DIR;
    else process.env.SIONBANANA_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  });
}

function useGrokVideoModel(t, value) {
  const previous = process.env.SIONBANANA_GROK_VIDEO_MODEL;
  if (value === undefined) delete process.env.SIONBANANA_GROK_VIDEO_MODEL;
  else process.env.SIONBANANA_GROK_VIDEO_MODEL = value;
  t.after(() => {
    if (previous === undefined) delete process.env.SIONBANANA_GROK_VIDEO_MODEL;
    else process.env.SIONBANANA_GROK_VIDEO_MODEL = previous;
  });
}

function useFetchGuard(t, implementation) {
  const previous = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = previous;
  });
}

test("resolveDefaultGrokVideoModel uses the 1.5 fallback and trims overrides", () => {
  assert.equal(FALLBACK_GROK_VIDEO_MODEL, "grok-imagine-video-1.5");
  assert.equal(resolveDefaultGrokVideoModel({}), "grok-imagine-video-1.5");
  assert.equal(resolveDefaultGrokVideoModel({ SIONBANANA_GROK_VIDEO_MODEL: "" }), "grok-imagine-video-1.5");
  assert.equal(resolveDefaultGrokVideoModel({ SIONBANANA_GROK_VIDEO_MODEL: "   " }), "grok-imagine-video-1.5");
  assert.equal(
    resolveDefaultGrokVideoModel({ SIONBANANA_GROK_VIDEO_MODEL: " grok-imagine-video " }),
    "grok-imagine-video"
  );
});

test("maxDurationForGrokVideoModel identifies 1.5 model variants", () => {
  assert.equal(maxDurationForGrokVideoModel("grok-imagine-video-1.5"), 15);
  assert.equal(maxDurationForGrokVideoModel("grok-imagine-video"), 30);
  assert.equal(maxDurationForGrokVideoModel("grok-imagine-video-1.5-fast"), 15);
  assert.equal(maxDurationForGrokVideoModel("grok-imagine-video-2"), 30);
});

test("supportsFrameReferences identifies 1.5 model variants", () => {
  assert.equal(supportsFrameReferences("grok-imagine-video-1.5"), true);
  assert.equal(supportsFrameReferences("grok-imagine-video-1.5-fast"), true);
  assert.equal(supportsFrameReferences("grok-imagine-video"), false);
  assert.equal(supportsFrameReferences("grok-imagine-video-2"), false);
});

test("generateGrokVideo submits optional last and reference frames without requiring a source frame", async t => {
  const submittedPayloads = [];
  const mp4 = Buffer.from("0000000c6674797069736f6d", "hex");
  useFetchGuard(t, async (url, init = {}) => {
    if (String(url).endsWith("/videos/generations")) {
      submittedPayloads.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ request_id: "request_frames" }), { status: 200 });
    }
    if (String(url).endsWith("/videos/request_frames")) {
      return new Response(
        JSON.stringify({ status: "done", video: { url: "https://videos.example.test/request_frames.mp4" } }),
        { status: 200 }
      );
    }
    if (String(url) === "https://videos.example.test/request_frames.mp4") {
      return new Response(mp4, { headers: { "content-type": "video/mp4" } });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const source = "data:image/png;base64,c291cmNl";
  const lastFrame = "data:image/jpeg;base64,bGFzdA==";
  const references = ["data:image/webp;base64,cmVmLTE=", "data:image/png;base64,cmVmLTI="];
  await generateGrokVideo({
    sourceImageDataUri: source,
    lastFrameDataUri: lastFrame,
    referenceImageDataUris: references,
    prompt: "Interpolate the fixed frames.",
    proxyUrl: "http://127.0.0.1:18645/v1"
  });
  await generateGrokVideo({
    referenceImageDataUris: references,
    prompt: "Keep the character consistent.",
    proxyUrl: "http://127.0.0.1:18645/v1"
  });

  assert.deepEqual(submittedPayloads[0].last_frame, { url: lastFrame });
  assert.deepEqual(submittedPayloads[0].reference_images, references.map(url => ({ url })));
  assert.deepEqual(submittedPayloads[0].image, { url: source });
  assert.equal("image" in submittedPayloads[1], false);
  assert.deepEqual(submittedPayloads[1].reference_images, references.map(url => ({ url })));
});

test("generateGrokVideo rejects invalid frame references before submitting", async t => {
  let fetchCalls = 0;
  useFetchGuard(t, async () => {
    fetchCalls += 1;
    throw new Error("fetch must not be called for invalid frame references");
  });
  await assert.rejects(
    generateGrokVideo({
      prompt: "Too many references.",
      referenceImageDataUris: Array.from({ length: 4 }, () => "data:image/png;base64,cmVm"),
      proxyUrl: "http://127.0.0.1:18645/v1"
    }),
    error => error instanceof GrokVideoError && error.status === 400
  );
  await assert.rejects(
    generateGrokVideo({
      prompt: "Invalid last frame.",
      lastFrameDataUri: "https://images.example.test/last.png",
      proxyUrl: "http://127.0.0.1:18645/v1"
    }),
    error => error instanceof GrokVideoError && error.status === 400 && /last frame/i.test(error.message)
  );
  await assert.rejects(
    generateGrokVideo({
      prompt: "Invalid reference image.",
      referenceImageDataUris: ["https://images.example.test/reference.png"],
      proxyUrl: "http://127.0.0.1:18645/v1"
    }),
    error => error instanceof GrokVideoError && error.status === 400 && /reference image/i.test(error.message)
  );
  assert.equal(fetchCalls, 0);
});

test("generateGrokVideo resolves the runtime default model before submitting", async t => {
  useGrokVideoModel(t, " grok-imagine-video-legacy ");
  const submittedPayloads = [];
  const mp4 = Buffer.from("0000000c6674797069736f6d", "hex");
  useFetchGuard(t, async (url, init = {}) => {
    if (String(url).endsWith("/videos/generations")) {
      submittedPayloads.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ request_id: "request_123" }), { status: 200 });
    }
    if (String(url).endsWith("/videos/request_123")) {
      return new Response(
        JSON.stringify({
          status: "done",
          video: { url: "https://videos.example.test/request_123.mp4" }
        }),
        { status: 200 }
      );
    }
    if (String(url) === "https://videos.example.test/request_123.mp4") {
      return new Response(mp4, { headers: { "content-type": "video/mp4" } });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  const result = await generateGrokVideo({
    prompt: "Animate this image.",
    proxyUrl: "http://127.0.0.1:18645/v1"
  });

  assert.equal(submittedPayloads.length, 1);
  assert.equal(submittedPayloads[0].model, "grok-imagine-video-legacy");
  assert.equal(result.model, "grok-imagine-video-legacy");
});

test("POST rejects default 1.5 durations over 15 seconds before image reads or generation", async t => {
  await useTempDataDir(t);
  useGrokVideoModel(t, undefined);
  let fetchCalls = 0;
  useFetchGuard(t, async () => {
    fetchCalls += 1;
    throw new Error("fetch must not be called for duration validation");
  });
  const { POST } = await loadVideoRouteHandlers();

  const defaultResponse = await POST(
    new Request("http://localhost/api/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceImageId: "image_123",
        prompt: "Animate the banana.",
        duration: 20
      })
    })
  );
  assert.equal(defaultResponse.status, 400);
  assert.deepEqual(await defaultResponse.json(), {
    ok: false,
    reason: "grok-imagine-video-1.5 supports videos up to 15 seconds; requested 20."
  });
  assert.equal(fetchCalls, 0);

  const legacyResponse = await POST(
    new Request("http://localhost/api/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceImageId: "image_123",
        prompt: "Animate the banana.",
        duration: 20,
        model: "grok-imagine-video"
      })
    })
  );
  assert.equal(legacyResponse.status, 404);
  assert.equal(fetchCalls, 0);
});

test("POST rejects unsupported frame references before image reads or generation", async t => {
  await useTempDataDir(t);
  let fetchCalls = 0;
  useFetchGuard(t, async () => {
    fetchCalls += 1;
    throw new Error("fetch must not be called for frame-reference validation");
  });
  const { POST } = await loadVideoRouteHandlers();

  const legacyResponse = await POST(
    new Request("http://localhost/api/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceImageId: "image_123",
        lastFrameImageId: "image_last",
        prompt: "Interpolate the banana.",
        model: "grok-imagine-video"
      })
    })
  );
  assert.equal(legacyResponse.status, 400);
  assert.deepEqual(await legacyResponse.json(), {
    ok: false,
    reason: "grok-imagine-video does not support last_frame or reference_images; use a grok-imagine-video-1.5 model."
  });

  const missingSourceResponse = await POST(
    new Request("http://localhost/api/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Animate the banana." })
    })
  );
  assert.equal(missingSourceResponse.status, 400);
  assert.equal((await missingSourceResponse.json()).ok, false);
  assert.equal(fetchCalls, 0);
});

test("POST accepts reference-only input and preserves reference ids without source response fields", async t => {
  await useTempDataDir(t);
  const reference = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+9sL5WQAAAABJRU5ErkJggg==",
    "base64"
  );
  await saveImageBuffer("image_ref_1", reference);
  await saveImageBuffer("image_ref_2", reference);
  await saveImageBuffer("image_last", reference);
  const submittedPayloads = [];
  const mp4 = Buffer.from("0000000c6674797069736f6d", "hex");
  useFetchGuard(t, async (url, init = {}) => {
    if (String(url).endsWith("/videos/generations")) {
      submittedPayloads.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ request_id: "request_reference_only" }), { status: 200 });
    }
    if (String(url).endsWith("/videos/request_reference_only")) {
      return new Response(
        JSON.stringify({ status: "done", video: { url: "https://videos.example.test/reference-only.mp4" } }),
        { status: 200 }
      );
    }
    if (String(url) === "https://videos.example.test/reference-only.mp4") {
      return new Response(mp4, { headers: { "content-type": "video/mp4" } });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
  const { POST } = await loadVideoRouteHandlers();

  const response = await POST(
    new Request("http://localhost/api/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lastFrameImageId: "image_last",
        referenceImageIds: ["image_ref_1", "image_ref_2"],
        prompt: "Keep the banana mascot consistent."
      })
    })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal("sourceImageId" in body, false);
  assert.equal("sourceImage" in body, false);
  assert.equal(body.lastFrameImageId, "image_last");
  assert.deepEqual(body.referenceImageIds, ["image_ref_1", "image_ref_2"]);
  assert.equal("image" in submittedPayloads[0], false);
  assert.equal(typeof submittedPayloads[0].last_frame.url, "string");
  assert.equal(submittedPayloads[0].reference_images.length, 2);

  const metadataPath = path.join(
    process.env.SIONBANANA_DATA_DIR,
    "videos",
    body.storagePath.replace(/\.mp4$/, ".json")
  );
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  assert.equal("sourceImageId" in metadata, false);
  assert.equal(metadata.lastFrameImageId, "image_last");
  assert.deepEqual(metadata.referenceImageIds, ["image_ref_1", "image_ref_2"]);
});

test("POST returns a 404 VideoSourceImageError for a missing reference image", async t => {
  await useTempDataDir(t);
  let fetchCalls = 0;
  useFetchGuard(t, async () => {
    fetchCalls += 1;
    throw new Error("fetch must not be called when a reference image is missing");
  });
  const { POST } = await loadVideoRouteHandlers();

  const response = await POST(
    new Request("http://localhost/api/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        referenceImageIds: ["missing_reference"],
        prompt: "Keep the banana mascot consistent."
      })
    })
  );
  assert.equal(response.status, 404);
  assert.equal((await response.json()).ok, false);
  assert.equal(fetchCalls, 0);
});
