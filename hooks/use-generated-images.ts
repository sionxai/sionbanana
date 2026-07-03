"use client";

import { useEffect, useMemo, useState } from "react";
import type { GeneratedImageDocument } from "@/lib/types";
import { LOCAL_STORAGE_KEY } from "@/components/studio/constants";

interface UseGeneratedImagesOptions {
  limitResults?: number;
  includeDiskFallback?: boolean;
  diskFallbackLimit?: number;
  onNewRecord?: (record: GeneratedImageDocument) => void;
}

const HISTORY_REFRESH_EVENT = "yesgem-history-refresh";
const IMAGES_UPDATED_EVENT = "sionbanana:images-updated";

type DiskImageEntry = {
  id: string;
  ext: string;
  bucket: string;
  createdAtIso: string;
  size: number;
  promptMeta?: {
    rawPrompt?: string;
    refinedPrompt?: string;
  };
};

function getLocalImageId(url?: string | null): string | null {
  const match = url?.match(/^\/api\/images\/([A-Za-z0-9_\-]+)/);
  return match?.[1] ?? null;
}

function createDiskFallbackRecord(item: DiskImageEntry): GeneratedImageDocument {
  const rawPrompt = item.promptMeta?.rawPrompt ?? "";
  const refinedPrompt = item.promptMeta?.refinedPrompt ?? "";
  const hasPrompt = rawPrompt.length > 0 || refinedPrompt.length > 0;
  const fallbackPrompt = "디스크에서 복원된 이미지";

  return {
    id: item.id,
    userId: "local",
    mode: "create",
    promptMeta: hasPrompt
      ? { rawPrompt, refinedPrompt }
      : {
          rawPrompt: fallbackPrompt,
          refinedPrompt: fallbackPrompt
        },
    status: "completed",
    imageUrl: `/api/images/${item.id}`,
    thumbnailUrl: `/api/images/${item.id}`,
    originalImageUrl: `/api/images/${item.id}`,
    metadata: {
      diskFallback: true,
      fileSize: item.size,
      bucket: item.bucket,
      ext: item.ext
    },
    model: "gpt-image-2",
    createdAt: item.createdAtIso,
    updatedAt: item.createdAtIso
  };
}

function readRecords(): GeneratedImageDocument[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GeneratedImageDocument[]) : [];
  } catch (error) {
    console.warn("[useGeneratedImages] Failed to read localStorage", error);
    return [];
  }
}

function shallowEqual(a: GeneratedImageDocument[], b: GeneratedImageDocument[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].updatedAt !== b[i].updatedAt) return false;
  }
  return true;
}

function diskItemsEqual(a: DiskImageEntry[], b: DiskImageEntry[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].ext !== b[i].ext ||
      a[i].bucket !== b[i].bucket ||
      a[i].createdAtIso !== b[i].createdAtIso ||
      a[i].size !== b[i].size ||
      (a[i].promptMeta?.rawPrompt ?? "") !== (b[i].promptMeta?.rawPrompt ?? "") ||
      (a[i].promptMeta?.refinedPrompt ?? "") !== (b[i].promptMeta?.refinedPrompt ?? "")
    ) {
      return false;
    }
  }
  return true;
}

function sortRecords(records: GeneratedImageDocument[]) {
  return [...records].sort((a, b) => {
    const aTime = Date.parse(a.createdAt || a.updatedAt || "");
    const bTime = Date.parse(b.createdAt || b.updatedAt || "");
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
}

function mergeWithDiskRecords(
  localRecords: GeneratedImageDocument[],
  diskItems: DiskImageEntry[]
): GeneratedImageDocument[] {
  const knownIds = new Set<string>();
  const knownFileIds = new Set<string>();

  localRecords.forEach(record => {
    knownIds.add(record.id);
    const fileId =
      getLocalImageId(record.imageUrl) ??
      getLocalImageId(record.originalImageUrl) ??
      getLocalImageId(record.thumbnailUrl);
    if (fileId) {
      knownFileIds.add(fileId);
    }
  });

  const fallbackRecords = diskItems
    .filter(item => !knownIds.has(item.id) && !knownFileIds.has(item.id))
    .map(createDiskFallbackRecord);

  return sortRecords([...localRecords, ...fallbackRecords]);
}

async function readDiskRecords(limit: number, signal?: AbortSignal): Promise<DiskImageEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`/api/images?${params.toString()}`, { signal, cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { ok?: boolean; items?: DiskImageEntry[] };
  return data.ok && Array.isArray(data.items) ? data.items : [];
}

export function useGeneratedImages(options: UseGeneratedImagesOptions = {}) {
  const {
    limitResults,
    includeDiskFallback = true,
    diskFallbackLimit = 60
  } = options;
  const [localRecords, setLocalRecords] = useState<GeneratedImageDocument[]>(() => readRecords());
  const [diskItems, setDiskItems] = useState<DiskImageEntry[]>([]);
  const [loading, setLoading] = useState(includeDiskFallback);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reload = () => {
      setLocalRecords(prev => {
        const next = readRecords();
        return shallowEqual(prev, next) ? prev : next;
      });
    };

    reload();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LOCAL_STORAGE_KEY || event.key === null) reload();
    };
    const handleCustom = () => reload();

    window.addEventListener("storage", handleStorage);
    window.addEventListener(HISTORY_REFRESH_EVENT, handleCustom as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(HISTORY_REFRESH_EVENT, handleCustom as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!includeDiskFallback) {
      setDiskItems(prev => (prev.length ? [] : prev));
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const normalizedLimit = Number.isInteger(diskFallbackLimit) && diskFallbackLimit > 0 ? diskFallbackLimit : 60;

    const reloadDisk = async () => {
      setLoading(true);
      try {
        const next = await readDiskRecords(normalizedLimit, controller.signal);
        setDiskItems(prev => (diskItemsEqual(prev, next) ? prev : next));
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("[useGeneratedImages] Failed to read disk images", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    reloadDisk();
    const handleCustom = () => reloadDisk();
    window.addEventListener(HISTORY_REFRESH_EVENT, handleCustom as EventListener);
    window.addEventListener(IMAGES_UPDATED_EVENT, handleCustom as EventListener);
    return () => {
      controller.abort();
      window.removeEventListener(HISTORY_REFRESH_EVENT, handleCustom as EventListener);
      window.removeEventListener(IMAGES_UPDATED_EVENT, handleCustom as EventListener);
    };
  }, [diskFallbackLimit, includeDiskFallback]);

  const mergedRecords = useMemo(
    () => mergeWithDiskRecords(localRecords, diskItems),
    [localRecords, diskItems]
  );

  const limited = useMemo(
    () => (limitResults ? mergedRecords.slice(0, limitResults) : mergedRecords),
    [mergedRecords, limitResults]
  );

  return { records: limited, loading };
}

export function notifyHistoryRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HISTORY_REFRESH_EVENT));
}
