"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 10_000;
const MAX_NOTIFICATIONS = 20;
const IMAGES_UPDATED_EVENT = "sionbanana:images-updated";

type LatestImageItem = {
  id: string;
  createdAtIso?: string;
};

type LatestImagesResponse = {
  ok?: boolean;
  items?: LatestImageItem[];
  total?: number;
};

type NotificationItem = {
  id: string;
  createdAtIso: string;
};

type ImageSnapshot = {
  total: number;
  latestId: string | null;
};

function formatNotificationTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "시각 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function getDetectedCount(previous: ImageSnapshot, next: ImageSnapshot) {
  if (next.total > previous.total) {
    return next.total - previous.total;
  }
  return next.latestId && next.latestId !== previous.latestId ? 1 : 0;
}

async function readLatestImages(limit: number, signal?: AbortSignal): Promise<{
  snapshot: ImageSnapshot;
  latestItems: LatestImageItem[];
} | null> {
  const response = await fetch(`/api/images?limit=${limit}`, { signal, cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  const data = await response.json() as LatestImagesResponse;
  if (!data.ok || !Array.isArray(data.items) || typeof data.total !== "number") {
    return null;
  }

  const latestItem = data.items[0] ?? null;
  return {
    snapshot: {
      total: data.total,
      latestId: latestItem?.id ?? null
    },
    latestItems: data.items
  };
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [previewFailures, setPreviewFailures] = useState<Record<string, boolean>>({});
  const baselineRef = useRef<ImageSnapshot | null>(null);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    const controller = new AbortController();

    const poll = async () => {
      if (disposed || inFlight || document.visibilityState !== "visible") {
        return;
      }

      inFlight = true;
      try {
        const result = await readLatestImages(1, controller.signal);
        if (!result || disposed) {
          return;
        }

        const previous = baselineRef.current;
        baselineRef.current = result.snapshot;
        if (!previous) {
          return;
        }

        const detectedCount = getDetectedCount(previous, result.snapshot);
        if (detectedCount <= 0) {
          return;
        }

        const notificationResult =
          detectedCount > 1
            ? await readLatestImages(Math.min(detectedCount, MAX_NOTIFICATIONS), controller.signal)
            : result;
        const latestItems = notificationResult?.latestItems ?? result.latestItems;

        setUnreadCount(count => count + detectedCount);
        const notificationItems = latestItems
          .filter(item => item.id)
          .map(item => ({
            id: item.id,
            createdAtIso: item.createdAtIso ?? new Date().toISOString()
          }));
        if (notificationItems.length) {
          setItems(current => {
            const nextIds = new Set(notificationItems.map(item => item.id));
            const withoutDuplicates = current.filter(item => !nextIds.has(item.id));
            return [...notificationItems, ...withoutDuplicates].slice(0, MAX_NOTIFICATIONS);
          });
        }
        toast.success(`새 이미지 ${detectedCount}장 생성됨`);
        window.dispatchEvent(new CustomEvent(IMAGES_UPDATED_EVENT));
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("[NotificationBell] Failed to poll image updates", error);
        }
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="fixed right-24 top-3 z-[45] h-8 sm:right-28 sm:top-4">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="relative h-8 w-8 shadow-md"
        onClick={() => setOpen(value => !value)}
        aria-label="새 이미지 알림"
        aria-expanded={open}
        title="새 이미지 알림"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 top-10 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">새 이미지</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setUnreadCount(0)}
            >
              모두 읽음
            </Button>
          </div>
          {items.length ? (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {items.map(item => {
                const useOriginal = previewFailures[item.id];
                const imageSrc = useOriginal ? `/api/images/${item.id}` : `/api/images/${item.id}?thumb=1`;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-md border border-border/60 bg-background/80 p-2"
                  >
                    <img
                      src={imageSrc}
                      alt="생성 이미지 썸네일"
                      className="h-10 w-10 shrink-0 rounded object-cover"
                      onError={() => {
                        if (!useOriginal) {
                          setPreviewFailures(current => ({ ...current, [item.id]: true }));
                        }
                      }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{item.id}</p>
                      <p className="text-xs text-muted-foreground">{formatNotificationTime(item.createdAtIso)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              새 이미지 알림이 없습니다
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
