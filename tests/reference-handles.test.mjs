import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildReferenceHandleMap,
  buildReferenceHandleMappings,
  formatOrdinal,
  replaceReferenceHandleMentions,
  resolveReferenceHandles
} from "../lib/studio-helpers/reference-handles.ts";

test("formatOrdinal formats English ordinal suffixes", () => {
  assert.equal(formatOrdinal(1), "1st");
  assert.equal(formatOrdinal(2), "2nd");
  assert.equal(formatOrdinal(3), "3rd");
  assert.equal(formatOrdinal(4), "4th");
  assert.equal(formatOrdinal(11), "11th");
  assert.equal(formatOrdinal(12), "12th");
  assert.equal(formatOrdinal(13), "13th");
  assert.equal(formatOrdinal(21), "21st");
  assert.equal(formatOrdinal(22), "22nd");
});

test("buildReferenceHandleMappings skips blanks and keeps first duplicate mapping", () => {
  assert.deepEqual(
    buildReferenceHandleMappings([" ref1 ", "", "ref1", "ref2", "  "]),
    [
      { handle: "ref1", referenceIndex: 1 },
      { handle: "ref2", referenceIndex: 4 }
    ]
  );
});

test("replaceReferenceHandleMentions replaces mapped handles only", () => {
  const mappings = buildReferenceHandleMappings(["ref1"]);

  assert.equal(
    replaceReferenceHandleMentions("draw @ref1 next to @ref2", mappings),
    "draw the 1st reference image (@ref1) next to @ref2"
  );
  assert.equal(
    replaceReferenceHandleMentions("draw @ref1", []),
    "draw @ref1"
  );
});

test("buildReferenceHandleMap aligns urls and handles while skipping incomplete entries", () => {
  assert.deepEqual(
    buildReferenceHandleMap(
      ["primary.png", "gallery-1.png", "gallery-2.png", "", "gallery-4.png"],
      ["", "ref1", "ref2", "ref3", " "]
    ),
    [
      { handle: "ref1", referenceIndex: 2, url: "gallery-1.png" },
      { handle: "ref2", referenceIndex: 3, url: "gallery-2.png" }
    ]
  );
});

test("resolveReferenceHandles preserves gallery handle offset when primary resolves", () => {
  assert.deepEqual(
    resolveReferenceHandles({
      requestedHandles: ["", "ref1", "ref2"],
      primaryRequested: true,
      primaryResolved: true,
      galleryResolvedFlags: [true, true]
    }),
    ["", "ref1", "ref2"]
  );
});

test("resolveReferenceHandles does not drift gallery handles when requested primary fails to resolve", () => {
  assert.deepEqual(
    resolveReferenceHandles({
      requestedHandles: ["", "ref1", "ref2"],
      primaryRequested: true,
      primaryResolved: false,
      galleryResolvedFlags: [true, true]
    }),
    ["ref1", "ref2"]
  );
});

test("resolveReferenceHandles maps gallery-only requests without primary offset", () => {
  assert.deepEqual(
    resolveReferenceHandles({
      requestedHandles: ["ref1", "ref2"],
      primaryRequested: false,
      primaryResolved: false,
      galleryResolvedFlags: [true, true]
    }),
    ["ref1", "ref2"]
  );
});

test("resolveReferenceHandles keeps handles for resolved gallery entries only", () => {
  assert.deepEqual(
    resolveReferenceHandles({
      requestedHandles: ["", "ref1", "ref2", "ref3"],
      primaryRequested: true,
      primaryResolved: false,
      galleryResolvedFlags: [true, false, true]
    }),
    ["ref1", "ref3"]
  );
});
