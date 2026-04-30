export type RequestId = number;

export type GenerationPhase =
  | "idle"
  | "pending"
  | "success"
  | "error"
  | "canceled";

export interface GenerationSnapshot {
  activeRequestIds: RequestId[];
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
        ...state,
        activeRequestIds: [...state.activeRequestIds, action.requestId],
        phase: "pending"
      };
    case "SUCCESS": {
      const remaining = state.activeRequestIds.filter(id => id !== action.requestId);
      return {
        activeRequestIds: remaining,
        lastFinishedRequestId: action.requestId,
        phase: remaining.length > 0 ? "pending" : "success",
        resultRecordId: action.recordId,
        errorMessage: undefined
      };
    }
    case "ERROR": {
      const remaining = state.activeRequestIds.filter(id => id !== action.requestId);
      return {
        activeRequestIds: remaining,
        lastFinishedRequestId: action.requestId,
        phase: remaining.length > 0 ? "pending" : "error",
        resultRecordId: undefined,
        errorMessage: action.message
      };
    }
    case "CANCEL": {
      const remaining = state.activeRequestIds.filter(id => id !== action.requestId);
      return {
        activeRequestIds: remaining,
        lastFinishedRequestId: action.requestId,
        phase: remaining.length > 0 ? "pending" : "canceled",
        resultRecordId: undefined,
        errorMessage: undefined
      };
    }
    default:
      return state;
  }
}

export const selectors = {
  isGenerating: (snapshot: GenerationSnapshot) => snapshot.activeRequestIds.length > 0,
  inflightCount: (snapshot: GenerationSnapshot) => snapshot.activeRequestIds.length,
  showSuccess: (snapshot: GenerationSnapshot, currentRequestId: RequestId | null) =>
    snapshot.phase === "success" &&
    snapshot.lastFinishedRequestId !== null &&
    snapshot.lastFinishedRequestId === currentRequestId
};
