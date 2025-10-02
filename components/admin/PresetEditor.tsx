"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { Preset, PresetInput, PresetCategory } from "@/lib/presets/types";

interface PresetGroupOption {
  category: PresetCategory;
  groupId: string;
  groupLabel: string;
}

interface PresetEditorProps {
  preset?: Preset | null;
  onSave: (id: string, input: PresetInput) => Promise<void>;
  onClose: () => void;
  groups: PresetGroupOption[];
}

const NEW_GROUP_OPTION = "__new__";

function randomSegment(): string {
  return Math.random().toString(36).slice(2, 8);
}

function generatePresetId(category: PresetCategory): string {
  const timestamp = Date.now().toString(36);
  return `${category}-${timestamp}-${randomSegment()}`;
}

function generateGroupId(category: PresetCategory): string {
  return `${category}-grp-${randomSegment()}`;
}

export default function PresetEditor({ preset, onSave, onClose, groups }: PresetEditorProps) {
  const isEdit = Boolean(preset);
  const defaultCategory: PresetCategory = preset?.category ?? "external";

  const initialGroupConfig = useMemo(() => {
    if (preset?.groupId) {
      return {
        selection: preset.groupId,
        groupId: preset.groupId,
        groupLabel: preset.groupLabel ?? "",
        newGroupId: generateGroupId(defaultCategory)
      };
    }

    const categoryGroups = groups.filter(group => group.category === defaultCategory);
    if (categoryGroups.length > 0) {
      const first = categoryGroups[0];
      return {
        selection: first.groupId,
        groupId: first.groupId,
        groupLabel: first.groupLabel,
        newGroupId: generateGroupId(defaultCategory)
      };
    }

    const generated = generateGroupId(defaultCategory);
    return {
      selection: NEW_GROUP_OPTION,
      groupId: generated,
      groupLabel: "",
      newGroupId: generated
    };
  }, [defaultCategory, groups, preset]);

  const [id, setId] = useState(() => preset?.id ?? generatePresetId(defaultCategory));
  const [category, setCategory] = useState<PresetCategory>(defaultCategory);
  const [groupSelection, setGroupSelection] = useState<string>(initialGroupConfig.selection);
  const [groupId, setGroupId] = useState(initialGroupConfig.groupId);
  const [newGroupId, setNewGroupId] = useState(initialGroupConfig.newGroupId);
  const [groupLabel, setGroupLabel] = useState(initialGroupConfig.groupLabel);
  const [label, setLabel] = useState(preset?.label ?? "");
  const [labelKo, setLabelKo] = useState(preset?.labelKo ?? "");
  const [prompt, setPrompt] = useState(preset?.prompt ?? "");
  const [note, setNote] = useState(preset?.note ?? "");
  const [order, setOrder] = useState(preset?.order ?? 0);
  const [active, setActive] = useState(preset?.active ?? true);
  const [saving, setSaving] = useState(false);

  const categoryGroups = useMemo(
    () => groups.filter(group => group.category === category),
    [groups, category]
  );

  const handleGroupSelectionChange = useCallback(
    (value: string) => {
      if (value === NEW_GROUP_OPTION) {
        const generated = generateGroupId(category);
        setGroupSelection(NEW_GROUP_OPTION);
        setNewGroupId(generated);
        setGroupId(generated);
        setGroupLabel("");
        return;
      }

      setGroupSelection(value);
      setGroupId(value);
      const matched = groups.find(
        option => option.category === category && option.groupId === value
      );
      if (matched) {
        setGroupLabel(matched.groupLabel);
      }
    },
    [category, groups]
  );

  useEffect(() => {
    if (groupSelection !== NEW_GROUP_OPTION) {
      const exists = categoryGroups.some(group => group.groupId === groupSelection);
      if (!exists) {
        if (categoryGroups.length > 0) {
          const first = categoryGroups[0];
          setGroupSelection(first.groupId);
          setGroupId(first.groupId);
          setGroupLabel(first.groupLabel);
        } else {
          const generated = generateGroupId(category);
          setGroupSelection(NEW_GROUP_OPTION);
          setNewGroupId(generated);
          setGroupId(generated);
          setGroupLabel("");
        }
      }
    }
  }, [category, categoryGroups, groupSelection]);

  useEffect(() => {
    if (groupSelection === NEW_GROUP_OPTION) {
      setGroupId(newGroupId);
    }
  }, [groupSelection, newGroupId]);

  const handleCategoryChange = (nextCategory: PresetCategory) => {
    setCategory(nextCategory);

    const availableGroups = groups.filter(group => group.category === nextCategory);
    if (availableGroups.length > 0) {
      const first = availableGroups[0];
      setGroupSelection(first.groupId);
      setGroupId(first.groupId);
      setGroupLabel(first.groupLabel);
      setNewGroupId(generateGroupId(nextCategory));
    } else {
      const generated = generateGroupId(nextCategory);
      setGroupSelection(NEW_GROUP_OPTION);
      setNewGroupId(generated);
      setGroupId(generated);
      setGroupLabel("");
    }
  };

  const handleRegeneratePresetId = () => {
    if (isEdit) {
      return;
    }
    setId(generatePresetId(category));
  };

  const handleRegenerateGroupId = () => {
    const generated = generateGroupId(category);
    setNewGroupId(generated);
    setGroupId(generated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedLabel = label.trim();
    const trimmedLabelKo = labelKo.trim();
    const trimmedPrompt = prompt.trim();
    const trimmedGroupLabel = groupLabel.trim();
    const trimmedNote = note.trim();

    if (!id || !category || !groupId || !trimmedLabel || !trimmedPrompt) {
      alert("필수 필드를 모두 입력해주세요.");
      return;
    }

    if (groupSelection === NEW_GROUP_OPTION && !trimmedGroupLabel) {
      alert("새 그룹을 생성하려면 그룹 표시명을 입력해주세요.");
      return;
    }

    setSaving(true);
    try {
      const input: PresetInput = {
        category,
        groupId,
        groupLabel: trimmedGroupLabel || groupId,
        label: trimmedLabel,
        labelKo: trimmedLabelKo || trimmedLabel,
        prompt: trimmedPrompt,
        note: trimmedNote ? trimmedNote : undefined,
        order,
        active
      };

      await onSave(id, input);
      onClose();
    } catch (error) {
      console.error("[PresetEditor] Save error:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold mb-4">
          {preset ? "프리셋 수정" : "새 프리셋 생성"}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ID */}
          <div>
            <label className="block text-sm font-medium mb-1">
              프리셋 ID <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className="w-full rounded border px-3 py-2 bg-gray-50"
                value={id}
                readOnly
                disabled
              />
              {!isEdit && (
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={handleRegeneratePresetId}
                >
                  새 ID
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {isEdit
                ? "프리셋 ID는 변경할 수 없습니다."
                : "ID는 자동으로 생성되며 필요 시 재생성할 수 있습니다."}
            </p>
          </div>

          {/* 카테고리 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              카테고리 <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full rounded border px-3 py-2"
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as PresetCategory)}
              required
            >
              <option value="camera">카메라</option>
              <option value="lighting">조명</option>
              <option value="pose">포즈</option>
              <option value="external">외부</option>
            </select>
          </div>

          {/* 그룹 선택 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              그룹 선택 <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full rounded border px-3 py-2"
              value={groupSelection}
              onChange={(e) => handleGroupSelectionChange(e.target.value)}
            >
              {categoryGroups.map(group => (
                <option key={group.groupId} value={group.groupId}>
                  {group.groupLabel} ({group.groupId})
                </option>
              ))}
              <option value={NEW_GROUP_OPTION}>➕ 새 그룹 생성</option>
            </select>
            {groupSelection === NEW_GROUP_OPTION ? (
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="w-full rounded border px-3 py-2 bg-gray-50"
                    value={groupId}
                    readOnly
                    disabled
                  />
                  <button
                    type="button"
                    className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={handleRegenerateGroupId}
                  >
                    재생성
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  새 그룹 ID는 자동으로 생성됩니다.
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                선택된 그룹 ID: {groupId}
              </p>
            )}
          </div>

          {/* 그룹 표시명 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              그룹 표시명
            </label>
            <input
              type="text"
              className="w-full rounded border px-3 py-2"
              value={groupLabel}
              onChange={(e) => setGroupLabel(e.target.value)}
              placeholder="예: 자연광 (새 그룹 생성 시 필수)"
              required={groupSelection === NEW_GROUP_OPTION}
            />
          </div>

          {/* 레이블 (영문) */}
          <div>
            <label className="block text-sm font-medium mb-1">
              레이블 (영문) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full rounded border px-3 py-2"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: Standing"
              required
            />
          </div>

          {/* 레이블 (한글) */}
          <div>
            <label className="block text-sm font-medium mb-1">
              레이블 (한글)
            </label>
            <input
              type="text"
              className="w-full rounded border px-3 py-2"
              value={labelKo}
              onChange={(e) => setLabelKo(e.target.value)}
              placeholder="예: 서 있는 (미입력시 영문 레이블 사용)"
            />
          </div>

          {/* 프롬프트 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              프롬프트 <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full rounded border px-3 py-2 min-h-[120px] font-mono text-sm"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="AI에게 전달될 프롬프트 텍스트를 입력하세요"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              현재 {prompt.length}자
            </p>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              메모 (선택)
            </label>
            <textarea
              className="w-full rounded border px-3 py-2 min-h-[60px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="관리자용 메모 (사용자에게 표시되지 않음)"
            />
          </div>

          {/* 순서 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              정렬 순서 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={order}
              onChange={(e) => setOrder(parseInt(e.target.value || "0", 10))}
              placeholder="0"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              작은 숫자가 먼저 표시됩니다
            </p>
          </div>

          {/* 활성화 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              className="rounded border"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <label htmlFor="active" className="text-sm font-medium">
              활성화 (체크 해제 시 사용자에게 표시되지 않음)
            </label>
          </div>

          {/* 버튼 */}
          <div className="flex gap-2 justify-end pt-4 border-t">
            <button
              type="button"
              className="rounded border px-4 py-2 hover:bg-gray-50"
              onClick={onClose}
              disabled={saving}
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
