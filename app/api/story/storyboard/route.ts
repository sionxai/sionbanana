import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  callCodexResponses,
  CodexResponseError,
  DEFAULT_TEXT_MODEL,
  type CodexMessage
} from "@/lib/codex-fetch";
import { CodexAuthError } from "@/lib/codex-oauth";
import {
  ANGLE_OPTIONS,
  FRAMING_OPTIONS,
  SPECIAL_OPTIONS,
  normalizeCinematography,
  type SceneCinematography
} from "@/lib/story-cinematography";
import { STORY_REFERENCE_HANDLE_PATTERN, type StoryReferenceRole } from "@/lib/story-references";

type ChatRole = "system" | "user" | "assistant" | "developer";

type StoryboardScene = {
  prompt: string;
  mentions: string[];
  invalidMentions?: string[];
  cinematography: SceneCinematography;
};

const STORYBOARD_MODEL = "gpt-5.5";
const HANDLE_PATTERN = /@([A-Za-z0-9_가-힣ㄱ-ㅎㅏ-ㅣ]+)/gu;

const handleSchema = z
  .object({
    handle: z
      .string()
      .trim()
      .regex(STORY_REFERENCE_HANDLE_PATTERN, "핸들은 1~32자의 한글, 영문, 숫자, 밑줄만 사용할 수 있습니다."),
    role: z.enum(["character", "location"]),
    description: z.string().trim().max(300).optional()
  })
  .strict();

const requestSchema = z
  .object({
    story: z.string().trim().min(1).max(2000),
    sceneCount: z.number().int().min(1).max(10),
    handles: z.array(handleSchema).max(10)
  })
  .strict();

type StoryboardRequestBody = z.infer<typeof requestSchema>;

const storyboardSceneResponseSchema = z
  .object({
    prompt: z.unknown().optional(),
    mentions: z.unknown().optional(),
    invalidMentions: z.unknown().optional(),
    cinematography: z.unknown().optional()
  })
  .passthrough();

const storyboardScenesResponseSchema = z.array(storyboardSceneResponseSchema);

type RawStoryboardScene = z.infer<typeof storyboardSceneResponseSchema>;

function toCodexInput(messages: { role: ChatRole; content: string }[]): CodexMessage[] {
  return messages.map(message => ({
    role: message.role === "system" ? "developer" : message.role,
    content: message.content
  }));
}

