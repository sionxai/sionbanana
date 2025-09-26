import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { storage } from "@/lib/firebase/client";
import { ref, listAll, getDownloadURL, getMetadata } from "firebase/storage";
import type { GeneratedImageDocument } from "@/lib/types";

interface UseStorageImagesOptions {
  limitResults?: number;
  onNewRecord?: (record: GeneratedImageDocument) => void;
}

export function useStorageImages({ limitResults = 50, onNewRecord }: UseStorageImagesOptions = {}) {
  const { user } = useAuth();
  const [records, setRecords] = useState<GeneratedImageDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const lastRecordIdsRef = useRef<Set<string>>(new Set());
  const isLoadingRef = useRef(false);
  const onNewRecordRef = useRef<((record: GeneratedImageDocument) => void) | undefined>(onNewRecord);

  useEffect(() => {
    onNewRecordRef.current = onNewRecord;
  }, [onNewRecord]);

  useEffect(() => {
    if (!user) {
      console.log("[useStorageImages] No user found - clearing records");
      setRecords([]);
      setLoading(false);
      lastRecordIdsRef.current = new Set();
      return;
    }

    console.log("[useStorageImages] User found:", user.uid, "isAnonymous:", user.isAnonymous);

    let cancelled = false;
    setLoading(true);

    const loadRecords = async () => {
      if (isLoadingRef.current) {
        return;
      }

      try {
        isLoadingRef.current = true;
        const bucket = storage();

        if (!bucket) {
          console.log("[useStorageImages] Storage not initialized");
          setRecords([]);
          setLoading(false);
          return;
        }

        // Firebase Storage에서 사용자 이미지 폴더 참조
        const imagesRef = ref(bucket, `users/${user.uid}/images`);
        console.log("[useStorageImages] Listing files for user:", user.uid);

        const result = await listAll(imagesRef);
        console.log("[useStorageImages] Found", result.items.length, "files");

        // 각 파일의 메타데이터와 다운로드 URL 가져오기
        const imagePromises = result.items.map(async (itemRef) => {
          try {
            const [downloadURL, metadata] = await Promise.all([
              getDownloadURL(itemRef),
              getMetadata(itemRef)
            ]);

            // 파일명에서 ID 추출 (예: uuid.png -> uuid)
            const fileName = itemRef.name;
            const fileId = fileName.split('.')[0];

            return {
              id: fileId,
              userId: user.uid,
              mode: "create" as const,
              promptMeta: {
                rawPrompt: metadata.customMetadata?.prompt || "",
                refinedPrompt: metadata.customMetadata?.refinedPrompt || "",
                aspectRatio: metadata.customMetadata?.aspectRatio || "original",
                pose: {},
                camera: {},
                referenceGallery: [],
                negativePrompt: ""
              },
              status: "completed" as const,
              imageUrl: downloadURL,
              originalImageUrl: downloadURL,
              thumbnailUrl: downloadURL,
              diff: undefined,
              metadata: metadata.customMetadata || {},
              model: metadata.customMetadata?.model || "gemini-2.5-flash-image-preview",
              costCredits: 1,
              createdAt: metadata.timeCreated,
              updatedAt: metadata.updated
            } as GeneratedImageDocument;
          } catch (error) {
            console.warn("[useStorageImages] Failed to process file:", itemRef.name, error);
            return null;
          }
        });

        const items = (await Promise.all(imagePromises))
          .filter((item): item is GeneratedImageDocument => item !== null)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, limitResults);

        if (cancelled) {
          return;
        }

        // Check for new completed records and trigger callback
        if (onNewRecordRef.current && items.length > 0) {
          const currentIds = new Set(items.map(item => item.id));
          const previousIds = lastRecordIdsRef.current;

          items.forEach(item => {
            if (!previousIds.has(item.id)) {
              onNewRecordRef.current?.(item);
            }
          });

          lastRecordIdsRef.current = currentIds;
        } else if (items.length === 0) {
          lastRecordIdsRef.current = new Set();
        }

        console.log("[useStorageImages] Successfully loaded", items.length, "images");
        setRecords(items);
        setLoading(false);
      } catch (err) {
        console.error("[useStorageImages] Failed to load images from storage:", err);
        console.error("[useStorageImages] Error details:", {
          message: err instanceof Error ? err.message : String(err),
          code: (err as any)?.code,
          userId: user.uid
        });
        setRecords([]);
        setLoading(false);
      } finally {
        isLoadingRef.current = false;
      }
    };

    loadRecords();

    // Refresh data periodically
    const interval = setInterval(loadRecords, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [limitResults, user?.uid]);

  return { records, loading };
}