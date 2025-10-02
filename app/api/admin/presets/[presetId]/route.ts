import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getPresetByIdAdmin, updatePresetAdmin, deletePresetAdmin } from "@/lib/presets/firestore-admin";
import { ADMIN_UID } from "@/lib/constants";
import type { PresetInput } from "@/lib/presets/types";

/**
 * GET /api/admin/presets/[presetId]
 * 단일 프리셋 조회 (관리자 전용)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { presetId: string } }
) {
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

    const preset = await getPresetByIdAdmin(params.presetId);

    if (!preset) {
      return NextResponse.json(
        { error: "프리셋을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ preset });
  } catch (error) {
    console.error("[GET /api/admin/presets/:id] Error:", error);
    return NextResponse.json(
      { error: "프리셋 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/presets/[presetId]
 * 프리셋 수정 (관리자 전용)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { presetId: string } }
) {
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

    const input = await request.json() as Partial<PresetInput>;

    const preset = await updatePresetAdmin(params.presetId, input, decodedToken.uid);

    return NextResponse.json({ preset });
  } catch (error) {
    console.error("[PUT /api/admin/presets/:id] Error:", error);
    return NextResponse.json(
      { error: "프리셋 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/presets/[presetId]
 * 프리셋 삭제 (관리자 전용)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { presetId: string } }
) {
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

    await deletePresetAdmin(params.presetId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/admin/presets/:id] Error:", error);
    return NextResponse.json(
      { error: "프리셋 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}