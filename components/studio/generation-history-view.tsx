"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useGeneratedImages } from "@/hooks/use-generated-images";
import type { GeneratedImageDocument, GenerationMode } from "@/lib/types";
import { getAspectRatioLabel } from "@/lib/aspect";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/components/providers/auth-provider";
import { REFERENCE_IMAGE_DOC_ID } from "@/components/studio/constants";
import { broadcastReferenceUpdate } from "@/components/studio/reference-sync";
import { shouldUseFirestore } from "@/lib/env";
import { deleteGeneratedImageDoc, saveGeneratedImageDoc, updateGeneratedImageDoc } from "@/lib/firebase/firestore";
import { deleteUserImage } from "@/lib/firebase/storage";
import { toast } from "sonner";

const HISTORY_LIMIT = 120;

type ModeFilterValue = "all" | GenerationMode;
type TimeframeValue = "all" | "1d" | "7d" | "30d" | "90d";

const MODE_LABEL: Record<GenerationMode, string> = {
  create: "이미지 생성",
  remix: "이미지 리믹스",
  camera: "카메라 앵글",
  crop: "크롭",
  "prompt-adapt": "프롬프트 변환",
  lighting: "조명",
  pose: "포즈",
  style: "스타일 프리셋",
  external: "외부 프리셋",
  upscale: "업스케일",
  sketch: "스케치 변환"
};

const MODE_FILTER_OPTIONS: { value: ModeFilterValue; label: string }[] = [
  { value: "all", label: "전체" },
  ...Object.entries(MODE_LABEL).map(([value, label]) => ({ value: value as GenerationMode, label }))
];

const TIMEFRAME_DURATIONS: Record<Exclude<TimeframeValue, "all">, number> = {
  "1d": 1 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000
};

const TIMEFRAME_OPTIONS: { value: TimeframeValue; label: string }[] = [
  { value: "all", label: "전체 기간" },
  { value: "1d", label: "최근 1일" },
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
  { value: "90d", label: "최근 90일" }
];

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

function GalleryCard({
  record,
  selected,
  onSelect,
  onToggleSelect
}: {
  record: GeneratedImageDocument;
  selected: boolean;
  onSelect: (record: GeneratedImageDocument) => void;
  onToggleSelect: (recordId: string) => void;
}) {
  const previewUrl = record.thumbnailUrl ?? record.imageUrl ?? record.originalImageUrl;
  const promptPreview = record.promptMeta?.refinedPrompt ?? record.promptMeta?.rawPrompt ?? "";

  const handleCardClick = () => {
    onSelect(record);
  };

  const handleKeyActivate = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(record);
    }
  };

  const handleCheckboxToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    onToggleSelect(record.id);
  };

  const handleCheckboxClick = (event: React.MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyActivate}
      className={cn(
        "group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/60 bg-card text-left shadow-sm transition focus:outline-none",
        "hover:border-primary/50 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary/60",
        selected ? "border-primary/70 ring-2 ring-primary/50" : ""
      )}
    >
      <div className="relative aspect-[9/16] w-full bg-muted">
        <div className="pointer-events-none absolute left-3 top-3 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 shadow">
          <input
            type="checkbox"
            checked={selected}
            onChange={handleCheckboxToggle}
            onClick={handleCheckboxClick}
            className="pointer-events-auto h-4 w-4 accent-primary"
            aria-label="이미지 선택"
          />
        </div>
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={promptPreview || "생성 이미지"}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-contain object-center transition duration-300"
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
    </div>
  );
}

