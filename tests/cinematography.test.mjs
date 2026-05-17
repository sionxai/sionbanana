import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCinematographySuffix,
  normalizeCinematography
} from "../lib/story-cinematography.ts";

test("normalizeCinematography falls back to the first sequence item", () => {
  assert.deepEqual(normalizeCinematography({}, 0), {
    framing: "extreme-long-shot",
    angle: "eye-level",
    special: "establishing-shot"
  });
});

test("normalizeCinematography replaces invalid values with the indexed fallback", () => {
  assert.deepEqual(normalizeCinematography({ framing: "invalid" }, 1), {
    framing: "medium-shot",
    angle: "low-angle",
    special: null
  });
});

test("buildCinematographySuffix uses the expected English keywords", () => {
  assert.equal(
    buildCinematographySuffix({
      framing: "medium-shot",
      angle: "low-angle",
      special: "over-the-shoulder"
    }),
    "Camera: medium shot, low-angle composition, over-the-shoulder view."
  );
});

test("buildCinematographySuffix omits the final phrase when special is absent", () => {
  assert.equal(
    buildCinematographySuffix({
      framing: "close-up",
      angle: "eye-level",
      special: null
    }),
    "Camera: close-up, eye-level angle."
  );
});
