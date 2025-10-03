import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { shouldUseFirestore } from "@/lib/env";
import type { GeneratedImageDocument } from "@/lib/types";

interface UseFirestoreImagesOptions {
  limitResults?: number;
  onNewRecord?: (record: GeneratedImageDocument) => void;
}

export function useFirestoreImages({ limitResults = 50, onNewRecord }: UseFirestoreImagesOptions = {}) {
  const { user } = useAuth();
  const [records, setRecords] = useState<GeneratedImageDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const processedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!shouldUseFirestore) {
      console.warn("[useFirestoreImages] Firestore is disabled via configuration");
      setRecords([]);
      setLoading(false);
      return;
    }

    if (!user) {
      console.log("[useFirestoreImages] No user found - clearing records");
      setRecords([]);
      setLoading(false);
      return;
    }

    console.log("[useFirestoreImages] Loading images for user:", user.uid);

    setLoading(true);

    try {
      const firestoreDb = firestore();
      if (!firestoreDb || typeof firestoreDb !== "object") {
        console.warn("[useFirestoreImages] Firestore instance unavailable");
        setRecords([]);
        setLoading(false);
        return;
      }

      // Firestore 실시간 리스너 설정
      const imagesRef = collection(firestoreDb, "users", user.uid, "images");
      const q = query(
        imagesRef,
        orderBy("createdAt", "desc"),
        limit(limitResults)
      );

      console.log("[useFirestoreImages] Setting up realtime listener...");

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const items: GeneratedImageDocument[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            items.push({
              id: doc.id,
              ...data,
              // Ensure required fields have defaults
              userId: data.userId || user.uid,
              mode: data.mode || "create",
              status: data.status || "completed",
              promptMeta: data.promptMeta || {
                rawPrompt: "",
                refinedPrompt: "",
                aspectRatio: "original"
              },
              metadata: data.metadata || {},
              costCredits: data.costCredits || 1,
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString()
            } as GeneratedImageDocument);
          });

          console.log("[useFirestoreImages] Realtime update: loaded", items.length, "images from Firestore");
          setRecords(items);
          setLoading(false);

          // Trigger callback only for NEW records (not already processed)
          if (onNewRecord && items.length > 0) {
            items.forEach(item => {
              if (!processedIdsRef.current.has(item.id)) {
                processedIdsRef.current.add(item.id);
                onNewRecord(item);
              }
            });
          }
        },
        (error) => {
          console.error("[useFirestoreImages] Realtime listener error:", error);
          console.error("[useFirestoreImages] Error details:", {
            message: error instanceof Error ? error.message : String(error),
            code: (error as any)?.code,
            userId: user.uid
          });
          setRecords([]);
          setLoading(false);
        }
      );

      return () => {
        console.log("[useFirestoreImages] Cleaning up realtime listener");
        unsubscribe();
      };
    } catch (error) {
      console.error("[useFirestoreImages] Failed to setup realtime listener:", error);
      setRecords([]);
      setLoading(false);
    }
  }, [limitResults, onNewRecord, shouldUseFirestore, user?.uid]);

  return { records, loading };
}
