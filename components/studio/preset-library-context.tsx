"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { shouldUseFirestore } from "@/lib/env";
import { getAllPresets } from "@/lib/presets/firestore";
import type { Preset } from "@/lib/presets/types";
import {
  EXTERNAL_PRESET_GROUPS,
  type ExternalPresetGroup,
  type ExternalPresetOption
} from "@/components/studio/external-preset-config";
import {
  LIGHTING_PRESET_GROUPS,
  type LightingPresetGroup,
  type LightingPresetOption
} from "@/components/studio/lighting-config";
import {
  POSE_PRESET_GROUPS,
  type PosePresetGroup,
  type PosePresetOption
} from "@/components/studio/pose-config";
import type {
  LightingPresetCategory,
  PosePresetCategory,
  PoseSelections,
  LightingSelections
} from "@/components/studio/types";
import { resolveLocalizedText } from "@/lib/presets/localized";

export type LightingPromptLookup = Record<string, Record<string, string>>;
export type PosePromptLookup = Record<string, Record<string, string>>;

export interface CameraPresetOption {
  id: string;
  name: string;
  instruction: string;
}

export interface CameraPresetGroup {
  id: string;
  title: string;
  options: CameraPresetOption[];
}

interface PresetLibraryData {
  cameraGroups: CameraPresetGroup[];
  externalGroups: ExternalPresetGroup[];
  lightingGroups: LightingPresetGroup[];
  poseGroups: PosePresetGroup[];
}

interface PresetLibraryValue extends PresetLibraryData {
  status: "loading" | "ready" | "error";
  source: "fallback" | "firestore";
  lightingLookup: LightingPromptLookup;
  poseLookup: PosePromptLookup;
  generatePosePrompt: (selections: { expression?: string; posture?: string }) => string;
  buildLightingInstruction: (selections: LightingSelections) => string | null;
  buildPoseInstruction: (selections: PoseSelections) => string | null;
  refresh: () => void;
  error: Error | null;
}

const LIGHTING_CATEGORY_ORDER: LightingPresetCategory[] = [
  "illumination",
  "atmosphere",
  "time",
  "cinematic",
  "artistic",
  "harmony",
  "mood"
];

const POSE_CATEGORY_ORDER: PosePresetCategory[] = [
  "expression",
  "posture"
];

const PresetLibraryContext = createContext<PresetLibraryValue | null>(null);

function cloneExternalGroups(groups: ExternalPresetGroup[]): ExternalPresetGroup[] {
  return groups.map(group => ({
    ...group,
    options: group.options.map(option => ({ ...option }))
  }));
}

function cloneLightingGroups(groups: LightingPresetGroup[]): LightingPresetGroup[] {
  return groups.map(group => ({
    ...group,
    options: group.options.map(option => ({ ...option }))
  }));
}

function clonePoseGroups(groups: PosePresetGroup[]): PosePresetGroup[] {
  return groups.map(group => ({
    ...group,
    options: group.options.map(option => ({ ...option }))
  }));
}

const FALLBACK_CAMERA_GROUPS: CameraPresetGroup[] = [
  {
    id: "default",
    title: "카메라 프리셋",
    options: [
      { id: "wide", name: "와이드 앵글", instruction: "Wide angle shot, slightly pulled back, full figure framing" },
      { id: "medium", name: "미디엄 샷", instruction: "Medium shot, waist up framing, natural perspective" },
      { id: "close", name: "클로즈업", instruction: "Close-up shot, shoulder and head framing, intimate perspective" },
      { id: "low", name: "로우 앵글", instruction: "Low angle shot, camera positioned below subject, dramatic upward view" },
      { id: "high", name: "하이 앵글", instruction: "High angle shot, camera positioned above subject, overhead perspective" }
    ]
  }
];

function createFallbackState(): PresetLibraryData {
  return {
    cameraGroups: FALLBACK_CAMERA_GROUPS.map(group => ({
      ...group,
      options: group.options.map(option => ({ ...option }))
    })),
    externalGroups: cloneExternalGroups(EXTERNAL_PRESET_GROUPS),
    lightingGroups: cloneLightingGroups(LIGHTING_PRESET_GROUPS),
    poseGroups: clonePoseGroups(POSE_PRESET_GROUPS)
  };
}

function extractValue(preset: Preset, prefix: string): string {
  const metaValue = typeof preset.metadata?.value === "string" ? preset.metadata.value : null;
  if (metaValue && metaValue.trim().length > 0) {
    return metaValue.trim();
  }
  if (preset.id.startsWith(prefix)) {
    return preset.id.substring(prefix.length);
  }
  return preset.id;
}

