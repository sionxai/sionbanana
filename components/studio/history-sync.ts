import type { GeneratedImageDocument } from "@/lib/types";
import { LOCAL_STORAGE_KEY } from "@/components/studio/constants";

export const HISTORY_SYNC_EVENT = "yesgem:history-sync";
export const HISTORY_REFRESH_EVENT = "yesgem-history-refresh";

export interface HistorySyncPayload {
  records: GeneratedImageDocument[];
  source?: string;
}

export function broadcastHistoryUpdate(records: GeneratedImageDocument[], source?: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const detail: HistorySyncPayload = { records, source };
    window.dispatchEvent(new CustomEvent<HistorySyncPayload>(HISTORY_SYNC_EVENT, { detail }));
  } catch (error) {
    console.warn("Failed to broadcast history update", error);
  }
}

// 단일 진실 원천(localStorage)을 안전하게 갱신하기 위한 atomic merge.
// 여러 페이지가 자기 state로 통째로 setItem 하면 서로 덮어쓰는 문제가 있어,
// 항상 현재 저장된 값과 합쳐 쓴다. 같은 id가 양쪽에 있으면 더 최근 updatedAt을 채택.
export function persistRecordsMerge(localRecords: GeneratedImageDocument[]): GeneratedImageDocument[] {
  if (typeof window === "undefined") return localRecords;

  let stored: GeneratedImageDocument[] = [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) stored = parsed as GeneratedImageDocument[];
    }
  } catch {
    stored = [];
  }

  const map = new Map<string, GeneratedImageDocument>();
  const epoch = (record: GeneratedImageDocument): number => parseIsoDate(record.updatedAt) || parseIsoDate(record.createdAt) || 0;
  for (const record of stored) map.set(record.id, record);
  for (const record of localRecords) {
    const existing = map.get(record.id);
    if (!existing || epoch(record) >= epoch(existing)) {
      map.set(record.id, record);
    }
  }
  const merged = Array.from(map.values());
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new Event(HISTORY_REFRESH_EVENT));
  } catch (error) {
    // 한도 초과 시 base64 잔재 우선 청소 후 재시도.
    const compact = merged.filter(r => {
      const looksBase64 = (url: unknown) => typeof url === "string" && url.startsWith("data:");
      return !(looksBase64((r as { imageUrl?: unknown }).imageUrl) ||
        looksBase64((r as { thumbnailUrl?: unknown }).thumbnailUrl) ||
        looksBase64((r as { originalImageUrl?: unknown }).originalImageUrl));
    });
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(compact));
      window.dispatchEvent(new Event(HISTORY_REFRESH_EVENT));
    } catch (retryError) {
      console.warn("Failed to persist records even after trimming", retryError);
    }
  }
  return merged;
}

// 특정 record를 삭제하고 모든 탭/컴포넌트에 반영.
export function removeRecordFromLocalStorage(id: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const next = parsed.filter((r: { id?: string }) => r.id !== id);
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(HISTORY_REFRESH_EVENT));
  } catch (error) {
    console.warn("Failed to remove record from localStorage", error);
  }
}

function parseIsoDate(value?: string | number | null | any): number {
  if (!value) {
    return 0;
  }

  // Handle ISO string
  if (typeof value === 'string') {
    const time = Date.parse(value);
    if (!Number.isNaN(time)) {
      return time;
    }
  }

  // Handle timestamp number
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  // Handle Firestore Timestamp object
  if (typeof value === 'object' && value !== null) {
    // Check for Firestore Timestamp with seconds and nanoseconds
    if ('seconds' in value && 'nanoseconds' in value) {
      try {
        const timestamp = (value as any).seconds * 1000 + Math.floor((value as any).nanoseconds / 1000000);
        return timestamp;
      } catch (error) {
        console.warn('[parseIsoDate] Failed to parse Firestore Timestamp (seconds/nanoseconds):', error);
        return 0;
      }
    }

    // Check for toDate method
    if ('toDate' in value && typeof (value as any).toDate === 'function') {
      try {
        return (value as any).toDate().getTime();
      } catch (error) {
        console.warn('[parseIsoDate] Failed to call toDate():', error);
        return 0;
      }
    }
  }

  console.warn('[parseIsoDate] Unable to parse timestamp:', typeof value, value);
  return 0;
}

export function mergeHistoryRecords(
  primary: GeneratedImageDocument[],
  secondary: GeneratedImageDocument[]
): GeneratedImageDocument[] {
  const seen = new Set<string>();
  const merged: GeneratedImageDocument[] = [];
  let duplicatesSkipped = 0;

  const appendRecords = (records: GeneratedImageDocument[], source: string) => {
    for (const record of records) {
      if (!record?.id) {
        console.warn(`[History Merge] ${source}: Record without ID`, record);
        continue;
      }
      if (seen.has(record.id)) {
        duplicatesSkipped++;
        console.log(`[History Merge] ${source}: Skipping duplicate ID: ${record.id}`);
        continue;
      }
      seen.add(record.id);
      merged.push(record);
    }
  };

  appendRecords(primary, 'primary');
  appendRecords(secondary, 'secondary');

  if (duplicatesSkipped > 0) {
    console.log(`[History Merge] Total duplicates skipped: ${duplicatesSkipped}`);
  }

  merged.sort((a, b) => {
    const aTime = parseIsoDate(a.createdAt ?? a.updatedAt);
    const bTime = parseIsoDate(b.createdAt ?? b.updatedAt);

    // Debug: log if sorting seems wrong
    if (aTime === 0 || bTime === 0) {
      console.warn('[History Sort] Invalid timestamp detected:', {
        aId: a.id,
        aCreatedAt: a.createdAt,
        aTime,
        bId: b.id,
        bCreatedAt: b.createdAt,
        bTime
      });
    }

    return bTime - aTime;
  });

  return merged;
}
