"use client";

import { useState } from "react";
import type { StoryboardStyle, StoryboardStyleInput } from "@/lib/storyboard/types";

interface VideoStyleEditorProps {
  style?: StoryboardStyle | null;
  onSave: (id: string, input: StoryboardStyleInput) => Promise<void>;
  onClose: () => void;
}

function randomSegment(): string {
  return Math.random().toString(36).slice(2, 8);
}

function generateStyleId() {
  return `style-${Date.now().toString(36)}-${randomSegment()}`;
}

export default function VideoStyleEditor({ style, onSave, onClose }: VideoStyleEditorProps) {
  const isEdit = Boolean(style);
  const [id, setId] = useState(() => style?.id ?? generateStyleId());
  const [label, setLabel] = useState(style?.label ?? "");
  const [description, setDescription] = useState(style?.description ?? "");
  const [grading, setGrading] = useState(style?.grading ?? "");
  const [previewGradient, setPreviewGradient] = useState(style?.previewGradient ?? "");
  const [referenceImageUrl, setReferenceImageUrl] = useState(style?.referenceImageUrl ?? "");
  const [prompt, setPrompt] = useState(style?.prompt ?? "");
  const [order, setOrder] = useState(style?.order ?? 0);
  const [active, setActive] = useState(style?.active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!id.trim() || !label.trim() || !description.trim() || !grading.trim()) {
      alert("필수 항목을 모두 입력해주세요.");
      return;
    }

    setSaving(true);
    try {
      const safeLabel = label.trim();
      const fallbackText = `${safeLabel || "Style"}`;
      const derivedBgm = style?.bgm?.trim() || `${fallbackText} background music`;
      const derivedVoTone = style?.voTone?.trim() || `${fallbackText} narration tone`;
      const derivedSfx = style?.sfx ?? [];

      const rawInput: StoryboardStyleInput = {
        label: label.trim(),
        description: description.trim(),
        grading: grading.trim(),
        bgm: derivedBgm,
        sfx: derivedSfx,
        voTone: derivedVoTone,
        previewGradient: previewGradient.trim() || undefined,
        referenceImageUrl: referenceImageUrl.trim() || undefined,
        prompt: prompt.trim() || undefined,
        order: Number.isFinite(order) ? order : 0,
        active
      };

      const input = Object.fromEntries(
        Object.entries(rawInput).filter(([, value]) => value !== undefined)
      ) as StoryboardStyleInput;

      await onSave(id.trim(), input);
      onClose();
    } catch (error) {
      console.error("[VideoStyleEditor] save error", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6">
        <h3 className="mb-4 text-xl font-semibold">{isEdit ? "영상 스타일 수정" : "새 영상 스타일"}</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">스타일 ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="w-full rounded border px-3 py-2 bg-gray-50"
                value={id}
                readOnly
              />
              {!isEdit ? (
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => setId(generateStyleId())}
                >
                  새 ID
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">스타일 이름</label>
              <input
                type="text"
                className="w-full rounded border px-3 py-2"
                value={label}
                onChange={event => setLabel(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">정렬 순서</label>
              <input
                type="number"
                className="w-full rounded border px-3 py-2"
                value={order}
                onChange={event => setOrder(Number(event.target.value))}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">스타일 설명</label>
            <textarea
              className="w-full rounded border px-3 py-2"
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={2}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">그레이딩 / 분위기 설명</label>
            <textarea
              className="w-full rounded border px-3 py-2"
              value={grading}
              onChange={event => setGrading(event.target.value)}
              rows={2}
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">프리뷰 그라데이션 (Tailwind 클래스)</label>
              <input
                type="text"
                className="w-full rounded border px-3 py-2"
                value={previewGradient}
                onChange={event => setPreviewGradient(event.target.value)}
                placeholder="예: from-zinc-900 via-zinc-700 to-black"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">참조 이미지 URL</label>
              <input
                type="url"
                className="w-full rounded border px-3 py-2"
                value={referenceImageUrl}
                onChange={event => setReferenceImageUrl(event.target.value)}
                placeholder="https://"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">스타일 프롬프트</label>
            <textarea
              className="w-full rounded border px-3 py-2 font-mono text-sm"
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              rows={4}
              placeholder="이 스타일을 설명하거나 세부 지침을 적어주세요."
            />
            <p className="mt-1 text-xs text-gray-500">현재 {prompt.length}자</p>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="rounded border"
                checked={active}
                onChange={event => setActive(event.target.checked)}
              />
              활성화
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
                onClick={onClose}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="submit"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                disabled={saving}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
