import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { GenerationMode } from "@/lib/types";

export interface GenerateVariables {
  prompt: string;
  refinedPrompt?: string;
  negativePrompt?: string;
  mode: GenerationMode;
  camera?: {
    angle?: string;
    aperture?: string;
    subjectDirection?: string;
    cameraDirection?: string;
    zoom?: string;
  };
  options?: Record<string, unknown>;
}

export interface GenerateResponse {
  ok: boolean;
  base64Image?: string | null;
  imageUrl?: string;
  storagePath?: string | null;
  id?: string;
  model?: string;
  revisedPrompt?: string | null;
  reason?: string;
  status?: number;
  costCredits?: number;
  images?: Array<{
    id: string;
    imageUrl: string;
    base64Image?: string | null;
    storagePath?: string | null;
    revisedPrompt?: string | null;
    mimeType?: string;
  }>;
}

export const GENERATE_TIMEOUT_MS = 300000;
const TRANSIENT_GENERATE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const GENERATE_RETRY_DELAYS_MS = [1500, 4000];

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `generate-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function callGenerateApi(variables: GenerateVariables, signal?: AbortSignal): Promise<GenerateResponse> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), GENERATE_TIMEOUT_MS);
  const effectiveSignal = timeoutController.signal;
  const handleExternalAbort = () => timeoutController.abort();
  if (signal) {
    if (signal.aborted) {
      timeoutController.abort();
    } else {
      signal.addEventListener("abort", handleExternalAbort, { once: true });
    }
  }
  const requestVariables: GenerateVariables = {
    ...variables,
    options: {
      ...(variables.options ?? {}),
      idempotencyKey:
        typeof variables.options?.idempotencyKey === "string"
          ? variables.options.idempotencyKey
          : createIdempotencyKey()
    }
  };

  try {
    for (let attempt = 0; attempt <= GENERATE_RETRY_DELAYS_MS.length; attempt++) {
      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestVariables),
          signal: effectiveSignal
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (TRANSIENT_GENERATE_STATUS.has(response.status) && attempt < GENERATE_RETRY_DELAYS_MS.length) {
            await delay(GENERATE_RETRY_DELAYS_MS[attempt], effectiveSignal);
            continue;
          }
          return {
            ok: false,
            reason: errorData.reason || `HTTP ${response.status}: ${response.statusText}`,
            status: response.status
          };
        }

        const data = (await response.json()) as GenerateResponse;
        return data;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        if (attempt < GENERATE_RETRY_DELAYS_MS.length) {
          await delay(GENERATE_RETRY_DELAYS_MS[attempt], effectiveSignal);
          continue;
        }
        throw error;
      }
    }

    return {
      ok: false,
      reason: "이미지 생성 재시도에 실패했습니다."
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        reason: "요청 시간이 초과되었습니다. 다시 시도해주세요."
      };
    }

    return {
      ok: false,
      reason: error instanceof Error ? error.message : "네트워크 오류가 발생했습니다."
    };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", handleExternalAbort);
  }
}

export function useGenerateImage() {
  return useMutation({
    mutationFn: (variables: GenerateVariables) => callGenerateApi(variables),
    onSuccess: data => {
      if (data.ok) {
        toast.success("이미지를 생성했습니다.");
      } else {
        toast.error("생성 실패", {
          description: data.reason ?? "잠시 후 다시 시도해주세요."
        });
      }
    },
    onError: error => {
      console.error(error);
      toast.error("생성 실패", {
        description: "네트워크 환경을 확인해주세요."
      });
    }
  });
}
