import {
  findReferenceByHandle,
  getRegisteredHandles,
  type StoryReferenceLibrary,
  type StoryReferenceRole
} from "@/lib/story-references";

export type StorySegment =
  | { type: "text"; value: string }
  | { type: "mention"; handle: string; role: StoryReferenceRole };

export type ParsedStory = {
  segments: StorySegment[];
  mentioned: string[];
  invalid: string[];
};

const HANDLE_CHARACTER_PATTERN = /[A-Za-z0-9_가-힣ㄱ-ㅎㅏ-ㅣ]/u;

function isHandleCharacter(value: string): boolean {
  return HANDLE_CHARACTER_PATTERN.test(value);
}

function appendText(segments: StorySegment[], value: string) {
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

export function parseStoryMentions(
  text: string,
  library: StoryReferenceLibrary
): ParsedStory {
  const segments: StorySegment[] = [];
  const mentioned: string[] = [];
  const invalid: string[] = [];
  const mentionedSet = new Set<string>();
  const registeredHandles = getRegisteredHandles(library);

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

    const reference = findReferenceByHandle(library, matchedHandle);
    if (!reference) {
      invalid.push(candidate);
      appendText(segments, text.slice(index, candidateEnd));
      index = candidateEnd;
      continue;
    }

    segments.push({
      type: "mention",
      handle: matchedHandle,
      role: reference.role
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
