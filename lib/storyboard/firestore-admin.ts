import { FALLBACK_STORYBOARD_STYLES } from "@/data/storyboard-styles";
import type {
  StoryboardStyle,
  StoryboardStyleInput
} from "@/lib/storyboard/types";

// 로컬 단일 사용자 도구로 전환되면서 Firestore 의존을 제거.
// 스타일 데이터는 data/storyboard-styles.ts(시드)와 인메모리 추가분만 사용한다.
// 추후 SQLite 통합 시 이 모듈만 교체하면 됨.

const inMemoryStore = new Map<string, StoryboardStyle>();

let seeded = false;

function seedIfNeeded() {
  if (seeded) return;
  for (const style of FALLBACK_STORYBOARD_STYLES) {
    inMemoryStore.set(style.id, style);
  }
  seeded = true;
}

function sortStyles(styles: StoryboardStyle[]): StoryboardStyle[] {
  return styles.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.label.localeCompare(b.label);
  });
}

export async function getAllStoryboardStylesAdmin(): Promise<StoryboardStyle[]> {
  seedIfNeeded();
  return sortStyles(Array.from(inMemoryStore.values()));
}

export async function getActiveStoryboardStylesAdmin(): Promise<StoryboardStyle[]> {
  seedIfNeeded();
  const active = Array.from(inMemoryStore.values()).filter(style => style.active !== false);
  return sortStyles(active);
}

export async function getStoryboardStyleByIdAdmin(id: string): Promise<StoryboardStyle | null> {
  seedIfNeeded();
  return inMemoryStore.get(id) ?? null;
}

export async function createStoryboardStyleAdmin(
  id: string,
  input: StoryboardStyleInput,
  userId: string
): Promise<StoryboardStyle> {
  seedIfNeeded();
  const now = new Date().toISOString();
  const style: StoryboardStyle = {
    id,
    ...input,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId
  };
  inMemoryStore.set(id, style);
  return style;
}

export async function updateStoryboardStyleAdmin(
  id: string,
  input: Partial<StoryboardStyleInput>,
  userId: string
): Promise<StoryboardStyle> {
  seedIfNeeded();
  const existing = inMemoryStore.get(id);
  if (!existing) {
    throw new Error("스타일을 찾을 수 없습니다.");
  }
  const updated: StoryboardStyle = {
    ...existing,
    ...input,
    updatedAt: new Date().toISOString(),
    updatedBy: userId
  };
  inMemoryStore.set(id, updated);
  return updated;
}

export async function deleteStoryboardStyleAdmin(id: string): Promise<void> {
  seedIfNeeded();
  inMemoryStore.delete(id);
}
