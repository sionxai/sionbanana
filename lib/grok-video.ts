import "server-only";

import { Buffer } from "node:buffer";

export const DEFAULT_GROK_VIDEO_PROXY_URL = "http://127.0.0.1:18645/v1";
export const DEFAULT_GROK_VIDEO_MODEL = "grok-imagine-video";
export const DEFAULT_GROK_VIDEO_DURATION = 5;
export const DEFAULT_GROK_VIDEO_RESOLUTION = "720p";

const SUBMIT_TIMEOUT_MS = 60_000;
const POLL_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 5_000;
const TOTAL_TIMEOUT_MS = 900_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_VIDEO_DOWNLOAD_BYTES = 100 * 1024 * 1024;

export type GrokVideoProgressEvent =
  | { phase: "submitted"; requestId: string }
  | { phase: "poll"; requestId: string; status: string; progress?: number }
  | { phase: "downloading"; requestId: string; videoUrl: string }
  | { phase: "done"; requestId: string; bytes: number };

export interface GenerateGrokVideoOptions {
  sourceImageDataUri?: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  model?: string;
  proxyUrl?: string;
  signal?: AbortSignal;
  onProgress?: (event: GrokVideoProgressEvent) => void;
}

export interface GenerateGrokVideoResult {
  videoBuffer: Buffer;
  contentType: string;
  requestId: string;
  videoUrl: string;
  model: string;
  duration: number;
  resolution: string;
  aspectRatio?: string;
  usage?: unknown;
}

type VideoPollResult = {
  status: string;
  progress?: number;
  videoUrl?: string;
  duration?: number | null;
  usage?: unknown;
  failedCode?: string;
};

export class GrokVideoError extends Error {
  status: number;
  code: string;
  body?: string;

