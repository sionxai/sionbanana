export type StoryReferenceRole = "character" | "location";

export type StoryReference = {
  id: string;
  handle: string;
  role: StoryReferenceRole;
  imageUrl: string;
  description?: string;
  slotIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type StoryReferenceLibrary = {
  characters: (StoryReference | null)[];
  locations: (StoryReference | null)[];
};

export type StoryReferenceInput = Omit<
  StoryReference,
  "id" | "role" | "slotIndex" | "createdAt" | "updatedAt"
>;

export const STORY_REFERENCE_SLOT_COUNT = 5;
export const STORY_REFERENCES_STORAGE_KEY = "sionbanana-story-references-v1";
export const STORY_REFERENCES_EVENT = "sionbanana:story-references-updated";
export const STORY_REFERENCE_HANDLE_PATTERN = /^[A-Za-z0-9_가-힣ㄱ-ㅎㅏ-ㅣ]{1,32}$/u;

function createEmptySlots(): (StoryReference | null)[] {
  return Array.from({ length: STORY_REFERENCE_SLOT_COUNT }, () => null);
}

function emptyLibrary(): StoryReferenceLibrary {
  return {
    characters: createEmptySlots(),
    locations: createEmptySlots()
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `story-ref-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "");
}

function assertValidHandle(handle: string) {
  if (!STORY_REFERENCE_HANDLE_PATTERN.test(handle)) {
    throw new Error("핸들은 1~32자의 한글, 영문, 숫자, 밑줄만 사용할 수 있습니다.");
  }
}

function assertUniqueHandle(
  library: StoryReferenceLibrary,
  role: StoryReferenceRole,
  slotIndex: number,
  handle: string
) {
  const duplicate = [...library.characters, ...library.locations].some(ref => {
    if (!ref || (ref.role === role && ref.slotIndex === slotIndex)) {
      return false;
    }
    return normalizeHandle(ref.handle) === handle;
  });

  if (duplicate) {
    throw new Error(`이미 사용 중인 핸들입니다: @${handle}`);
  }
}

function normalizeSlotArray(
  value: unknown,
  role: StoryReferenceRole
): (StoryReference | null)[] {
  const source = Array.isArray(value) ? value : [];
  return createEmptySlots().map((_, index) => {
    const item = source[index];
    if (!item || typeof item !== "object") {
      return null;
    }

    const record = item as Partial<StoryReference>;
    const handle = typeof record.handle === "string" ? normalizeHandle(record.handle) : "";
    const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl : "";
    const createdAt = typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString();
    const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : createdAt;

    if (!handle && !imageUrl) {
      return null;
    }

    return {
      id: typeof record.id === "string" && record.id ? record.id : createId(),
      handle,
      role,
      imageUrl,
      description: typeof record.description === "string" ? record.description : undefined,
      slotIndex: index,
      createdAt,
      updatedAt
    };
  });
}

function normalizeLibrary(value: unknown): StoryReferenceLibrary {
  const record = value && typeof value === "object" ? (value as Partial<StoryReferenceLibrary>) : {};
  return {
    characters: normalizeSlotArray(record.characters, "character"),
    locations: normalizeSlotArray(record.locations, "location")
  };
}

function getRoleSlots(library: StoryReferenceLibrary, role: StoryReferenceRole) {
  return role === "character" ? library.characters : library.locations;
}

function emitStoryReferencesUpdated(library: StoryReferenceLibrary) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<StoryReferenceLibrary>(STORY_REFERENCES_EVENT, { detail: library }));
}

export function loadStoryReferences(): StoryReferenceLibrary {
  if (typeof window === "undefined") {
    return emptyLibrary();
  }

  try {
    const raw = window.localStorage.getItem(STORY_REFERENCES_STORAGE_KEY);
    if (!raw) {
      return emptyLibrary();
    }
    return normalizeLibrary(JSON.parse(raw));
  } catch (error) {
    console.warn("[story-references] Failed to load references", error);
    return emptyLibrary();
  }
}

export function saveStoryReference(
  role: StoryReferenceRole,
  slotIndex: number,
  ref: StoryReferenceInput | null
): StoryReferenceLibrary {
  const current = loadStoryReferences();
  const targetSlots = getRoleSlots(current, role);

  if (slotIndex < 0 || slotIndex >= STORY_REFERENCE_SLOT_COUNT) {
    throw new RangeError(`story reference slotIndex must be 0-${STORY_REFERENCE_SLOT_COUNT - 1}`);
  }

  const nextSlots = [...targetSlots];
  const previous = nextSlots[slotIndex];

  if (!ref) {
    nextSlots[slotIndex] = null;
  } else {
    const now = new Date().toISOString();
    const handle = normalizeHandle(ref.handle);
    assertValidHandle(handle);
    assertUniqueHandle(current, role, slotIndex, handle);
    nextSlots[slotIndex] = {
      id: previous?.id ?? createId(),
      handle,
      role,
      imageUrl: ref.imageUrl,
      description: ref.description,
      slotIndex,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };
  }

  const next: StoryReferenceLibrary =
    role === "character"
      ? { characters: nextSlots, locations: [...current.locations] }
      : { characters: [...current.characters], locations: nextSlots };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORY_REFERENCES_STORAGE_KEY, JSON.stringify(next));
    emitStoryReferencesUpdated(next);
  }

  return next;
}

export function subscribeStoryReferences(callback: (library: StoryReferenceLibrary) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORY_REFERENCES_STORAGE_KEY || event.key === null) {
      callback(loadStoryReferences());
    }
  };
  const handleCustom = (event: Event) => {
    const customEvent = event as CustomEvent<StoryReferenceLibrary>;
    callback(customEvent.detail ?? loadStoryReferences());
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STORY_REFERENCES_EVENT, handleCustom);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STORY_REFERENCES_EVENT, handleCustom);
  };
}

export function getRegisteredHandles(library: StoryReferenceLibrary): string[] {
  const seen = new Set<string>();
  const handles: string[] = [];

  [...library.characters, ...library.locations].forEach(ref => {
    const handle = ref?.handle?.trim();
    if (!handle || seen.has(handle)) {
      return;
    }
    seen.add(handle);
    handles.push(handle);
  });

  return handles;
}

export function findReferenceByHandle(
  library: StoryReferenceLibrary,
  handle: string
): StoryReference | null {
  const normalized = normalizeHandle(handle);
  return (
    [...library.characters, ...library.locations].find(ref => ref?.handle === normalized) ?? null
  );
}
