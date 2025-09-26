import { NextRequest } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { describeAspectRatioForPrompt } from "@/lib/aspect";
import { CAMERA_MODE_PROMPT_GUIDELINE } from "@/components/studio/camera-config";

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
  const apiKey = serverEnv.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ ok: false, reason: "OPENAI_API_KEY is not configured." }),
      { status: 500 }
    );
  }

  try {
    const payload = requestSchema.parse(await request.json());

    const instructions = buildPromptInstruction(payload);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You are an assistant that transforms user prompts for AI image generation. Return concise JSON describing the resulting prompt."
          },
          {
            role: "user",
            content: instructions
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "prompt_response",
            schema: {
              type: "object",
              properties: {
                finalPrompt: { type: "string" },
                summary: { type: "string" },
                cameraNotes: { type: "string" }
              },
              required: ["finalPrompt"],
              additionalProperties: false
            }
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error", response.status, errorText);
      return new Response(
        JSON.stringify({ ok: false, reason: "Failed to reach OpenAI API." }),
        { status: 500 }
      );
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message?.content;
    if (!message) {
      return new Response(
        JSON.stringify({ ok: false, reason: "OpenAI API returned no content." }),
        { status: 500 }
      );
    }

    let parsed: { finalPrompt: string; summary?: string; cameraNotes?: string };
    try {
      parsed = JSON.parse(message);
    } catch (error) {
      console.error("Failed to parse OpenAI response", message, error);
      return new Response(
        JSON.stringify({ ok: false, reason: "OpenAI 응답을 해석하지 못했습니다." }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, ...parsed }),
      { status: 200 }
    );
  } catch (error) {
    console.error("/api/prompt error", error);
    return new Response(
      JSON.stringify({ ok: false, reason: "프롬프트 생성 중 오류가 발생했습니다." }),
      { status: 500 }
    );
  }
}

function buildPromptInstruction(payload: z.infer<typeof requestSchema>) {
  const segments: string[] = [];
  segments.push(
    "You are an expert AI image prompt engineer. Rewrite the user's prompt into a richer, production-ready description while preserving the main subject and intent."
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