  constructor(message: string, options: { status: number; code: string; body?: string; cause?: unknown }) {
    super(message);
    this.name = "GrokVideoError";
    this.status = options.status;
    this.code = options.code;
    this.body = options.body;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export async function generateGrokVideo(options: GenerateGrokVideoOptions): Promise<GenerateGrokVideoResult> {
  const prompt = options.prompt.trim();
  if (!prompt) {
    throw new GrokVideoError("영상 프롬프트를 입력해주세요.", {
      status: 400,
      code: "GROK_VIDEO_INVALID_PROMPT"
    });
  }

  if (options.sourceImageDataUri && !isImageDataUri(options.sourceImageDataUri)) {
    throw new GrokVideoError("sourceImageDataUri는 image/* base64 data URI여야 합니다.", {
      status: 400,
      code: "GROK_VIDEO_INVALID_SOURCE_IMAGE"
    });
  }

  const model = options.model?.trim() || DEFAULT_GROK_VIDEO_MODEL;
  const duration = options.duration ?? DEFAULT_GROK_VIDEO_DURATION;
  const resolution = options.resolution?.trim() || DEFAULT_GROK_VIDEO_RESOLUTION;
  const aspectRatio = options.aspectRatio?.trim() || undefined;
  const proxyUrl = normalizeProxyUrl(options.proxyUrl);

  const payload: Record<string, unknown> = {
    model,
    prompt,
    duration,
    resolution
  };
  if (aspectRatio) {
    payload.aspect_ratio = aspectRatio;
  }
  if (options.sourceImageDataUri) {
    payload.image = { url: options.sourceImageDataUri };
  }

  const requestId = await submitVideoRequest(proxyUrl, payload, options.signal);
  options.onProgress?.({ phase: "submitted", requestId });

  const poll = await pollVideoUntilDone(proxyUrl, requestId, options);
  if (!poll.videoUrl) {
    throw new GrokVideoError("Grok 영상 생성이 완료됐지만 video.url이 없습니다.", {
      status: 502,
      code: "GROK_VIDEO_EMPTY_RESPONSE"
    });
  }

  options.onProgress?.({ phase: "downloading", requestId, videoUrl: poll.videoUrl });
  const downloaded = await downloadVideo(poll.videoUrl, options.signal);
  options.onProgress?.({ phase: "done", requestId, bytes: downloaded.buffer.byteLength });

  return {
    videoBuffer: downloaded.buffer,
    contentType: downloaded.contentType,
    requestId,
    videoUrl: poll.videoUrl,
    model,
    duration: poll.duration ?? duration,
    resolution,
    aspectRatio,
    usage: poll.usage
  };
}

async function submitVideoRequest(proxyUrl: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const data = await requestJson(endpoint(proxyUrl, "videos/generations"), {
    method: "POST",
    headers: videoHeaders(),
    body: JSON.stringify(payload)
  }, SUBMIT_TIMEOUT_MS, signal, "GROK_VIDEO_REQUEST_FAILED", "Grok 영상 생성 요청");

  const requestId = typeof data?.request_id === "string" ? data.request_id : typeof data?.id === "string" ? data.id : "";
  if (!requestId) {
    throw new GrokVideoError("Grok 영상 생성 요청이 request_id를 반환하지 않았습니다.", {
      status: 502,
      code: "GROK_VIDEO_REQUEST_FAILED"
    });
  }
  return requestId;
}

async function pollVideoUntilDone(
  proxyUrl: string,
  requestId: string,
  options: GenerateGrokVideoOptions
): Promise<VideoPollResult> {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;

  for (;;) {
    if (Date.now() > deadline) {
      throw new GrokVideoError("Grok 영상 생성 폴링 시간이 초과되었습니다.", {
        status: 504,
        code: "GROK_VIDEO_TIMEOUT"
      });
    }

    const poll = await pollVideoOnce(proxyUrl, requestId, options.signal);
    options.onProgress?.({ phase: "poll", requestId, status: poll.status, progress: poll.progress });

    if (poll.status === "done") {
      return poll;
    }
    if (poll.status === "failed" || poll.status === "expired") {
      throw failedPollToError(poll);
    }

    const remaining = deadline - Date.now();
    await sleep(Math.min(POLL_INTERVAL_MS, Math.max(1, remaining)), options.signal);
  }
}

async function pollVideoOnce(proxyUrl: string, requestId: string, signal?: AbortSignal): Promise<VideoPollResult> {
  const data = await requestJson(endpoint(proxyUrl, `videos/${encodeURIComponent(requestId)}`), {
    method: "GET",
    headers: videoHeaders()
  }, POLL_TIMEOUT_MS, signal, "GROK_VIDEO_POLL_FAILED", "Grok 영상 상태 조회");

  const video = isRecord(data?.video) ? data.video : {};
  const error = isRecord(data?.error) ? data.error : {};
  return {
    status: typeof data?.status === "string" ? data.status : "unknown",
    progress: typeof data?.progress === "number" ? data.progress : undefined,
    videoUrl: typeof video.url === "string" ? video.url : undefined,
    duration: typeof video.duration === "number" ? video.duration : null,
    usage: data?.usage,
    failedCode: typeof error.code === "string" ? error.code : undefined
  };
}

async function downloadVideo(url: string, signal?: AbortSignal): Promise<{ buffer: Buffer; contentType: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new GrokVideoError("Grok 영상 다운로드 URL이 올바르지 않습니다.", {
      status: 502,
      code: "GROK_VIDEO_DOWNLOAD_FAILED",
      cause: error
    });
  }

  if (parsed.protocol !== "https:") {
    throw new GrokVideoError("Grok 영상 다운로드 URL은 https만 허용됩니다.", {
      status: 502,
      code: "GROK_VIDEO_DOWNLOAD_FAILED"
    });
  }

  const timeout = withTimeoutSignal(signal, DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: timeout.signal });
    if (!response.ok) {
      throw new GrokVideoError(`Grok 영상 다운로드 실패 (${response.status})`, {
        status: response.status,
        code: "GROK_VIDEO_DOWNLOAD_FAILED"
      });
    }

    const contentLength = Number(response.headers.get("content-length") || "0");
    if (contentLength > MAX_VIDEO_DOWNLOAD_BYTES) {
      throw new GrokVideoError("Grok 영상 다운로드가 100MB 제한을 초과했습니다.", {
        status: 502,
        code: "GROK_VIDEO_DOWNLOAD_TOO_LARGE"
      });
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/^video\/mp4\b/i.test(contentType) && !/^application\/octet-stream\b/i.test(contentType)) {
      throw new GrokVideoError("Grok 영상 다운로드가 MP4가 아닌 응답을 반환했습니다.", {
        status: 502,
        code: "GROK_VIDEO_DOWNLOAD_NOT_MP4"
      });
    }

    const buffer = await readResponseBufferWithLimit(response, MAX_VIDEO_DOWNLOAD_BYTES);
    if (buffer.length === 0) {
      throw new GrokVideoError("Grok 영상 다운로드가 비어 있습니다.", {
        status: 502,
        code: "GROK_VIDEO_DOWNLOAD_FAILED"
      });
    }
    if (!isMp4Container(buffer)) {
      throw new GrokVideoError("Grok 영상 다운로드가 유효한 MP4 컨테이너가 아닙니다.", {
        status: 502,
        code: "GROK_VIDEO_DOWNLOAD_NOT_MP4"
      });
    }

