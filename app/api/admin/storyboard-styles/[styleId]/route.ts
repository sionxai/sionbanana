import { NextRequest, NextResponse } from "next/server";
import { ADMIN_UID } from "@/lib/constants";
import { getAdminAuth } from "@/lib/firebase/admin";
import {
  deleteStoryboardStyleAdmin,
  getStoryboardStyleByIdAdmin,
  updateStoryboardStyleAdmin
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

function parsePartialStyleInput(raw: any): Partial<StoryboardStyleInput> {
  if (!raw || typeof raw !== "object") {
    throw new Error("잘못된 요청 본문입니다.");
  }

  const result: Partial<StoryboardStyleInput> = {};

  if (raw.label !== undefined) {
    const text = String(raw.label).trim();
    if (text) {
      result.label = text;
    }
  }
  if (raw.description !== undefined) {
    const text = String(raw.description).trim();
    if (text) {
      result.description = text;
    }
  }
  if (raw.grading !== undefined) {
    const text = String(raw.grading).trim();
    if (text) {
      result.grading = text;
    }
  }
  if (raw.bgm !== undefined) {
    const text = String(raw.bgm ?? "").trim();
    result.bgm = text || undefined;
  }
  if (raw.sfx !== undefined) {
    result.sfx = ensureStringArray(raw.sfx);
  }
  if (raw.voTone !== undefined) {
    const text = String(raw.voTone ?? "").trim();
    result.voTone = text || undefined;
  }
  if (raw.previewGradient !== undefined) {
    const text = String(raw.previewGradient ?? "").trim();
    result.previewGradient = text || undefined;
  }
  if (raw.referenceImageUrl !== undefined) {
    const text = String(raw.referenceImageUrl ?? "").trim();
    result.referenceImageUrl = text || undefined;
  }
  if (raw.prompt !== undefined) {
    const text = String(raw.prompt ?? "").trim();
    result.prompt = text || undefined;
  }
  if (raw.order !== undefined) {
    const parsedOrder = Number.isFinite(raw.order) ? Number(raw.order) : Number(raw.order ?? 0);
    result.order = Number.isFinite(parsedOrder) ? parsedOrder : 0;
  }
  if (raw.active !== undefined) {
    result.active = raw.active !== false;
  }

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

export async function GET(request: NextRequest, { params }: { params: { styleId: string } }) {
  try {
    await requireAdminUser(request);
    const style = await getStoryboardStyleByIdAdmin(params.styleId);
    if (!style) {
      return NextResponse.json({ error: "스타일을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ style });
  } catch (error) {
    const status = (error as any)?.status ?? 500;
    console.error(`[/api/admin/storyboard-styles/${params.styleId}] GET`, error);
    return NextResponse.json({ error: (error as Error).message || "조회 실패" }, { status });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { styleId: string } }) {
  try {
    const userId = await requireAdminUser(request);
    const body = await request.json();
    const input = parsePartialStyleInput(body);
    const style = await updateStoryboardStyleAdmin(params.styleId, input, userId);
    return NextResponse.json({ style });
  } catch (error) {
    const status = (error as any)?.status ?? 500;
    console.error(`[/api/admin/storyboard-styles/${params.styleId}] PUT`, error);
    return NextResponse.json({ error: (error as Error).message || "수정 실패" }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { styleId: string } }) {
  try {
    await requireAdminUser(request);
    await deleteStoryboardStyleAdmin(params.styleId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = (error as any)?.status ?? 500;
    console.error(`[/api/admin/storyboard-styles/${params.styleId}] DELETE`, error);
    return NextResponse.json({ error: (error as Error).message || "삭제 실패" }, { status });
  }
}
