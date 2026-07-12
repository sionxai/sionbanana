"use client";

import type { KeyboardEvent } from "react";
import type { GalleryCategory } from "@/lib/presets/gallery-catalog";
import { cn } from "@/lib/utils";

type GalleryAction = "insert-prompt" | "run-batch";

interface PresetFilterBarProps {
  showActionTabs?: boolean;
  action: GalleryAction;
  onActionChange: (action: GalleryAction) => void;
  actionCounts?: Partial<Record<GalleryAction, number>>;
  categories: Array<{
    id: GalleryCategory | "all";
    name: string;
    count: number;
  }>;
  activeCategory: GalleryCategory | "all";
  onCategoryChange: (category: GalleryCategory | "all") => void;
  query: string;
  onQueryChange: (query: string) => void;
  resultCount?: number;
}

const ACTION_TABS: Array<{
  id: GalleryAction;
  label: string;
  activeClassName: string;
}> = [
  {
    id: "insert-prompt",
    label: "프롬프트",
    activeClassName: "bg-sky-500 text-white shadow-sm hover:bg-sky-500/90"
  },
  {
    id: "run-batch",
    label: "배치",
    activeClassName:
      "bg-amber-500 text-amber-950 shadow-sm hover:bg-amber-500/90"
  }
];

export function PresetFilterBar({
  showActionTabs = false,
  action,
  onActionChange,
  actionCounts,
  categories,
  activeCategory,
  onCategoryChange,
  query,
  onQueryChange,
  resultCount
}: PresetFilterBarProps) {
  const fallbackCount = categories.find(({ id }) => id === "all")?.count ?? 0;

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      onQueryChange("");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {showActionTabs ? (
        <div
          role="tablist"
          aria-label="프리셋 액션"
          className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/50 p-1"
        >
          {ACTION_TABS.map((tab) => {
            const isActive = action === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
                  isActive
                    ? tab.activeClassName
                    : "text-muted-foreground hover:bg-background hover:text-foreground"
                )}
                onClick={() => onActionChange(tab.id)}
              >
                {tab.label}{" "}
                <span className="font-mono text-[10.5px] opacity-80">
                  {actionCounts?.[tab.id] ?? fallbackCount}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border bg-background px-3.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            type="search"
            value={query}
            aria-label="프리셋 검색"
            placeholder="프리셋 검색 — 제목·설명·태그"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {query ? (
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="검색어 지우기"
              onClick={() => onQueryChange("")}
            >
              <span aria-hidden="true">✕</span>
            </button>
          ) : null}
        </div>
        {query && resultCount !== undefined ? (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {resultCount}개 결과
          </span>
        ) : null}
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1"
        aria-label="프리셋 카테고리"
      >
        {categories.map((category) => {
          if (category.id !== "all" && category.count === 0) {
            return null;
          }

          const isActive = activeCategory === category.id;
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={isActive}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
                isActive
                  ? "bg-foreground text-background"
                  : "bg-background hover:bg-muted"
              )}
              onClick={() => onCategoryChange(category.id)}
            >
              {category.name}{" "}
              <span className="font-mono text-[10.5px] opacity-70">
                {category.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
