import { findCharacterByHandle, getCharacterHandles, type Character } from "@/lib/characters";

export type CharacterMentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; handle: string; characterId: string };

export type ParsedCharacterMentions = {
  segments: CharacterMentionSegment[];
  mentioned: string[];
  invalid: string[];
};

const HANDLE_CHARACTER_PATTERN = /[A-Za-z0-9_가-힣ㄱ-ㅎㅏ-ㅣ]/u;

function isHandleCharacter(value: string): boolean {
  return HANDLE_CHARACTER_PATTERN.test(value);
}

function appendText(segments: CharacterMentionSegment[], value: string) {
  if (!value) {
    return;
  }

  const previous = segments[segments.length - 1];
  if (previous?.type === "text") {
    previous.value += value;
    return;
  }

  segments.push({ type: "text", value });
}

function findLongestRegisteredPrefix(candidate: string, handles: string[]): string | null {
  let matched: string | null = null;

  handles.forEach(handle => {
    if (!handle || !candidate.startsWith(handle)) {
      return;
    }
    if (!matched || handle.length > matched.length) {
      matched = handle;
    }
  });

  return matched;
}

export function parseCharacterMentions(
  text: string,
  characters: Character[]
): ParsedCharacterMentions {
  const segments: CharacterMentionSegment[] = [];
  const mentioned: string[] = [];
  const invalid: string[] = [];
  const mentionedSet = new Set<string>();
  const registeredHandles = getCharacterHandles(characters);

  let index = 0;
  while (index < text.length) {
    const current = text[index];

    if (current !== "@") {
      appendText(segments, current);
      index += 1;
      continue;
    }

    let candidateEnd = index + 1;
    while (candidateEnd < text.length && isHandleCharacter(text[candidateEnd])) {
      candidateEnd += 1;
    }

    const candidate = text.slice(index + 1, candidateEnd);
    if (!candidate) {
      appendText(segments, current);
      index += 1;
      continue;
    }

    const matchedHandle = findLongestRegisteredPrefix(candidate, registeredHandles);
    if (!matchedHandle) {
      invalid.push(candidate);
      appendText(segments, text.slice(index, candidateEnd));
      index = candidateEnd;
      continue;
    }

    const character = findCharacterByHandle(characters, matchedHandle);
    if (!character) {
      invalid.push(candidate);
      appendText(segments, text.slice(index, candidateEnd));
      index = candidateEnd;
      continue;
    }

    segments.push({
      type: "mention",
      handle: matchedHandle,
      characterId: character.id
    });

    if (!mentionedSet.has(matchedHandle)) {
      mentionedSet.add(matchedHandle);
      mentioned.push(matchedHandle);
    }

    index += matchedHandle.length + 1;
  }

  return {
    segments,
    mentioned,
    invalid
  };
}
