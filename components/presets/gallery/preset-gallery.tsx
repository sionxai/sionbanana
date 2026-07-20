"use client";

import { useMemo, useState } from "react";
import { PresetCard } from "@/components/presets/gallery/preset-card";
import { PresetFilterBar } from "@/components/presets/gallery/preset-filter-bar";
import {
  GALLERY_CATEGORIES,
  type GalleryCard,
  type GalleryCategory
} from "@/lib/presets/gallery-catalog";
import {
  countByCategory,
  filterGalleryCards
} from "@/lib/presets/gallery-filter";

type GalleryAction = "insert-prompt" | "run-batch";

interface PresetGalleryProps {
  promptCards: GalleryCard[];
  batchCards: GalleryCard[];
  onApplyPrompt: (card: GalleryCard) => void;
  onRunBatch: (card: GalleryCard) => void;
  isReferenceAvailable: boolean;
  /** 배치가 이미 실행 중이면 모든 배치 카드를 비활성화한다(동시 실행 방지). */
  isBatchBusy?: boolean;
  pendingCommandId?: string | null;
  promptActionLabel?: string;
  defaultAction?: GalleryAction;
}

export function PresetGallery({
  promptCards,
  batchCards,
  onApplyPrompt,
  onRunBatch,
  isReferenceAvailable,
  isBatchBusy = false,
  pendingCommandId,
  promptActionLabel,
  defaultAction = "insert-prompt"
}: PresetGalleryProps) {
  const [action, setAction] = useState<GalleryAction>(defaultAction);
  const [category, setCategory] = useState<GalleryCategory | "all">("all");
  const [query, setQuery] = useState("");

  const sourceCards = action === "insert-prompt" ? promptCards : batchCards;
  const categoryCounts = useMemo(
    () => countByCategory(sourceCards, query),
    [sourceCards, query]
  );
  const actionCounts = useMemo(
    () => ({
      "insert-prompt": countByCategory(promptCards, query).all,
      "run-batch": countByCategory(batchCards, query).all
    }),
    [batchCards, promptCards, query]
  );
  const categories = useMemo(
    () => [
      { id: "all" as const, name: "전체", count: categoryCounts.all },
      ...GALLERY_CATEGORIES.map(({ id, name }) => ({
        id,
        name,
        count: categoryCounts[id] ?? 0
      }))
    ],
    [categoryCounts]
  );
  const visibleCards = useMemo(
    () =>
      filterGalleryCards(sourceCards, { category, query }).sort((left, right) => {
        const leftIsHero = left.id === "external:editorial-ad-poster";
        const rightIsHero = right.id === "external:editorial-ad-poster";
        return Number(rightIsHero) - Number(leftIsHero);
      }),
    [category, query, sourceCards]
  );

  function handleActionChange(nextAction: GalleryAction) {
    setAction(nextAction);
    setCategory("all");
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    setCategory("all");
  }

  return (
    <section className="flex flex-col gap-4">
      <PresetFilterBar
        showActionTabs
        action={action}
        onActionChange={handleActionChange}
        actionCounts={actionCounts}
        categories={categories}
        activeCategory={category}
        onCategoryChange={setCategory}
        query={query}
        onQueryChange={handleQueryChange}
        resultCount={visibleCards.length}
      />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4">
        {visibleCards.length === 0 ? (
          <p className="col-span-full py-16 text-center text-muted-foreground">
            {query
              ? `'${query}'에 맞는 프리셋이 없습니다.`
              : "해당 프리셋이 없습니다."}
          </p>
        ) : (
          visibleCards.map((card) => {
            if (action === "insert-prompt") {
              return (
                <PresetCard
                  key={card.id}
                  card={card}
                  onApply={onApplyPrompt}
                  promptActionLabel={promptActionLabel}
                />
              );
            }

            return (
              <PresetCard
                key={card.id}
                card={card}
                onApply={onRunBatch}
                disabled={!isReferenceAvailable || isBatchBusy}
                referenceMissing={!isReferenceAvailable}
                pending={pendingCommandId === card.batch?.commandId}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
