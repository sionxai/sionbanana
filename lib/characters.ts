export type CharacterShot = {
  id: string;
  url: string;
  kind: "face" | "body" | "sheet" | "other";
  label?: string;
};

export type Character = {
  id: string;
  name: string;
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
  Omit<Character, "id" | "createdAt" | "updatedAt">;

export const CHARACTERS_STORAGE_KEY = "sionbanana-characters-v1";
export const CHARACTERS_EVENT = "sionbanana:characters-updated";

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

  return {
    id: stringOrUndefined(record.id) ?? createId(),
    name: stringOrUndefined(record.name) ?? "이름 없는 캐릭터",
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

  return value.flatMap(item => {
    const character = normalizeCharacter(item);
    return character ? [character] : [];
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
