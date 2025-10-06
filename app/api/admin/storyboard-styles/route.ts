import { NextRequest, NextResponse } from "next/server";
import { ADMIN_UID } from "@/lib/constants";
import { getAdminAuth } from "@/lib/firebase/admin";
import {
  createStoryboardStyleAdmin,
  getAllStoryboardStylesAdmin
} from "@/lib/storyboard/firestore-admin";
import type { StoryboardStyleInput } from "@/lib/storyboard/types";

function ensureStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseStyleInput(raw: any): StoryboardStyleInput {
  if (!raw || typeof raw !== "object") {
    throw new Error("잘못된 요청 본문입니다.");
  }

  const {
    label,
    description,
    grading,
    bgm,
    sfx,
    voTone,
    previewGradient,
    referenceImageUrl,
    prompt,
    order,
    active
  } = raw;

  if (!label || !description || !grading) {
    throw new Error("label, description, grading은 필수입니다.");
  }

  const parsedOrder = Number.isFinite(order) ? Number(order) : Number(order ?? 0) || 0;
  const trimmedLabel = String(label).trim();

  const result: StoryboardStyleInput = {
    label: trimmedLabel,
    description: String(description).trim(),
    grading: String(grading).trim(),
    bgm: bgm ? String(bgm).trim() : `${trimmedLabel} background music`,
    sfx: ensureStringArray(sfx),
    voTone: voTone ? String(voTone).trim() : `${trimmedLabel} narration tone`,
    previewGradient: previewGradient ? String(previewGradient).trim() : undefined,
    referenceImageUrl: referenceImageUrl ? String(referenceImageUrl).trim() : undefined,
    prompt: prompt ? String(prompt).trim() : undefined,
    order: parsedOrder,
    active: active !== false
  };

  Object.keys(result).forEach(key => {
    if ((result as Record<string, unknown>)[key] === undefined) {
      delete (result as Record<string, unknown>)[key];
    }
  });

  return result;
}

async function requireAdminUser(request: NextRequest) {
  const auth = getAdminAuth();
  if (!auth) {
    throw new Error("Firebase Auth가 설정되지 않았습니다.");
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("인증이 필요합니다.");
  }

  const token = authHeader.substring(7);
  const decodedToken = await auth.verifyIdToken(token);

  if (decodedToken.uid !== ADMIN_UID) {
    const error = new Error("관리자 권한이 필요합니다.");
    (error as any).status = 403;
    throw error;
  }

  return decodedToken.uid;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const styles = await getAllStoryboardStylesAdmin();
    return NextResponse.json({ styles });
  } catch (error) {
    const status = (error as any)?.status ?? 500;
    console.error("[GET /api/admin/storyboard-styles]", error);
    return NextResponse.json({ error: (error as Error).message || "조회에 실패했습니다." }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAdminUser(request);
    const body = await request.json();
    if (!body?.id) {
      return NextResponse.json({ error: "id 필드가 필요합니다." }, { status: 400 });
    }

    const input = parseStyleInput(body);
    const style = await createStoryboardStyleAdmin(String(body.id), input, userId);
    return NextResponse.json({ style }, { status: 201 });
  } catch (error) {
    const status = (error as any)?.status ?? 500;
    console.error("[POST /api/admin/storyboard-styles]", error);
    return NextResponse.json({ error: (error as Error).message || "생성에 실패했습니다." }, { status });
  }
}
