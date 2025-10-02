import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { batchCreatePresetsAdmin } from "@/lib/presets/firestore-admin";
import { ADMIN_UID } from "@/lib/constants";
import type { PresetInput, PresetImportRow } from "@/lib/presets/types";

/**
 * POST /api/admin/presets/import
 * CSV/JSON 파일로 프리셋 대량 생성/수정 (관리자 전용)
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
    const { presets, mode = "create" } = body as {
      presets: PresetImportRow[];
      mode?: "create" | "upsert";
    };

    if (!Array.isArray(presets) || presets.length === 0) {
      return NextResponse.json(
        { error: "프리셋 데이터가 필요합니다." },
        { status: 400 }
      );
    }

    // 데이터 검증 및 변환
    const validPresets: Array<PresetInput & { id: string }> = [];
    const errors: Array<{ row: number; error: string }> = [];

    presets.forEach((row, index) => {
      try {
        // 필수 필드 검증
        if (!row.id || !row.category || !row.groupId || !row.label || !row.prompt) {
          errors.push({
            row: index + 1,
            error: "필수 필드 누락 (id, category, groupId, label, prompt)"
          });
          return;
        }

        // 카테고리 검증
        if (!["camera", "lighting", "pose", "external"].includes(row.category)) {
          errors.push({
            row: index + 1,
            error: `잘못된 카테고리: ${row.category}`
          });
          return;
        }

        let metadata: Record<string, unknown> | undefined;
        if (typeof row.metadata === "string" && row.metadata.trim().length) {
          try {
            metadata = JSON.parse(row.metadata);
          } catch (parseError) {
            throw new Error(`metadata JSON 파싱 실패: ${row.metadata}`);
          }
        } else if (row.metadata && typeof row.metadata === "object") {
          metadata = row.metadata as Record<string, unknown>;
        }

        validPresets.push({
          id: row.id,
          category: row.category as "camera" | "lighting" | "pose" | "external",
          groupId: row.groupId,
          groupLabel: row.groupLabel || row.groupId,
          label: row.label,
          labelKo: row.labelKo || row.label,
          prompt: row.prompt,
          note: row.note,
          order: typeof row.order === "number" ? row.order : 0,
          active: row.active !== false,
          metadata
        });
      } catch (err) {
        errors.push({
          row: index + 1,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    });

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: "일부 데이터 검증 실패",
          errors,
          validCount: validPresets.length
        },
        { status: 400 }
      );
    }

    // Firestore에 배치 생성
    const count = await batchCreatePresetsAdmin(validPresets, decodedToken.uid);

    return NextResponse.json({
      success: true,
      imported: count,
      total: presets.length
    });
  } catch (error) {
    console.error("[POST /api/admin/presets/import] Error:", error);
    return NextResponse.json(
      {
        error: "프리셋 가져오기에 실패했습니다.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
