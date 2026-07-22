import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSheetPrompt } from "@/lib/motion/prompt";

test("reference directive is prepended only when hasReference is true", () => {
  const referenced = buildSheetPrompt({
    description: "천천히 걷는다",
    cols: 4,
    rows: 2,
    hasReference: true
  });
  const generated = buildSheetPrompt({
    description: "a fox walks slowly",
    cols: 4,
    rows: 2,
    hasReference: false
  });

  assert.match(referenced.split("\n")[0], /참조 이미지/);
  assert.match(referenced.split("\n")[0], /동일한 얼굴·헤어·의상·체형·색상/);
  assert.match(referenced.split("\n")[0], /새로운 인물을 만들지 마라/);
  assert.doesNotMatch(generated, /참조 이미지/);
});

test("character subject explicitly uses green chroma key", () => {
  const prompt = buildSheetPrompt({
    description: "a running hero",
    cols: 4,
    rows: 2,
    subjectType: "character"
  });

  assert.match(prompt, /#00FF00/);
  assert.match(prompt, /green/);
  assert.doesNotMatch(prompt, /#FF00FF|magenta/);
});

test("object subject explicitly uses magenta chroma key", () => {
  const prompt = buildSheetPrompt({
    description: "a spinning umbrella",
    cols: 4,
    rows: 2,
    subjectType: "object"
  });

  assert.match(prompt, /#FF00FF/);
  assert.match(prompt, /magenta/);
  assert.doesNotMatch(prompt, /#00FF00|green/);
});

test("walk preset describes exactly eight phased frames and a seamless loop", () => {
  const prompt = buildSheetPrompt({
    description: "walk slowly",
    cols: 4,
    rows: 2,
    action: "walk"
  });

  assert.match(prompt, /8-frame walk sequence/);
  assert.equal(prompt.match(/\b\d+\. /g)?.length, 8);
  assert.match(prompt, /contact pose/);
  assert.match(prompt, /down pose/);
  assert.match(prompt, /passing pose/);
  assert.match(prompt, /up pose/);
  assert.match(prompt, /final frame.*first frame.*seamless loop/i);
});

test("custom action keeps the description generic instead of forcing preset phases", () => {
  const prompt = buildSheetPrompt({
    description: "spins an umbrella",
    cols: 3,
    rows: 2,
    action: "custom"
  });

  assert.match(prompt, /6 consecutive frames/);
  assert.doesNotMatch(prompt, /contact pose|compression pose|anticipation crouch|impact pose/i);
});

test("all prompt modes default to character green and retain unified direction requirements", () => {
  const prompts = [
    buildSheetPrompt({ description: "walk", cols: 4, rows: 2, action: "walk" }),
    buildSheetPrompt({ description: "custom pose", cols: 2, rows: 2, action: "custom" }),
    buildSheetPrompt({
      description: "reference idle",
      cols: 2,
      rows: 2,
      action: "idle",
      hasReference: true
    })
  ];

  for (const prompt of prompts) {
    assert.match(prompt, /#00FF00/);
    assert.match(prompt, /green/);
    assert.doesNotMatch(prompt, /#FF00FF|magenta/);
    assert.match(prompt, /same direction/i);
    assert.match(prompt, /Do not mirror/i);
  }
});

test("explicit frame descriptions take precedence over an action preset", () => {
  const prompt = buildSheetPrompt({
    description: "special walk",
    cols: 2,
    rows: 1,
    action: "walk",
    frames: ["first authored pose", "second authored pose"]
  });

  assert.match(prompt, /1\. first authored pose/);
  assert.match(prompt, /2\. second authored pose/);
  assert.doesNotMatch(prompt, /contact pose|down pose|passing pose|up pose/i);
});
