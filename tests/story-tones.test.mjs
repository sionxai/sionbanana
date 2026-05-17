import assert from "node:assert/strict";
import { test } from "node:test";

import { TONE_OPTIONS } from "../lib/story-tones.ts";

test("TONE_OPTIONS keeps 20 options evenly distributed across categories", () => {
  const categoryCounts = TONE_OPTIONS.reduce((counts, option) => {
    counts[option.category] = (counts[option.category] ?? 0) + 1;
    return counts;
  }, {});

  assert.equal(TONE_OPTIONS.length, 20);
  assert.deepEqual(categoryCounts, {
    cinematic: 5,
    commercial: 5,
    documentary: 5,
    vlog: 5
  });
});
