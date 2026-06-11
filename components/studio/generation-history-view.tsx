"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Film, Play } from "lucide-react";
import { useGeneratedImages } from "@/hooks/use-generated-images";
import type { GeneratedImageDocument, GenerationMode } from "@/lib/types";
import { getAspectRatioLabel } from "@/lib/aspect";
import {
  getHistoryRecordTags,
  getHistoryTagOptions,
  isHistoryRecordFavorite,
  setHistoryRecordFavorite,
  setHistoryRecordTags
} from "@/lib/history-records";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
const LOCAL_AUTH = { user: { uid: "local" } } as const;
const useLocalUser = () => LOCAL_AUTH;
import { REFERENCE_IMAGE_DOC_ID } from "@/components/studio/constants";
import {
  broadcastHistoryUpdate,
  createVideoHistoryRecord,
  HISTORY_REFRESH_EVENT,
  isVideoHistoryRecord,
  persistRecordsMerge,
  removeRecordFromLocalStorage
} from "@/components/studio/history-sync";
import { broadcastReferenceUpdate } from "@/components/studio/reference-sync";
import { VideoModal, type VideoCreatedResult } from "@/components/studio/video-modal";
import { toast } from "sonner";

const PAGE_SIZE = 36;
const SERVER_IMAGE_PAGE_SIZE = 60;
const SERVER_VIDEO_METADATA_FLAG = "serverVideo";
const SERVER_IMAGE_METADATA_FLAG = "serverImage";

type DiskVideoHistoryEntry = {
  id: string;
  bucket?: string;
  videoUrl?: string;
  createdAtIso: string;
  sourceImageId?: string;
  prompt?: string;
  model?: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  requestId?: string;
  bytes?: number;
};

type VideoHistoryApiResponse = {
  ok?: boolean;
  videos?: DiskVideoHistoryEntry[];
  reason?: string;
};

function getLocalImageId(url?: string | null): string | null {
  const match = url?.match(/^\/api\/images\/([A-Za-z0-9_\-]+)/);
  return match?.[1] ?? null;
}

function isServerVideoHistoryRecord(record: GeneratedImageDocument): boolean {
  return isVideoHistoryRecord(record) && record.metadata?.[SERVER_VIDEO_METADATA_FLAG] === true;
}

function isServerImageHistoryRecord(record: GeneratedImageDocument): boolean {
  return !isVideoHistoryRecord(record) && record.metadata?.[SERVER_IMAGE_METADATA_FLAG] === true;
}

function createServerVideoHistoryRecord(video: DiskVideoHistoryEntry): GeneratedImageDocument {
  const prompt = video.prompt?.trim() || "디스크에서 복원된 영상";
  const sourceImageUrl = video.sourceImageId ? `/api/images/${video.sourceImageId}` : undefined;
  const videoUrl = video.videoUrl ?? `/api/videos/${video.id}`;

  return {
    id: video.id,
    userId: "local",
    mode: "create",
    kind: "video",
    promptMeta: {
      rawPrompt: prompt,
      refinedPrompt: prompt
    },
    status: "completed",
    imageUrl: sourceImageUrl,
    thumbnailUrl: sourceImageUrl,
    originalImageUrl: sourceImageUrl,
    videoUrl,
    videoMeta: {
      sourceImageId: video.sourceImageId,
      prompt: video.prompt,
      requestId: video.requestId,
      model: video.model,
      duration: video.duration,
      resolution: video.resolution,
      aspectRatio: video.aspectRatio,
      createdAtIso: video.createdAtIso,
      bytes: video.bytes
    },
    metadata: {
      sourceImageId: video.sourceImageId,
      kind: "video",
      bucket: video.bucket,
      [SERVER_VIDEO_METADATA_FLAG]: true
    },
    model: video.model ?? "grok-video",
    createdAt: video.createdAtIso,
    updatedAt: video.createdAtIso
  };
}

type DiskImageHistoryEntry = {
  id: string;
  ext?: string;
  bucket?: string;
  createdAtIso: string;
  size?: number;
  promptMeta?: { rawPrompt?: string; refinedPrompt?: string };
};

type ImageHistoryApiResponse = {
  ok?: boolean;
  items?: DiskImageHistoryEntry[];
  nextCursor?: string | null;
  total?: number;
  reason?: string;
};

