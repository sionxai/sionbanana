import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSheetPrompt,
  isCyclicAction,
  MOTION_ACTION_PRESETS,
  motionActionPresetValues
} from "@/lib/motion/prompt";

function presetDescriptions(action, cols, rows) {
  const prompt = buildSheetPrompt({ description: action, cols, rows, action });
  const sequence = prompt.split("\n").find(line => line.startsWith("Render this "));
  const numbered = sequence
    .replace(/^.*?sequence in order: /, "")
    .replace(/ (?:The final frame|This is a one-shot action:).*$/, "");
  return numbered.split(/(?:^| )\d+\. /).slice(1);
}

test("motion action presets keep their values and metadata in one complete set", () => {
  assert.equal(motionActionPresetValues.length, 11);
  assert.deepEqual(Object.keys(MOTION_ACTION_PRESETS).sort(), [...motionActionPresetValues].sort());

  for (const action of motionActionPresetValues) {
    if (action === "custom") continue;
    const prompt = buildSheetPrompt({ description: action, cols: 1, rows: 1, action });
    assert.match(prompt, /sequence in order:/, action);
  }
});

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
  assert.match(prompt, /seamless loop/);
  assert.equal(
    prompt,
    buildSheetPrompt({ description: "spins an umbrella", cols: 3, rows: 2 })
  );
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
    assert.match(prompt, /every cell of every row/i);
    assert.match(prompt, /facing the same way as row 1/i);
    assert.match(prompt, /no snake order/i);
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
  assert.match(prompt, /seamless loop/);
});

test("cyclic presets use eight distinct phase descriptions", () => {
  for (const action of ["walk", "run", "idle", "stun"]) {
    const descriptions = presetDescriptions(action, 4, 2);
    assert.equal(descriptions.length, 8);
    assert.equal(new Set(descriptions).size, 8, action);
    assert.ok(descriptions.every(description => !description.includes("halfway between")));
  }
});

test("new preset phases preserve distinct 4x2 sequences and their playback wording", () => {
  for (const action of ["reload", "hit", "fall", "stun", "getup"]) {
    const descriptions = presetDescriptions(action, 4, 2);
    assert.equal(descriptions.length, 8, action);
    assert.equal(new Set(descriptions).size, 8, action);

    const prompt = buildSheetPrompt({ description: action, cols: 4, rows: 2, action });
    if (action === "stun") {
      assert.match(prompt, /seamless loop/);
      assert.doesNotMatch(prompt, /one-shot action/);
    } else {
      assert.match(prompt, /one-shot action/);
      assert.doesNotMatch(prompt, /seamless loop/);
    }
  }
  assert.match(
    buildSheetPrompt({ description: "getup", cols: 4, rows: 2, action: "getup" }),
    /8-frame get-up sequence/
  );
  assert.match(
    buildSheetPrompt({ description: "hit", cols: 4, rows: 2, action: "hit" }),
    /8-frame hit-reaction sequence/
  );
});

test("four-frame walk evenly samples the eight phases without interpolation", () => {
  const descriptions = presetDescriptions("walk", 2, 2);
  assert.equal(new Set(descriptions).size, 4);
  assert.deepEqual(descriptions, [
    "contact pose, right foot forward with the heel just touching down, left toe extended behind",
    "passing pose, left foot lifted and swinging past the planted right leg, body rising",
    "contact pose, left foot forward with the heel just touching down, right toe extended behind",
    "passing pose, right foot lifted and swinging past the planted left leg, body rising"
  ]);
});

test("twelve-frame walk interpolates repeated phase slots without adjacent duplicates", () => {
  const descriptions = presetDescriptions("walk", 4, 3);
  assert.equal(descriptions.length, 12);
  assert.ok(descriptions.some(description => description.includes("halfway between")));
  for (let index = 1; index < descriptions.length; index += 1) {
    assert.notEqual(descriptions[index], descriptions[index - 1]);
  }
});

test("one-shot presets settle at the end while cyclic presets loop", () => {
  for (const action of ["jump", "attack"]) {
    const prompt = buildSheetPrompt({ description: action, cols: 4, rows: 2, action });
    assert.doesNotMatch(prompt, /seamless loop/);
    assert.match(prompt, /one-shot action/);
    assert.match(prompt, /last frame is the settled end pose and must not return to the first frame/);
  }
  const walk = buildSheetPrompt({ description: "walk", cols: 4, rows: 2, action: "walk" });
  assert.match(walk, /seamless loop/);
  assert.doesNotMatch(walk, /one-shot/);
});

test("explicit frames keep loop instructions even with a one-shot action", () => {
  const prompt = buildSheetPrompt({
    description: "authored jump",
    cols: 2,
    rows: 1,
    action: "jump",
    frames: ["first authored pose", "second authored pose"]
  });
  assert.match(prompt, /seamless loop/);
  assert.doesNotMatch(prompt, /one-shot action/);
});

test("one-shot phase sampling preserves the first and last poses", () => {
  assert.deepEqual(presetDescriptions("jump", 1, 1), ["anticipation crouch before takeoff"]);
  assert.deepEqual(presetDescriptions("jump", 2, 2), [
    "anticipation crouch before takeoff",
    "airborne ascent approaching the apex",
    "descending pose preparing for ground contact",
    "recovery pose rising back toward the starting stance"
  ]);
  assert.deepEqual(presetDescriptions("attack", 2, 1), [
    "anticipation pose winding up the attack",
    "recovery pose returning toward the starting stance"
  ]);
});

test("isCyclicAction resolves cyclic metadata", () => {
  assert.equal(isCyclicAction("stun"), true);
  assert.equal(isCyclicAction("reload"), false);
  for (const action of ["walk", "run", "idle"]) assert.equal(isCyclicAction(action), true);
  for (const action of ["jump", "attack", "custom"]) assert.equal(isCyclicAction(action), false);
});
