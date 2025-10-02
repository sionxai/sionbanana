"use client";

import { useState, useEffect, useMemo } from "react";
import { firebaseAuth } from "@/lib/firebase/client";
import PresetEditor from "./PresetEditor";
import type { Preset, PresetCategory, PresetImportRow, PresetInput } from "@/lib/presets/types";
import { resolveLocalizedText } from "@/lib/presets/localized";
import presetsMigrationData from "@/presets-migration-data.json";
import { batchCreatePresets } from "@/lib/presets/firestore";

const CATEGORY_ORDER: PresetCategory[] = ["camera", "lighting", "pose", "external"];

const CATEGORY_LABEL: Record<PresetCategory, string> = {
  camera: "카메라",
  lighting: "조명",
  pose: "포즈",
  external: "외부"
};

async function callApi(path: string, method = "GET", body?: unknown) {
  const auth = firebaseAuth();
  const user = auth?.currentUser;
  const token = user ? await user.getIdToken() : "";

  const response = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  return response;
}

function normalizePreset(raw: any): Preset {
  const groupLabelKo = resolveLocalizedText(raw?.groupLabel, "ko");
  const groupLabelEn = resolveLocalizedText(raw?.groupLabel, "en");
  const labelEn = resolveLocalizedText(raw?.label, "en");
  const labelKoFromLabel = resolveLocalizedText(raw?.label, "ko");
  const labelKoExplicit = resolveLocalizedText(raw?.labelKo, "ko");
  const groupLabel = groupLabelKo || groupLabelEn || String(raw?.groupId ?? "");
  const label =
    labelEn ||
    labelKoFromLabel ||
    resolveLocalizedText(raw?.labelKo, "en") ||
    (typeof raw?.label === "string" ? raw.label : "");
  const labelKo = labelKoExplicit || labelKoFromLabel || labelEn || "";

  return {
    ...raw,
    groupLabel,
    label,
    labelKo,
  } as Preset;
}

function normalizeImportRows(rows: PresetImportRow[]): Array<PresetInput & { id: string }> {
  return rows.map((row, index) => {
    if (!row.id || !row.category || !row.groupId || !row.label || !row.prompt) {
      throw new Error(`프리셋 ${index + 1}번: 필수 필드(id, category, groupId, label, prompt)가 누락되었습니다.`);
    }

    if (!["camera", "lighting", "pose", "external"].includes(row.category)) {
      throw new Error(`프리셋 ${index + 1}번: 잘못된 카테고리(${row.category})입니다.`);
    }

    let metadata: Record<string, unknown> | undefined;
    if (typeof row.metadata === "string" && row.metadata.trim().length) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch (error) {
        throw new Error(`프리셋 ${index + 1}번: metadata 파싱 실패 (${row.metadata})`);
      }
    } else if (row.metadata && typeof row.metadata === "object") {
      metadata = row.metadata as Record<string, unknown>;
    }

    const orderValue = typeof row.order === "number" ? row.order : Number(row.order);

    return {
      id: row.id,
      category: row.category as PresetCategory,
      groupId: row.groupId,
      groupLabel: row.groupLabel || row.groupId,
      label: row.label,
      labelKo: row.labelKo || row.label,
      prompt: row.prompt,
      note: row.note,
      order: Number.isFinite(orderValue) ? Number(orderValue) : 0,
      active: row.active !== false && row.active !== "false",
      metadata
    };
  });
}

