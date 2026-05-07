import { z } from "zod";

const serverSchema = z.object({
  SIONBANANA_DATA_DIR: z.string().optional(),
  CODEX_HOME: z.string().optional(),
  CHATGPT_LOCAL_HOME: z.string().optional(),
  CODEX_RESPONSES_ENDPOINT: z.string().optional(),
  DEFAULT_TEXT_MODEL: z.string().optional(),
  DEFAULT_IMAGE_MODEL: z.string().optional(),
  // 호환성 (제거 예정)
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional()
});

export const serverEnv = serverSchema.parse({
  SIONBANANA_DATA_DIR: process.env.SIONBANANA_DATA_DIR,
  CODEX_HOME: process.env.CODEX_HOME,
  CHATGPT_LOCAL_HOME: process.env.CHATGPT_LOCAL_HOME,
  CODEX_RESPONSES_ENDPOINT: process.env.CODEX_RESPONSES_ENDPOINT,
  DEFAULT_TEXT_MODEL: process.env.DEFAULT_TEXT_MODEL,
  DEFAULT_IMAGE_MODEL: process.env.DEFAULT_IMAGE_MODEL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY
});

// 로컬 단일 사용자 도구로 전환되면서 Firebase 의존성을 제거. 호출처는 점진적으로 정리.
export const clientEnv = {} as Record<string, string | undefined>;
export const isFirebaseConfigured = false;

export function getServiceAccountKey(): null {
  return null;
}

export function getFirestoreDatabaseId(): string {
  return "(default)";
}