export function GenerationHistoryView() {
  const { records, loading } = useGeneratedImages({ limitResults: HISTORY_LIMIT });
  const { user } = useAuth();
  const [selectedRecord, setSelectedRecord] = useState<GeneratedImageDocument | null>(null);
  const [modeFilter, setModeFilter] = useState<ModeFilterValue>("all");
  const [timeframeFilter, setTimeframeFilter] = useState<TimeframeValue>("all");
  const [localRecords, setLocalRecords] = useState<GeneratedImageDocument[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [imageFitMode, setImageFitMode] = useState<"contain" | "cover">("contain");

  useEffect(() => {
    setLocalRecords(records ?? []);
  }, [records]);

  const historyItems = useMemo(() => {
    if (!localRecords.length) {
      return [];
    }
    return [...localRecords].sort((a, b) => dateValueToEpoch(b.createdAt) - dateValueToEpoch(a.createdAt));
  }, [localRecords]);

  const filteredItems = useMemo(() => {
    let items = historyItems;

    if (modeFilter !== "all") {
      items = items.filter(record => record.mode === modeFilter);
    }

    if (timeframeFilter !== "all") {
      const threshold = Date.now() - TIMEFRAME_DURATIONS[timeframeFilter];
      items = items.filter(record => dateValueToEpoch(record.createdAt) >= threshold);
    }

    return items;
  }, [historyItems, modeFilter, timeframeFilter]);

  useEffect(() => {
    if (!selectedRecord) {
      return;
    }
    const stillVisible = filteredItems.some(record => record.id === selectedRecord.id);
    if (!stillVisible) {
      setSelectedRecord(null);
    }
  }, [filteredItems, selectedRecord]);

  useEffect(() => {
    if (selectedRecord) {
      setImageFitMode("contain");
    }
  }, [selectedRecord]);

  useEffect(() => {
    setSelectedIds(prev => {
      if (!prev.length) {
        return prev;
      }
      const availableIds = new Set(historyItems.map(record => record.id));
      const filtered = prev.filter(id => availableIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [historyItems]);

  const handleSelectRecord = (record: GeneratedImageDocument) => {
    setSelectedRecord(record);
  };

  const handleToggleRecordSelection = (recordId: string) => {
    setSelectedIds(prev =>
      prev.includes(recordId)
        ? prev.filter(id => id !== recordId)
        : [...prev, recordId]
    );
  };

  const visibleIds = useMemo(() => filteredItems.map(record => record.id), [filteredItems]);
  const recordMap = useMemo(() => {
    const map = new Map<string, GeneratedImageDocument>();
    historyItems.forEach(item => map.set(item.id, item));
    return map;
  }, [historyItems]);
  const hasSelection = selectedIds.length > 0;
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));

  const handleSelectAllVisible = () => {
    if (!visibleIds.length) {
      return;
    }
    setSelectedIds(prev => {
      if (visibleIds.every(id => prev.includes(id))) {
        return prev.filter(id => !visibleIds.includes(id));
      }
      const merged = new Set([...prev, ...visibleIds]);
      return Array.from(merged);
    });
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleDownloadSelected = () => {
    if (!selectedIds.length) {
      toast.error("다운로드할 이미지를 선택해주세요.");
      return;
    }

    const targets: DownloadTarget[] = [];
    selectedIds.forEach(id => {
      const record = recordMap.get(id);
      if (!record) {
        return;
      }
      const target = buildDownloadTarget(record);
      if (target) {
        targets.push(target);
      }
    });

    if (!targets.length) {
      toast.error("다운로드할 이미지를 찾을 수 없습니다.");
      return;
    }

    targets.forEach((target, index) => {
      startDownload(target, index * 200);
    });

    toast.success(`${targets.length}개의 이미지 다운로드를 시작했습니다.`);
  };

  type DownloadTarget = {
    href: string;
    filename: string;
  };

  const buildDownloadTarget = (record: GeneratedImageDocument): DownloadTarget | null => {
    const url = record.imageUrl ?? record.originalImageUrl ?? record.thumbnailUrl;
    if (!url) {
      return null;
    }

    const filename = `${record.id}.png`;

    if (url.startsWith("data:")) {
      return { href: url, filename };
    }

    const mediaUrl = url.includes("alt=media") ? url : `${url}${url.includes("?") ? "&" : "?"}alt=media`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(filename)}`;
    return { href: downloadUrl, filename };
  };

  const startDownload = (target: DownloadTarget, delayMs = 0) => {
    if (typeof window === "undefined") {
      return;
    }

    const trigger = () => {
      const link = document.createElement("a");
      link.href = target.href;
      link.download = target.filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    if (delayMs > 0) {
      window.setTimeout(trigger, delayMs);
    } else {
      trigger();
    }
  };

  const handleDownloadRecord = (record: GeneratedImageDocument) => {
    const target = buildDownloadTarget(record);
    if (!target) {
      toast.error("다운로드할 이미지를 찾을 수 없습니다.");
      return;
    }

    startDownload(target);
  };

  const updateRecordInState = (recordId: string, updater: (record: GeneratedImageDocument) => GeneratedImageDocument) => {
    setLocalRecords(prev => prev.map(item => (item.id === recordId ? updater(item) : item)));
    setSelectedRecord(prev => (prev && prev.id === recordId ? updater(prev) : prev));
  };

  const handleToggleFavorite = async (record: GeneratedImageDocument) => {
    const nextFavorite = record.metadata?.favorite !== true;
    const updatedRecord = {
      ...record,
      metadata: { ...(record.metadata ?? {}), favorite: nextFavorite }
    } as GeneratedImageDocument;

    updateRecordInState(record.id, () => updatedRecord);

    if (user && shouldUseFirestore) {
      try {
        await updateGeneratedImageDoc(user.uid, record.id, {
          metadata: { ...(record.metadata ?? {}), favorite: nextFavorite }
        });
      } catch (error) {
        console.warn("[History] Failed to toggle favorite", error);
        updateRecordInState(record.id, () => record);
        toast.error("즐겨찾기 상태를 저장하지 못했습니다.");
        return;
      }
    }

    toast.success(nextFavorite ? "즐겨찾기에 추가했습니다." : "즐겨찾기를 해제했습니다.");
  };

  const handleDeleteRecord = async (record: GeneratedImageDocument) => {
    if (!user) {
      toast.error("로그인이 필요합니다.");
      return;
    }

    const confirmed = window.confirm("이 이미지를 삭제하시겠어요? 이 작업은 되돌릴 수 없습니다.");
    if (!confirmed) {
      return;
    }

    setLocalRecords(prev => prev.filter(item => item.id !== record.id));
    setSelectedRecord(prev => (prev && prev.id === record.id ? null : prev));

    if (shouldUseFirestore) {
      try {
        await deleteGeneratedImageDoc(user.uid, record.id);
      } catch (error) {
        console.warn("[History] Failed to delete Firestore document", error);
        toast.error("기록을 삭제하지 못했습니다.");
        return;
      }
    }

    try {
      if (record.imageUrl && !record.imageUrl.startsWith("data:")) {
        await deleteUserImage(user.uid, record.id);
      }
    } catch (error) {
      console.warn("[History] Failed to delete storage image", error);
    }

    toast.success("이미지를 삭제했습니다.");
  };

  const handleSetReference = async (record: GeneratedImageDocument) => {
    const imageUrl = record.imageUrl ?? record.originalImageUrl ?? null;
    if (!imageUrl) {
      toast.error("기준 이미지를 불러올 수 없습니다.");
      return;
    }

    const nowIso = new Date().toISOString();
    const createdAtIso = toDate(record.createdAt)?.toISOString() ?? nowIso;
    const referenceRecord: GeneratedImageDocument = {
      ...record,
      id: REFERENCE_IMAGE_DOC_ID,
      originalImageUrl: record.originalImageUrl ?? imageUrl,
      thumbnailUrl: record.thumbnailUrl ?? imageUrl,
      diff: undefined,
      metadata: { ...(record.metadata ?? {}), isReference: true, referenceSourceId: record.id },
      createdAt: createdAtIso,
      updatedAt: nowIso
    };

    broadcastReferenceUpdate(referenceRecord, "history");

    if (user && shouldUseFirestore) {
      try {
        await saveGeneratedImageDoc(user.uid, REFERENCE_IMAGE_DOC_ID, {
          mode: record.mode,
          status: record.status,
          promptMeta: record.promptMeta,
          imageUrl,
          thumbnailUrl: record.thumbnailUrl ?? imageUrl,
          originalImageUrl: record.originalImageUrl ?? imageUrl,
          metadata: { ...(record.metadata ?? {}), isReference: true, referenceSourceId: record.id },
          model: record.model,
          costCredits: record.costCredits,
          createdAtIso,
          updatedAtIso: nowIso
        });
      } catch (error) {
        console.error("[History] Failed to persist reference", error);
        toast.error("기준 이미지를 저장하지 못했습니다.");
        return;
      }
    }

    toast.success("기준 이미지로 설정했습니다.");
  };

  const primaryPrompt = selectedRecord?.promptMeta?.refinedPrompt || selectedRecord?.promptMeta?.rawPrompt;
  const rawPromptOnly =
    selectedRecord && selectedRecord.promptMeta?.refinedPrompt && selectedRecord.promptMeta.rawPrompt &&
    selectedRecord.promptMeta.refinedPrompt !== selectedRecord.promptMeta.rawPrompt
      ? selectedRecord.promptMeta.rawPrompt
      : undefined;
  const negativePrompt = selectedRecord?.promptMeta?.negativePrompt;
  const modalImageUrl = selectedRecord
    ? selectedRecord.imageUrl ?? selectedRecord.thumbnailUrl ?? selectedRecord.originalImageUrl ?? ""
    : "";
  const originalImageUrl = selectedRecord
    ? selectedRecord.originalImageUrl ?? selectedRecord.imageUrl ?? selectedRecord.thumbnailUrl ?? ""
    : "";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 pb-28">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">생성 기록</h1>
        <p className="text-sm text-muted-foreground">
          최근에 만든 이미지들을 한눈에 살펴보고, 사용한 프롬프트와 세부 정보를 확인하세요.
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">필터</span>
          <span className="text-xs text-muted-foreground">
            총 {historyItems.length}개 중 {filteredItems.length}개 표시
          </span>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">생성 모드</span>
            <ToggleGroup
              type="single"
              value={modeFilter}
              onValueChange={value => setModeFilter((value as ModeFilterValue) || "all")}
              className="flex flex-wrap gap-2"
              aria-label="생성 모드 필터"
            >
              {MODE_FILTER_OPTIONS.map(option => {
                const isDisabled = option.value !== "all" && !historyItems.some(record => record.mode === option.value);
                return (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    disabled={isDisabled}
                    className="disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {option.label}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">기간</span>
            <ToggleGroup
              type="single"
              value={timeframeFilter}
              onValueChange={value => setTimeframeFilter((value as TimeframeValue) || "all")}
              className="flex flex-wrap gap-2"
              aria-label="기간 필터"
            >
              {TIMEFRAME_OPTIONS.map(option => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">선택</span>
          <span className="text-xs text-muted-foreground">
            선택 {selectedIds.length}개 / 표시 {filteredItems.length}개
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSelectAllVisible}
            disabled={!filteredItems.length}
          >
            {allVisibleSelected ? "선택 해제" : "전체 선택"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleClearSelection}
            disabled={!hasSelection}
          >
            선택 초기화
          </Button>
          <Button
            size="sm"
            onClick={handleDownloadSelected}
            disabled={!hasSelection}
          >
            일괄 다운로드
          </Button>
        </div>
      </div>

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

      {!loading && historyItems.length > 0 && filteredItems.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-muted/20 py-20 text-center">
          <p className="text-base font-medium text-foreground">선택한 조건에 맞는 기록이 없습니다.</p>
          <p className="text-sm text-muted-foreground">필터를 조정하거나 기간을 넓혀보세요.</p>
        </div>
      ) : null}

      {filteredItems.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filteredItems.map(record => {
            const isSelected = selectedIds.includes(record.id);
            return (
              <GalleryCard
                key={record.id}
                record={record}
                selected={isSelected}
                onSelect={handleSelectRecord}
                onToggleSelect={handleToggleRecordSelection}
              />
            );
          })}
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
              <div className="relative aspect-[9/16] w-full max-h-[80vh] overflow-hidden rounded-2xl border border-border/60 bg-muted">
                {modalImageUrl ? (
                  <>
                    <div className="absolute left-4 top-4 z-20 rounded-full bg-black/40 px-2 py-1 backdrop-blur">
                      <ToggleGroup
                        type="single"
                        value={imageFitMode}
                        onValueChange={value => setImageFitMode((value as "contain" | "cover") || "contain")}
                        className="flex gap-1"
                        aria-label="이미지 표시 방식"
                      >
                        <ToggleGroupItem
                          value="contain"
                          className={cn(
                            "h-7 rounded-full px-3 text-xs text-white transition",
                            "data-[state=on]:bg-white data-[state=on]:text-black"
                          )}
                        >
                          전체
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="cover"
                          className={cn(
                            "h-7 rounded-full px-3 text-xs text-white transition",
                            "data-[state=on]:bg-white data-[state=on]:text-black"
                          )}
                        >
                          채우기
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                    <Image
                      src={modalImageUrl}
                      alt={primaryPrompt ?? "생성 이미지"}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className={cn(
                        imageFitMode === "cover" ? "object-cover" : "object-contain",
                        "transition-all duration-300"
                      )}
                      priority
                    />
                  </>
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

                <div className="flex flex-wrap gap-2 pt-2">
                  {originalImageUrl ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={originalImageUrl} target="_blank" rel="noreferrer">
                        원본 보기
                      </a>
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => handleSetReference(selectedRecord)}>
                    기준이미지
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadRecord(selectedRecord)}
                  >
                    다운로드
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteRecord(selectedRecord)}
                  >
                    삭제
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedRecord.metadata?.favorite ? "secondary" : "outline"}
                    onClick={() => handleToggleFavorite(selectedRecord)}
                  >
                    {selectedRecord.metadata?.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
