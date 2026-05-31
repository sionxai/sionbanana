import assert from "node:assert/strict";
import { test } from "node:test";

import { buildGenerateArgs, TOOL_NAMES } from "../scripts/mcp-server.mjs";

test("buildGenerateArgs includes batch and concurrency when provided", () => {
  assert.deepEqual(
    buildGenerateArgs({
      prompt: "banana milk package hero shot",
      category: "packaging",
      slug: "banana-milk-hero",
      count: 1,
      quality: "medium",
      size: "1024x1024",
      batch: 10,
      concurrency: 4
    }),
    [
      "--prompt",
      "banana milk package hero shot",
      "--category",
      "packaging",
      "--slug",
      "banana-milk-hero",
      "--count",
      "1",
      "--quality",
      "medium",
      "--size",
      "1024x1024",
      "--batch",
      "10",
      "--concurrency",
      "4"
    ]
  );
});

test("buildGenerateArgs preserves single-generate defaults by omitting batch flags", () => {
  assert.deepEqual(
    buildGenerateArgs({
      prompt: "banana milk package hero shot",
      slug: "banana-milk-hero"
    }),
    [
      "--prompt",
      "banana milk package hero shot",
      "--slug",
      "banana-milk-hero"
    ]
  );
});

test("TOOL_NAMES exposes generate_many alongside existing generate", () => {
  assert.equal(TOOL_NAMES.includes("generate"), true);
  assert.equal(TOOL_NAMES.includes("generate_many"), true);
});
