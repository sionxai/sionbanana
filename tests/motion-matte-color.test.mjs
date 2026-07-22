import assert from "node:assert/strict";
import { test } from "node:test";

import { keyColorForSubject, subjectTypeValues } from "@/lib/motion/matte-color";

test("subject key colors match the character and object contracts", () => {
  assert.deepEqual(subjectTypeValues, ["character", "object"]);
  assert.deepEqual(keyColorForSubject("character"), { hex: "#00FF00", name: "green" });
  assert.deepEqual(keyColorForSubject("object"), { hex: "#FF00FF", name: "magenta" });
});
