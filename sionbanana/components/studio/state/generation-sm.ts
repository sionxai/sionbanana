export type RequestId = number;

export type GenerationPhase =
  | "idle"
  | "pending"
  | "success"
  | "error"
  | "canceled";

export interface GenerationSnapshot {
  activeRequestId: RequestId | null;
  lastFinishedRequestId: RequestId | null;
  phase: GenerationPhase;
  resultRecordId?: string;
  errorMessage?: string;
}

type Action =
  | { type: "START"; requestId: RequestId }
  | { type: "SUCCESS"; requestId: RequestId; recordId: string }
  | { type: "ERROR"; requestId: RequestId; message?: string }
  | { type: "CANCEL"; requestId: RequestId };

export function genReducer(state: GenerationSnapshot, action: Action): GenerationSnapshot {
  switch (action.type) {
    case "START":
      return {
        activeRequestId: action.requestId,
        lastFinishedRequestId: state.lastFinishedRequestId,
        phase: "pending",
        resultRecordId: undefined,
        errorMessage: undefined
      };
    case "SUCCESS":
      if (state.activeRequestId !== action.requestId) {
        return state;
      }
      return {
        activeRequestId: null,
        lastFinishedRequestId: action.requestId,
        phase: "success",
        resultRecordId: action.recordId,
        errorMessage: undefined
      };
    case "ERROR":
      if (state.activeRequestId !== action.requestId) {
        return state;
      }
      return {
        activeRequestId: null,
        lastFinishedRequestId: action.requestId,
        phase: "error",
        resultRecordId: undefined,
        errorMessage: action.message
      };
    case "CANCEL":
      if (state.activeRequestId !== action.requestId) {
        return state;
      }
      return {
        activeRequestId: null,
        lastFinishedRequestId: action.requestId,
        phase: "canceled",
        resultRecordId: undefined,
        errorMessage: undefined
      };
    default:
      return state;
  }
}

export const selectors = {
  isGenerating: (snapshot: GenerationSnapshot) => snapshot.phase === "pending",
  showSuccess: (snapshot: GenerationSnapshot, currentRequestId: RequestId | null) =>
    snapshot.phase === "success" && snapshot.lastFinishedRequestId !== null && snapshot.lastFinishedRequestId === currentRequestId
};
