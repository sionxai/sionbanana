"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  GALLERY_CATEGORIES,
  type GalleryCard,
  type GalleryCategory
} from "@/lib/presets/gallery-catalog";
import { cn } from "@/lib/utils";

const CATEGORY_GRADIENT: Record<
  GalleryCategory,
  { className: string; icon: string }
> = {
  ad: {
    className: "from-pink-400 via-orange-300 to-yellow-300",
    icon: "📸"
  },
  fashion: { className: "from-indigo-400 to-fuchsia-400", icon: "🧥" },
  character: { className: "from-sky-400 to-blue-500", icon: "🎭" },
  camera: { className: "from-emerald-400 to-teal-400", icon: "🎥" },
  product: { className: "from-orange-400 to-amber-400", icon: "🛍️" },
  space: { className: "from-blue-500 to-cyan-400", icon: "🏙️" },
  story: { className: "from-violet-400 to-pink-400", icon: "🎬" },
  info: { className: "from-sky-400 to-cyan-300", icon: "📊" },
  edit: { className: "from-teal-400 to-emerald-300", icon: "🪄" },
  food: { className: "from-orange-400 to-yellow-300", icon: "🍽️" }
};

const CATEGORY_NAME = Object.fromEntries(
  GALLERY_CATEGORIES.map(({ id, name }) => [id, name])
) as Record<GalleryCategory, string>;

interface PresetCardProps {
  card: GalleryCard;
  onApply: (card: GalleryCard) => void;
  disabled?: boolean;
  pending?: boolean;
  referenceMissing?: boolean;
  promptActionLabel?: string;
}

function getBatchActionLabel(expectedOutput?: string): string {
  const count = expectedOutput?.match(/\d+/)?.[0];
  return count ? `${count}장 생성` : "생성";
}

export function PresetCard({
  card,
  onApply,
  disabled = false,
  pending = false,
  referenceMissing = false,
  promptActionLabel
}: PresetCardProps) {
  const placeholder = CATEGORY_GRADIENT[card.category];
  const visibleTags = card.tags.slice(0, 5);
  const hiddenTagCount = Math.max(card.tags.length - visibleTags.length, 0);
  const isBatch = card.action === "run-batch";
  const batchDisabled = disabled || pending || !card.batch;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md motion-reduce:transition-none">
      <div className="relative aspect-[4/3] overflow-hidden">
        {card.thumbnail.kind === "curated" && card.thumbnail.src ? (
          <Image
            src={card.thumbnail.src}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br",
              placeholder.className
            )}
          >
            <span className="text-4xl" aria-hidden="true">
              {placeholder.icon}
            </span>
            <span className="rounded-full bg-black/20 px-2.5 py-1 text-[10.5px] font-medium text-white backdrop-blur-sm">
              {CATEGORY_NAME[card.category]}
            </span>
          </div>
        )}

        <span
          className={cn(
            "absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold text-white shadow-sm backdrop-blur-md",
            isBatch ? "bg-amber-600/80" : "bg-sky-600/80"
          )}
        >
          {isBatch ? "배치" : "프롬프트"}
        </span>
        <span className="absolute right-2.5 top-2.5 rounded-full bg-black/40 px-2 py-1 font-mono text-[9.5px] text-white shadow-sm backdrop-blur-md">
          {card.modelBadge} · {card.version}
        </span>
        {card.id === "external:editorial-ad-poster" ? (
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-yellow-300 px-2 py-0.5 text-[10px] font-black text-yellow-950 shadow-sm">
            NEW
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div>
          <h3 className="text-sm font-bold">{card.titleKo}</h3>
          {card.titleEn ? (
            <p className="font-mono text-[10.5px] text-muted-foreground">
              {card.titleEn}
            </p>
          ) : null}
        </div>

        <p className="line-clamp-2 text-xs text-muted-foreground">
          {card.description}
        </p>

        <div className="flex flex-wrap gap-1">
          {visibleTags.map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className="rounded-md border bg-muted/50 px-1.5 py-0.5 text-[10.5px]"
            >
              {tag}
            </span>
          ))}
          {hiddenTagCount > 0 ? (
            <span className="rounded-md border bg-muted/50 px-1.5 py-0.5 text-[10.5px]">
              +{hiddenTagCount}
            </span>
          ) : null}
        </div>

        {isBatch ? (
          <div className="flex min-h-6 items-center justify-between gap-2 text-[10.5px]">
            {referenceMissing ? (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                ⚑ 기준 이미지 필요
              </span>
            ) : (
              <span />
            )}
            <span className="ml-auto font-mono text-muted-foreground">
              예상 {card.batch?.expectedOutput ?? "정보 없음"}
            </span>
          </div>
        ) : null}

        <div className="mt-auto pt-1">
          {isBatch ? (
            <Button
              type="button"
              className="w-full bg-amber-500 text-amber-950 hover:bg-amber-500/90"
              disabled={batchDisabled}
              onClick={() => onApply(card)}
            >
              {pending
                ? "생성 중..."
                : `▶ ${getBatchActionLabel(card.batch?.expectedOutput)}`}
            </Button>
          ) : (
            <div className="flex gap-1.5">
              <Button
                type="button"
                className="w-full bg-sky-500 text-white hover:bg-sky-500/90"
                disabled={disabled || pending}
                onClick={() => onApply(card)}
              >
                {promptActionLabel ?? "프롬프트에 추가"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                title="전체 복사"
                aria-label="전체 복사"
                disabled={disabled || pending}
                onClick={() => onApply(card)}
              >
                <span aria-hidden="true">⧉</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
