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
  activeRequestIds: [],
  lastFinishedRequestId: null,
  phase: "idle"
};

export function useGenerationCoordinator() {
  const nextIdRef = useRef<number>(1);
  const abortMapRef = useRef<Map<number, AbortController>>(new Map());
  const [snapshot, dispatch] = useReducer(genReducer, initialSnapshot);

  const start = useCallback((): GenerationGuard => {
    const controller = new AbortController();
    const requestId = nextIdRef.current++;
    abortMapRef.current.set(requestId, controller);
    dispatch({ type: "START", requestId });

    const cleanup = () => {
      abortMapRef.current.delete(requestId);
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
  const inflightCount = selectors.inflightCount(snapshot);
  const showSuccessFor = useCallback(
    (requestId: number | null) => selectors.showSuccess(snapshot, requestId),
    [snapshot]
  );

  return {
    snapshot,
    isGenerating,
    inflightCount,
    showSuccessFor,
    start
  };
}
