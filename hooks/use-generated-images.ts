import { shouldUseFirestore } from "@/lib/env";
import type { GeneratedImageDocument } from "@/lib/types";
import { useFirestoreImages } from "./use-firestore-images";
import { useStorageImages } from "./use-storage-images";

interface UseGeneratedImagesOptions {
  limitResults?: number;
  onNewRecord?: (record: GeneratedImageDocument) => void;
}

export function useGeneratedImages(options: UseGeneratedImagesOptions = {}) {
  if (shouldUseFirestore) {
    return useFirestoreImages(options);
  }
  return useStorageImages(options);
}
