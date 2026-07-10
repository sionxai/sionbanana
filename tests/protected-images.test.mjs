import assert from "node:assert/strict";
import { test } from "node:test";

import { collectProtectedLocalImageIds } from "../lib/studio-helpers/protected-images.ts";

test("collectProtectedLocalImageIds keeps only unique local image ids", () => {
  const ids = collectProtectedLocalImageIds([
    "/api/images/reference-a",
    "/api/images/reference_b?cache=1",
    "/api/images/reference-a#preview",
    "data:image/png;base64,AAAA",
    "https://example.com/api/images/external",
    null,
    undefined
  ]);

  assert.deepEqual([...ids], ["reference-a", "reference_b"]);
});
