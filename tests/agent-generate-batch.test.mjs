import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createBatchRunConfigs,
  createBatchSlug,
  normalizeConfig
} from "../scripts/agent-generate.mjs";

test("normalizeConfig keeps single-run defaults for batch options", () => {
  const config = normalizeConfig({
    prompt: "A banana cafe arrival"
  });

  assert.equal(config.batch, 1);
  assert.equal(config.concurrency, 4);
  assert.equal(config.slug, "a-banana-cafe-arrival");
});

test("createBatchRunConfigs indexes slugs without mutating the base config", () => {
  const config = normalizeConfig({
    prompt: "A banana cafe arrival",
    slug: "cafe-arrival",
    batch: "3",
    concurrency: "2"
  });

  const runs = createBatchRunConfigs(config);

  assert.equal(config.slug, "cafe-arrival");
  assert.equal(config.batch, 3);
  assert.equal(config.concurrency, 2);
  assert.deepEqual(
    runs.map(run => run.slug),
    ["cafe-arrival-01", "cafe-arrival-02", "cafe-arrival-03"]
  );
  assert.deepEqual(
    runs.map(run => run.prompt),
    ["A banana cafe arrival", "A banana cafe arrival", "A banana cafe arrival"]
  );
});

test("createBatchSlug grows padding width for larger batches", () => {
  assert.equal(createBatchSlug("scene", 0, 100), "scene-001");
  assert.equal(createBatchSlug("scene", 99, 100), "scene-100");
});

test("normalizeConfig rejects invalid batch and concurrency values", () => {
  assert.throws(
    () => normalizeConfig({ prompt: "x", batch: "0" }),
    /--batch must be a positive integer/
  );
  assert.throws(
    () => normalizeConfig({ prompt: "x", concurrency: "1.5" }),
    /--concurrency must be a positive integer/
  );
});
