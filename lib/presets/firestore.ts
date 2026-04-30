// Firestore 프리셋 저장소 stub. 로컬 도구로 전환되면서
// `presets-migration-data.json`을 시드로 메모리에 로드해 그대로 반환한다.

import type { Preset, PresetCategory } from "@/lib/presets/types";

let seeded: Preset[] | null = null;

function loadSeed(): Preset[] {
  if (seeded) return seeded;
  try {
    const raw = require("../../presets-migration-data.json") as { presets?: unknown };
    seeded = Array.isArray(raw?.presets) ? (raw.presets as Preset[]) : [];
  } catch (error) {
    console.warn("[presets] failed to read seed", error);
    seeded = [];
  }
  return seeded;
}

export async function getAllPresets(): Promise<Preset[]> {
  return loadSeed();
}

export async function getPresetsByCategory(category: PresetCategory): Promise<Preset[]> {
  return loadSeed().filter(preset => preset.category === category);
}

export async function getActivePresets(category?: PresetCategory): Promise<Preset[]> {
  const all = loadSeed().filter(preset => preset.active !== false);
  return category ? all.filter(preset => preset.category === category) : all;
}

export async function getPresetById(presetId: string): Promise<Preset | null> {
  return loadSeed().find(preset => preset.id === presetId) ?? null;
}

export async function createPreset(): Promise<never> {
  throw new Error("createPreset은 로컬 도구에서 지원되지 않습니다.");
}

export async function updatePreset(): Promise<never> {
  throw new Error("updatePreset은 로컬 도구에서 지원되지 않습니다.");
}

export async function deletePreset(): Promise<never> {
  throw new Error("deletePreset은 로컬 도구에서 지원되지 않습니다.");
}

export async function batchCreatePresets(): Promise<never> {
  throw new Error("batchCreatePresets는 로컬 도구에서 지원되지 않습니다.");
}