    return { buffer, contentType: "video/mp4" };
  } catch (error) {
    throw normalizeFetchError(error, timeout.timedOut(), signal, "GROK_VIDEO_DOWNLOAD_FAILED", "Grok 영상 다운로드");
  } finally {
    timeout.cleanup();
  }
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  code: string,
  label: string
): Promise<any> {
  const timeout = withTimeoutSignal(signal, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: timeout.signal });
    const text = await response.text();
    const data = parseJsonResponse(text);
    if (!response.ok) {
      const suffix = text ? `: ${text.slice(0, 500)}` : "";
      throw new GrokVideoError(`${label} 실패 (${response.status})${suffix}`, {
        status: response.status,
        code,
        body: text
      });
    }
    return data;
  } catch (error) {
    throw normalizeFetchError(error, timeout.timedOut(), signal, code, label);
  } finally {
    timeout.cleanup();
  }
}

function normalizeFetchError(
  error: unknown,
  timedOut: boolean,
  signal: AbortSignal | undefined,
  code: string,
  label: string
): Error {
  if (error instanceof GrokVideoError) {
    return error;
  }
  if (isAbortError(error)) {
    if (signal?.aborted) {
      return new GrokVideoError("Grok 영상 생성이 취소되었습니다.", {
        status: 499,
        code: "GROK_VIDEO_CANCELED",
        cause: error
      });
    }
    if (timedOut) {
      return new GrokVideoError(`${label} 시간이 초과되었습니다.`, {
        status: 504,
        code: "GROK_VIDEO_TIMEOUT",
        cause: error
      });
    }
  }
  if (isConnectionRefused(error)) {
    return new GrokVideoError("Grok 프록시가 실행 중이 아닙니다. 먼저 progrok proxy를 실행하세요.", {
      status: 502,
      code: "GROK_PROXY_NOT_RUNNING",
      cause: error
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new GrokVideoError(`${label} 요청 실패: ${message}`, {
    status: 502,
    code,
    cause: error
  });
}

function failedPollToError(poll: VideoPollResult): GrokVideoError {
  if (poll.status === "expired") {
    return new GrokVideoError("Grok 영상 생성 요청이 만료되었습니다.", {
      status: 502,
      code: "GROK_VIDEO_EXPIRED"
    });
  }
  return new GrokVideoError(`Grok 영상 생성이 실패했습니다${poll.failedCode ? `: ${poll.failedCode}` : ""}`, {
    status: 502,
    code: "GROK_VIDEO_FAILED"
  });
}

async function readResponseBufferWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new GrokVideoError("Grok 영상 다운로드가 100MB 제한을 초과했습니다.", {
        status: 502,
        code: "GROK_VIDEO_DOWNLOAD_TOO_LARGE"
      });
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = Buffer.from(value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new GrokVideoError("Grok 영상 다운로드가 100MB 제한을 초과했습니다.", {
          status: 502,
          code: "GROK_VIDEO_DOWNLOAD_TOO_LARGE"
        });
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

function videoHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: "Bearer dummy"
  };
}

function endpoint(proxyUrl: string, pathname: string): string {
  return `${proxyUrl}/${pathname.replace(/^\/+/, "")}`;
}

function normalizeProxyUrl(proxyUrl: string | undefined): string {
  const raw = proxyUrl?.trim() || DEFAULT_GROK_VIDEO_PROXY_URL;
  return raw.replace(/\/+$/, "");
}

function withTimeoutSignal(signal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
  timedOut: () => boolean;
} {
  const controller = new AbortController();
  let didTimeOut = false;

  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  const timer = setTimeout(() => {
    didTimeOut = true;
    abort();
  }, timeoutMs);

  if (signal?.aborted) {
    abort();
  } else {
    signal?.addEventListener("abort", abort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    },
    timedOut: () => didTimeOut
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GrokVideoError("Grok 영상 생성이 취소되었습니다.", {
        status: 499,
        code: "GROK_VIDEO_CANCELED"
      }));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new GrokVideoError("Grok 영상 생성이 취소되었습니다.", {
        status: 499,
        code: "GROK_VIDEO_CANCELED"
      }));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isMp4Container(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
}

function isImageDataUri(value: string): boolean {
  return /^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonResponse(text: string): any {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function isAbortError(error: unknown): boolean {
  return Boolean(error) && typeof error === "object" && (error as { name?: string }).name === "AbortError";
}

function isConnectionRefused(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth += 1) {
    const value = current as { code?: unknown; cause?: unknown; message?: unknown };
    if (value.code === "ECONNREFUSED") return true;
    if (typeof value.message === "string" && value.message.includes("ECONNREFUSED")) return true;
    current = value.cause;
  }
  return false;
}
