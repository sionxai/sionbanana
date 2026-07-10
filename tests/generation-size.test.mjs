import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveRequestedSize } from "../lib/generation/size.ts";

test("resolveRequestedSize preserves imageSize when aspect ratio is absent or original", () => {
  assert.equal(resolveRequestedSize("2048x1152", undefined), "2048x1152");
  assert.equal(resolveRequestedSize("2048x1152", "original"), "2048x1152");
  assert.equal(resolveRequestedSize("2048x1152", "constructor"), "2048x1152");
});

test("resolveRequestedSize applies supported aspect ratios at the 2K tier", () => {
  assert.equal(resolveRequestedSize("2048x1152", "9:16"), "1152x2048");
  assert.equal(resolveRequestedSize("2048x1152", "1:1"), "2048x2048");
  assert.equal(resolveRequestedSize("2048x1152", "4:3"), "1360x1024");
});

test("resolveRequestedSize applies the 1K tier and handles missing values", () => {
  assert.equal(resolveRequestedSize("1024x1024", "16:9"), "1824x1024");
  assert.equal(resolveRequestedSize(undefined, "16:9"), "1824x1024");
  assert.equal(resolveRequestedSize(undefined, undefined), undefined);
});