function resolveLabel(value: unknown, prefer: "en" | "ko" = "en"): string {
  const text = resolveLocalizedText(value as any, prefer);
  if (text && text.trim().length > 0) {
    return text.trim();
  }
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const first = Object.values(value as Record<string, unknown>).find(v => typeof v === "string");
    if (typeof first === "string") {
      return first;
    }
  }
  return "";
}

function resolvePrompt(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const text = resolveLocalizedText(value as any, "en");
    if (text) {
      return text;
    }
    const first = Object.values(value as Record<string, unknown>).find(v => typeof v === "string");
    if (typeof first === "string") {
      return first;
    }
  }
  return String(value ?? "");
}

function buildCameraGroupsFromPresets(
  presets: Preset[],
  fallbackGroups: CameraPresetGroup[]
): { groups: CameraPresetGroup[]; hasRemote: boolean } {
  if (!presets.length) {
    return {
      groups: fallbackGroups.map(group => ({
        ...group,
        options: group.options.map(option => ({ ...option }))
      })),
      hasRemote: false
    };
  }

  const fallbackMap = new Map<string, CameraPresetGroup>();
  fallbackGroups.forEach(group => fallbackMap.set(group.id, group));

  const remoteMap = new Map<string, { group: CameraPresetGroup; orders: number[] }>();

  presets
    .filter(preset => preset.active !== false)
    .forEach(preset => {
      const groupId = preset.groupId || "default";
      const fallback = fallbackMap.get(groupId);
      if (!remoteMap.has(groupId)) {
        const groupTitle =
          resolveLabel(preset.groupLabel, "ko") ||
          resolveLabel(preset.groupLabel, "en") ||
          fallback?.title ||
          "카메라 프리셋";
        remoteMap.set(groupId, {
          group: {
            id: groupId,
            title: groupTitle,
            options: []
          },
          orders: []
        });
      }

      const container = remoteMap.get(groupId)!;
      const optionId = extractValue(preset, "cam-");

      const name = resolveLabel(preset.labelKo, "ko") || resolveLabel(preset.label, "ko") || resolveLabel(preset.label, "en");
      const instruction = resolvePrompt(preset.prompt);

      const option: CameraPresetOption = {
        id: optionId,
        name: name || optionId,
        instruction
      };

      if (!container.group.options.some(existing => existing.id === option.id)) {
        container.group.options.push(option);
        container.orders.push(typeof preset.order === "number" ? preset.order : Number.MAX_SAFE_INTEGER);
      }
    });

  // Sort options per group
  remoteMap.forEach(({ group, orders }) => {
    group.options = group.options
      .map((option, index) => ({ option, order: orders[index] ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.order - b.order)
      .map(({ option }) => option);
  });

  const result: CameraPresetGroup[] = [];

  fallbackGroups.forEach(fallback => {
    const remote = remoteMap.get(fallback.id);
    if (remote) {
      result.push(remote.group);
      remoteMap.delete(fallback.id);
    } else {
      result.push({
        ...fallback,
        options: fallback.options.map(option => ({ ...option }))
      });
    }
  });

  // Append any new groups that did not exist in fallback
  const leftover = Array.from(remoteMap.values())
    .map(entry => entry.group)
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    groups: [...result, ...leftover],
    hasRemote: remoteMap.size > 0 || presets.length > 0
  };
}

function buildExternalGroupsFromPresets(
  presets: Preset[],
  fallbackGroups: ExternalPresetGroup[]
): { groups: ExternalPresetGroup[]; hasRemote: boolean } {
  if (!presets.length) {
    return { groups: cloneExternalGroups(fallbackGroups), hasRemote: false };
  }

  const fallbackMap = new Map<string, ExternalPresetGroup>();
  fallbackGroups.forEach(group => fallbackMap.set(group.id, group));

  const remoteMap = new Map<string, { group: ExternalPresetGroup; orders: number[] }>();

  presets
    .filter(preset => preset.active !== false)
    .forEach(preset => {
      const groupId = preset.groupId || "external";
      const fallback = fallbackMap.get(groupId);
      if (!remoteMap.has(groupId)) {
        const groupTitle =
          resolveLabel(preset.groupLabel, "ko") ||
          resolveLabel(preset.groupLabel, "en") ||
          fallback?.title ||
          groupId;
        remoteMap.set(groupId, {
          group: {
            id: groupId,
            title: groupTitle,
            description: fallback?.description,
            options: []
          },
          orders: []
        });
      }

      const container = remoteMap.get(groupId)!;
      const optionId = extractValue(preset, "ext-");

      const labelEn = resolveLabel(preset.label, "en") || resolveLabel(preset.labelKo, "en");
      const labelKo = resolveLabel(preset.labelKo, "ko") || resolveLabel(preset.label, "ko") || labelEn;
      const prompt = resolvePrompt(preset.prompt);

      const option: ExternalPresetOption = {
        id: optionId,
        label: labelEn || optionId,
        labelKo: labelKo || labelEn || optionId,
        prompt,
        ...(preset.note ? { note: preset.note } : {})
      };

      if (!container.group.options.some(existing => existing.id === option.id)) {
        container.group.options.push(option);
        container.orders.push(typeof preset.order === "number" ? preset.order : Number.MAX_SAFE_INTEGER);
      }
    });

  // Sort options per group
  remoteMap.forEach(({ group, orders }) => {
    group.options = group.options
      .map((option, index) => ({ option, order: orders[index] ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.order - b.order)
      .map(({ option }) => option);
  });

  const result: ExternalPresetGroup[] = [];

  fallbackGroups.forEach(fallback => {
    const remote = remoteMap.get(fallback.id);
    if (remote) {
      result.push(remote.group);
      remoteMap.delete(fallback.id);
    } else {
      result.push({
        ...fallback,
        options: fallback.options.map(option => ({ ...option }))
      });
    }
  });

  // Append any new groups that did not exist in fallback
  const leftover = Array.from(remoteMap.values())
    .map(entry => entry.group)
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    groups: [...result, ...leftover],
    hasRemote: remoteMap.size > 0 || presets.length > 0
  };
}

function buildLightingGroupsFromPresets(
  presets: Preset[],
  fallbackGroups: LightingPresetGroup[]
): { groups: LightingPresetGroup[]; hasRemote: boolean } {
  if (!presets.length) {
    return { groups: cloneLightingGroups(fallbackGroups), hasRemote: false };
  }

  const fallbackMap = new Map<string, LightingPresetGroup>();
  fallbackGroups.forEach(group => fallbackMap.set(group.key, group));

  const remoteMap = new Map<string, { group: LightingPresetGroup; orders: number[] }>();

  presets
    .filter(preset => preset.active !== false)
    .forEach(preset => {
      const groupId = preset.groupId || "illumination";
      if (!remoteMap.has(groupId)) {
        const fallback = fallbackMap.get(groupId);
        const groupTitle =
          resolveLabel(preset.groupLabel, "ko") ||
          resolveLabel(preset.groupLabel, "en") ||
          fallback?.title ||
          groupId;
        remoteMap.set(groupId, {
          group: {
            key: groupId as LightingPresetCategory,
            title: groupTitle,
            description: fallback?.description,
            options: []
          },
          orders: []
        });
      }

      const container = remoteMap.get(groupId)!;
      const value = extractValue(preset, "light-");
      const label =
        resolveLabel(preset.labelKo, "ko") ||
        resolveLabel(preset.label, "ko") ||
        resolveLabel(preset.label, "en") ||
        value;

      const option: LightingPresetOption = {
        value,
        label,
        prompt: resolvePrompt(preset.prompt)
      };

      if (!container.group.options.some(existing => existing.value === option.value)) {
        container.group.options.push(option);
        container.orders.push(typeof preset.order === "number" ? preset.order : Number.MAX_SAFE_INTEGER);
      }
    });

  remoteMap.forEach(({ group, orders }) => {
    group.options = group.options
      .map((option, index) => ({ option, order: orders[index] ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.order - b.order)
      .map(({ option }) => option);
  });

  const result: LightingPresetGroup[] = [];

  fallbackGroups.forEach(fallback => {
    const remote = remoteMap.get(fallback.key);
    if (remote) {
      result.push(remote.group);
      remoteMap.delete(fallback.key);
    } else {
      result.push({
        ...fallback,
        options: fallback.options.map(option => ({ ...option }))
      });
    }
  });

  const leftover = Array.from(remoteMap.values())
    .map(entry => entry.group)
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    groups: [...result, ...leftover],
    hasRemote: remoteMap.size > 0 || presets.length > 0
  };
}

function buildPoseGroupsFromPresets(
  presets: Preset[],
  fallbackGroups: PosePresetGroup[]
): { groups: PosePresetGroup[]; hasRemote: boolean } {
  if (!presets.length) {
    return { groups: clonePoseGroups(fallbackGroups), hasRemote: false };
  }

  const fallbackMap = new Map<string, PosePresetGroup>();
  fallbackGroups.forEach(group => fallbackMap.set(group.key, group));

  const remoteMap = new Map<string, { group: PosePresetGroup; orders: number[] }>();

  presets
    .filter(preset => preset.active !== false)
    .forEach(preset => {
      const groupId = preset.groupId || "expression";
      if (!remoteMap.has(groupId)) {
        const fallback = fallbackMap.get(groupId);
        const groupTitle =
          resolveLabel(preset.groupLabel, "ko") ||
          resolveLabel(preset.groupLabel, "en") ||
          fallback?.title ||
          groupId;
        remoteMap.set(groupId, {
          group: {
            key: groupId as PosePresetCategory,
            title: groupTitle,
            options: []
          },
          orders: []
        });
      }

      const container = remoteMap.get(groupId)!;
      const value = extractValue(preset, "pose-");
      const label =
        resolveLabel(preset.labelKo, "ko") ||
        resolveLabel(preset.label, "ko") ||
        resolveLabel(preset.label, "en") ||
        value;

      const option: PosePresetOption = {
        value,
        label,
        prompt: resolvePrompt(preset.prompt)
      };

      if (!container.group.options.some(existing => existing.value === option.value)) {
        container.group.options.push(option);
        container.orders.push(typeof preset.order === "number" ? preset.order : Number.MAX_SAFE_INTEGER);
      }
    });

  remoteMap.forEach(({ group, orders }) => {
    group.options = group.options
      .map((option, index) => ({ option, order: orders[index] ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.order - b.order)
      .map(({ option }) => option);
  });

  // Ensure each group has a default option
  remoteMap.forEach(({ group }) => {
    const hasDefault = group.options.some(option => option.value === "default");
    if (!hasDefault) {
      const fallbackDefault = fallbackMap.get(group.key)?.options.find(option => option.value === "default");
      if (fallbackDefault) {
        group.options.unshift({ ...fallbackDefault });
      } else {
        group.options.unshift({ value: "default", label: "기본값", prompt: "" });
      }
    }
  });

  const result: PosePresetGroup[] = [];

  fallbackGroups.forEach(fallback => {
    const remote = remoteMap.get(fallback.key);
    if (remote) {
      result.push(remote.group);
      remoteMap.delete(fallback.key);
    } else {
      result.push({
        ...fallback,
        options: fallback.options.map(option => ({ ...option }))
      });
    }
  });

  const leftover = Array.from(remoteMap.values())
    .map(entry => entry.group)
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    groups: [...result, ...leftover],
    hasRemote: remoteMap.size > 0 || presets.length > 0
  };
}

function buildLightingLookup(groups: LightingPresetGroup[]): LightingPromptLookup {
  const lookup: LightingPromptLookup = {};
  LIGHTING_CATEGORY_ORDER.forEach(category => {
    lookup[category] = {};
  });

  groups.forEach(group => {
    if (!lookup[group.key]) {
      lookup[group.key] = {};
    }
    group.options.forEach(option => {
      lookup[group.key][option.value] = option.prompt;
    });
  });

  return lookup;
}

function buildPoseLookup(groups: PosePresetGroup[]): PosePromptLookup {
  const lookup: PosePromptLookup = {};
  POSE_CATEGORY_ORDER.forEach(category => {
    lookup[category] = {};
  });

  groups.forEach(group => {
    if (!lookup[group.key]) {
      lookup[group.key] = {};
    }
    group.options.forEach(option => {
      lookup[group.key][option.value] = option.prompt;
    });
  });

  return lookup;
}

function createPosePromptGenerator(lookup: PosePromptLookup) {
  return (selections: { expression?: string; posture?: string }) => {
    const prompts: string[] = [];
    const expression = selections.expression;
    if (expression && expression !== "default") {
      const phrase = lookup.expression?.[expression];
      if (phrase) {
        prompts.push(phrase);
      }
    }

    const posture = selections.posture;
    if (posture && posture !== "default") {
      const phrase = lookup.posture?.[posture];
      if (phrase) {
        prompts.push(phrase);
      }
    }

    return prompts.join(" ");
  };
}

function createLightingInstructionBuilder(lookup: LightingPromptLookup) {
  return (selections: LightingSelections): string | null => {
    const lines: string[] = [];
    for (const category of LIGHTING_CATEGORY_ORDER) {
      const values = selections[category];
      if (!values?.length) {
        continue;
      }
      const phrases = lookup[category] || {};
      values.forEach(value => {
        const phrase = phrases[value];
        if (phrase && !lines.includes(phrase)) {
          lines.push(phrase);
        }
      });
    }

    return lines.length ? lines.join(" ") : null;
  };
}

function createPoseInstructionBuilder(lookup: PosePromptLookup) {
  return (selections: PoseSelections): string | null => {
    const lines: string[] = [];
    for (const category of POSE_CATEGORY_ORDER) {
      const values = selections[category];
      if (!values?.length) {
        continue;
      }
      const phrases = lookup[category] || {};
      values.forEach(value => {
        const phrase = phrases[value];
        if (phrase && !lines.includes(phrase)) {
          lines.push(phrase);
        }
      });
    }

    return lines.length ? lines.join(" ") : null;
  };
}

export function PresetLibraryProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PresetLibraryData>(() => createFallbackState());
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    shouldUseFirestore ? "loading" : "ready"
  );
  const [source, setSource] = useState<"fallback" | "firestore">("fallback");
  const [error, setError] = useState<Error | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    if (!shouldUseFirestore) {
      setStatus("ready");
      setSource("fallback");
      setError(null);
      setData(createFallbackState());
      return;
    }

    let cancelled = false;

    async function loadPresets() {
      setStatus("loading");
      try {
        const presets = await getAllPresets();
        if (cancelled) {
          return;
        }

        const activePresets = presets.filter(preset => preset.active !== false);

        const {
          groups: cameraGroups,
          hasRemote: hasCameraRemote
        } = buildCameraGroupsFromPresets(activePresets.filter(p => p.category === "camera"), FALLBACK_CAMERA_GROUPS);

        const {
          groups: externalGroups,
          hasRemote: hasExternalRemote
        } = buildExternalGroupsFromPresets(activePresets.filter(p => p.category === "external"), EXTERNAL_PRESET_GROUPS);

        const {
          groups: lightingGroups,
          hasRemote: hasLightingRemote
        } = buildLightingGroupsFromPresets(activePresets.filter(p => p.category === "lighting"), LIGHTING_PRESET_GROUPS);

        const {
          groups: poseGroups,
          hasRemote: hasPoseRemote
        } = buildPoseGroupsFromPresets(activePresets.filter(p => p.category === "pose"), POSE_PRESET_GROUPS);

        const hasRemote = hasCameraRemote || hasExternalRemote || hasLightingRemote || hasPoseRemote;

        setData({
          cameraGroups,
          externalGroups,
          lightingGroups,
          poseGroups
        });
        setSource(hasRemote ? "firestore" : "fallback");
        setStatus("ready");
        setError(null);
      } catch (err) {
        console.error("[PresetLibrary] Failed to load presets from Firestore", err);
        if (cancelled) {
          return;
        }
        setData(createFallbackState());
        setSource("fallback");
        setStatus("error");
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    }

    loadPresets();

    return () => {
      cancelled = true;
    };
  }, [refreshIndex]);

  const refresh = useCallback(() => {
    setRefreshIndex(index => index + 1);
  }, []);

  const lightingLookup = useMemo(() => buildLightingLookup(data.lightingGroups), [data.lightingGroups]);
  const poseLookup = useMemo(() => buildPoseLookup(data.poseGroups), [data.poseGroups]);
  const generatePosePrompt = useMemo(() => createPosePromptGenerator(poseLookup), [poseLookup]);
  const buildLightingInstruction = useMemo(() => createLightingInstructionBuilder(lightingLookup), [lightingLookup]);
  const buildPoseInstruction = useMemo(() => createPoseInstructionBuilder(poseLookup), [poseLookup]);

  const value = useMemo<PresetLibraryValue>(
    () => ({
      cameraGroups: data.cameraGroups,
      externalGroups: data.externalGroups,
      lightingGroups: data.lightingGroups,
      poseGroups: data.poseGroups,
      lightingLookup,
      poseLookup,
      generatePosePrompt,
      buildLightingInstruction,
      buildPoseInstruction,
      status,
      source,
      refresh,
      error
    }),
    [
      data.cameraGroups,
      data.externalGroups,
      data.lightingGroups,
      data.poseGroups,
      lightingLookup,
      poseLookup,
      generatePosePrompt,
      buildLightingInstruction,
      buildPoseInstruction,
      status,
      source,
      refresh,
      error
    ]
  );

  return (
    <PresetLibraryContext.Provider value={value}>
      {children}
    </PresetLibraryContext.Provider>
  );
}

export function usePresetLibrary(): PresetLibraryValue {
  const ctx = useContext(PresetLibraryContext);
  if (!ctx) {
    throw new Error("usePresetLibrary must be used within a PresetLibraryProvider");
  }
  return ctx;
}
