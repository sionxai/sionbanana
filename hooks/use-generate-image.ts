import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { firebaseAuth } from "@/lib/firebase/client";
import type { GenerationMode } from "@/lib/types";

export interface GenerateVariables {
  prompt: string;
  refinedPrompt?: string;
  negativePrompt?: string;
  mode: GenerationMode;
  camera?: {
    angle?: string;
    aperture?: string;
  };
  options?: Record<string, unknown>;
}

export interface GenerateResponse {
  ok: boolean;
  base64Image?: string;
  imageUrl?: string;
  reason?: string;
  costCredits?: number;
}

export async function callGenerateApi(variables: GenerateVariables, signal?: AbortSignal): Promise<GenerateResponse> {
  const auth = firebaseAuth();
  const user = auth?.currentUser;
  const token = user ? await user.getIdToken() : "";

  // Create a timeout signal if none provided
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30000); // 30 second timeout

  const effectiveSignal = signal || timeoutController.signal;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(variables),
      signal: effectiveSignal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        ok: false,
        reason: errorData.reason || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = (await response.json()) as GenerateResponse;
    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        reason: "요청 시간이 초과되었습니다. 다시 시도해주세요."
      };
    }

    return {
      ok: false,
      reason: error instanceof Error ? error.message : "네트워크 오류가 발생했습니다."
    };
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
