"use client";

import { useEffect } from "react";

const LOCAL_STORAGE_KEY = "yesgem-local-records";
const REFERENCE_SYNC_STORAGE_KEY = "yesgem-reference-record";
const REFERENCE_GALLERY_STORAGE_KEY = "yesgem-reference-slots";

// 1.58v 이전: 이미지 base64 데이터 URL을 record.imageUrl에 직접 박아 localStorage에 저장.
// 1.59v 이후: 이미지를 디스크에 저장하고 record.imageUrl은 `/api/images/<id>` 형태.
// 또한 1.59v 이후 기준 이미지는 사용자가 명시적으로 추가할 때만 등록되므로,
// 옛 자동 promote로 박힌 reference-image record와 broadcast 캐시도 mount 시 청소한다.
export function LegacyStorageMigration() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          window.localStorage.removeItem(LOCAL_STORAGE_KEY);
        } else {
          const cleaned = parsed.filter((record: { id?: string; imageUrl?: unknown; thumbnailUrl?: unknown; originalImageUrl?: unknown }) => {
            const isLegacyBase64 = (url: unknown) => typeof url === "string" && url.startsWith("data:");
            // base64 잔재 record 제거
            if (isLegacyBase64(record.imageUrl) || isLegacyBase64(record.thumbnailUrl) || isLegacyBase64(record.originalImageUrl)) {
              return false;
            }
            // 자동 promote로 박혀있던 reference-image record 제거 (디폴트는 비움)
            if (record.id === "reference-image") return false;
            return true;
          });
          if (cleaned.length !== parsed.length) {
            const removed = parsed.length - cleaned.length;
            window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleaned));
            console.info(`[legacy-migration] Removed ${removed} legacy/auto-reference records`);
          }
        }
      }
    } catch (error) {
      console.warn("[legacy-migration] Could not clean legacy records, resetting key", error);
      try { window.localStorage.removeItem(LOCAL_STORAGE_KEY); } catch {}
    }

    // 자동 promote 시기에 broadcast된 reference 캐시 + 슬롯 캐시도 정리.
    try {
      const ref = window.localStorage.getItem(REFERENCE_SYNC_STORAGE_KEY);
      if (ref) {
        // base64 reference는 무조건 제거. URL 기반 reference만 보존하지만,
        // 디폴트가 비어 있어야 한다는 정책에 따라 일단 모두 제거하고 사용자가 다시 추가하게 한다.
        window.localStorage.removeItem(REFERENCE_SYNC_STORAGE_KEY);
      }
    } catch {}
    try { window.localStorage.removeItem(REFERENCE_GALLERY_STORAGE_KEY); } catch {}
  }, []);

  return null;
}
