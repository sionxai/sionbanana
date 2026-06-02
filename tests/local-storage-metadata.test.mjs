import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  listAllImages,
  listVideos,
  readImageMetadata,
  saveImageBuffer,
  saveImageMetadata,
  saveVideoBuffer,
  saveVideoMetadata
} from "../lib/local/storage.ts";

async function useTempDataDir(t) {
  const previous = process.env.SIONBANANA_DATA_DIR;
  const dir = await mkdtemp(path.join(tmpdir(), "sionbanana-storage-"));
  process.env.SIONBANANA_DATA_DIR = dir;
  t.after(async () => {
    if (previous === undefined) {
      delete process.env.SIONBANANA_DATA_DIR;
    } else {
      process.env.SIONBANANA_DATA_DIR = previous;
    }
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test("local storage saves and merges image metadata sidecars", async t => {
  await useTempDataDir(t);

  const saved = await saveImageBuffer("image_123", Buffer.from("image-data"), "image/png");
  const bucket = path.dirname(saved.relativePath);

  await saveImageMetadata("image_123", bucket, {
    rawPrompt: "raw prompt",
    refinedPrompt: "refined prompt",
    model: "gpt-image-2",
    mode: "create",
    createdAtIso: "2026-05-20T00:00:00.000Z",
    nested: {
      keep: true,
      drop: undefined
    },
    drop: undefined
  });

  assert.deepEqual(await readImageMetadata("image_123"), {
    rawPrompt: "raw prompt",
    refinedPrompt: "refined prompt",
    model: "gpt-image-2",
    mode: "create",
    createdAtIso: "2026-05-20T00:00:00.000Z",
    nested: {
      keep: true
    }
  });

  const withMetadata = await listAllImages({ includeMetadata: true });
  assert.equal(withMetadata.length, 1);
  assert.equal(withMetadata[0].metadata?.rawPrompt, "raw prompt");

  const legacySaved = await saveImageBuffer("legacy_456", Buffer.from("legacy-data"), "image/png");
  assert.equal(path.dirname(legacySaved.relativePath), bucket);
  assert.equal(await readImageMetadata("legacy_456"), null);

  const legacyEntry = (await listAllImages({ includeMetadata: true })).find(item => item.id === "legacy_456");
  assert.equal(legacyEntry?.metadata, null);

  const withoutMetadata = await listAllImages();
  assert.equal(withoutMetadata.some(item => Object.hasOwn(item, "metadata")), false);

  const savedVideo = await saveVideoBuffer("video_123", Buffer.from("video-data"));
  const videoBucket = path.dirname(savedVideo.relativePath);
  await saveVideoMetadata(
    "video_123",
    {
      sourceImageId: "image_123",
      prompt: "motion prompt",
      model: "grok-2-vision-1212",
      duration: 5,
      resolution: "720p",
      aspectRatio: "16:9",
      requestId: "req_123",
      createdAtIso: "2026-05-20T00:02:00.000Z",
      bytes: savedVideo.bytes,
      drop: undefined
    },
    videoBucket
  );

  const videos = await listVideos();
  assert.equal(videos.length, 1);
  assert.equal(videos[0].id, "video_123");
  assert.equal(videos[0].videoUrl, "/api/videos/video_123");
  assert.equal(videos[0].sourceImageId, "image_123");
  assert.equal(videos[0].prompt, "motion prompt");
  assert.equal(videos[0].duration, 5);
  assert.equal(videos[0].bytes, savedVideo.bytes);

  const legacyVideo = await saveVideoBuffer("legacy_video", Buffer.from("legacy-video"));
  const legacyVideoEntry = (await listVideos()).find(item => item.id === "legacy_video");
  assert.equal(legacyVideoEntry?.bytes, legacyVideo.bytes);
  assert.ok(legacyVideoEntry?.createdAtIso);
  assert.equal(Number.isNaN(Date.parse(legacyVideoEntry?.createdAtIso ?? "")), false);
});
