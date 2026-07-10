import { NextRequest } from "next/server";
import { z } from "zod";
import { describeAspectRatioForPrompt } from "@/lib/aspect";
import { CAMERA_MODE_PROMPT_GUIDELINE } from "@/components/studio/camera-config";
import { callCodexResponses, CodexResponseError } from "@/lib/codex-fetch";
import { CodexAuthError } from "@/lib/codex-oauth";

const requestSchema = z.object({
  basePrompt: z.string().min(1),
  userPrompt: z.string().optional(),
  negativePrompt: z.string().optional(),
  aspectRatio: z.string().optional(),
  referenceGallery: z.array(z.string()).optional(),
  camera: z
    .object({
      angle: z.string().optional(),
      aperture: z.string().optional(),
      subjectDirection: z.string().optional(),
      cameraDirection: z.string().optional(),
      zoom: z.string().optional()
    })
    .optional()
});

export async function POST(request: NextRequest) {
  try {
    const payload = requestSchema.parse(await request.json());
    const instructions = buildPromptInstruction(payload);

    const result = await callCodexResponses({
      mode: "text",
      input: [
        {
          role: "developer",
          content:
            "You are an assistant that transforms user prompts for AI image generation. Return ONLY a JSON object with keys finalPrompt (string, required), summary (string, optional), and cameraNotes (string, optional). No markdown, no commentary."
        },
        { role: "user", content: instructions }
      ],
      reasoningEffort: "none",
      logTag: "api/prompt"
    });

    const message = result.text?.trim();
    if (!message) {
      return jsonResponse({ ok: false, reason: "Codex 응답이 비어 있습니다." }, 502);
    }

    const cleaned = stripJsonFence(message);
    let parsed: { finalPrompt: string; summary?: string; cameraNotes?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      console.error("Failed to parse Codex response", cleaned, error);
      return jsonResponse(
        { ok: false, reason: "Codex 응답을 해석하지 못했습니다." },
        502
      );
    }

    if (!parsed.finalPrompt) {
      return jsonResponse({ ok: false, reason: "finalPrompt가 비어 있습니다." }, 502);
    }

    return jsonResponse({ ok: true, ...parsed }, 200);
  } catch (error) {
    if (error instanceof CodexAuthError) {
      return jsonResponse({ ok: false, reason: error.message, code: error.code }, 401);
    }
    if (error instanceof CodexResponseError) {
      console.error("/api/prompt Codex error", error.status, error.body.slice(0, 500));
      return jsonResponse(
        { ok: false, reason: `Codex 호출 실패 (${error.status})` },
        error.status === 401 ? 401 : 502
      );
    }
    if (error instanceof z.ZodError) {
      return jsonResponse({ ok: false, reason: "유효하지 않은 입력입니다.", issues: error.issues }, 400);
    }
    console.error("/api/prompt error", error);
    return jsonResponse({ ok: false, reason: "프롬프트 생성 중 오류가 발생했습니다." }, 500);
  }
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  return trimmed;
}

function buildPromptInstruction(payload: z.infer<typeof requestSchema>) {
  const segments: string[] = [];
  segments.push(
    "You are an expert AI image prompt engineer. Rewrite the user's prompt into a richer, production-ready description while preserving the main subject and intent."
  );
  segments.push(
    "If the base prompt contains @handle tokens (e.g., @ref1, @민수), preserve every @handle token verbatim in finalPrompt — do not translate, remove, or paraphrase them; they are reference-image identifiers."
  );
  segments.push(
    "Always integrate the provided camera settings using cinematic vocabulary. Mention the camera angle explicitly (e.g., 'low-angle hero shot') and convert the aperture into depth-of-field language (e.g., 'shot at f/1.4 for a shallow depth of field')."
  );
  segments.push(
    "Enhance the scene with complementary lighting, mood, and style descriptors without inventing new subjects. Use fluent, natural language."
  );
  segments.push(
    "If an aspect ratio is provided, tailor the composition to that framing (e.g., cinematic widescreen, vertical poster) while keeping the main subject centered."
  );
  segments.push(
    "Output JSON with: finalPrompt (one or two sentences, same language as the base prompt unless it is extremely short, in which case use fluent English), summary (brief explanation of enhancements), cameraNotes (how camera settings were applied)."
  );
  segments.push(
    "Camera angle cheat sheet: Low Angle = dramatic upward perspective, High Angle = elevated vantage, Worms Eye = extreme low-angle looking straight up, Birds Eye = aerial top-down, Close Up = intimate framing, Wide Shot = expansive framing."
  );

  segments.push(`Base visual description: ${payload.basePrompt}`);

  if (payload.userPrompt) {
    segments.push(`User modifications to apply: ${payload.userPrompt}`);
  }

  if (payload.negativePrompt) {
    segments.push(`Negative prompt (avoid these elements): ${payload.negativePrompt}`);
  }

  if (payload.camera) {
    const items = [
      payload.camera.angle ? `angle: ${payload.camera.angle}` : null,
      payload.camera.aperture ? `aperture: ${payload.camera.aperture}` : null,
      payload.camera.subjectDirection ? `subject orientation: ${payload.camera.subjectDirection}` : null,
      payload.camera.cameraDirection ? `camera facing: ${payload.camera.cameraDirection}` : null,
      payload.camera.zoom ? `zoom: ${payload.camera.zoom}` : null
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join(", ");

    if (items.length) {
      segments.push(`Camera settings -> ${items}`);
    }

    segments.push(`Camera-only directive: ${CAMERA_MODE_PROMPT_GUIDELINE}`);
    segments.push(
      "Do not change the subject's pose, expression, or background—describe only camera framing, motion, and focal adjustments."
    );
  }

  if (payload.aspectRatio && payload.aspectRatio !== "original") {
    const ratioDescription = describeAspectRatioForPrompt(payload.aspectRatio) ?? payload.aspectRatio;
    segments.push(`Aspect ratio preference: ${ratioDescription}.`);
  }

  if (payload.referenceGallery?.length) {
    segments.push(`Additional reference images provided: ${payload.referenceGallery.length}.`);
  }

  segments.push("Return only JSON conforming to the schema.");

  return segments.join("\n");
}
