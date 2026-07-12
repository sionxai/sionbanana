import {
  GALLERY_CATEGORIES,
  type GalleryCard,
  type GalleryCategory
} from "@/lib/presets/gallery-catalog";

export function matchesGalleryQuery(
  card: GalleryCard,
  query: string
): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (terms.length === 0) {
    return true;
  }

  const searchableText = [
    card.titleKo,
    card.titleEn ?? "",
    card.description,
    card.tags.join(" ")
  ]
    .join(" ")
    .toLowerCase();

  return terms.every((term) => searchableText.includes(term));
}

export function filterGalleryCards(
  cards: GalleryCard[],
  opts: {
    category?: GalleryCategory | "all";
    query?: string;
  }
): GalleryCard[] {
  return cards.filter((card) => {
    const matchesCategory =
      !opts.category || opts.category === "all" || card.category === opts.category;

    return matchesCategory && matchesGalleryQuery(card, opts.query ?? "");
  });
}

export function countByCategory(
  cards: GalleryCard[],
  query = ""
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries([
    ["all", 0],
    ...GALLERY_CATEGORIES.map(({ id }) => [id, 0])
  ]);

  for (const card of cards) {
    if (!matchesGalleryQuery(card, query)) {
      continue;
    }

    counts.all += 1;
    counts[card.category] = (counts[card.category] ?? 0) + 1;
  }

  return counts;
}
