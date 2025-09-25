export type ViewSpec = {
  id: string;
  label: string;
  instruction: string;
};

export type LightingPresetCategory = "illumination" | "atmosphere" | "time" | "cinematic" | "artistic" | "harmony" | "mood";

export type LightingSelections = Record<LightingPresetCategory, string[]>;

export type PosePresetCategory = "expression" | "posture";

export type PoseSelections = Record<PosePresetCategory, string[]>;

export interface PromptDetails {
  // 베이스 프롬프트 (사용자가 직접 입력한 기본 프롬프트)
  basePrompt?: string;

  // 사용자 수정 지시사항 (remix 액션에서 추가로 입력한 내용)
  userInstructions?: string[];

  // 모드별 조정사항
  modeAdjustments?: {
    camera?: string;
    pose?: string;
    lighting?: string;
  };

  // GPT 생성 정보
  gptGenerated?: {
    summary?: string;
    cameraNotes?: string;
    finalPrompt?: string;
  };

  // 메타 정보
  source?: "manual" | "gpt-manual" | "gpt-auto";
  timestamp?: string;
}
