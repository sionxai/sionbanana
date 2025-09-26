import { useEffect, useRef, useState } from "react";
import { query, orderBy, limit, getDocs } from "firebase/firestore";
import { useAuth } from "@/components/providers/auth-provider";
import { toDateString, userImagesCollection } from "@/lib/firebase/firestore";
import type { GeneratedImageDocument } from "@/lib/types";
import { shouldUseFirestore } from "@/lib/env";

interface UseGeneratedImagesOptions {
  limitResults?: number;
  onNewRecord?: (record: GeneratedImageDocument) => void;
}

export function useGeneratedImages({ limitResults = 50, onNewRecord }: UseGeneratedImagesOptions = {}) {
  const { user } = useAuth();
  const [records, setRecords] = useState<GeneratedImageDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const lastRecordIdsRef = useRef<Set<string>>(new Set());
  const isLoadingRef = useRef(false);
  const onNewRecordRef = useRef<((record: GeneratedImageDocument) => void) | undefined>(onNewRecord);

  useEffect(() => {
    if (!shouldUseFirestore) {
      console.log("[useGeneratedImages] Firestore is disabled");
      setRecords([]);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    onNewRecordRef.current = onNewRecord;
  }, [onNewRecord]);

  useEffect(() => {
    if (!shouldUseFirestore) {
      return;
    }

    if (!user) {
      console.log("[useGeneratedImages] No user found - clearing records");
      setRecords([]);
      setLoading(false);
      lastRecordIdsRef.current = new Set();
      return;
    }

    console.log("[useGeneratedImages] User found:", user.uid, "isAnonymous:", user.isAnonymous);

    let cancelled = false;
    setLoading(true);

    const loadRecords = async () => {
      if (isLoadingRef.current) {
        return;
      }

      try {
        isLoadingRef.current = true;
        const q = query(userImagesCollection(user.uid), orderBy("createdAt", "desc"), limit(limitResults));
        console.log("[useGeneratedImages] Querying for user:", user.uid, "limit:", limitResults);
        const snapshot = await getDocs(q);
        console.log("[useGeneratedImages] Query result:", snapshot.docs.length, "documents");

        const items: GeneratedImageDocument[] = snapshot.docs.map(doc => {
          const data = doc.data();
          const createdAtIso = typeof data.createdAtIso === "string" ? data.createdAtIso : toDateString(data.createdAt);
          const updatedAtIso =
            typeof data.updatedAtIso === "string"
              ? data.updatedAtIso
              : toDateString(data.updatedAt ?? data.createdAt);
          return {
            id: doc.id,
            userId: user.uid,
            mode: data.mode ?? "create",
            promptMeta: data.promptMeta,
            status: data.status,
            imageUrl: data.imageUrl,
            originalImageUrl: data.originalImageUrl,
            thumbnailUrl: data.thumbnailUrl,
            diff: data.diff,
            metadata: data.metadata,
            model: data.model ?? "gemini-nano-banana",
            costCredits: data.costCredits,
            createdAt: createdAtIso,
            updatedAt: updatedAtIso
          } as GeneratedImageDocument;
        });

        if (cancelled) {
          return;
        }

        // Check for new completed records and trigger callback once per record
        if (onNewRecordRef.current && items.length > 0) {
          const currentIds = new Set(items.map(item => item.id));
          const previousIds = lastRecordIdsRef.current;

          items.forEach(item => {
            if (!previousIds.has(item.id) && item.status === "completed" && item.imageUrl) {
              onNewRecordRef.current?.(item);
            }
          });

          lastRecordIdsRef.current = currentIds;
        } else if (items.length === 0) {
          lastRecordIdsRef.current = new Set();
        }

        setRecords(items);
        setLoading(false);
      } catch (err) {
        console.error("Failed to load generated images:", err);
        setRecords([]);
        setLoading(false);
      } finally {
        isLoadingRef.current = false;
      }
    };

    loadRecords();

    // Refresh data periodically to simulate real-time updates
    const interval = setInterval(loadRecords, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [limitResults, user?.uid]);

  return { records, loading };
}
