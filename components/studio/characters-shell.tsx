"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useGeneratedImages } from "@/hooks/use-generated-images";
import type { GeneratedImageDocument } from "@/lib/types";
import { toast } from "sonner";
import {
  copyCharacterImageToStorage,
  storeCharacterImageFile
} from "@/components/studio/character-image-storage";
import {
  CHARACTER_HANDLE_PATTERN,
  loadCharacters,
  removeCharacter,
  saveCharacter,
  subscribeCharacters,
  type Character
} from "@/lib/characters";

type DraftSource =
  | { kind: "existing"; url: string }
  | { kind: "upload"; file: File; previewUrl: string }
  | { kind: "history"; record: GeneratedImageDocument; url: string };

type CharacterDraft = {
  id?: string;
  name: string;
  handle: string;
  description: string;
  tagsText: string;
  source: DraftSource | null;
};

function createEmptyDraft(): CharacterDraft {
  return {
    name: "",
    handle: "",
    description: "",
    tagsText: "",
    source: null
  };
}

function draftFromCharacter(character: Character): CharacterDraft {
  return {
    id: character.id,
    name: character.name,
    handle: character.handle,
    description: character.description ?? "",
    tagsText: (character.tags ?? []).join(", "),
    source: { kind: "existing", url: character.primaryImageUrl }
  };
}

function parseTags(value: string): string[] | undefined {
  const seen = new Set<string>();
  const tags = value
    .split(/[,\n]/)
    .map(tag => tag.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .filter(tag => {
      if (seen.has(tag)) {
        return false;
      }
      seen.add(tag);
      return true;
    });

  return tags.length ? tags : undefined;
}

function getRecordImageUrl(record: GeneratedImageDocument): string {
  return record.imageUrl ?? record.thumbnailUrl ?? record.originalImageUrl ?? "";
}

function normalizeDraftHandle(value: string): string {
  return value.trim().replace(/^@+/, "");
}

export function CharactersShell() {
  const [characters, setCharacters] = useState<Character[]>(() => loadCharacters());
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [historyPickerOpen, setHistoryPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const { records: historyRecords, loading: historyLoading } = useGeneratedImages({ limitResults: 24 });

  useEffect(() => {
    setCharacters(loadCharacters());
    return subscribeCharacters(setCharacters);
  }, []);

  const handleDelete = (character: Character) => {
    const confirmed = window.confirm(`${character.name} 캐릭터를 삭제할까요?`);
    if (!confirmed) {
      return;
    }
    setCharacters(removeCharacter(character.id));
  };

  const closeEditor = () => {
    if (draft?.source?.kind === "upload") {
      URL.revokeObjectURL(draft.source.previewUrl);
    }
    setDraft(null);
    setHistoryPickerOpen(false);
    setSaving(false);
  };

  const handleCreate = () => {
    setDraft(createEmptyDraft());
    setHistoryPickerOpen(false);
  };

  const handleEdit = (character: Character) => {
    setDraft(current => {
      if (current?.source?.kind === "upload") {
        URL.revokeObjectURL(current.source.previewUrl);
      }
      return draftFromCharacter(character);
    });
    setHistoryPickerOpen(false);
  };

  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있습니다.");
      event.target.value = "";
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setDraft(current => {
      if (current?.source?.kind === "upload") {
        URL.revokeObjectURL(current.source.previewUrl);
      }
      return current ? { ...current, source: { kind: "upload", file, previewUrl } } : current;
    });
    event.target.value = "";
  };

  const handlePickHistory = (record: GeneratedImageDocument) => {
    const url = getRecordImageUrl(record);
    if (!url) {
      toast.error("선택한 기록의 이미지를 찾을 수 없습니다.");
      return;
    }
    setDraft(current => {
      if (current?.source?.kind === "upload") {
        URL.revokeObjectURL(current.source.previewUrl);
      }
      return current ? { ...current, source: { kind: "history", record, url } } : current;
    });
    setHistoryPickerOpen(false);
  };

  const handleSave = async () => {
    if (!draft) {
      return;
    }

    const name = draft.name.trim();
    const handle = normalizeDraftHandle(draft.handle);
    if (!name) {
      toast.error("캐릭터 이름을 입력해주세요.");
      return;
    }
    if (!handle) {
      toast.error("캐릭터 핸들을 입력해주세요.");
      return;
    }
    if (!CHARACTER_HANDLE_PATTERN.test(handle)) {
      toast.error("핸들은 1~32자의 한글, 영문, 숫자, 밑줄만 사용할 수 있습니다.");
      return;
    }
    if (!draft.source) {
      toast.error("캐릭터 이미지를 선택해주세요.");
      return;
    }

    setSaving(true);
    try {
      const storedUrl =
        draft.source.kind === "upload"
          ? await storeCharacterImageFile(draft.source.file)
          : draft.source.kind === "history"
            ? await copyCharacterImageToStorage(draft.source.url)
            : draft.source.url;

      saveCharacter({
        id: draft.id,
        name,
        handle,
        description: draft.description.trim() || undefined,
        thumbnailUrl: storedUrl,
        primaryImageUrl: storedUrl,
        shots: [
          {
            id: draft.id ? `${draft.id}-primary` : "primary",
            url: storedUrl,
            kind: "other",
            label: "Primary"
          }
        ],
        tags: parseTags(draft.tagsText),
        source:
          draft.source.kind === "upload"
            ? "upload"
            : draft.source.kind === "history"
              ? "history"
              : characters.find(character => character.id === draft.id)?.source
      });
      toast.success(draft.id ? "캐릭터를 수정했습니다." : "캐릭터를 추가했습니다.");
      closeEditor();
    } catch (error) {
      console.error("character save error", error);
      toast.error(error instanceof Error ? error.message : "캐릭터 저장에 실패했습니다.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 pb-28">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-foreground">캐릭터 라이브러리</h1>
          <p className="text-sm text-muted-foreground">생성 기준으로 재사용할 캐릭터 이미지를 관리합니다.</p>
        </div>
        <Button type="button" onClick={handleCreate}>캐릭터 추가</Button>
      </header>

      {characters.length === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 text-center">
          <p className="text-base font-medium text-foreground">캐릭터 라이브러리가 비어있습니다. 추가해주세요</p>
          <Button type="button" onClick={handleCreate}>추가</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map(character => (
            <CharacterCard
              key={character.id}
              character={character}
              onEdit={() => handleEdit(character)}
              onDelete={() => handleDelete(character)}
            />
          ))}
        </div>
      )}

      {draft ? (
        <CharacterEditor
          draft={draft}
          characters={characters}
          onChange={setDraft}
          onClose={closeEditor}
          onUploadClick={() => uploadInputRef.current?.click()}
          onSave={() => void handleSave()}
          saving={saving}
          historyPickerOpen={historyPickerOpen}
          onToggleHistoryPicker={() => setHistoryPickerOpen(value => !value)}
          historyRecords={historyRecords}
          historyLoading={historyLoading}
          onPickHistory={handlePickHistory}
        />
      ) : null}

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUploadChange}
      />
    </div>
  );
}