type ImageHistoryPage = {
  records: GeneratedImageDocument[];
  nextCursor: string | null;
  total: number | null;
};

function createServerImageHistoryRecord(item: DiskImageHistoryEntry): GeneratedImageDocument {
  const url = `/api/images/${item.id}`;
  const raw = item.promptMeta?.rawPrompt?.trim() || "디스크에서 복원된 이미지";
  const refined = item.promptMeta?.refinedPrompt?.trim() || raw;
  return {
    id: item.id,
    userId: "local",
    mode: "create",
    kind: "image",
    promptMeta: { rawPrompt: raw, refinedPrompt: refined },
    status: "completed",
    imageUrl: url,
    thumbnailUrl: url,
    originalImageUrl: url,
    metadata: { bucket: item.bucket, [SERVER_IMAGE_METADATA_FLAG]: true },
    model: "gpt-image",
    createdAt: item.createdAtIso,
    updatedAt: item.createdAtIso
  };
}

async function readServerImageHistoryPage(
  cursor: string | null,
  signal?: AbortSignal
): Promise<ImageHistoryPage> {
  const params = new URLSearchParams({ limit: String(SERVER_IMAGE_PAGE_SIZE) });
  if (cursor) {
    params.set("cursor", cursor);
  }
  const response = await fetch(`/api/images?${params.toString()}`, { signal, cache: "no-store" });
  if (!response.ok) {
    return { records: [], nextCursor: null, total: null };
  }
  const data = await response.json() as ImageHistoryApiResponse;
  if (!data.ok || !Array.isArray(data.items)) {
    return { records: [], nextCursor: null, total: null };
  }
  return {
    records: data.items.map(createServerImageHistoryRecord),
    nextCursor: data.nextCursor ?? null,
    total: typeof data.total === "number" ? data.total : null
  };
}

function mergeLocalAndServerVideoRecords(
  localRecords: GeneratedImageDocument[],
  serverVideoRecords: GeneratedImageDocument[],
  serverImageRecords: GeneratedImageDocument[] = []
): GeneratedImageDocument[] {
  const map = new Map<string, GeneratedImageDocument>();
  const localVideoUrls = new Set<string>();

  localRecords.forEach(record => {
    map.set(record.id, record);
    if (isVideoHistoryRecord(record) && record.videoUrl) {
      localVideoUrls.add(record.videoUrl);
    }
  });

  serverVideoRecords.forEach(record => {
    if (map.has(record.id)) {
      return;
    }
    if (record.videoUrl && localVideoUrls.has(record.videoUrl)) {
      return;
    }
    map.set(record.id, record);
  });

  serverImageRecords.forEach(record => {
    if (map.has(record.id)) {
      return;
    }
    map.set(record.id, record);
  });

  return Array.from(map.values()).sort((a, b) => dateValueToEpoch(b.createdAt) - dateValueToEpoch(a.createdAt));
}

function appendUniqueHistoryRecords(
  existing: GeneratedImageDocument[],
  nextRecords: GeneratedImageDocument[]
): GeneratedImageDocument[] {
  if (!nextRecords.length) {
    return existing;
  }

  const map = new Map(existing.map(record => [record.id, record]));
  nextRecords.forEach(record => {
    if (!map.has(record.id)) {
      map.set(record.id, record);
    }
  });
  return Array.from(map.values());
}

async function readServerVideoHistoryRecords(signal?: AbortSignal): Promise<GeneratedImageDocument[]> {
  const response = await fetch("/api/history/videos", { signal, cache: "no-store" });
  if (!response.ok) {
    return [];
  }
  const data = await response.json() as VideoHistoryApiResponse;
  if (!data.ok || !Array.isArray(data.videos)) {
    return [];
  }
  return data.videos.map(createServerVideoHistoryRecord);
}

type ModeFilterValue = "all" | GenerationMode;
type FavoriteFilterValue = "all" | "favorite";
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

