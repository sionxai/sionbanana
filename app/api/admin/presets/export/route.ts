import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getAllPresetsAdmin } from "@/lib/presets/firestore-admin";
import { ADMIN_UID } from "@/lib/constants";
import type { PresetExportRow } from "@/lib/presets/types";

/**
 * GET /api/admin/presets/export
 * 프리셋을 JSON 형식으로 내보내기 (관리자 전용)
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

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json"; // json or csv
    const category = searchParams.get("category");

    // 모든 프리셋 가져오기
    const allPresets = await getAllPresetsAdmin();
    const presets = category
      ? allPresets.filter((p) => p.category === category)
      : allPresets;

    // Export 형식으로 변환
    const exportData: PresetExportRow[] = presets.map((p) => ({
      id: p.id,
      category: p.category,
      groupId: p.groupId,
      groupLabel: p.groupLabel,
      label: p.label,
      labelKo: p.labelKo,
      prompt: p.prompt,
      note: p.note || "",
      order: p.order,
      active: p.active ? "true" : "false",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      metadata: p.metadata ? JSON.stringify(p.metadata) : ""
    }));

    if (format === "csv") {
      // CSV 형식으로 변환
      const headers = [
        "id",
        "category",
        "groupId",
        "groupLabel",
        "label",
        "labelKo",
        "prompt",
        "note",
        "order",
        "active",
        "createdAt",
        "updatedAt",
        "metadata"
      ];

      const csvRows = [
        headers.join(","),
        ...exportData.map((row) =>
          headers
            .map((header) => {
              const value = row[header as keyof PresetExportRow];
              // CSV 이스케이프: 쌍따옴표로 감싸고 내부 쌍따옴표는 두 배로
              if (value === undefined || value === null) return "";
              const str = String(value).replace(/"/g, '""');
              return `"${str}"`;
            })
            .join(",")
        )
      ];

      const csvContent = csvRows.join("\n");

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="presets_${Date.now()}.csv"`
        }
      });
    }

    // JSON 형식 (기본)
    return NextResponse.json(
      { presets: exportData },
      {
        headers: {
          "Content-Disposition": `attachment; filename="presets_${Date.now()}.json"`
        }
      }
    );
  } catch (error) {
    console.error("[GET /api/admin/presets/export] Error:", error);
    return NextResponse.json(
      { error: "프리셋 내보내기에 실패했습니다." },
      { status: 500 }
    );
  }
}
