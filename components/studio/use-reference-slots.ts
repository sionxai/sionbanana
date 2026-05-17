"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import {
  isDataUrl,
  mergeReferenceGalleryUrls
} from "@/lib/studio-helpers/url";
import {
  INITIAL_REFERENCE_SLOT_COUNT,
  MAX_REFERENCE_SLOT_COUNT,
  REFERENCE_GALLERY_STORAGE_KEY,
  createReferenceSlot,
  type ReferenceSlotState
} from "@/lib/studio-helpers/constants";

type UseReferenceSlotsArgs = {
  userUid: string | null;
};

type UseReferenceSlotsResult = {
  referenceSlots: ReferenceSlotState[];
  setReferenceSlots: Dispatch<SetStateAction<ReferenceSlotState[]>>;
  collectReferenceGalleryUrls: () => string[];
};

const createInitialReferenceSlots = () =>
  Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot());

export function useReferenceSlots({ userUid }: UseReferenceSlotsArgs): UseReferenceSlotsResult {
  const [referenceSlots, setReferenceSlots] = useState<ReferenceSlotState[]>(createInitialReferenceSlots);
  const referenceSlotsPersistWarningShownRef = useRef(false);

  const collectReferenceGalleryUrls = useCallback(
    () => mergeReferenceGalleryUrls(referenceSlots.map(slot => slot.imageUrl)),
    [referenceSlots]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(REFERENCE_GALLERY_STORAGE_KEY);
      if (!raw) {
        setReferenceSlots(createInitialReferenceSlots());
        return;
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .slice(0, MAX_REFERENCE_SLOT_COUNT)
          .map((item: { id?: unknown; imageUrl?: unknown; updatedAt?: unknown; source?: unknown; characterId?: unknown }) => {
            const imageUrl = typeof item?.imageUrl === "string" ? (item.imageUrl as string) : null;
            const source: ReferenceSlotState["source"] =
              item?.source === "manual" || item?.source === "character-mention"
                ? item.source
                : imageUrl
                  ? "manual"
                  : undefined;
            return {
              id:
                typeof item?.id === "string"
                  ? (item.id as string)
                  : (typeof crypto !== "undefined" && "randomUUID" in crypto
                      ? crypto.randomUUID()
                      : `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
              imageUrl,
              updatedAt: typeof item?.updatedAt === "string" ? (item.updatedAt as string) : new Date().toISOString(),
              source,
              characterId: typeof item?.characterId === "string" ? (item.characterId as string) : undefined
            };
          });

        const normalizedFiltered = normalized.filter(slot => {
          if (!slot.imageUrl) return true;
          if (!userUid) return false;
          const url = slot.imageUrl;
          return url.startsWith("data:") || url.startsWith("/api/images/") || url.includes(`/users/${userUid}/`);
        });

        const ensured = normalizedFiltered.length
          ? normalizedFiltered
          : createInitialReferenceSlots();
        setReferenceSlots(ensured);
      } else {
        setReferenceSlots(createInitialReferenceSlots());
      }
    } catch (error) {
      console.warn("Failed to load reference slots", error);
      setReferenceSlots(createInitialReferenceSlots());
    }
  }, [userUid]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      let strippedDataUrlCount = 0;
      const payload = referenceSlots.map(slot => {
        const shouldStripImageUrl = isDataUrl(slot.imageUrl);
        if (shouldStripImageUrl) {
          strippedDataUrlCount += 1;
        }
        const imageUrl = shouldStripImageUrl ? null : slot.imageUrl;
        return {
          id: slot.id,
          imageUrl,
          updatedAt: slot.updatedAt,
          source: imageUrl ? slot.source ?? "manual" : undefined,
          characterId: imageUrl ? slot.characterId : undefined
        };
      });
      window.localStorage.setItem(REFERENCE_GALLERY_STORAGE_KEY, JSON.stringify(payload));
      if (strippedDataUrlCount > 0) {
        console.warn(`Skipped ${strippedDataUrlCount} data URL reference slot(s) while persisting localStorage.`);
      }
    } catch (error) {
      console.warn("Failed to persist reference slots", error);
      if (!referenceSlotsPersistWarningShownRef.current) {
        referenceSlotsPersistWarningShownRef.current = true;
        toast.warning("참조 이미지 브라우저 저장 공간이 부족해 일부 저장을 건너뛰었습니다.");
      }
    }
  }, [referenceSlots]);

  return {
    referenceSlots,
    setReferenceSlots,
    collectReferenceGalleryUrls
  };
}
