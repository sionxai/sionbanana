import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  listAllImages,
  readImageMetadata,
  saveImageBuffer,
  saveImageMetadata
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
});
