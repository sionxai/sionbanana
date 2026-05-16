export type CharacterShot = {
  id: string;
  url: string;
  kind: "face" | "body" | "sheet" | "other";
  label?: string;
};

export type Character = {
  id: string;
  name: string;
  handle: string;
  description?: string;
  thumbnailUrl: string;
  primaryImageUrl: string;
  sheetUrl?: string;
  shots?: CharacterShot[];
  tags?: string[];
  source?: "upload" | "history" | "preset-sheet" | "studio-result";
  createdAt: string;
  updatedAt: string;
};

export type CharacterInput = Partial<Pick<Character, "id" | "createdAt" | "updatedAt">> &
  Partial<Pick<Character, "handle">> &
  Omit<Character, "id" | "handle" | "createdAt" | "updatedAt">;

export const CHARACTERS_STORAGE_KEY = "sionbanana-characters-v1";
export const CHARACTERS_EVENT = "sionbanana:characters-updated";
export const CHARACTER_HANDLE_PATTERN = /^[A-Za-z0-9_가-힣ㄱ-ㅎㅏ-ㅣ]{1,32}$/u;
const CHARACTER_HANDLE_LETTER_PATTERN = /[A-Za-z0-9_가-힣ㄱ-ㅎㅏ-ㅣ]/u;

