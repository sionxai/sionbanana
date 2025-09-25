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

function parseIsoDate(value?: string | null): number {
  if (!value) {
    return 0;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

export function mergeHistoryRecords(
  primary: GeneratedImageDocument[],
  secondary: GeneratedImageDocument[]
): GeneratedImageDocument[] {
  const seen = new Set<string>();
  const merged: GeneratedImageDocument[] = [];

  const appendRecords = (records: GeneratedImageDocument[]) => {
    for (const record of records) {
      if (!record?.id || seen.has(record.id)) {
        continue;
      }
      seen.add(record.id);
      merged.push(record);
    }
  };

  appendRecords(primary);
  appendRecords(secondary);

  merged.sort((a, b) => {
    const aTime = parseIsoDate(a.createdAt ?? a.updatedAt);
    const bTime = parseIsoDate(b.createdAt ?? b.updatedAt);
    return bTime - aTime;
  });

  return merged;
}
