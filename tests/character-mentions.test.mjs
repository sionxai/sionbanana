import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCharacterMentions } from "../lib/character-mentions.ts";

const now = "2026-01-01T00:00:00.000Z";

function character(id, name, handle) {
  return {
    id,
    name,
    handle,
    thumbnailUrl: `https://example.com/${id}-thumb.png`,
    primaryImageUrl: `https://example.com/${id}.png`,
    createdAt: now,
    updatedAt: now
  };
}

const characters = [
  character("character-1", "민수", "민수"),
  character("character-2", "지우", "지우")
];

test("parseCharacterMentions resolves registered handles and leaves Korean particles as text", () => {
  const parsed = parseCharacterMentions("@민수가 @지우를 만난다", characters);

  assert.deepEqual(parsed.mentioned, ["민수", "지우"]);
  assert.deepEqual(parsed.invalid, []);
  assert.deepEqual(parsed.segments, [
    { type: "mention", handle: "민수", characterId: "character-1" },
    { type: "text", value: "가 " },
    { type: "mention", handle: "지우", characterId: "character-2" },
    { type: "text", value: "를 만난다" }
  ]);
});

test("parseCharacterMentions uses the longest registered prefix inside a candidate", () => {
  const parsed = parseCharacterMentions("@민수가 도착했다", characters);

  assert.deepEqual(parsed.mentioned, ["민수"]);
  assert.deepEqual(parsed.invalid, []);
  assert.deepEqual(parsed.segments, [
    { type: "mention", handle: "민수", characterId: "character-1" },
    { type: "text", value: "가 도착했다" }
  ]);
});

test("parseCharacterMentions reports unregistered handles as invalid", () => {
  const parsed = parseCharacterMentions("@미등록이 등장한다", characters);

  assert.deepEqual(parsed.mentioned, []);
  assert.deepEqual(parsed.invalid, ["미등록이"]);
  assert.deepEqual(parsed.segments, [
    { type: "text", value: "@미등록이 등장한다" }
  ]);
});

test("parseCharacterMentions returns empty collections for empty text", () => {
  assert.deepEqual(parseCharacterMentions("", characters), {
    segments: [],
    mentioned: [],
    invalid: []
  });
});

test("parseCharacterMentions treats a bare at sign as text", () => {
  assert.deepEqual(parseCharacterMentions("@", characters), {
    segments: [{ type: "text", value: "@" }],
    mentioned: [],
    invalid: []
  });
});
