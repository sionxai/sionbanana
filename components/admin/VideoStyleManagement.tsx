/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { firebaseAuth } from "@/lib/firebase/client";
import type { StoryboardStyle, StoryboardStyleInput } from "@/lib/storyboard/types";
import VideoStyleEditor from "./VideoStyleEditor";
import { FALLBACK_STORYBOARD_STYLES } from "@/data/storyboard-styles";

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

export default function VideoStyleManagement() {
  const [styles, setStyles] = useState<StoryboardStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingStyle, setEditingStyle] = useState<StoryboardStyle | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadStyles = async () => {
    setLoading(true);
    try {
      const response = await callApi("/api/admin/storyboard-styles");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "스타일을 불러오지 못했습니다.");
      }
      const data = await response.json();
      const loaded = Array.isArray(data.styles) ? data.styles : [];
      setStyles(loaded.length ? loaded : FALLBACK_STORYBOARD_STYLES);
    } catch (error) {
      console.error("[VideoStyleManagement] load error", error);
      alert(error instanceof Error ? error.message : "스타일을 불러오는 중 오류가 발생했습니다.");
      setStyles(FALLBACK_STORYBOARD_STYLES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStyles();
  }, []);

  const filteredStyles = useMemo(() => {
    if (!search.trim()) {
      return styles;
    }
    const keyword = search.trim().toLowerCase();
    return styles.filter(style =>
      [style.label, style.description, style.grading, style.bgm, style.voTone]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(keyword))
    );
  }, [styles, search]);

  const handleSave = async (id: string, input: StoryboardStyleInput) => {
    const isCreate = !styles.find(style => style.id === id);
    const url = isCreate ? "/api/admin/storyboard-styles" : `/api/admin/storyboard-styles/${id}`;
    const method = isCreate ? "POST" : "PUT";
    const body = isCreate ? { id, ...input } : input;

    const response = await callApi(url, method, body);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "저장에 실패했습니다.");
    }
    await loadStyles();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) {
      return;
    }
    try {
      const response = await callApi(`/api/admin/storyboard-styles/${id}`, "DELETE");
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "삭제에 실패했습니다.");
      }
      await loadStyles();
    } catch (error) {
      console.error("[VideoStyleManagement] delete error", error);
      alert(error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="rounded-lg border p-6">
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">영상 스타일 관리</h2>
          <p className="text-sm text-muted-foreground">프롬프트 기반 영상 스타일 프리셋을 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            className="w-64 rounded border px-3 py-2 text-sm"
            placeholder="스타일 검색"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => setShowCreate(true)}
          >
            + 새 스타일
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-sm font-medium">
                <th className="p-3 w-24">미리보기</th>
                <th className="p-3 w-48">스타일</th>
                <th className="p-3">설명</th>
                <th className="p-3 w-40">그레이딩</th>
                <th className="p-3 w-24">순서</th>
                <th className="p-3 w-20">활성</th>
                <th className="p-3 w-36">액션</th>
              </tr>
            </thead>
            <tbody>
              {filteredStyles.map(style => (
                <tr key={style.id} className="border-b text-sm hover:bg-gray-50">
                  <td className="p-3 align-top">
                    {style.referenceImageUrl ? (
                      <img
                        src={style.referenceImageUrl}
                        alt={style.label}
                        className="h-16 w-full rounded object-cover"
                      />
                    ) : (
                      <div
                        className={`h-16 w-full rounded bg-gradient-to-br ${style.previewGradient ?? "from-slate-700 via-slate-900 to-black"}`}
                      />
                    )}
                  </td>
                  <td className="p-3 align-top">
                    <div className="font-medium">{style.label}</div>
                    <div className="text-xs text-muted-foreground">ID: {style.id}</div>
                  </td>
                  <td className="p-3 align-top">
                    <div className="text-sm leading-snug">{style.description}</div>
                    {style.prompt ? (
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{style.prompt}</div>
                    ) : null}
                  </td>
                  <td className="p-3 align-top text-xs text-muted-foreground">{style.grading}</td>
                  <td className="p-3 align-top">{style.order}</td>
                  <td className="p-3 align-top">{style.active ? "✓" : "-"}</td>
                  <td className="p-3 align-top">
                    <div className="flex gap-3">
                      <button
                        className="text-blue-600 hover:underline"
                        onClick={() => setEditingStyle(style)}
                      >
                        수정
                      </button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => handleDelete(style.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStyles.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">등록된 스타일이 없습니다.</div>
          )}
        </div>
      )}

      {(showCreate || editingStyle) && (
        <VideoStyleEditor
          style={editingStyle}
          onSave={handleSave}
          onClose={() => {
            setShowCreate(false);
            setEditingStyle(null);
          }}
        />
      )}
    </div>
  );
}
