import assert from "node:assert/strict";
import { test } from "node:test";

import { parseStoryMentions } from "../lib/story-mentions.ts";

const now = "2026-01-01T00:00:00.000Z";

function reference(role, handle, slotIndex) {
  return {
    id: `${role}-${slotIndex}`,
    handle,
    role,
    imageUrl: `https://example.com/${role}-${slotIndex}.png`,
    slotIndex,
    createdAt: now,
    updatedAt: now
  };
}

const library = {
  characters: [
    reference("character", "민수", 0),
    null,
    null,
    null,
    null
  ],
  locations: [
    reference("location", "카페", 0),
    null,
    null,
    null,
    null
  ]
};

test("parseStoryMentions resolves registered handles and leaves Korean particles as text", () => {
  const parsed = parseStoryMentions("@민수가 @카페에서 만난다", library);

  assert.deepEqual(parsed.mentioned, ["민수", "카페"]);
  assert.deepEqual(parsed.invalid, []);
  assert.deepEqual(parsed.segments, [
    { type: "mention", handle: "민수", role: "character" },
    { type: "text", value: "가 " },
    { type: "mention", handle: "카페", role: "location" },
    { type: "text", value: "에서 만난다" }
  ]);
});

test("parseStoryMentions uses the longest registered prefix inside a candidate", () => {
  const parsed = parseStoryMentions("@민수가 도착했다", library);

  assert.deepEqual(parsed.mentioned, ["민수"]);
  assert.deepEqual(parsed.invalid, []);
  assert.deepEqual(parsed.segments, [
    { type: "mention", handle: "민수", role: "character" },
    { type: "text", value: "가 도착했다" }
  ]);
});

test("parseStoryMentions reports unregistered handles as invalid", () => {
  const parsed = parseStoryMentions("@미등록이 등장한다", library);

  assert.deepEqual(parsed.mentioned, []);
  assert.deepEqual(parsed.invalid, ["미등록이"]);
  assert.deepEqual(parsed.segments, [
    { type: "text", value: "@미등록이 등장한다" }
  ]);
});

test("parseStoryMentions returns empty collections for empty text", () => {
  assert.deepEqual(parseStoryMentions("", library), {
    segments: [],
    mentioned: [],
    invalid: []
  });
});

test("parseStoryMentions treats a bare at sign as text", () => {
  assert.deepEqual(parseStoryMentions("@", library), {
    segments: [{ type: "text", value: "@" }],
    mentioned: [],
    invalid: []
  });
});
