import "server-only";

import { CodexAuthError, getCodexAuth } from "./codex-oauth";

// Re-export for convenience so consumers don't need a second import.
export { CodexAuthError };

const CODEX_RESPONSES_ENDPOINT =
  process.env.CODEX_RESPONSES_ENDPOINT || "https://chatgpt.com/backend-api/codex/responses";

export const DEFAULT_TEXT_MODEL = process.env.DEFAULT_TEXT_MODEL || "gpt-5.4-mini";
export const DEFAULT_IMAGE_MODEL = process.env.DEFAULT_IMAGE_MODEL || "gpt-5.4-mini";

export type CodexContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

export type CodexMessage = {
  role: "user" | "developer" | "system" | "assistant";
  content: string | CodexContentPart[];
};

export type CodexImageQuality = "low" | "medium" | "high" | "auto";
export type CodexImageModeration = "low" | "auto";
export type CodexImageFormat = "png" | "jpeg" | "webp";

export type CodexImageOptions = {
  quality?: CodexImageQuality;
  size?: string;
  moderation?: CodexImageModeration;
  output_format?: CodexImageFormat;
};

export type CodexCallOptions = {
  mode: "text" | "image";
  model?: string;
  input: CodexMessage[];
  imageOptions?: CodexImageOptions;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  responseFormat?: {
    type: "json_schema";
    json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean };
  };
  signal?: AbortSignal;
  /** 디버깅용 로그 prefix */
  logTag?: string;
};

export type CodexImageResult = {
  b64: string;
  mimeType: string;
  revisedPrompt?: string;
};

export type CodexCallResult = {
  text?: string;
  images: CodexImageResult[];
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

export class CodexResponseError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, message?: string) {
    super(message ?? `Codex 응답 실패 (${status}): ${body.slice(0, 200)}`);
    this.name = "CodexResponseError";
    this.status = status;
    this.body = body;
  }
}

export async function callCodexResponses(options: CodexCallOptions): Promise<CodexCallResult> {
  const { accessToken, accountId } = await getCodexAuth();

  const tools = options.mode === "image"
    ? [
        (() => {
          const tool: Record<string, unknown> = {
            type: "image_generation",
            quality: options.imageOptions?.quality ?? "medium",
            size: options.imageOptions?.size ?? "1024x1024",
            moderation: options.imageOptions?.moderation ?? "low"
          };
          if (options.imageOptions?.output_format) {
            tool.output_format = options.imageOptions.output_format;
          }
          return tool;
        })()
      ]
    : undefined;

  // Codex Responses API는 시스템 지시문을 `instructions` 필드로 받는다.
  // developer/system role 메시지는 instructions로 옮기고, input에는 user/assistant만 남긴다.
  const systemTexts: string[] = [];
  const conversational: typeof options.input = [];
  for (const message of options.input) {
    if (message.role === "developer" || message.role === "system") {
      if (typeof message.content === "string") {
        systemTexts.push(message.content);
      } else {
        for (const part of message.content) {
          if (part.type === "input_text") systemTexts.push(part.text);
        }
      }
      continue;
    }
    conversational.push(message);
  }

  const requestBody: Record<string, unknown> = {
    model: options.model ?? (options.mode === "image" ? DEFAULT_IMAGE_MODEL : DEFAULT_TEXT_MODEL),
    input: conversational,
    stream: true,
    store: false,
    reasoning: { effort: options.reasoningEffort ?? "none" }
  };
  const instructions = systemTexts.join("\n\n").trim();
  if (instructions) {
    requestBody.instructions = instructions;
  }
  if (tools) {
    requestBody.tools = tools;
    requestBody.tool_choice = "required";
  }
  if (options.responseFormat) {
    requestBody.response_format = options.responseFormat;
  }

  const response = await fetch(CODEX_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "chatgpt-account-id": accountId,
      "OpenAI-Beta": "responses=experimental",
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify(requestBody),
    signal: options.signal
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    if (options.logTag) {
      console.error(`[${options.logTag}] Codex ${response.status}:`, errorBody.slice(0, 500));
    }
    throw new CodexResponseError(response.status, errorBody);
  }

  if (!response.body) {
    throw new CodexResponseError(500, "Codex 응답 본문이 비어있습니다.");
  }

  return parseCodexStream(response.body, options.logTag);
}

