import type { GeneratedImageDocument } from "@/lib/types";

export const HISTORY_SYNC_EVENT = "yesgem:history-sync";

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
