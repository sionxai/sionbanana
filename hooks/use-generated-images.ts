"use client";

import { useEffect, useMemo, useState } from "react";
import type { GeneratedImageDocument } from "@/lib/types";
import { LOCAL_STORAGE_KEY } from "@/components/studio/constants";

interface UseGeneratedImagesOptions {
  limitResults?: number;
  onNewRecord?: (record: GeneratedImageDocument) => void;
}

const HISTORY_REFRESH_EVENT = "yesgem-history-refresh";

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

export function useGeneratedImages(options: UseGeneratedImagesOptions = {}) {
  const { limitResults } = options;
  const [records, setRecords] = useState<GeneratedImageDocument[]>(() => readRecords());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reload = () => {
      setRecords(prev => {
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

  const limited = useMemo(
    () => (limitResults ? records.slice(0, limitResults) : records),
    [records, limitResults]
  );

  return { records: limited, loading: false };
}

export function notifyHistoryRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HISTORY_REFRESH_EVENT));
}
