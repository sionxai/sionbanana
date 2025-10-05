"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useGeneratedImages } from "@/hooks/use-generated-images";
import type { GeneratedImageDocument } from "@/lib/types";
import { getAspectRatioLabel } from "@/lib/aspect";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const HISTORY_LIMIT = 120;

type FirestoreTimestampLike = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

function toDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "object") {
    const timestamp = value as FirestoreTimestampLike;
    if (typeof timestamp.toDate === "function") {
      return timestamp.toDate();
    }
    if (typeof timestamp.seconds === "number") {
      const milliseconds = timestamp.seconds * 1000 + (timestamp.nanoseconds ?? 0) / 1_000_000;
      const parsed = new Date(milliseconds);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

function formatDate(value: unknown) {
  const parsed = toDate(value);
  if (!parsed) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function dateValueToEpoch(value: unknown) {
  const parsed = toDate(value);
  return parsed ? parsed.getTime() : 0;
}

function PromptBlock({
  title,
  value,
  helper
}: {
  title: string;
  value?: string;
  helper?: string;
}) {
  if (!value) {
    return null;
  }

  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      console.warn("Failed to copy prompt", error);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleCopy}>
          복사
        </Button>
      </div>
      <p className="rounded-xl border border-border/60 bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
        {value}
      </p>
      {helper ? <p className="text-xs text-muted-foreground/70">{helper}</p> : null}
    </div>
  );
}

function GalleryCard({ record, onSelect }: { record: GeneratedImageDocument; onSelect: (record: GeneratedImageDocument) => void }) {
  const previewUrl = record.thumbnailUrl ?? record.imageUrl ?? record.originalImageUrl;
  const promptPreview = record.promptMeta?.refinedPrompt ?? record.promptMeta?.rawPrompt ?? "";

  return (
    <button
      type="button"
      onClick={() => onSelect(record)}
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card text-left shadow-sm transition",
        "hover:border-primary/50 hover:shadow-lg"
      )}
    >
      <div className="relative aspect-square w-full bg-muted">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={promptPreview || "생성 이미지"}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition will-change-transform group-hover:scale-[1.02]"
            priority={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">미리보기 없음</div>
        )}
        {promptPreview ? (
          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-xs text-white/90 line-clamp-2">
            {promptPreview}
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-3 text-xs text-muted-foreground">
        <span className="truncate">{formatDate(record.createdAt)}</span>
        <Badge variant="outline" className="uppercase tracking-wide">
          {record.mode}
        </Badge>
      </div>
    </button>
  );
}

export function GenerationHistoryView() {
  const { records, loading } = useGeneratedImages({ limitResults: HISTORY_LIMIT });
  const [selectedRecord, setSelectedRecord] = useState<GeneratedImageDocument | null>(null);

  const historyItems = useMemo(() => {
    if (!records?.length) {
      return [];
    }
    return [...records].sort((a, b) => dateValueToEpoch(b.createdAt) - dateValueToEpoch(a.createdAt));
  }, [records]);

  const primaryPrompt = selectedRecord?.promptMeta?.refinedPrompt || selectedRecord?.promptMeta?.rawPrompt;
  const rawPromptOnly =
    selectedRecord && selectedRecord.promptMeta?.refinedPrompt && selectedRecord.promptMeta.rawPrompt &&
    selectedRecord.promptMeta.refinedPrompt !== selectedRecord.promptMeta.rawPrompt
      ? selectedRecord.promptMeta.rawPrompt
      : undefined;
  const negativePrompt = selectedRecord?.promptMeta?.negativePrompt;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 pb-28">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">생성 기록</h1>
        <p className="text-sm text-muted-foreground">
          최근에 만든 이미지들을 한눈에 살펴보고, 사용한 프롬프트와 세부 정보를 확인하세요.
        </p>
      </header>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`history-loading-${index}`}
              className="h-full w-full animate-pulse rounded-2xl border border-border/60 bg-muted/40"
            />
          ))}
        </div>
      ) : null}

      {!loading && historyItems.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-muted/20 py-20 text-center">
          <p className="text-base font-medium text-foreground">아직 생성한 이미지가 없습니다.</p>
          <p className="text-sm text-muted-foreground">스튜디오에서 이미지를 생성하면 이곳에 기록이 쌓입니다.</p>
        </div>
      ) : null}

      {historyItems.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {historyItems.map(record => (
            <GalleryCard key={record.id} record={record} onSelect={setSelectedRecord} />
          ))}
        </div>
      ) : null}

      {selectedRecord ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-10"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-background shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedRecord(null)}
              className="absolute right-5 top-5 rounded-full bg-black/40 px-3 py-1 text-xs text-white backdrop-blur transition hover:bg-black/60"
            >
              닫기
            </button>

            <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_1fr]">
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border/60 bg-muted">
                {selectedRecord.imageUrl || selectedRecord.thumbnailUrl || selectedRecord.originalImageUrl ? (
                  <Image
                    src={selectedRecord.imageUrl ?? selectedRecord.thumbnailUrl ?? selectedRecord.originalImageUrl ?? ""}
                    alt={primaryPrompt ?? "생성 이미지"}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-contain"
                    priority
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                    이미지 미리보기를 불러오지 못했습니다.
                  </div>
                )}
              </div>

              <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{formatDate(selectedRecord.createdAt)}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="uppercase tracking-wide">
                      {selectedRecord.mode}
                    </Badge>
                    <span>•</span>
                    <span>{selectedRecord.model}</span>
                    {selectedRecord.promptMeta?.aspectRatio ? (
                      <>
                        <span>•</span>
                        <span>{getAspectRatioLabel(selectedRecord.promptMeta.aspectRatio)}</span>
                      </>
                    ) : null}
                    {selectedRecord.costCredits ? (
                      <>
                        <span>•</span>
                        <span>{selectedRecord.costCredits} credits</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <PromptBlock
                  title="최종 프롬프트"
                  value={primaryPrompt}
                />
                <PromptBlock
                  title="원본 프롬프트"
                  value={rawPromptOnly}
                  helper="모델에 전달하기 전에 정제되기 전의 입력입니다."
                />
                <PromptBlock title="네거티브 프롬프트" value={negativePrompt} />

                {selectedRecord.promptMeta?.referenceGallery && selectedRecord.promptMeta.referenceGallery.length ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground">참조 이미지</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedRecord.promptMeta.referenceGallery.map(url => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative block h-20 w-20 overflow-hidden rounded-lg border border-border/60"
                        >
                          <Image
                            src={url}
                            alt="reference"
                            fill
                            sizes="80px"
                            className="object-cover transition group-hover:scale-105"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
