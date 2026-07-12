import assert from "node:assert/strict";
import { test } from "node:test";

import { EXTERNAL_PRESET_GROUPS } from "../components/studio/external-preset-config.ts";
import {
  BATCH_GALLERY_CARDS,
  GALLERY_CATEGORIES,
  buildExternalGalleryCards,
  getGalleryCards
} from "../lib/presets/gallery-catalog.ts";

test("batch gallery exposes the 10 unique reference-based commands", () => {
  assert.equal(BATCH_GALLERY_CARDS.length, 10);

  const commandIds = BATCH_GALLERY_CARDS.map(
    (card) => card.batch?.commandId
  );
  assert.equal(new Set(commandIds).size, 10);

  for (const card of BATCH_GALLERY_CARDS) {
    assert.equal(card.action, "run-batch");
    assert.equal(card.batch?.requiresReference, true);
    assert.ok(card.batch?.expectedOutput);
  }
});

test("external presets normalize to one prompt card per option", () => {
  const cards = buildExternalGalleryCards();
  const optionCount = EXTERNAL_PRESET_GROUPS.reduce(
    (count, group) => count + group.options.length,
    0
  );

  assert.equal(optionCount, 92);
  assert.equal(cards.length, optionCount);

  for (const card of cards) {
    assert.equal(card.action, "insert-prompt");
    assert.ok(card.prompt);
  }
});

test("editorial ad poster keeps its curated gallery metadata", () => {
  const card = buildExternalGalleryCards().find(
    ({ id }) => id === "external:editorial-ad-poster"
  );

  assert.ok(card);
  assert.equal(card.category, "ad");
  assert.equal(card.thumbnail.kind, "curated");
  assert.ok(card.tags.includes("광고"));
});

test("external case ids map to their specified categories", () => {
  const cardsById = new Map(
    buildExternalGalleryCards().map((card) => [card.id, card])
  );

  assert.equal(cardsById.get("external:case-06")?.category, "fashion");
  assert.equal(cardsById.get("external:case-04")?.category, "space");
  assert.equal(cardsById.get("external:case-18")?.category, "food");
});

test("external cards keep bounded tags and known categories", () => {
  const categoryNames = new Set(
    GALLERY_CATEGORIES.map((category) => category.name)
  );

  for (const card of buildExternalGalleryCards()) {
    assert.ok(card.tags.length >= 1 && card.tags.length <= 5);
    assert.ok(
      GALLERY_CATEGORIES.some((category) => category.id === card.category)
    );

    if (card.id !== "external:editorial-ad-poster") {
      assert.ok(categoryNames.has(card.tags[0]));
    }
  }
});

test("gallery accessor returns the requested action catalog", () => {
  assert.equal(getGalleryCards("insert-prompt").length, 92);
  assert.equal(getGalleryCards("run-batch").length, 10);
});
