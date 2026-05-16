"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  loadCharacters,
  removeCharacter,
  subscribeCharacters,
  type Character
} from "@/lib/characters";

export function CharactersShell() {
  const [characters, setCharacters] = useState<Character[]>(() => loadCharacters());

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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 pb-28">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">캐릭터 라이브러리</h1>
        <p className="text-sm text-muted-foreground">생성 기준으로 재사용할 캐릭터 이미지를 관리합니다.</p>
      </header>

      {characters.length === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 text-center">
          <p className="text-base font-medium text-foreground">캐릭터 라이브러리가 비어있습니다. 추가해주세요</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map(character => (
            <CharacterCard
              key={character.id}
              character={character}
              onEdit={() => {}}
              onDelete={() => handleDelete(character)}
            />
          ))}
        </div>
      )}
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
