import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getAllPresetsAdmin, createPresetAdmin } from "@/lib/presets/firestore-admin";
import { ADMIN_UID } from "@/lib/constants";
import type { PresetInput } from "@/lib/presets/types";

/**
 * GET /api/admin/presets
 * 모든 프리셋 목록 조회 (관리자 전용)
 */
export async function GET(request: NextRequest) {
  try {
    // 관리자 인증 확인
    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json(
        { error: "Firebase Auth가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);

    if (decodedToken.uid !== ADMIN_UID) {
      return NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 }
      );
    }

    // 쿼리 파라미터로 필터링 옵션 받기
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const presets = await getAllPresetsAdmin();

    // 카테고리 필터링
    const filtered = category
      ? presets.filter((p) => p.category === category)
      : presets;

    return NextResponse.json({ presets: filtered });
  } catch (error) {
    console.error("[GET /api/admin/presets] Error:", error);
    return NextResponse.json(
      { error: "프리셋 목록 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/presets
 * 새 프리셋 생성 (관리자 전용)
 */
export async function POST(request: NextRequest) {
  try {
    // 관리자 인증 확인
    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json(
        { error: "Firebase Auth가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);

    if (decodedToken.uid !== ADMIN_UID) {
      return NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, ...input } = body as PresetInput & { id: string };

    if (!id) {
      return NextResponse.json(
        { error: "프리셋 ID가 필요합니다." },
        { status: 400 }
      );
    }

    // 필수 필드 검증
    if (!input.category || !input.groupId || !input.label || !input.prompt) {
      return NextResponse.json(
        { error: "필수 필드가 누락되었습니다." },
        { status: 400 }
      );
    }

    const preset = await createPresetAdmin(id, input, decodedToken.uid);

    return NextResponse.json({ preset }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/presets] Error:", error);
    return NextResponse.json(
      { error: "프리셋 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}