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
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : "";

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(variables),
    signal
  });

  const data = (await response.json()) as GenerateResponse;
  if (!response.ok) {
    return data;
  }

  return data;
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
