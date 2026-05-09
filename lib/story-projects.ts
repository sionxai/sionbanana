import type { SceneStatus } from "@/components/studio/scene-card";
import { normalizeCinematography, type SceneCinematography } from "@/lib/story-cinematography";
import type { GeneratedImageDocument } from "@/lib/types";

export const STORY_PROJECTS_STORAGE_KEY = "sionbanana-story-projects-v1";
export const STORY_PROJECTS_EVENT = "sionbanana:story-projects-updated";

export type StoryProjectScene = {
  id: string;
  prompt: string;
  mentions: string[];
  cinematography?: SceneCinematography;
  status: SceneStatus;
  resultUrl?: string;
  resultRecord?: GeneratedImageDocument;
};

export type StoryProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  story: string;
  sceneCount: number;
  mode: "review" | "instant";
  toneId: string | null;
  scenes: StoryProjectScene[];
};

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `story-project-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)));
}

function normalizeSceneStatus(value: unknown, resultUrl?: string): SceneStatus {
  if (value === "completed" && resultUrl) {
    return "completed";
  }
  if (value === "error") {
    return "error";
  }
  return "idle";
}

function normalizeScene(value: unknown, index: number): StoryProjectScene | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<StoryProjectScene>;
  const prompt = typeof record.prompt === "string" ? record.prompt : "";
  const resultUrl = typeof record.resultUrl === "string" && record.resultUrl ? record.resultUrl : undefined;
  const resultRecord =
    record.resultRecord && typeof record.resultRecord === "object"
      ? (record.resultRecord as GeneratedImageDocument)
      : undefined;

  if (!prompt && !resultUrl) {
    return null;
  }

  return {
    id: typeof record.id === "string" && record.id ? record.id : `story-scene-${index + 1}`,
    prompt,
    mentions: normalizeStringArray(record.mentions),
    cinematography: normalizeCinematography(record.cinematography, index),
    status: normalizeSceneStatus(record.status, resultUrl),
    ...(resultUrl ? { resultUrl } : {}),
    ...(resultRecord ? { resultRecord } : {})
  };
}

function normalizeProject(value: unknown): StoryProject | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<StoryProject>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : now;
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : createdAt;
  const sceneCount = typeof record.sceneCount === "number" && Number.isFinite(record.sceneCount)
    ? Math.min(10, Math.max(1, Math.round(record.sceneCount)))
    : 5;
  const mode = record.mode === "review" ? "review" : "instant";
  const scenes = Array.isArray(record.scenes)
    ? record.scenes.map((scene, index) => normalizeScene(scene, index)).filter((scene): scene is StoryProjectScene => Boolean(scene))
    : [];

  return {
    id: typeof record.id === "string" && record.id ? record.id : createId(),
    name,
    createdAt,
    updatedAt,
    story: typeof record.story === "string" ? record.story : "",
    sceneCount,
    mode,
    toneId: typeof record.toneId === "string" ? record.toneId : null,
    scenes
  };
}

function sortProjects(projects: StoryProject[]): StoryProject[] {
  return [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function emitProjectsUpdated(projects: StoryProject[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<StoryProject[]>(STORY_PROJECTS_EVENT, { detail: projects }));
}

function persistProjects(projects: StoryProject[]): StoryProject[] {
  const next = sortProjects(projects);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORY_PROJECTS_STORAGE_KEY, JSON.stringify(next));
    emitProjectsUpdated(next);
  }
  return next;
}

export function loadProjects(): StoryProject[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORY_PROJECTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return sortProjects(parsed.map(normalizeProject).filter((project): project is StoryProject => Boolean(project)));
  } catch (error) {
    console.warn("[story-projects] Failed to load projects", error);
    return [];
  }
}

export function saveProject(project: StoryProject): StoryProject[] {
  const normalized = normalizeProject(project);
  if (!normalized) {
    throw new Error("프로젝트 이름이 필요합니다.");
  }

  const current = loadProjects();
  return persistProjects([normalized, ...current.filter(item => item.id !== normalized.id)]);
}

export function removeProject(id: string): StoryProject[] {
  const next = loadProjects().filter(project => project.id !== id);
  return persistProjects(next);
}

export function getProject(id: string): StoryProject | null {
  return loadProjects().find(project => project.id === id) ?? null;
}

export function subscribeProjects(callback: (projects: StoryProject[]) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORY_PROJECTS_STORAGE_KEY || event.key === null) {
      callback(loadProjects());
    }
  };
  const handleCustom = (event: Event) => {
    const customEvent = event as CustomEvent<StoryProject[]>;
    callback(customEvent.detail ?? loadProjects());
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STORY_PROJECTS_EVENT, handleCustom);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STORY_PROJECTS_EVENT, handleCustom);
  };
}
