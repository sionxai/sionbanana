import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countByCategory,
  filterGalleryCards,
  matchesGalleryQuery
} from "@/lib/presets/gallery-filter";

const cards = [
  {
    id: "prompt:fashion-editorial",
    action: "insert-prompt",
    category: "fashion",
    titleKo: "패션 에디토리얼",
    titleEn: "Fashion Editorial",
    description: "스튜디오에서 촬영한 세련된 인물 화보",
    tags: ["인물", "매거진", "Lookbook"],
    version: "v1",
    modelBadge: "Image",
    thumbnail: { kind: "placeholder" }
  },
  {
    id: "prompt:food-ad",
    action: "insert-prompt",
    category: "food",
    titleKo: "푸드 광고",
    titleEn: "Food Ad",
    description: "따뜻한 자연광의 디저트 제품 사진",
    tags: ["Dessert", "광고"],
    version: "v1",
    modelBadge: "Image",
    thumbnail: { kind: "placeholder" }
  },
  {
    id: "prompt:product-studio",
    action: "insert-prompt",
    category: "product",
    titleKo: "제품 스튜디오",
    description: "미니멀한 배경의 상업 제품 사진",
    tags: ["광고", "패키지"],
    version: "v1",
    modelBadge: "Image",
    thumbnail: { kind: "placeholder" }
  }
];

test("matchesGalleryQuery requires every whitespace-separated term", () => {
  assert.equal(matchesGalleryQuery(cards[0], "패션 스튜디오"), true);
  assert.equal(matchesGalleryQuery(cards[0], "패션 디저트"), false);
  assert.equal(matchesGalleryQuery(cards[0], "   "), true);
});

test("matchesGalleryQuery ignores letter case", () => {
  assert.equal(matchesGalleryQuery(cards[0], "fAsHiOn EDITORIAL"), true);
});

test("matchesGalleryQuery searches tags", () => {
  assert.equal(matchesGalleryQuery(cards[1], "DESSERT"), true);
  assert.equal(matchesGalleryQuery(cards[2], "패키지"), true);
});

test("filterGalleryCards combines category and query", () => {
  assert.deepEqual(
    filterGalleryCards(cards, { category: "food", query: "광고 dessert" }).map(
      (card) => card.id
    ),
    ["prompt:food-ad"]
  );
  assert.deepEqual(
    filterGalleryCards(cards, { category: "fashion", query: "광고" }),
    []
  );
});

test("countByCategory includes query-matched total in all", () => {
  const counts = countByCategory(cards, "광고");

  assert.equal(counts.all, 2);
  assert.equal(counts.food, 1);
  assert.equal(counts.product, 1);
  assert.equal(counts.fashion, 0);
  assert.equal(counts.ad, 0);
  assert.equal(
    counts.all,
    Object.entries(counts)
      .filter(([category]) => category !== "all")
      .reduce((sum, [, count]) => sum + count, 0)
  );
});
