"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadCharacters, subscribeCharacters, type Character } from "@/lib/characters";
import { cn } from "@/lib/utils";

export type CharacterPickerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (character: Character) => void;
  title?: string;
  excludeIds?: string[];
};

export function CharacterPickerModal({
  isOpen,
  onClose,
  onSelect,
  title = "캐릭터 선택",
  excludeIds = []
}: CharacterPickerModalProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [characters, setCharacters] = useState<Character[]>(() => loadCharacters());
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCharacters(loadCharacters());
    setQuery("");
    setSelectedTag(null);
    setSelectedCharacterId(null);
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    const unsubscribe = subscribeCharacters(setCharacters);

    return () => {
      window.clearTimeout(focusTimer);
      unsubscribe();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const excludedCharacterIds = useMemo(() => new Set(excludeIds), [excludeIds]);

  const availableCharacters = useMemo(
    () => characters.filter(character => !excludedCharacterIds.has(character.id)),
    [characters, excludedCharacterIds]
  );

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    availableCharacters.forEach(character => {
      character.tags?.forEach(tag => {
        if (tag.trim()) {
          tags.add(tag.trim());
        }
      });
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [availableCharacters]);

  const filteredCharacters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase().replace(/^@+/, "");

    return availableCharacters.filter(character => {
      if (selectedTag && !character.tags?.includes(selectedTag)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchable = [character.name, character.handle, character.description ?? ""]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [availableCharacters, query, selectedTag]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedCharacterId(current => {
      if (current && filteredCharacters.some(character => character.id === current)) {
        return current;
      }
      return filteredCharacters[0]?.id ?? null;
    });
  }, [filteredCharacters, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Enter" || event.isComposing) {
        return;
      }

      const selectedCharacter =
        filteredCharacters.find(character => character.id === selectedCharacterId) ?? filteredCharacters[0];
      if (!selectedCharacter) {
        return;
      }

      event.preventDefault();
      onSelect(selectedCharacter);
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [filteredCharacters, isOpen, onClose, onSelect, selectedCharacterId]);

  if (!isOpen) {
    return null;
  }

  const emptyMessage = characters.length === 0 || availableCharacters.length === 0 ? "캐릭터가 없습니다." : "검색 결과 없음";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="character-picker-title"
      onClick={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="mx-auto mt-20 flex max-h-[calc(100vh-7rem)] max-w-3xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 id="character-picker-title" className="text-base font-semibold text-foreground">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">{availableCharacters.length}개 캐릭터</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="캐릭터 선택 닫기">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 border-b px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="이름, 핸들, 설명 검색"
              className="pl-9"
            />
          </div>

          {tagOptions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  selectedTag === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
                onClick={() => setSelectedTag(null)}
              >
                전체
              </button>
              {tagOptions.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                    selectedTag === tag
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                  onClick={() => setSelectedTag(current => (current === tag ? null : tag))}
                >
                  #{tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {filteredCharacters.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filteredCharacters.map(character => {
                const imageUrl = character.thumbnailUrl || character.primaryImageUrl;
                const isSelected = character.id === selectedCharacterId;

                return (
                  <button
                    key={character.id}
                    type="button"
                    className={cn(
                      "group min-w-0 overflow-hidden rounded-lg border bg-card text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isSelected ? "border-primary ring-2 ring-primary/30" : "border-border/70"
                    )}
                    onClick={() => {
                      onSelect(character);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedCharacterId(character.id)}
                    onFocus={() => setSelectedCharacterId(character.id)}
                  >
                    <div className="relative aspect-square overflow-hidden bg-muted">
                      <img
                        src={imageUrl}
                        alt={character.name}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    </div>
                    <div className="space-y-1 p-2">
                      <p className="truncate text-xs font-semibold text-foreground">{character.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">@{character.handle}</p>
                      {character.description ? (
                        <p className="line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">
                          {character.description}
                        </p>
                      ) : null}
                      {character.tags?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {character.tags.slice(0, 2).map(tag => (
                            <Badge key={tag} variant="secondary" className="max-w-full truncate px-1.5 text-[10px]">
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-56 items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