function normalizeHandle(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^@+/, "") : "";
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  values.forEach(value => {
    const normalized = normalizeHandle(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    next.push(normalized);
  });
  return next;
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractMentionCandidates(prompt: string): string[] {
  return unique(Array.from(prompt.matchAll(HANDLE_PATTERN), match => match[1]));
}

function safeParseJsonArray(text: string): RawStoryboardScene[] | null {
  try {
    const parsed = JSON.parse(stripJsonFence(text));
    const result = storyboardScenesResponseSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function normalizeScenes(rawScenes: RawStoryboardScene[], registeredHandles: Set<string>, sceneCount: number): StoryboardScene[] {
  return rawScenes.slice(0, sceneCount).map((rawScene, index) => {
    const record = rawScene as Record<string, unknown>;
    const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
    const rawMentions = Array.isArray(record.mentions) ? record.mentions : [];
    const promptMentions = extractMentionCandidates(prompt);
    const mentionedCandidates = unique([...rawMentions.map(normalizeHandle), ...promptMentions]);
    const mentions = mentionedCandidates.filter(handle => registeredHandles.has(handle));
    const invalidMentions = mentionedCandidates.filter(handle => !registeredHandles.has(handle));

    return {
      prompt,
      mentions,
      cinematography: normalizeCinematography(record.cinematography, index),
      ...(invalidMentions.length ? { invalidMentions } : {})
    };
  });
}

function formatHandleList(handles: Array<{ handle: string; role: StoryReferenceRole; description?: string }>): string {
  return handles
    .map(item => {
      const description = item.description?.trim();
      return `- @${item.handle} (${item.role})${description ? `: ${description}` : ""}`;
    })
    .join("\n");
}

function buildMessages({
  story,
  sceneCount,
  handles
}: {
  story: string;
  sceneCount: number;
  handles: Array<{ handle: string; role: StoryReferenceRole; description?: string }>;
}) {
  const handleList = formatHandleList(handles);
  const framingIds = FRAMING_OPTIONS.map(option => option.id).join(", ");
  const angleIds = ANGLE_OPTIONS.map(option => option.id).join(", ");
  const specialIds = SPECIAL_OPTIONS.map(option => option.id).join(", ");
  return [
    {
      role: "system" as const,
      content:
        "당신은 키비주얼 시리즈 스토리보드 작가. " +
        "사용자의 스토리를 컷별 이미지 생성 프롬프트로 재구성한다. " +
        "각 컷의 prompt는 요약문이 아니라 바로 이미지 생성에 사용할 수 있는 상세 키프레임 설명이어야 한다. " +
        "각 prompt는 한국어 2~4문장, 약 160~420자로 작성하고, 장면의 행동, 표정/감정, 공간, 구도, 조명, 분위기, 핵심 소품을 자연스럽게 포함한다. " +
        "스토리의 의도와 디테일을 해석해 장면마다 충분히 구체화하되, 한 컷에 보이지 않는 사건 설명이나 메타 해설은 쓰지 않는다. " +
        "등록된 핸들만 mention 가능하다. 예: @민수, @카페. " +
        "각 prompt에는 등장하는 @핸들을 포함하고, mentions에는 @를 제외한 핸들명을 넣는다. " +
        `각 컷에 cinematography 객체를 포함한다. framing은 다음 id 중 하나: ${framingIds}. ` +
        `angle은 다음 id 중 하나: ${angleIds}. special은 다음 id 중 하나 또는 null: ${specialIds}. ` +
        "전체 컷에서 같은 framing/angle 조합을 기계적으로 반복하지 않는다. " +
        "응답은 JSON 배열만 반환한다. 마크다운, 설명, 코드펜스는 금지한다."
    },
    {
      role: "user" as const,
      content:
        `스토리:\n${story.trim()}\n\n` +
        `컷 수: ${sceneCount}\n\n` +
        `등록된 핸들:\n${handleList || "- 없음"}\n\n` +
        "출력 형식:\n" +
        `[{"prompt":"비 내리는 저녁의 @카페 입구 앞, 젖은 유리문 너머 따뜻한 조명이 번지고 @민수가 문고리를 잡은 채 잠시 멈춰 선다. @민수의 표정은 기대와 두려움이 섞여 있고, 손에는 여러 번 접힌 종이가 구겨져 있다. 카메라는 문 앞의 좁은 처마 아래에서 인물을 살짝 올려다보며, 빗방울과 반사광이 장면의 긴장감을 만든다.","mentions":["민수","카페"],"cinematography":{"framing":"medium-shot","angle":"low-angle","special":"over-the-shoulder"}}]\n\n` +
        `반드시 ${sceneCount}개 배열 항목을 목표로 작성하고, 각 prompt는 상세한 이미지 생성 프롬프트로 쓴다. ` +
        "prompt에는 위 등록 핸들만 사용하고, 원문을 단순 요약하지 말고 컷마다 시각적으로 충분히 구체화한다. " +
        "cinematography는 각 컷의 시각적 기능에 맞게 달리 선택한다."
    }
  ];
}

async function requestStoryboardScenes({
  body,
  registeredHandles,
  isRetry = false
}: {
  body: StoryboardRequestBody;
  registeredHandles: Set<string>;
  isRetry?: boolean;
}): Promise<StoryboardScene[]> {
  const messages = buildMessages(body);
  if (isRetry) {
    messages.push({
      role: "user" as const,
      content:
        `이전 응답의 컷 수가 요청한 ${body.sceneCount}개보다 적었습니다. ` +
        `반드시 ${body.sceneCount}개 JSON 배열 항목만 반환하고 각 항목에 cinematography를 포함하세요.`
    });
  }

  const result = await callCodexResponses({
    mode: "text",
    model: STORYBOARD_MODEL,
    input: toCodexInput(messages),
    reasoningEffort: "none",
    logTag: "api/story/storyboard"
  });

  const content = result.text?.trim();
  if (!content) {
    throw new Error("스토리 분할 결과 없음");
  }

  const parsed = safeParseJsonArray(content);
  if (!parsed) {
    throw new Error("LLM 응답 파싱 실패");
  }

  return normalizeScenes(parsed, registeredHandles, body.sceneCount).filter(scene => scene.prompt);
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = requestSchema.parse(await request.json());
    const registeredHandles = new Set(body.handles.map(item => normalizeHandle(item.handle)).filter(Boolean));

    let scenes = await requestStoryboardScenes({ body, registeredHandles });
    if (scenes.length < body.sceneCount) {
      scenes = await requestStoryboardScenes({ body, registeredHandles, isRetry: true });
    }
    if (scenes.length < body.sceneCount) {
      return NextResponse.json(
        { ok: false, reason: "스토리 분할 컷 수가 요청보다 적음" },
        { status: 502 }
      );
    }
    if (!scenes.length) {
      return NextResponse.json({ ok: false, reason: "스토리 분할 결과 없음" }, { status: 502 });
    }

    return NextResponse.json(
      {
        ok: true,
        scenes,
        meta: { model: STORYBOARD_MODEL || DEFAULT_TEXT_MODEL }
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, reason: "유효하지 않은 입력입니다.", issues: error.issues }, { status: 400 });
    }
    if (error instanceof CodexAuthError) {
      return NextResponse.json({ ok: false, reason: error.message, code: error.code }, { status: 401 });
    }
    if (error instanceof CodexResponseError) {
      console.error("/api/story/storyboard Codex error", error.status, error.body.slice(0, 500));
      return NextResponse.json(
        { ok: false, reason: `Codex 호출 실패 (${error.status})` },
        { status: error.status === 401 ? 401 : 502 }
      );
    }
    if (error instanceof Error && (error.message === "스토리 분할 결과 없음" || error.message === "LLM 응답 파싱 실패")) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: 502 });
    }
    console.error("/api/story/storyboard error", error);
    return NextResponse.json({ ok: false, reason: "스토리 분할 중 오류가 발생했습니다." }, { status: 500 });
  }
}