function CharacterCard({
  character,
  onEdit,
  onDelete
}: {
  character: Character;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tags = character.tags ?? [];

  return (
    <Card className="overflow-hidden shadow-sm">
      <div className="relative aspect-square w-full bg-muted">
        <Image
          src={character.thumbnailUrl}
          alt={character.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
          priority={false}
        />
      </div>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="space-y-1">
          <h2 className="line-clamp-1 text-base font-semibold text-foreground">{character.name}</h2>
          <p className="line-clamp-1 text-xs font-medium text-muted-foreground">@{character.handle}</p>
          {character.description ? (
            <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{character.description}</p>
          ) : (
            <p className="min-h-10 text-sm text-muted-foreground">설명 없음</p>
          )}
        </div>
        <div className="flex min-h-6 flex-wrap gap-1">
          {tags.length ? (
            tags.slice(0, 4).map(tag => (
              <Badge key={tag} variant="secondary" className="max-w-full truncate">
                {tag}
              </Badge>
            ))
          ) : (
            <Badge variant="outline">태그 없음</Badge>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="button" size="sm" variant="outline" className="flex-1" onClick={onEdit}>
            편집
          </Button>
          <Button type="button" size="sm" variant="destructive" className="flex-1" onClick={onDelete}>
            삭제
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CharacterEditor({
  draft,
  characters,
  onChange,
  onClose,
  onUploadClick,
  onSave,
  saving,
  historyPickerOpen,
  onToggleHistoryPicker,
  historyRecords,
  historyLoading,
  onPickHistory
}: {
  draft: CharacterDraft;
  characters: Character[];
  onChange: (draft: CharacterDraft) => void;
  onClose: () => void;
  onUploadClick: () => void;
  onSave: () => void;
  saving: boolean;
  historyPickerOpen: boolean;
  onToggleHistoryPicker: () => void;
  historyRecords: GeneratedImageDocument[];
  historyLoading: boolean;
  onPickHistory: (record: GeneratedImageDocument) => void;
}) {
  const previewUrl = useMemo(() => {
    if (!draft.source) {
      return "";
    }
    if (draft.source.kind === "upload") {
      return draft.source.previewUrl;
    }
    return draft.source.url;
  }, [draft.source]);
  const normalizedHandle = normalizeDraftHandle(draft.handle);
  const duplicateHandle = normalizedHandle
    ? characters.some(character => character.id !== draft.id && normalizeDraftHandle(character.handle) === normalizedHandle)
    : false;
  const handleStatus = !normalizedHandle
    ? "핸들을 입력해주세요."
    : !CHARACTER_HANDLE_PATTERN.test(normalizedHandle)
      ? "1~32자의 한글, 영문, 숫자, 밑줄만 사용할 수 있습니다."
      : duplicateHandle
        ? "이미 사용 중인 핸들입니다."
        : "사용 가능한 핸들입니다.";
  const handleStatusTone = normalizedHandle && CHARACTER_HANDLE_PATTERN.test(normalizedHandle) && !duplicateHandle
    ? "text-emerald-600"
    : "text-destructive";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {draft.id ? "Edit character" : "New character"}
            </p>
            <h2 className="text-lg font-semibold text-foreground">
              {draft.id ? "캐릭터 편집" : "캐릭터 추가"}
            </h2>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onClose} disabled={saving}>
            닫기
          </Button>
        </div>

        <ScrollArea className="min-h-0">
          <div className="grid gap-5 p-5 lg:grid-cols-[280px_1fr]">
            <div className="flex flex-col gap-3">
              <div className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt={draft.name || "캐릭터 미리보기"}
                    fill
                    sizes="280px"
                    className="object-cover"
                    unoptimized={previewUrl.startsWith("blob:") || previewUrl.startsWith("data:")}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                    이미지 없음
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={onUploadClick} disabled={saving}>
                  업로드
                </Button>
                <Button type="button" variant="outline" onClick={onToggleHistoryPicker} disabled={saving}>
                  히스토리
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="character-name">이름</Label>
                <Input
                  id="character-name"
                  value={draft.name}
                  onChange={event => onChange({ ...draft, name: event.target.value })}
                  placeholder="캐릭터 이름"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="character-handle">핸들</Label>
                <Input
                  id="character-handle"
                  value={draft.handle}
                  onChange={event => onChange({ ...draft, handle: event.target.value })}
                  placeholder="민수"
                  disabled={saving}
                />
                <p className={`text-xs ${handleStatusTone}`}>@{normalizedHandle || "handle"} · {handleStatus}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="character-description">설명</Label>
                <Textarea
                  id="character-description"
                  value={draft.description}
                  onChange={event => onChange({ ...draft, description: event.target.value })}
                  placeholder="외형, 성격, 사용 목적"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="character-tags">태그</Label>
                <Input
                  id="character-tags"
                  value={draft.tagsText}
                  onChange={event => onChange({ ...draft, tagsText: event.target.value })}
                  placeholder="주인공, 표정, 전신"
                  disabled={saving}
                />
              </div>

              {historyPickerOpen ? (
                <HistoryPicker
                  records={historyRecords}
                  loading={historyLoading}
                  onPick={onPickHistory}
                />
              ) : null}
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? "저장 중" : "저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HistoryPicker({
  records,
  loading,
  onPick
}: {
  records: GeneratedImageDocument[];
  loading: boolean;
  onPick: (record: GeneratedImageDocument) => void;
}) {
  const availableRecords = records.filter(record => Boolean(getRecordImageUrl(record)));

  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">히스토리에서 선택</p>
        <span className="text-xs text-muted-foreground">{availableRecords.length}개</span>
      </div>
      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`history-loading-${index}`} className="aspect-square animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : availableRecords.length ? (
        <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
          {availableRecords.map(record => {
            const imageUrl = getRecordImageUrl(record);
            return (
              <button
                key={record.id}
                type="button"
                className="group relative aspect-square overflow-hidden rounded-lg border bg-background text-left transition hover:border-primary"
                onClick={() => onPick(record)}
              >
                <Image
                  src={imageUrl}
                  alt={record.promptMeta?.refinedPrompt ?? record.promptMeta?.rawPrompt ?? "history"}
                  fill
                  sizes="160px"
                  className="object-cover transition group-hover:scale-105"
                  unoptimized={imageUrl.startsWith("data:")}
                />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">선택할 히스토리 이미지가 없습니다.</p>
      )}
    </div>
  );
}