const SHOT_KINDS: CharacterShot["kind"][] = ["face", "body", "sheet", "other"];
const CHARACTER_SOURCES: NonNullable<Character["source"]>[] = [
  "upload",
  "history",
  "preset-sheet",
  "studio-result"
];

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `character-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isShotKind(value: unknown): value is CharacterShot["kind"] {
  return typeof value === "string" && SHOT_KINDS.includes(value as CharacterShot["kind"]);
}

function isCharacterSource(value: unknown): value is NonNullable<Character["source"]> {
  return typeof value === "string" && CHARACTER_SOURCES.includes(value as NonNullable<Character["source"]>);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeHandle(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^@+/, "") : "";
}

function createHandleFromName(name: string): string {
  const fallback = name
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "_")
    .split("")
    .filter(character => CHARACTER_HANDLE_LETTER_PATTERN.test(character))
    .join("")
    .slice(0, 32);

  return fallback || "character";
}

function assertValidHandle(handle: string) {
  if (!CHARACTER_HANDLE_PATTERN.test(handle)) {
    throw new Error("핸들은 1~32자의 한글, 영문, 숫자, 밑줄만 사용할 수 있습니다.");
  }
}

function makeUniqueHandle(handle: string, used: Set<string>): string {
  if (!used.has(handle)) {
    used.add(handle);
    return handle;
  }

  const base = handle.slice(0, 30) || "character";
  let index = 2;
  let suffix = `_${index}`;
  let next = `${base.slice(0, 32 - suffix.length)}${suffix}`;
  while (used.has(next)) {
    index += 1;
    suffix = `_${index}`;
    next = `${base.slice(0, 32 - suffix.length)}${suffix}`;
  }
  used.add(next);
  return next;
}

function assertUniqueHandle(characters: Character[], id: string, handle: string) {
  const duplicate = characters.some(character => {
    if (character.id === id) {
      return false;
    }
    return normalizeHandle(character.handle) === handle;
  });

  if (duplicate) {
    throw new Error(`이미 사용 중인 핸들입니다: @${handle}`);
  }
}

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<string>();
  const tags = value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => {
      if (seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });

  return tags.length ? tags : undefined;
}

function normalizeShots(value: unknown): CharacterShot[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const shots = value.flatMap(item => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Partial<CharacterShot>;
    const url = stringOrUndefined(record.url);
    if (!url) {
      return [];
    }

    return [
      {
        id: stringOrUndefined(record.id) ?? createId(),
        url,
        kind: isShotKind(record.kind) ? record.kind : "other",
        label: stringOrUndefined(record.label)
      }
    ];
  });

  return shots.length ? shots : undefined;
}

function normalizeCharacter(value: unknown): Character | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<Character>;
  const primaryImageUrl = stringOrUndefined(record.primaryImageUrl) ?? stringOrUndefined(record.thumbnailUrl);
  if (!primaryImageUrl) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = stringOrUndefined(record.createdAt) ?? now;
  const name = stringOrUndefined(record.name) ?? "이름 없는 캐릭터";
  const handle = normalizeHandle(record.handle) || createHandleFromName(name);

  return {
    id: stringOrUndefined(record.id) ?? createId(),
    name,
    handle,
    description: stringOrUndefined(record.description),
    thumbnailUrl: stringOrUndefined(record.thumbnailUrl) ?? primaryImageUrl,
    primaryImageUrl,
    sheetUrl: stringOrUndefined(record.sheetUrl),
    shots: normalizeShots(record.shots),
    tags: normalizeTags(record.tags),
    source: isCharacterSource(record.source) ? record.source : undefined,
    createdAt,
    updatedAt: stringOrUndefined(record.updatedAt) ?? createdAt
  };
}

function normalizeCharacters(value: unknown): Character[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedHandles = new Set<string>();

  return value.flatMap(item => {
    const character = normalizeCharacter(item);
    if (!character) {
      return [];
    }

    return [{ ...character, handle: makeUniqueHandle(character.handle, usedHandles) }];
  });
}

function emitCharactersUpdated(characters: Character[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<Character[]>(CHARACTERS_EVENT, { detail: characters }));
}

export function loadCharacters(): Character[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CHARACTERS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return normalizeCharacters(JSON.parse(raw));
  } catch (error) {
    console.warn("[characters] Failed to load characters", error);
    return [];
  }
}

export function saveCharacter(character: CharacterInput): Character {
  const current = loadCharacters();
  const now = new Date().toISOString();
  const id = stringOrUndefined(character.id) ?? createId();
  const existing = current.find(item => item.id === id);
  const normalized = normalizeCharacter({
    ...character,
    id,
    createdAt: existing?.createdAt ?? character.createdAt ?? now,
    updatedAt: now
  });

  if (!normalized) {
    throw new Error("캐릭터 이미지를 찾을 수 없습니다.");
  }
  assertValidHandle(normalized.handle);
  assertUniqueHandle(current, id, normalized.handle);

  const next = existing
    ? current.map(item => (item.id === id ? normalized : item))
    : [normalized, ...current];

  if (typeof window !== "undefined") {
    window.localStorage.setItem(CHARACTERS_STORAGE_KEY, JSON.stringify(next));
    emitCharactersUpdated(next);
  }

  return normalized;
}

export function removeCharacter(id: string): Character[] {
  const next = loadCharacters().filter(character => character.id !== id);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(CHARACTERS_STORAGE_KEY, JSON.stringify(next));
    emitCharactersUpdated(next);
  }

  return next;
}

export function getCharacter(id: string): Character | null {
  return loadCharacters().find(character => character.id === id) ?? null;
}

export function getCharacterHandles(library: Character[]): string[] {
  const seen = new Set<string>();
  const handles: string[] = [];

  library.forEach(character => {
    const handle = normalizeHandle(character.handle);
    if (!handle || seen.has(handle)) {
      return;
    }
    seen.add(handle);
    handles.push(handle);
  });

  return handles;
}

export function findCharacterByHandle(library: Character[], handle: string): Character | null {
  const normalized = normalizeHandle(handle);
  return library.find(character => normalizeHandle(character.handle) === normalized) ?? null;
}

export function subscribeCharacters(callback: (characters: Character[]) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === CHARACTERS_STORAGE_KEY || event.key === null) {
      callback(loadCharacters());
    }
  };
  const handleCustom = (event: Event) => {
    const customEvent = event as CustomEvent<Character[]>;
    callback(customEvent.detail ?? loadCharacters());
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(CHARACTERS_EVENT, handleCustom);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CHARACTERS_EVENT, handleCustom);
  };
}