async function parseCodexStream(
  body: ReadableStream<Uint8Array>,
  logTag?: string
): Promise<CodexCallResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalText = "";
  let deltaBuffer = "";
  const images: CodexImageResult[] = [];
  let finishReason: string | undefined;
  let usage: CodexCallResult["usage"];

  const collectImageItem = (item: Record<string, unknown>) => {
    const result = typeof item.result === "string" ? item.result : null;
    if (!result) return;
    const revisedPrompt =
      typeof item.revised_prompt === "string" ? item.revised_prompt : undefined;
    images.push({
      b64: result,
      mimeType: typeof item.output_format === "string" ? `image/${item.output_format}` : "image/png",
      revisedPrompt
    });
  };

  const handleEvent = (event: string, dataLine: string) => {
    if (!dataLine || dataLine === "[DONE]") return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(dataLine);
    } catch {
      return;
    }

    if (event === "response.output_text.delta" || payload.type === "response.output_text.delta") {
      const delta = typeof payload.delta === "string" ? payload.delta : "";
      if (delta) deltaBuffer += delta;
      return;
    }

    if (event === "response.output_item.done" || payload.type === "response.output_item.done") {
      const item = (payload.item as Record<string, unknown>) ?? {};
      if (item.type === "image_generation_call") {
        collectImageItem(item);
      } else if (item.type === "message") {
        const content = item.content as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(content)) {
          const text = content
            .map(part => (typeof part.text === "string" ? part.text : ""))
            .filter(Boolean)
            .join("");
          if (text) finalText = text;
        }
      }
      return;
    }

    if (event === "response.completed" || payload.type === "response.completed") {
      const fullResponse = payload.response as Record<string, unknown> | undefined;
      if (fullResponse) {
        const output = fullResponse.output as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(output)) {
          for (const item of output) {
            if (item.type === "image_generation_call") {
              collectImageItem(item);
            } else if (item.type === "message" && Array.isArray(item.content)) {
              const text = (item.content as Array<Record<string, unknown>>)
                .map(part => (typeof part.text === "string" ? part.text : ""))
                .filter(Boolean)
                .join("");
              if (text) finalText = text;
            }
          }
        }
        const usageObj = fullResponse.usage as Record<string, unknown> | undefined;
        if (usageObj) {
          usage = {
            inputTokens: typeof usageObj.input_tokens === "number" ? usageObj.input_tokens : undefined,
            outputTokens: typeof usageObj.output_tokens === "number" ? usageObj.output_tokens : undefined
          };
        }
        const status = fullResponse.status;
        if (typeof status === "string") finishReason = status;
      }
      return;
    }

    if (event === "response.failed" || payload.type === "response.failed") {
      const message =
        ((payload.response as Record<string, unknown>)?.error as Record<string, unknown>)?.message ??
        "응답이 실패했습니다.";
      throw new CodexResponseError(500, JSON.stringify(payload), String(message));
    }
  };

  const flushBuffer = () => {
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const lines = chunk.split("\n");
      let event = "message";
      const dataParts: string[] = [];
      for (const line of lines) {
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataParts.push(line.slice(5).trim());
        }
      }
      const dataLine = dataParts.join("\n");
      try {
        handleEvent(event, dataLine);
      } catch (error) {
        if (logTag) {
          console.error(`[${logTag}] 이벤트 파싱 실패`, error);
        }
        throw error;
      }
      boundary = buffer.indexOf("\n\n");
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      flushBuffer();
    }
    buffer += decoder.decode();
    if (buffer.length > 0) {
      buffer += "\n\n";
      flushBuffer();
    }
  } finally {
    reader.releaseLock();
  }

  return {
    text: finalText || deltaBuffer || undefined,
    images,
    finishReason,
    usage
  };
}

export async function bufferToDataUrl(
  buffer: Buffer,
  mimeType: string = "image/png"
): Promise<string> {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

const CODEX_USAGE_ENDPOINT =
  process.env.CODEX_USAGE_ENDPOINT || "https://chatgpt.com/backend-api/wham/usage";

export type CodexRateWindow = {
  used_percent: number;
  limit_window_seconds: number;
  reset_after_seconds: number;
  reset_at: number;
};

export type CodexRateLimit = {
  allowed: boolean;
  limit_reached: boolean;
  primary_window: CodexRateWindow | null;
  secondary_window: CodexRateWindow | null;
};

export type CodexAdditionalRateLimit = {
  limit_name: string;
  metered_feature?: string;
  rate_limit: CodexRateLimit;
};

export type CodexUsageResponse = {
  user_id?: string;
  account_id?: string;
  email?: string;
  plan_type?: string;
  rate_limit?: CodexRateLimit;
  code_review_rate_limit?: CodexRateLimit | null;
  additional_rate_limits?: CodexAdditionalRateLimit[];
};

export async function fetchCodexUsage(): Promise<CodexUsageResponse> {
  const { accessToken, accountId } = await getCodexAuth();

  const response = await fetch(CODEX_USAGE_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "chatgpt-account-id": accountId,
      "OpenAI-Beta": "responses=experimental",
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new CodexResponseError(response.status, body);
  }

  return (await response.json()) as CodexUsageResponse;
}
