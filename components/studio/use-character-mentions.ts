"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { findCharacterByHandle, loadCharacters, subscribeCharacters, type Character } from "@/lib/characters";
import { parseCharacterMentions } from "@/lib/character-mentions";
import {
  MAX_REFERENCE_SLOT_COUNT,
  createManualReferenceHandle,
  createReferenceSlot,
  type ReferenceSlotState
} from "@/lib/studio-helpers/constants";
import type { CharacterMentionChip } from "@/components/studio/prompt-panel";

type UseCharacterMentionsArgs = {
  prompt: string;
  referenceSlots: ReferenceSlotState[];
  setReferenceSlots: Dispatch<SetStateAction<ReferenceSlotState[]>>;
};

type UseCharacterMentionsResult = {
  characters: Character[];
  characterMentionChips: CharacterMentionChip[];
};

export function useCharacterMentions({
  prompt,
  referenceSlots,
  setReferenceSlots
}: UseCharacterMentionsArgs): UseCharacterMentionsResult {
  const [characters, setCharacters] = useState<Character[]>(() => loadCharacters());

  const parsedCharacterMentions = useMemo(
    () => parseCharacterMentions(prompt, characters),
    [characters, prompt]
  );

  const mentionedCharacters = useMemo(
    () =>
      parsedCharacterMentions.mentioned
        .map(handle => findCharacterByHandle(characters, handle))
        .filter((character): character is Character => Boolean(character?.primaryImageUrl)),
    [characters, parsedCharacterMentions.mentioned]
  );

  const characterMentionChips = useMemo<CharacterMentionChip[]>(() => {
    const chips: CharacterMentionChip[] = [];
    const seen = new Set<string>();

    // 이미지가 첨부된 참조 슬롯 핸들(@ref1 등). 캐릭터는 아니지만 유효한 첨부 핸들이므로
    // "미등록"이 아니라 "첨부됨"으로 표시한다.
    const attachedReferenceHandles = new Set(
      referenceSlots
        .filter(slot => Boolean(slot.imageUrl) && slot.handle.trim())
        .map(slot => slot.handle.trim())
    );

    parsedCharacterMentions.mentioned.forEach(handle => {
      if (seen.has(handle)) {
        return;
      }
      seen.add(handle);
      const character = findCharacterByHandle(characters, handle);
      if (!character) {
        chips.push({ handle, status: "invalid" });
        return;
      }

      const attached = referenceSlots.some(
        slot => slot.source === "character-mention" && slot.characterId === character.id && Boolean(slot.imageUrl)
      );
      chips.push({
        handle,
        status: character.primaryImageUrl && attached ? "attached" : "missing-image"
      });
    });

    parsedCharacterMentions.invalid.forEach(handle => {
      if (seen.has(handle)) {
        return;
      }
      seen.add(handle);
      chips.push({
        handle,
        status: attachedReferenceHandles.has(handle) ? "attached" : "invalid"
      });
    });

    return chips;
  }, [characters, parsedCharacterMentions.invalid, parsedCharacterMentions.mentioned, referenceSlots]);

  useEffect(() => {
    setCharacters(loadCharacters());
    return subscribeCharacters(setCharacters);
  }, []);

  useEffect(() => {
    const mentionedById = new Map(mentionedCharacters.map(character => [character.id, character]));

    setReferenceSlots(prev => {
      const now = new Date().toISOString();
      let changed = false;
      let next = prev.map((slot, index) => {
        if (slot.source !== "character-mention" || !slot.characterId || mentionedById.has(slot.characterId)) {
          return slot;
        }
        changed = true;
        return {
          id: slot.id,
          imageUrl: null,
          handle: createManualReferenceHandle(index),
          updatedAt: now
        };
      });

      const existingMentionIds = new Set(
        next
          .filter(slot => slot.source === "character-mention" && slot.characterId && slot.imageUrl)
          .map(slot => slot.characterId as string)
      );

      mentionedCharacters.forEach(character => {
        const existingSlot = next.find(
          slot => slot.source === "character-mention" && slot.characterId === character.id
        );

        if (existingSlot) {
          if (existingSlot.imageUrl !== character.primaryImageUrl || existingSlot.handle !== character.handle) {
            changed = true;
            next = next.map(slot =>
              slot.id === existingSlot.id
                ? { ...slot, imageUrl: character.primaryImageUrl, handle: character.handle, updatedAt: now }
                : slot
            );
          }
          existingMentionIds.add(character.id);
          return;
        }

        if (existingMentionIds.has(character.id)) {
          return;
        }

        const emptyIndex = next.findIndex(slot => !slot.imageUrl);
        if (emptyIndex >= 0) {
          changed = true;
          next = next.map((slot, index) =>
            index === emptyIndex
              ? {
                  ...slot,
                  imageUrl: character.primaryImageUrl,
                  handle: character.handle,
                  source: "character-mention",
                  characterId: character.id,
                  updatedAt: now
                }
              : slot
          );
          existingMentionIds.add(character.id);
          return;
        }

        if (next.length < MAX_REFERENCE_SLOT_COUNT) {
          changed = true;
          next = [
            ...next,
            {
              ...createReferenceSlot(),
              imageUrl: character.primaryImageUrl,
              handle: character.handle,
              source: "character-mention",
              characterId: character.id,
              updatedAt: now
            }
          ];
          existingMentionIds.add(character.id);
        }
      });

      return changed ? next : prev;
    });
  }, [mentionedCharacters, setReferenceSlots]);

  return {
    characters,
    characterMentionChips
  };
}