function dateGroupKey(value: unknown) {
  const parsed = toDate(value);
  if (!parsed) {
    return "unknown";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateGroupLabel(key: string) {
  if (key === "unknown") {
    return "날짜 없음";
  }

  const [year, month, day] = key.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) {
    return key;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
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

function getLocalThumbnailUrl(url?: string | null): string | null {
  const id = getLocalImageId(url);
  return id ? `/api/images/${id}?thumb=1` : null;
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
  const originalPreviewUrl = record.thumbnailUrl ?? record.imageUrl ?? record.originalImageUrl;
  const thumbnailPreviewUrl = getLocalThumbnailUrl(originalPreviewUrl);
  const [previewUrl, setPreviewUrl] = useState(thumbnailPreviewUrl ?? originalPreviewUrl);
  const promptPreview = record.promptMeta?.refinedPrompt ?? record.promptMeta?.rawPrompt ?? "";
  const isFavorite = isHistoryRecordFavorite(record);
  const isVideoRecord = isVideoHistoryRecord(record);
  const hasAttachedVideo = Boolean(record.videoUrl);
  const tags = getHistoryRecordTags(record);
  const usesLocalPreview = Boolean(previewUrl?.startsWith("/api/images/"));

  useEffect(() => {
    setPreviewUrl(thumbnailPreviewUrl ?? originalPreviewUrl);
  }, [originalPreviewUrl, thumbnailPreviewUrl]);

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
            aria-label="기록 선택"
          />
        </div>
        {isVideoRecord ? (
          <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col items-end gap-1">
            <Badge className="bg-background/95 px-2.5 py-1 text-xs text-foreground shadow">
              <Film className="mr-1 h-3.5 w-3.5" />
              영상
            </Badge>
            {isFavorite ? <Badge className="bg-background/90 text-foreground shadow">★</Badge> : null}
          </div>
        ) : isFavorite ? (
          <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col items-end gap-1">
            <Badge className="bg-background/90 text-foreground shadow">★</Badge>
            {hasAttachedVideo ? (
              <Badge className="bg-background/90 text-foreground shadow">
                <Film className="mr-1 h-3 w-3" />
                영상
              </Badge>
            ) : null}
          </div>
        ) : hasAttachedVideo ? (
          <Badge className="pointer-events-none absolute right-3 top-3 z-20 bg-background/90 text-foreground shadow">
            <Film className="mr-1 h-3 w-3" />
            영상
          </Badge>
        ) : null}
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={promptPreview || "생성 이미지"}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            unoptimized={usesLocalPreview}
            onError={() => {
              if (thumbnailPreviewUrl && originalPreviewUrl && previewUrl === thumbnailPreviewUrl) {
                setPreviewUrl(originalPreviewUrl);
              }
            }}
            className={cn(
              isVideoRecord ? "object-cover opacity-90" : "object-contain",
              "object-center transition duration-300"
            )}
            priority={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">미리보기 없음</div>
        )}
        {isVideoRecord ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm">
              <Play className="ml-0.5 h-7 w-7 fill-current" />
            </div>
          </div>
        ) : null}
        {promptPreview ? (
          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-xs text-white/90 line-clamp-2">
            {promptPreview}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 px-3 py-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{formatDate(record.createdAt)}</span>
          <Badge variant="outline" className="uppercase tracking-wide">
            {isVideoRecord ? "video" : record.mode}
          </Badge>
        </div>
        {tags.length ? (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="secondary" className="max-w-full truncate text-[10px]">
                #{tag}
              </Badge>
            ))}
            {tags.length > 3 ? <Badge variant="outline">+{tags.length - 3}</Badge> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function GenerationHistoryView() {
  const { records, loading } = useGeneratedImages({ includeDiskFallback: false });
  const { user } = useLocalUser();
  const [selectedRecord, setSelectedRecord] = useState<GeneratedImageDocument | null>(null);
  const [modeFilter, setModeFilter] = useState<ModeFilterValue>("all");
  const [favoriteFilter, setFavoriteFilter] = useState<FavoriteFilterValue>("all");
  const [timeframeFilter, setTimeframeFilter] = useState<TimeframeValue>("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [localRecords, setLocalRecords] = useState<GeneratedImageDocument[]>([]);
  const [serverVideoRecords, setServerVideoRecords] = useState<GeneratedImageDocument[]>([]);
  const [serverVideosLoading, setServerVideosLoading] = useState(true);
  const [serverImageRecords, setServerImageRecords] = useState<GeneratedImageDocument[]>([]);
  const [serverImagesLoading, setServerImagesLoading] = useState(true);
  const [serverImagesLoadingMore, setServerImagesLoadingMore] = useState(false);
  const [serverImageNextCursor, setServerImageNextCursor] = useState<string | null>(null);
  const [serverImageTotal, setServerImageTotal] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [videoTargetRecord, setVideoTargetRecord] = useState<GeneratedImageDocument | null>(null);
  const [imageFitMode, setImageFitMode] = useState<"contain" | "cover">("contain");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const serverImageCursorRef = useRef<string | null>(null);
  const serverImagesLoadingRef = useRef(false);

  useEffect(() => {
    setLocalRecords(records ?? []);
  }, [records]);

  const loadServerImagePage = useCallback(
    async ({ reset = false, signal }: { reset?: boolean; signal?: AbortSignal } = {}) => {
      if (serverImagesLoadingRef.current) {
        return;
      }

      const cursor = reset ? null : serverImageCursorRef.current;
      if (!reset && !cursor) {
        return;
      }

      serverImagesLoadingRef.current = true;
      if (reset) {
        setServerImagesLoading(true);
      } else {
        setServerImagesLoadingMore(true);
      }

      try {
        const page = await readServerImageHistoryPage(cursor, signal);
        if (signal?.aborted) {
          return;
        }
        setServerImageRecords(prev => (reset ? page.records : appendUniqueHistoryRecords(prev, page.records)));
        serverImageCursorRef.current = page.nextCursor;
        setServerImageNextCursor(page.nextCursor);
        setServerImageTotal(page.total);
        if (!reset && page.records.length) {
          setVisibleCount(prev => prev + PAGE_SIZE);
        }
      } catch (error) {
        if (!signal?.aborted) {
          console.warn("[History] Failed to read disk images", error);
        }
      } finally {
        serverImagesLoadingRef.current = false;
        if (!signal?.aborted) {
          if (reset) {
            setServerImagesLoading(false);
          } else {
            setServerImagesLoadingMore(false);
          }
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    const reloadServerVideos = async () => {
      setServerVideosLoading(true);
      try {
        const nextRecords = await readServerVideoHistoryRecords(controller.signal);
        if (!disposed) {
          setServerVideoRecords(nextRecords);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("[History] Failed to read disk videos", error);
        }
      } finally {
        if (!disposed && !controller.signal.aborted) {
          setServerVideosLoading(false);
        }
      }
    };

    void reloadServerVideos();
    void loadServerImagePage({ reset: true, signal: controller.signal });
    const handleRefresh = () => {
      void reloadServerVideos();
      void loadServerImagePage({ reset: true });
    };

    window.addEventListener(HISTORY_REFRESH_EVENT, handleRefresh as EventListener);
    return () => {
      disposed = true;
      controller.abort();
      window.removeEventListener(HISTORY_REFRESH_EVENT, handleRefresh as EventListener);
    };
  }, [loadServerImagePage]);

  const historyItems = useMemo(() => {
    return mergeLocalAndServerVideoRecords(localRecords, serverVideoRecords, serverImageRecords);
  }, [localRecords, serverVideoRecords, serverImageRecords]);
  const historyLoading = loading || serverVideosLoading || serverImagesLoading;

  const tagOptions = useMemo(() => getHistoryTagOptions(historyItems), [historyItems]);

  const filteredItems = useMemo(() => {
    let items = historyItems;

    if (favoriteFilter === "favorite") {
      items = items.filter(isHistoryRecordFavorite);
    }

    if (tagFilter !== "all") {
      items = items.filter(record => getHistoryRecordTags(record).includes(tagFilter));
    }

    if (modeFilter !== "all") {
      items = items.filter(record => record.mode === modeFilter);
    }

    if (timeframeFilter !== "all") {
      const threshold = Date.now() - TIMEFRAME_DURATIONS[timeframeFilter];
      items = items.filter(record => dateValueToEpoch(record.createdAt) >= threshold);
    }

    return items;
  }, [favoriteFilter, historyItems, modeFilter, tagFilter, timeframeFilter]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [favoriteFilter, modeFilter, tagFilter, timeframeFilter, historyItems.length]);

  useEffect(() => {
    if (tagFilter !== "all" && !tagOptions.includes(tagFilter)) {
      setTagFilter("all");
    }
  }, [tagFilter, tagOptions]);

  const displayedItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount]
  );

  const displayedGroups = useMemo(() => {
    const groups = new Map<string, GeneratedImageDocument[]>();
    displayedItems.forEach(record => {
      const key = dateGroupKey(record.createdAt);
      const group = groups.get(key) ?? [];
      group.push(record);
      groups.set(key, group);
    });

    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      label: formatDateGroupLabel(key),
      items
    }));
  }, [displayedItems]);

  const hasLocalMoreItems = visibleCount < filteredItems.length;
  const canLoadServerImages = Boolean(serverImageNextCursor);
  const hasMoreItems = hasLocalMoreItems || canLoadServerImages;
  const handleLoadMore = useCallback(() => {
    if (hasLocalMoreItems) {
      setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredItems.length));
      return;
    }
    if (serverImageNextCursor && !serverImagesLoadingMore) {
      void loadServerImagePage();
    }
  }, [
    filteredItems.length,
    hasLocalMoreItems,
    loadServerImagePage,
    serverImageNextCursor,
    serverImagesLoadingMore
  ]);

  useEffect(() => {
    if (!hasMoreItems || typeof IntersectionObserver === "undefined") {
      return;
    }

    const target = loadMoreRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          handleLoadMore();
        }
      },
      { rootMargin: "480px 0px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [handleLoadMore, hasMoreItems]);

  useEffect(() => {
    if (!selectedRecord) {
      return;
    }
    const stillVisible = displayedItems.some(record => record.id === selectedRecord.id);
    if (!stillVisible) {
      setSelectedRecord(null);
    }
  }, [displayedItems, selectedRecord]);

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

  const visibleIds = useMemo(() => displayedItems.map(record => record.id), [displayedItems]);
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
      toast.error("다운로드할 항목을 선택해주세요.");
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
      toast.error("다운로드할 파일을 찾을 수 없습니다.");
      return;
    }

    targets.forEach((target, index) => {
      startDownload(target, index * 200);
    });

    toast.success(`${targets.length}개의 파일 다운로드를 시작했습니다.`);
  };

  type DownloadTarget = {
    href: string;
    filename: string;
  };

  const buildDownloadTarget = (record: GeneratedImageDocument): DownloadTarget | null => {
    if (isVideoHistoryRecord(record) && record.videoUrl) {
      return { href: record.videoUrl, filename: `${record.id}.mp4` };
    }

    const url = record.imageUrl ?? record.originalImageUrl ?? record.thumbnailUrl;
    if (!url) {
      return null;
    }

    const filename = `${record.id}.png`;

    if (url.startsWith("data:")) {
      return { href: url, filename };
    }

    // 로컬 라우트(/api/images/<id>)는 그대로 사용. 외부 URL만 /api/download 프록시 경유.
    if (url.startsWith("/api/") || url.startsWith("/")) {
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
      toast.error("다운로드할 파일을 찾을 수 없습니다.");
      return;
    }

    startDownload(target);
  };

  const getVideoSourceImageUrl = (record: GeneratedImageDocument): string => {
    return record.imageUrl ?? record.thumbnailUrl ?? record.originalImageUrl ?? "";
  };

  const handleOpenVideoModal = (record: GeneratedImageDocument) => {
    if (!getVideoSourceImageUrl(record)) {
      toast.error("영상화할 이미지를 찾을 수 없습니다.");
      return;
    }

    setVideoTargetRecord(record);
  };

  const replaceRecords = (updatedRecords: GeneratedImageDocument[]) => {
    if (!updatedRecords.length) {
      return;
    }

    const serverOnlyUpdates = updatedRecords.filter(isServerVideoHistoryRecord);
    const persistableUpdates = updatedRecords.filter(record => !isServerVideoHistoryRecord(record));

    if (persistableUpdates.length) {
      setLocalRecords(prev => {
        const map = new Map(prev.map(item => [item.id, item]));
        persistableUpdates.forEach(record => {
          map.set(record.id, record);
        });
        return Array.from(map.values());
      });
    }
    if (serverOnlyUpdates.length) {
      setServerVideoRecords(prev => {
        const map = new Map(prev.map(item => [item.id, item]));
        serverOnlyUpdates.forEach(record => {
          map.set(record.id, record);
        });
        return Array.from(map.values());
      });
    }
    setSelectedRecord(prev => {
      if (!prev) {
        return prev;
      }
      return updatedRecords.find(record => record.id === prev.id) ?? prev;
    });
    if (persistableUpdates.length) {
      const merged = persistRecordsMerge(persistableUpdates);
      broadcastHistoryUpdate(merged, "history");
    }
  };

  const replaceRecord = (updatedRecord: GeneratedImageDocument) => {
    replaceRecords([updatedRecord]);
  };

  const handleVideoCreated = (result: VideoCreatedResult) => {
    const sourceRecord = localRecords.find(record => record.id === result.sourceImageId) ?? videoTargetRecord;
    if (!sourceRecord) {
      toast.error("영상 원본 기록을 찾을 수 없습니다.");
      return;
    }

    const updatedRecord: GeneratedImageDocument = {
      ...sourceRecord,
      videoUrl: result.videoUrl,
      videoMeta: result.meta,
      updatedAt: result.meta.createdAtIso ?? new Date().toISOString()
    };
    const videoRecord = createVideoHistoryRecord({
      sourceRecord,
      videoUrl: result.videoUrl,
      videoMeta: result.meta,
      motionPrompt: result.motionPrompt,
      existingIds: localRecords.map(record => record.id)
    });

    replaceRecords([updatedRecord, videoRecord]);
    setVideoTargetRecord(prev => (prev && prev.id === updatedRecord.id ? updatedRecord : prev));
    toast.success("이미지 기록과 영상 카드를 함께 저장했습니다.");
  };

  const handleToggleFavorite = async (record: GeneratedImageDocument) => {
    const nextFavorite = !isHistoryRecordFavorite(record);
    const updatedRecord = setHistoryRecordFavorite(record, nextFavorite);
    replaceRecord(updatedRecord);

    toast.success(nextFavorite ? "즐겨찾기에 추가했습니다." : "즐겨찾기를 해제했습니다.");
  };

  const handleEditTags = (record: GeneratedImageDocument) => {
    const currentTags = getHistoryRecordTags(record);
    const input = window.prompt("태그 (쉼표 또는 줄바꿈으로 구분)", currentTags.join(", "));
    if (input === null) {
      return;
    }

    const updatedRecord = setHistoryRecordTags(record, input);
    replaceRecord(updatedRecord);
    toast.success(getHistoryRecordTags(updatedRecord).length ? "태그를 저장했습니다." : "태그를 비웠습니다.");
  };

  const handleDeleteRecord = async (record: GeneratedImageDocument) => {
    if (!user) {
      toast.error("로그인이 필요합니다.");
      return;
    }

    const isVideoRecord = isVideoHistoryRecord(record);
    const isServerVideoRecord = isServerVideoHistoryRecord(record);
    const isServerImageRecord = isServerImageHistoryRecord(record);
    const confirmed = window.confirm(
      isServerVideoRecord
        ? "이 디스크 영상 기록을 현재 화면에서 숨기시겠어요? 영상 파일은 삭제되지 않습니다."
        : isVideoRecord
        ? "이 영상 기록을 삭제하시겠어요? 연결된 이미지 기록은 유지됩니다."
        : "이 이미지를 삭제하시겠어요? 이 작업은 되돌릴 수 없습니다."
    );
    if (!confirmed) {
      return;
    }

    if (isServerVideoRecord) {
      setServerVideoRecords(prev => prev.filter(item => item.id !== record.id));
      setSelectedRecord(prev => (prev && prev.id === record.id ? null : prev));
      toast.success("영상 기록을 현재 화면에서 숨겼습니다.");
      return;
    }

    setLocalRecords(prev => prev.filter(item => item.id !== record.id));
    if (isServerImageRecord) {
      setServerImageRecords(prev => prev.filter(item => item.id !== record.id));
    }
    setSelectedRecord(prev => (prev && prev.id === record.id ? null : prev));
    removeRecordFromLocalStorage(record.id);

    if (!isVideoRecord) {
      try {
        const localImageId = getLocalImageId(record.imageUrl) ?? record.id;
        if (record.imageUrl?.startsWith("/api/images/")) {
          await fetch(`/api/images/${localImageId}`, { method: "DELETE" });
        }
      } catch (error) {
        console.warn("[History] Failed to delete storage image", error);
      }
    }

    toast.success(isVideoRecord ? "영상 기록을 삭제했습니다." : "이미지를 삭제했습니다.");
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

    toast.success("기준 이미지로 설정했습니다.");
  };

  const primaryPrompt = selectedRecord?.promptMeta?.refinedPrompt || selectedRecord?.promptMeta?.rawPrompt;
  const rawPromptOnly =
    selectedRecord && selectedRecord.promptMeta?.refinedPrompt && selectedRecord.promptMeta.rawPrompt &&
    selectedRecord.promptMeta.refinedPrompt !== selectedRecord.promptMeta.rawPrompt
      ? selectedRecord.promptMeta.rawPrompt
      : undefined;
  const negativePrompt = selectedRecord?.promptMeta?.negativePrompt;
  const selectedIsVideoRecord = selectedRecord ? isVideoHistoryRecord(selectedRecord) : false;
  const modalImageUrl = selectedRecord
    ? selectedRecord.imageUrl ?? selectedRecord.thumbnailUrl ?? selectedRecord.originalImageUrl ?? ""
    : "";
  const modalVideoUrl = selectedIsVideoRecord ? selectedRecord?.videoUrl ?? "" : "";
  const originalImageUrl = selectedRecord
    ? selectedRecord.originalImageUrl ?? selectedRecord.imageUrl ?? selectedRecord.thumbnailUrl ?? ""
    : "";
  const selectedTags = selectedRecord ? getHistoryRecordTags(selectedRecord) : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 pb-28">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">생성 기록</h1>
        <p className="text-sm text-muted-foreground">
          최근에 만든 이미지와 영상을 한눈에 살펴보고, 사용한 프롬프트와 세부 정보를 확인하세요.
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">필터</span>
          <span className="text-xs text-muted-foreground">
            총 {historyItems.length}개 중 {filteredItems.length}개 필터 · {displayedItems.length}개 표시
            {serverImageTotal !== null ? ` · 디스크 이미지 ${serverImageRecords.length}/${serverImageTotal}개 로드` : ""}
          </span>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">즐겨찾기</span>
            <ToggleGroup
              type="single"
              value={favoriteFilter}
              onValueChange={value => setFavoriteFilter((value as FavoriteFilterValue) || "all")}
              className="flex flex-wrap gap-2"
              aria-label="즐겨찾기 필터"
            >
              <ToggleGroupItem value="all">전체</ToggleGroupItem>
              <ToggleGroupItem value="favorite">즐겨찾기만</ToggleGroupItem>
            </ToggleGroup>
          </div>

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

          <div className="flex min-w-[180px] flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">태그</span>
            <select
              value={tagFilter}
              onChange={event => setTagFilter(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">전체 태그</option>
              {tagOptions.map(tag => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">선택</span>
          <span className="text-xs text-muted-foreground">
            선택 {selectedIds.length}개 / 표시 {displayedItems.length}개
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSelectAllVisible}
            disabled={!displayedItems.length}
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

      {historyLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`history-loading-${index}`}
              className="h-full w-full animate-pulse rounded-2xl border border-border/60 bg-muted/40"
            />
          ))}
        </div>
      ) : null}

      {!historyLoading && historyItems.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-muted/20 py-20 text-center">
          <p className="text-base font-medium text-foreground">아직 생성한 이미지나 영상이 없습니다.</p>
          <p className="text-sm text-muted-foreground">스튜디오에서 이미지를 생성하거나 영상을 만들면 이곳에 기록이 쌓입니다.</p>
        </div>
      ) : null}

      {!historyLoading && historyItems.length > 0 && filteredItems.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-muted/20 py-20 text-center">
          <p className="text-base font-medium text-foreground">선택한 조건에 맞는 기록이 없습니다.</p>
          <p className="text-sm text-muted-foreground">필터를 조정하거나 기간을 넓혀보세요.</p>
        </div>
      ) : null}

      {displayedItems.length > 0 ? (
        <div className="flex flex-col gap-8">
          {displayedGroups.map(group => (
            <section key={group.key} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
                <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
                <span className="text-xs text-muted-foreground">{group.items.length}개 표시</span>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {group.items.map(record => {
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
            </section>
          ))}
          {hasMoreItems ? (
            <div ref={loadMoreRef} className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleLoadMore}
                disabled={serverImagesLoadingMore}
              >
                {serverImagesLoadingMore
                  ? "불러오는 중..."
                  : hasLocalMoreItems
                  ? `더 보기 (${filteredItems.length - displayedItems.length}개 남음)`
                  : "다음 기록 불러오기"}
              </Button>
            </div>
          ) : null}
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
              <div
                className={cn(
                  "relative w-full max-h-[80vh] overflow-hidden rounded-2xl border border-border/60",
                  selectedIsVideoRecord ? "aspect-video bg-black" : "aspect-[9/16] bg-muted"
                )}
              >
                {selectedIsVideoRecord && modalVideoUrl ? (
                  <video
                    controls
                    src={modalVideoUrl}
                    poster={modalImageUrl || undefined}
                    className="h-full w-full bg-black object-contain"
                  />
                ) : modalImageUrl ? (
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
                    미디어 미리보기를 불러오지 못했습니다.
                  </div>
                )}
              </div>

              <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{formatDate(selectedRecord.createdAt)}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="uppercase tracking-wide">
                      {selectedIsVideoRecord ? "video" : selectedRecord.mode}
                    </Badge>
                    <span>•</span>
                    <span>{selectedRecord.model}</span>
                    {selectedIsVideoRecord && selectedRecord.videoMeta?.duration ? (
                      <>
                        <span>•</span>
                        <span>{selectedRecord.videoMeta.duration}초</span>
                      </>
                    ) : null}
                    {selectedIsVideoRecord && selectedRecord.videoMeta?.resolution ? (
                      <>
                        <span>•</span>
                        <span>{selectedRecord.videoMeta.resolution}</span>
                      </>
                    ) : null}
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

                {selectedRecord.videoUrl && !selectedIsVideoRecord ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Film className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-medium text-foreground">연결된 영상</h3>
                    </div>
                    <video controls src={selectedRecord.videoUrl} className="aspect-video w-full rounded-lg bg-black" />
                    {selectedRecord.videoMeta?.createdAtIso ? (
                      <p className="text-xs text-muted-foreground">
                        생성일 {formatDate(selectedRecord.videoMeta.createdAtIso)}
                      </p>
                    ) : null}
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
                  {!selectedIsVideoRecord ? (
                    <Button size="sm" variant="outline" onClick={() => handleSetReference(selectedRecord)}>
                      기준이미지
                    </Button>
                  ) : null}
                  {selectedIsVideoRecord && selectedRecord.videoUrl ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={selectedRecord.videoUrl} download={`${selectedRecord.id}.mp4`}>
                        영상 다운로드
                      </a>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadRecord(selectedRecord)}
                    >
                      다운로드
                    </Button>
                  )}
                  {!selectedIsVideoRecord ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenVideoModal(selectedRecord)}
                    >
                      <Film className="mr-2 h-4 w-4" />
                      영상화
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteRecord(selectedRecord)}
                  >
                    삭제
                  </Button>
                  <Button
                    size="sm"
                    variant={isHistoryRecordFavorite(selectedRecord) ? "secondary" : "outline"}
                    onClick={() => handleToggleFavorite(selectedRecord)}
                  >
                    {isHistoryRecordFavorite(selectedRecord) ? "즐겨찾기 해제" : "즐겨찾기"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleEditTags(selectedRecord)}>
                    태그 편집
                  </Button>
                </div>
                {selectedTags.length ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedTags.map(tag => (
                      <Badge key={tag} variant="secondary">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {videoTargetRecord ? (
        <VideoModal
          open={Boolean(videoTargetRecord)}
          onOpenChange={open => {
            if (!open) {
              setVideoTargetRecord(null);
            }
          }}
          sourceImageId={videoTargetRecord.id}
          sourceImageUrl={getVideoSourceImageUrl(videoTargetRecord)}
          defaultPrompt="카메라가 부드럽게 움직이고 장면에 자연스러운 생동감이 더해집니다."
          onVideoCreated={handleVideoCreated}
        />
      ) : null}
    </div>
  );
}