export default function PresetManagement() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<PresetCategory | "all">("all");
  const [searchText, setSearchText] = useState("");
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // 프리셋 목록 로드
  const loadPresets = async () => {
    setLoading(true);
    try {
      const response = await callApi("/api/admin/presets");
      if (response.ok) {
        const data = await response.json();
        const normalized = (data.presets || []).map((preset: any) => normalizePreset(preset));
        setPresets(normalized);
      } else {
        const error = await response.json();
        alert(error.error || "프리셋 조회 실패");
      }
    } catch (error) {
      console.error("[PresetManagement] Failed to load presets:", error);
      alert("프리셋 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPresets();
  }, []);

  const presetsByCategory = useMemo(() => {
    const map = new Map<PresetCategory, Map<string, { groupId: string; groupLabel: string; presets: Preset[] }>>();

    presets.forEach(preset => {
      const categoryMap = map.get(preset.category) ?? new Map();
      const groupKey = preset.groupId || "__ungrouped";
      const group = categoryMap.get(groupKey) ?? {
        groupId: preset.groupId,
        groupLabel: preset.groupLabel || preset.groupId || "(미지정)",
        presets: []
      };
      group.presets.push(preset);
      categoryMap.set(groupKey, group);
      map.set(preset.category, categoryMap);
    });

    return CATEGORY_ORDER.map(category => {
      const groups = Array.from(map.get(category)?.values() ?? []).sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
      groups.forEach(group => group.presets.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)));
      return { category, groups };
    });
  }, [presets]);

  const groupOptions = useMemo(() => {
    const map = new Map<string, { category: PresetCategory; groupId: string; groupLabel: string }>();

    presets.forEach(preset => {
      if (!preset.groupId) {
        return;
      }
      const key = `${preset.category}__${preset.groupId}`;
      if (!map.has(key)) {
        map.set(key, {
          category: preset.category,
          groupId: preset.groupId,
          groupLabel: preset.groupLabel
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.groupLabel.localeCompare(b.groupLabel);
    });
  }, [presets]);

  // 프리셋 필터링
  const filteredPresets = presets
    .filter((p) => filterCategory === "all" || p.category === filterCategory)
    .filter((p) => {
      if (!searchText) return true;
      const search = searchText.toLowerCase();
      return (
        p.label.toLowerCase().includes(search) ||
        p.labelKo.toLowerCase().includes(search) ||
        p.prompt.toLowerCase().includes(search) ||
        p.groupLabel.toLowerCase().includes(search)
      );
    });

  // 프리셋 저장 (생성/수정)
  const savePreset = async (id: string, input: PresetInput) => {
    try {
      const isCreate = !presets.find((p) => p.id === id);
      const url = isCreate ? "/api/admin/presets" : `/api/admin/presets/${id}`;
      const method = isCreate ? "POST" : "PUT";
      const body = isCreate ? { id, ...input } : input;

      const response = await callApi(url, method, body);

      if (response.ok) {
        alert(isCreate ? "생성되었습니다." : "수정되었습니다.");
        loadPresets();
      } else {
        const error = await response.json();
        alert(error.error || "저장 실패");
      }
    } catch (error) {
      console.error("[PresetManagement] Save error:", error);
      throw error;
    }
  };

  // 프리셋 삭제
  const deletePreset = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const response = await callApi(`/api/admin/presets/${id}`, "DELETE");
      if (response.ok) {
        alert("삭제되었습니다.");
        loadPresets();
      } else {
        const error = await response.json();
        alert(error.error || "삭제 실패");
      }
    } catch (error) {
      console.error("[PresetManagement] Delete error:", error);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  // CSV/JSON 내보내기
  const exportPresets = async (format: "json" | "csv") => {
    try {
      const category = filterCategory === "all" ? "" : filterCategory;
      const url = `/api/admin/presets/export?format=${format}${category ? `&category=${category}` : ""}`;
      const response = await callApi(url);

      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `presets_${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
      } else {
        const error = await response.json();
        alert(error.error || "내보내기 실패");
      }
    } catch (error) {
      console.error("[PresetManagement] Export error:", error);
      alert("내보내기 중 오류가 발생했습니다.");
    }
  };

  // CSV/JSON 가져오기
  const importPresets = async (file: File) => {
    console.log("[PresetManagement] Import started, file:", file.name, "size:", file.size);
    try {
      const text = await file.text();
      console.log("[PresetManagement] File read, length:", text.length);
      let presets: PresetImportRow[];

      if (file.name.endsWith(".json")) {
        const data = JSON.parse(text);
        presets = data.presets || data;
        console.log("[PresetManagement] JSON parsed, preset count:", presets.length);
      } else if (file.name.endsWith(".csv")) {
        // CSV 파싱 (간단한 구현)
        const lines = text.split("\n");
        const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        presets = lines.slice(1).filter((line) => line.trim()).map((line) => {
          const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
          const row: any = {};
          headers.forEach((header, i) => {
            row[header] = values[i];
          });
          return row as PresetImportRow;
        });
        console.log("[PresetManagement] CSV parsed, preset count:", presets.length);
      } else {
        alert("JSON 또는 CSV 파일만 지원합니다.");
        return;
      }

      console.log("[PresetManagement] Sending to API, preset count:", presets.length);
      const response = await callApi("/api/admin/presets/import", "POST", { presets });
      console.log("[PresetManagement] API response status:", response.status);

      if (response.ok) {
        const result = await response.json();
        console.log("[PresetManagement] Import success:", result);
        alert(`${result.imported}개의 프리셋을 가져왔습니다.`);
        loadPresets();
      } else {
        const error = await response.json();
        console.error("[PresetManagement] Import error response:", error);
        alert(error.error || "가져오기 실패");
      }
    } catch (error) {
      console.error("[PresetManagement] Import error:", error);
      alert("가져오기 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const importFromProjectPresets = async () => {
    const rawPresets = (presetsMigrationData as { presets?: PresetImportRow[] }).presets ?? [];
    if (!Array.isArray(rawPresets) || rawPresets.length === 0) {
      alert("불러올 프리셋 데이터가 없습니다.");
      return;
    }

    if (!confirm(`프로젝트에 정의된 ${rawPresets.length}개의 프리셋을 가져오고, 동일 ID는 덮어씁니다. 계속할까요?`)) {
      return;
    }

    setLoading(true);
    try {
      const normalizedPresets = normalizeImportRows(rawPresets);

      try {
        const CHUNK_SIZE = 150;
        let imported = 0;

        for (let i = 0; i < rawPresets.length; i += CHUNK_SIZE) {
          const chunk = rawPresets.slice(i, i + CHUNK_SIZE);
          const response = await callApi("/api/admin/presets/import", "POST", {
            presets: chunk,
            mode: "create"
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || error.details || `프리셋 가져오기 실패 (index ${i})`);
          }

          const result = await response.json();
          imported += result.imported ?? chunk.length;
        }

        alert(`${imported}개의 프리셋을 불러왔습니다.`);
        loadPresets();
      } catch (serverError) {
        console.warn("[PresetManagement] 서버 import 실패, 클라이언트로 재시도합니다.", serverError);

        const auth = firebaseAuth();
        const user = auth?.currentUser;
        if (!user) {
          throw new Error("로그인이 필요합니다. 다시 로그인 후 시도해주세요.");
        }

        const CHUNK_SIZE = 75;
        let imported = 0;

        for (let i = 0; i < normalizedPresets.length; i += CHUNK_SIZE) {
          const chunk = normalizedPresets.slice(i, i + CHUNK_SIZE);
          const count = await batchCreatePresets(chunk, user.uid);
          imported += count;
        }

        alert(`[클라이언트] ${imported}개의 프리셋을 불러왔습니다.`);
        loadPresets();
      }
    } catch (error) {
      console.error("[PresetManagement] Import project presets error:", error);
      alert(
        `프리셋 가져오기 중 오류가 발생했습니다: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importPresets(file);
    }
    e.target.value = ""; // 파일 입력 초기화
  };

  return (
    <div className="rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">프리셋 관리</h2>
        <div className="flex gap-2">
          <button
            className="rounded bg-blue-600 text-white px-4 py-2 hover:bg-blue-700"
            onClick={() => setShowCreateModal(true)}
          >
            + 새 프리셋
          </button>
          <button
            className="rounded border px-4 py-2 hover:bg-gray-50"
            onClick={importFromProjectPresets}
            disabled={loading}
          >
            코드 프리셋 불러오기
          </button>
          <button
            className="rounded border px-4 py-2 hover:bg-gray-50"
            onClick={() => exportPresets("json")}
          >
            JSON 내보내기
          </button>
          <button
            className="rounded border px-4 py-2 hover:bg-gray-50"
            onClick={() => exportPresets("csv")}
          >
            CSV 내보내기
          </button>
          <label className="rounded border px-4 py-2 hover:bg-gray-50 cursor-pointer">
            파일 가져오기
            <input
              type="file"
              accept=".json,.csv"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-4 mb-4">
        <select
          className="rounded border px-3 py-2"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as PresetCategory | "all")}
        >
          <option value="all">전체 카테고리</option>
          <option value="camera">카메라</option>
          <option value="lighting">조명</option>
          <option value="pose">포즈</option>
          <option value="external">외부</option>
        </select>
        <input
          type="text"
          placeholder="검색..."
          className="flex-1 rounded border px-3 py-2"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      {/* 프롬프트 분류 목록 */}
      <div className="mb-6 space-y-5">
        {presetsByCategory.map(({ category, groups }) => (
          <div key={category} className="rounded-lg border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-lg font-semibold">
                  {CATEGORY_LABEL[category]} ({groups.reduce((sum, group) => sum + group.presets.length, 0)}개)
                </h3>
                <p className="text-xs text-muted-foreground">카테고리: {category}</p>
              </div>
            </div>
            <div className="divide-y">
              {groups.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">등록된 프리셋이 없습니다.</div>
              ) : (
                groups.map(group => (
                  <details key={group.groupId || group.groupLabel} className="group">
                    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      {group.groupLabel} ({group.presets.length}개)
                      {group.groupId ? <span className="ml-2 text-xs text-muted-foreground">ID: {group.groupId}</span> : null}
                    </summary>
                    <div className="bg-gray-50/70 px-4 py-3 space-y-3">
                      {group.presets.map(preset => (
                        <div key={preset.id} className="rounded-md border bg-white p-3 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="font-medium text-sm">{preset.labelKo || preset.label}</div>
                              <div className="text-xs text-muted-foreground">ID: {preset.id} · 순서: {preset.order}</div>
                            </div>
                            <div className="flex gap-2 text-xs">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${preset.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700"}`}>
                                {preset.active ? "활성" : "비활성"}
                              </span>
                              <button
                                type="button"
                                className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                                onClick={() => setEditingPreset(preset)}
                              >
                                수정
                              </button>
                            </div>
                          </div>
                          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-100 px-2 py-1 text-xs text-gray-800">
                            {preset.prompt}
                          </pre>
                          {preset.note ? (
                            <p className="mt-1 text-xs text-muted-foreground">메모: {preset.note}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 프리셋 목록 테이블 */}
      {loading ? (
        <div className="text-center py-8">로딩 중...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left p-3 font-medium">ID</th>
                <th className="text-left p-3 font-medium">카테고리</th>
                <th className="text-left p-3 font-medium">그룹</th>
                <th className="text-left p-3 font-medium">레이블</th>
                <th className="text-left p-3 font-medium">프롬프트</th>
                <th className="text-left p-3 font-medium">순서</th>
                <th className="text-left p-3 font-medium">활성</th>
                <th className="text-left p-3 font-medium">액션</th>
              </tr>
            </thead>
            <tbody>
              {filteredPresets.map((preset) => (
                <tr key={preset.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-sm">{preset.id}</td>
                  <td className="p-3 text-sm">{preset.category}</td>
                  <td className="p-3 text-sm">{preset.groupLabel}</td>
                  <td className="p-3 text-sm">
                    <div>{preset.labelKo}</div>
                    <div className="text-gray-500">{preset.label}</div>
                  </td>
                  <td className="p-3 text-sm max-w-md truncate">{preset.prompt}</td>
                  <td className="p-3 text-sm">{preset.order}</td>
                  <td className="p-3 text-sm">{preset.active ? "✓" : "-"}</td>
                  <td className="p-3 text-sm">
                    <div className="flex gap-2">
                      <button
                        className="text-blue-600 hover:underline"
                        onClick={() => setEditingPreset(preset)}
                      >
                        수정
                      </button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => deletePreset(preset.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredPresets.length === 0 && (
            <div className="text-center py-8 text-gray-500">프리셋이 없습니다.</div>
          )}
        </div>
      )}

      {/* 생성/수정 모달 */}
      {(showCreateModal || editingPreset) && (
        <PresetEditor
          preset={editingPreset}
          onSave={savePreset}
          onClose={() => {
            setShowCreateModal(false);
            setEditingPreset(null);
          }}
          groups={groupOptions}
        />
      )}
    </div>
  );
}
