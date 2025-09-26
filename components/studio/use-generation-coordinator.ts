import { useCallback, useReducer, useRef } from "react";
import { genReducer, selectors, type GenerationSnapshot } from "./state/generation-sm";

interface GenerationGuard {
  requestId: number;
  signal: AbortSignal;
  onSuccess: (recordId: string) => void;
  onError: (message?: string) => void;
  onCancel: () => void;
  abort: () => void;
}

const initialSnapshot: GenerationSnapshot = {
  activeRequestId: null,
  lastFinishedRequestId: null,
  phase: "idle"
};

export function useGenerationCoordinator() {
  const nextIdRef = useRef<number>(1);
  const abortRef = useRef<AbortController | null>(null);
  const [snapshot, dispatch] = useReducer(genReducer, initialSnapshot);

  const start = useCallback((): GenerationGuard => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestId = nextIdRef.current++;
    dispatch({ type: "START", requestId });

    const cleanup = () => {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    };

    return {
      requestId,
      signal: controller.signal,
      onSuccess: (recordId: string) => {
        dispatch({ type: "SUCCESS", requestId, recordId });
        cleanup();
      },
      onError: (message?: string) => {
        dispatch({ type: "ERROR", requestId, message });
        cleanup();
      },
      onCancel: () => {
        dispatch({ type: "CANCEL", requestId });
        cleanup();
      },
      abort: () => controller.abort()
    };
  }, []);

  const isGenerating = selectors.isGenerating(snapshot);
  const showSuccessFor = useCallback(
    (requestId: number | null) => selectors.showSuccess(snapshot, requestId),
    [snapshot]
  );

  return {
    snapshot,
    isGenerating,
    showSuccessFor,
    start
  };
}
