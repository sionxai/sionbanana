"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { AspectRatioPreset, GenerationMode, GeneratedImageDocument } from "@/lib/types";
import { PromptPanel } from "@/components/studio/prompt-panel";
import { WorkspacePanel } from "@/components/studio/workspace-panel";
import { HistoryPanel } from "@/components/studio/history-panel";
import { DragHandle } from "@/components/studio/drag-handle";
import { useResizable } from "@/hooks/use-resizable";
import { useGenerationCoordinator } from "./use-generation-coordinator";
import { useGeneratedImages } from "@/hooks/use-generated-images";
import { callGenerateApi } from "@/hooks/use-generate-image";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { deleteUserImage, uploadUserImage } from "@/lib/firebase/storage";
import {
  deleteGeneratedImageDoc,
  saveGeneratedImageDoc,
  updateGeneratedImageDoc
} from "@/lib/firebase/firestore";
import { shouldUseFirestore } from "@/lib/env";
import {
  APERTURE_DEFAULT,
  APERTURE_MAX,
  APERTURE_MIN,
  DEFAULT_CAMERA_ANGLE,
  DEFAULT_CAMERA_DIRECTION,
  DEFAULT_SUBJECT_DIRECTION,
  DEFAULT_ZOOM_LEVEL,
  formatAperture,
  getCameraAngleLabel,
  getDirectionalLabel
} from "@/lib/camera";
import { DEFAULT_ASPECT_RATIO, getAspectRatioDimensions, getAspectRatioLabel } from "@/lib/aspect";
import {
  INITIAL_REFERENCE_SLOT_COUNT,
  LOCAL_STORAGE_KEY,
  MAX_REFERENCE_SLOT_COUNT,
  REFERENCE_GALLERY_STORAGE_KEY,
  REFERENCE_IMAGE_DOC_ID,
  ReferenceSlotState,
  createReferenceSlot
} from "@/components/studio/constants";
import type { LightingPresetCategory, LightingSelections, PosePresetCategory, PoseSelections, ViewSpec, PromptDetails } from "@/components/studio/types";
import {
  CHARACTER_BASE_PROMPT_FALLBACK,
  CHARACTER_NEGATIVE_ENFORCEMENT,
  CHARACTER_SINGLE_VIEW_GUIDELINE,
  CHARACTER_VIEWS,
  TURNAROUND_BASE_PROMPT_FALLBACK,
  TURNAROUND_NEGATIVE_ENFORCEMENT,
  TURNAROUND_SINGLE_VIEW_GUIDELINE,
  TURNAROUND_VIEWS
} from "@/components/studio/preset-config";
import {
  CAMERA_MODE_DEFAULT_DIRECTIVE,
  CAMERA_MODE_NEGATIVE_GUARD,
  CAMERA_MODE_PROMPT_GUIDELINE
} from "@/components/studio/camera-config";
import {
  LIGHTING_MODE_BASE_PROMPT,
  LIGHTING_PROMPT_LOOKUP
} from "@/components/studio/lighting-config";
import {
  POSE_MODE_BASE_PROMPT,
  POSE_PROMPT_LOOKUP
} from "@/components/studio/pose-config";
import {
  REFERENCE_SYNC_EVENT,
  REFERENCE_SYNC_STORAGE_KEY,
  broadcastReferenceUpdate,
  readStoredReference,
  type ReferenceSyncPayload
} from "@/components/studio/reference-sync";
import { HISTORY_SYNC_EVENT, broadcastHistoryUpdate, mergeHistoryRecords, type HistorySyncPayload } from "@/components/studio/history-sync";

async function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("파일을 읽을 수 없습니다."));
      }
    };
    reader.onerror = () => {
      reject(new Error("파일을 읽는 중 오류가 발생했습니다."));
    };
    reader.readAsDataURL(file);
  });
}

interface NormalizedCameraSettings {
  angle?: string;
  subjectDirection?: string;
  cameraDirection?: string;
  zoom?: string;
}

const CAMERA_ANGLE_PROMPT_MAP: Record<string, string> = {
  로우앵글: "a dramatic low-angle hero shot",
  lowangle: "a dramatic low-angle hero shot",
  웜즈아이: "an extreme worm's-eye perspective",
  wormseye: "an extreme worm's-eye perspective",
  하이앵글: "a high-angle overhead viewpoint",
  highangle: "a high-angle overhead viewpoint",
  버드아이: "a sweeping bird's-eye perspective",
  birdseye: "a sweeping bird's-eye perspective",
  더치앵글: "a tilted Dutch angle composition",
  dutchangle: "a tilted Dutch angle composition",
  아이레벨: "a natural eye-level perspective",
  eyelevel: "a natural eye-level perspective",
  반대방향: "a reverse-angle viewpoint that looks back toward the subject",
  reverseangle: "a reverse-angle viewpoint that looks back toward the subject",
  오버숄더: "an intimate over-the-shoulder framing",
  overtheshoulder: "an intimate over-the-shoulder framing"
};

const SUBJECT_DIRECTION_PROMPT_MAP: Record<string, string> = {
  정면: "the subject facing forward",
  좌측면: "the subject turned to the left",
  우측면: "the subject turned to the right",
  후면: "the subject showing their back",
  위에서: "the subject looking upward",
  아래에서: "the subject looking downward",
  front: "the subject facing forward",
  left: "the subject turned to the left",
  right: "the subject turned to the right",
  back: "the subject showing their back",
  up: "the subject looking upward",
  down: "the subject looking downward"
};

const CAMERA_DIRECTION_PROMPT_MAP: Record<string, string> = {
  정면: "the camera positioned directly in front of the subject",
  좌측면: "the camera positioned on the subject's left side",
  우측면: "the camera positioned on the subject's right side",
  후면: "the camera positioned behind the subject",
  위에서: "the camera placed overhead looking downward",
  아래에서: "the camera positioned low to the ground looking upward",
  front: "the camera positioned directly in front of the subject",
  left: "the camera positioned on the subject's left side",
  right: "the camera positioned on the subject's right side",
  back: "the camera positioned behind the subject",
  up: "the camera placed overhead looking downward",
  down: "the camera positioned low to the ground looking upward"
};

const ZOOM_PROMPT_MAP: Record<string, string> = {
  줌인: "tight zoomed-in framing that highlights facial detail",
  줌아웃: "zoomed-out framing that reveals the environment",
  확대: "an extreme close-up magnification",
  zoomin: "tight zoomed-in framing that highlights facial detail",
  zoomout: "zoomed-out framing that reveals the environment",
  magnify: "an extreme close-up magnification"
};

function sanitizePromptKey(value?: string | null) {
  if (!value) {
    return "";
  }
  return value.replace(/[\s_-]+/g, "").toLowerCase();
}

function resolveCameraAnglePrompt(angle?: string | null) {
  if (!angle || angle === DEFAULT_CAMERA_ANGLE) {
    return null;
  }
  const key = sanitizePromptKey(angle);
  return CAMERA_ANGLE_PROMPT_MAP[key] ?? CAMERA_ANGLE_PROMPT_MAP[angle];
}

function resolveSubjectDirectionPrompt(direction?: string | null) {
  if (!direction || direction === DEFAULT_SUBJECT_DIRECTION) {
    return null;
  }
  const key = sanitizePromptKey(direction);
  return SUBJECT_DIRECTION_PROMPT_MAP[key] ?? SUBJECT_DIRECTION_PROMPT_MAP[direction];
}

function resolveCameraDirectionPrompt(direction?: string | null) {
  if (!direction || direction === DEFAULT_CAMERA_DIRECTION) {
    return null;
  }
  const key = sanitizePromptKey(direction);
  return CAMERA_DIRECTION_PROMPT_MAP[key] ?? CAMERA_DIRECTION_PROMPT_MAP[direction];
}

function resolveZoomPrompt(zoom?: string | null) {
  if (!zoom || zoom === DEFAULT_ZOOM_LEVEL) {
    return null;
  }
  const key = sanitizePromptKey(zoom);
  return ZOOM_PROMPT_MAP[key] ?? ZOOM_PROMPT_MAP[zoom];
}

function buildCameraAdjustmentInstruction(settings: NormalizedCameraSettings) {
  const anglePhrase = resolveCameraAnglePrompt(settings.angle);
  const zoomPhrase = resolveZoomPrompt(settings.zoom);
  const subjectPhrase = resolveSubjectDirectionPrompt(settings.subjectDirection);
  const cameraPhrase = resolveCameraDirectionPrompt(settings.cameraDirection);

  const guidance: string[] = [];

  if (anglePhrase) {
    guidance.push(`Use ${anglePhrase}.`);
  }
  if (cameraPhrase) {
    guidance.push(`Position the camera so it is ${cameraPhrase}.`);
  }
  if (zoomPhrase) {
    guidance.push(`Maintain ${zoomPhrase}.`);
  }
  if (subjectPhrase) {
    guidance.push(`Keep ${subjectPhrase}.`);
  }

  return guidance.length ? guidance.join(' ') : null;
}

function combinePromptWithGuidance(
  promptText: string | null | undefined,
  guidance: string | null
): string {
  const trimmedGuidance = guidance?.trim();
  const base = (promptText ?? "").trim();

  if (!trimmedGuidance) {
    return base;
  }
  if (!base) {
    return trimmedGuidance;
  }
  if (base.includes(trimmedGuidance)) {
    return base;
  }
  return `${base}
${trimmedGuidance}`.trim();
}

function applyCameraPromptDirectives(
  _promptText: string | null | undefined,
  guidance: string | null
): string {
  const trimmedGuidance = guidance?.trim();
  return trimmedGuidance && trimmedGuidance.length
    ? trimmedGuidance
    : CAMERA_MODE_DEFAULT_DIRECTIVE;
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

function buildLightingInstruction(selections: LightingSelections): string | null {
  const lines: string[] = [];
  for (const category of LIGHTING_CATEGORY_ORDER) {
    const selected = selections[category];
    if (!selected?.length) {
      continue;
    }
    const lookup = LIGHTING_PROMPT_LOOKUP[category];
    selected.forEach(value => {
      const phrase = lookup[value];
      if (phrase && !lines.includes(phrase)) {
        lines.push(phrase);
      }
    });
  }
  return lines.length ? lines.join(" ") : null;
}

function cloneLightingSelections(selections: LightingSelections): LightingSelections {
  return LIGHTING_CATEGORY_ORDER.reduce((acc, category) => {
    acc[category] = [...(selections[category] ?? [])];
    return acc;
  }, {} as LightingSelections);
}

const POSE_CATEGORY_ORDER: PosePresetCategory[] = [
  "expression",
  "posture"
];

function buildPoseInstruction(selections: PoseSelections): string | null {
  const lines: string[] = [];
  for (const category of POSE_CATEGORY_ORDER) {
    const selected = selections[category];
    if (!selected?.length) {
      continue;
    }
    const lookup = POSE_PROMPT_LOOKUP[category];
    selected.forEach(value => {
      const phrase = lookup[value];
      if (phrase && !lines.includes(phrase)) {
        lines.push(phrase);
      }
    });
  }
  return lines.length ? lines.join(" ") : null;
}

function clonePoseSelections(selections: PoseSelections): PoseSelections {
  return {
    expression: [...selections.expression],
    posture: [...selections.posture]
  };
}

function normalizeCameraSettings(
  angle: string,
  subjectDirection: string,
  cameraDirection: string,
  zoom: string
): NormalizedCameraSettings {
  const normalized: NormalizedCameraSettings = {};
  if (angle && angle !== DEFAULT_CAMERA_ANGLE) {
    normalized.angle = angle;
  }
  if (subjectDirection && subjectDirection !== DEFAULT_SUBJECT_DIRECTION) {
    normalized.subjectDirection = subjectDirection;
  }
  if (cameraDirection && cameraDirection !== DEFAULT_CAMERA_DIRECTION) {
    normalized.cameraDirection = cameraDirection;
  }
  if (zoom && zoom !== DEFAULT_ZOOM_LEVEL) {
    normalized.zoom = zoom;
  }
  return normalized;
}

function buildCameraPrompt({ settings }: { settings: NormalizedCameraSettings }): string {
  const guidance = buildCameraAdjustmentInstruction(settings);
  const trimmed = guidance?.trim();
  return trimmed && trimmed.length ? trimmed : CAMERA_MODE_DEFAULT_DIRECTIVE;
}


const MODES: Array<{
  id: GenerationMode | "presets";
  label: string;
  description: string;
  href?: string;
}> = [
  { id: "create", label: "편집", description: "기본 프롬프트 기반 이미지 생성" },
  { id: "camera", label: "카메라", description: "화각 및 렌즈 스타일 변경" },
  { id: "lighting", label: "조명 및 배색", description: "조명과 컬러그레이딩 프리셋 적용" },
  { id: "pose", label: "포즈", description: "표정과 자세 프리셋 적용" },
  { id: "external", label: "외부 프리셋", description: "예시 기반 프롬프트 컬렉션" },
  { id: "crop", label: "크롭", description: "이미지 구도 및 비율 변경" },
  { id: "upscale", label: "업스케일", description: "고해상도로 업스케일" },
  { id: "sketch", label: "스케치", description: "스케치를 이미지로 변환" },
  { id: "prompt-adapt", label: "T2I", description: "타 툴용 프롬프트 변환" },
  {
    id: "presets",
    label: "프리셋",
    description: "자주 쓰는 시나리오 모음",
    href: "/presets"
  }
];


type RequestGptPromptArgs = {
  basePrompt?: string;
  userPrompt?: string;
  negativePrompt?: string;
  angle?: string;
  aperture?: string;
  aspectRatio?: string;
  gallery?: string[];
  subjectDirection?: string;
  cameraDirection?: string;
  zoom?: string;
  source?: "gpt-manual" | "gpt-auto";
};

type CameraSettingsPayload = {
  angle?: string;
  aperture: string;
  subjectDirection?: string;
  cameraDirection?: string;
  zoom?: string;
};

type ReferenceImageState = {
  url: string | null;
  signature: number;
  source: "override" | "derived";
};

export function StudioShell() {
  const { user } = useAuth();
  const lastUidRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeMode, setActiveMode] = useState<GenerationMode>("create");
  const [prompt, setPrompt] = useState<string>("");
  const [refinedPrompt, setRefinedPrompt] = useState<string>("");
  const [negativePrompt, setNegativePrompt] = useState<string>("");
  const [cameraAngle, setCameraAngle] = useState<string>(DEFAULT_CAMERA_ANGLE);
  const [aperture, setAperture] = useState<number>(APERTURE_DEFAULT);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>(DEFAULT_ASPECT_RATIO);
  const [subjectDirection, setSubjectDirection] = useState<string>(DEFAULT_SUBJECT_DIRECTION);
  const [cameraDirection, setCameraDirection] = useState<string>(DEFAULT_CAMERA_DIRECTION);
  const [zoomLevel, setZoomLevel] = useState<string>(DEFAULT_ZOOM_LEVEL);
  const [lightingSelections, setLightingSelections] = useState<LightingSelections>({
    illumination: [],
    atmosphere: [],
    time: [],
    cinematic: [],
    artistic: [],
    harmony: [],
    mood: []
  });
  const [poseSelections, setPoseSelections] = useState<PoseSelections>({
    expression: ["default"],
    posture: ["default"]
  });
  const [selectedImageId, setSelectedImageIdState] = useState<string | null>(null);
  const [localRecords, setLocalRecords] = useState<GeneratedImageDocument[]>([]);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const [referenceSlots, setReferenceSlots] = useState<ReferenceSlotState[]>(() =>
    Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot())
  );
  const [previewRecord, setPreviewRecord] = useState<GeneratedImageDocument | null>(null);
  const [useGptPrompt, setUseGptPrompt] = useState(false);
  const [gptLoading, setGptLoading] = useState(false);
  const [lastPromptDetails, setLastPromptDetails] = useState<PromptDetails | null>(null);
  const [characterBatchPending, setCharacterBatchPending] = useState(false);
  const [view360BatchPending, setView360BatchPending] = useState(false);
  const [comparisonImageId, setComparisonImageId] = useState<string | null>(null);
  const historySyncSourceRef = useRef<string | null>(null);
  const pendingSelectedImageIdRef = useRef<string | null>(null);
  const [selectedRecordOverride, setSelectedRecordOverride] = useState<GeneratedImageDocument | null>(null);
  const [freshlyGeneratedRecord, setFreshlyGeneratedRecord] = useState<GeneratedImageDocument | null>(null);
  const { snapshot: generationSnapshot, isGenerating, showSuccessFor, start: startGeneration } = useGenerationCoordinator();
  const [currentRequestId, setCurrentRequestId] = useState<number | null>(null);
  const [activeGuard, setActiveGuard] = useState<{ requestId: number; onSuccess: (recordId: string) => void; onError: (message?: string) => void; timeoutId?: NodeJS.Timeout } | null>(null);

  // Resizable layout hook
  const resizable = useResizable({
    containerRef,
    storageKey: "studio-panel-sizes",
    initialLeftWidth: 320,
    initialRightWidth: 360,
    minLeftWidth: 250,
    maxLeftWidth: 500,
    minRightWidth: 300,
    maxRightWidth: 500
  });

  // Helper function to clear active guard and timeout
  const clearActiveGuard = useCallback(() => {
    setActiveGuard(prev => {
      if (prev?.timeoutId) {
        clearTimeout(prev.timeoutId);
      }
      return null;
    });
  }, []);

  // Now we can safely use activeGuard in useGeneratedImages
  const { records, loading } = useGeneratedImages({
    onNewRecord: useCallback(
      (record: GeneratedImageDocument) => {
        if (activeGuard) {

          if (activeGuard.timeoutId) {
            clearTimeout(activeGuard.timeoutId);
          }

          activeGuard.onSuccess(record.id);
          clearActiveGuard();
        }

        setNewRecordToProcess(record);
      },
      [activeGuard, clearActiveGuard]
    )
  });

  const selectImage = useCallback(
    (id: string | null, options: { auto?: boolean; record?: GeneratedImageDocument | null } = {}) => {
      const { auto = false, record = null } = options;
      if (auto && id && record) {
        pendingSelectedImageIdRef.current = id;
        setSelectedRecordOverride(record);
      } else {
        pendingSelectedImageIdRef.current = null;
        setSelectedRecordOverride(auto ? record : null);
      }
      setSelectedImageIdState(id);
    },
    []
  );

  const selectImageAuto = useCallback(
    (id: string | null, record?: GeneratedImageDocument | null) => {
      selectImage(id, { auto: true, record: record ?? null });
    },
    [selectImage]
  );
  const [referenceImageState, setReferenceImageState] = useState<ReferenceImageState>({
    url: null,
    signature: 0,
    source: "derived"
  });

  // When user changes, clear local caches so one user's history/reference does not bleed into another.
  useEffect(() => {
    const currentUid = user?.uid ?? null;
    const prevUid = lastUidRef.current;
    const shouldReset = Boolean(prevUid && prevUid !== currentUid);

    if (shouldReset) {
      try {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
        window.localStorage.removeItem(REFERENCE_GALLERY_STORAGE_KEY);
        window.localStorage.removeItem(REFERENCE_SYNC_STORAGE_KEY);
      } catch {}
      setLocalRecords([]);
      selectImage(null);
      broadcastReferenceUpdate(null, "studio");
    }

    if (!currentUid && prevUid) {
      // ensure reference state cleared when logging out entirely
      setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
    }

    lastUidRef.current = currentUid;
  }, [user?.uid]);


  const collectReferenceGalleryUrls = () =>
    Array.from(
      new Set(
        referenceSlots
          .map(slot => slot.imageUrl)
          .filter((url): url is string => Boolean(url && url.trim().length))
      )
    );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(REFERENCE_GALLERY_STORAGE_KEY);
      if (!raw) {
        setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
        return;
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .slice(0, MAX_REFERENCE_SLOT_COUNT)
          .map((item: { id?: unknown; imageUrl?: unknown; updatedAt?: unknown }) => ({
            id:
              typeof item?.id === "string"
                ? (item.id as string)
                : (typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
            imageUrl: typeof item?.imageUrl === "string" ? (item.imageUrl as string) : null,
            updatedAt: typeof item?.updatedAt === "string" ? (item.updatedAt as string) : new Date().toISOString()
          }));

        const currentUid = user?.uid ?? null;
        const normalizedFiltered = normalized.filter(slot => {
          if (!slot.imageUrl) return true;
          if (!currentUid) return false;
          const url = slot.imageUrl;
          return url.startsWith("data:") || url.includes(`/users/${currentUid}/`);
        });

        const ensured = normalizedFiltered.length
          ? normalizedFiltered
          : Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot());
        setReferenceSlots(ensured);
      } else {
        setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
      }
    } catch (error) {
      console.warn("Failed to load reference slots", error);
      setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as GeneratedImageDocument[];
        if (Array.isArray(parsed)) {
          const uid = user?.uid ?? null;
          const filtered = uid ? parsed.filter(record => record.userId === uid) : [];
          setLocalRecords(filtered);
        }
      }
    } catch (error) {
      console.warn("Failed to read local history", error);
    } finally {
      setHistoryHydrated(true);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const payload = referenceSlots.map(slot => ({
        id: slot.id,
        imageUrl: slot.imageUrl,
        updatedAt: slot.updatedAt
      }));
      window.localStorage.setItem(REFERENCE_GALLERY_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn("Failed to persist reference slots", error);
    }
  }, [referenceSlots]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<HistorySyncPayload>).detail;
      if (!detail || detail.source === "studio") {
        return;
      }

      const currentUid = user?.uid ?? null;
      const incoming = Array.isArray(detail.records)
        ? detail.records.filter(r => r.userId && r.userId === currentUid)
        : [];
      if (!incoming.length) {
        return;
      }

      historySyncSourceRef.current = detail.source ?? null;

      setLocalRecords(prev => {
        const incomingMap = new Map(incoming.map(record => [record.id, record]));
        const merged = [...incoming];
        for (const record of prev) {
          if (!incomingMap.has(record.id)) {
            merged.push(record);
          }
        }
        return merged;
      });
    };

    window.addEventListener(HISTORY_SYNC_EVENT, handler as EventListener);
    return () => window.removeEventListener(HISTORY_SYNC_EVENT, handler as EventListener);
  }, [user?.uid]);

  const mergedRecords = useMemo(() => {
    const merged = mergeHistoryRecords(localRecords, records);
    const uid = user?.uid ?? null;
    return uid ? merged.filter(record => record.userId === uid) : [];
  }, [localRecords, records, user?.uid]);

  const [historyView, setHistoryView] = useState<"all" | "favorite">("all");

  const historyRecordsAll = useMemo(() => {
    return mergedRecords.filter(record => record.id !== REFERENCE_IMAGE_DOC_ID);
  }, [mergedRecords]);

  const historyRecords = useMemo(() => {
    return historyView === "favorite"
      ? historyRecordsAll.filter(record => record.metadata?.favorite === true)
      : historyRecordsAll;
  }, [historyRecordsAll, historyView]);

  useEffect(() => {
    setLocalRecords(prev => prev.filter(item => !records.some(record => record.id === item.id)));
  }, [records]);

  useEffect(() => {
    if (!historyHydrated || typeof window === "undefined") {
      return;
    }
    try {
      const historySnapshot = historyRecordsAll.slice(0, 50);
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(historySnapshot));
      if (historySyncSourceRef.current && historySyncSourceRef.current !== "studio") {
        historySyncSourceRef.current = null;
      } else {
        broadcastHistoryUpdate(historySnapshot, "studio");
      }
    } catch (error) {
      console.warn("Failed to persist local history", error);
    }
  }, [historyHydrated, historyRecordsAll]);

  useEffect(() => {
    if (!historyRecords.length) {
      pendingSelectedImageIdRef.current = null;
      selectImage(null);
      return;
    }

    const pendingId = pendingSelectedImageIdRef.current;
    if (pendingId) {
      if (historyRecords.some(record => record.id === pendingId)) {
        pendingSelectedImageIdRef.current = null;
        selectImage(pendingId);
      }
      return;
    }

    if (!selectedImageId || !historyRecords.some(record => record.id === selectedImageId)) {
      pendingSelectedImageIdRef.current = null;
      selectImage(historyRecords[0].id);
    }
  }, [historyRecords, selectedImageId, selectImage]);

  useEffect(() => {
    if (!selectedRecordOverride) {
      return;
    }
    // Only clear override when the record is actually available in merged records
    if (selectedImageId && mergedRecords.some(record => record.id === selectedImageId)) {
      setSelectedRecordOverride(null);
    }
  }, [mergedRecords, selectedImageId, selectedRecordOverride]);

  // Clear freshly generated record when it's available in merged records
  useEffect(() => {
    if (!freshlyGeneratedRecord) {
      return;
    }
    if (mergedRecords.some(record => record.id === freshlyGeneratedRecord.id)) {
      setFreshlyGeneratedRecord(null);
    }
  }, [mergedRecords, freshlyGeneratedRecord]);

  const selectedRecord: GeneratedImageDocument | null = useMemo(() => {
    // First priority: freshly generated record when generation just completed
    if (freshlyGeneratedRecord && selectedImageId === freshlyGeneratedRecord.id) {
      return freshlyGeneratedRecord;
    }
    // Second priority: override for newly generated images
    if (selectedRecordOverride && selectedRecordOverride.id === selectedImageId) {
      return selectedRecordOverride;
    }
    // Third priority: from history records
    const fromHistory = historyRecords.find(record => record.id === selectedImageId) ?? null;
    if (fromHistory) {
      return fromHistory;
    }
    return null;
  }, [historyRecords, selectedImageId, selectedRecordOverride, freshlyGeneratedRecord]);

  const comparisonRecord = useMemo(() => {
    if (!comparisonImageId) {
      return null;
    }
    return mergedRecords.find(record => record.id === comparisonImageId) ?? null;
  }, [comparisonImageId, mergedRecords]);

  const referenceRecord = useMemo(() => {
    const byId = mergedRecords.find(record => record.id === REFERENCE_IMAGE_DOC_ID);
    if (byId) {
      return byId;
    }
    return mergedRecords.find(record => record.metadata?.isReference === true) ?? null;
  }, [mergedRecords]);

  const hasReferenceDoc = Boolean(referenceRecord);

  useEffect(() => {
    if (comparisonImageId && !mergedRecords.some(record => record.id === comparisonImageId)) {
      setComparisonImageId(null);
    }
  }, [comparisonImageId, mergedRecords]);


  const setReferenceImageOverride = useCallback((url: string | null) => {
    setReferenceImageState(prev => ({
      url,
      signature: prev.signature + 1,
      source: "override"
    }));
  }, []);

  const derivedReferenceImageUrl = referenceRecord?.imageUrl ?? referenceRecord?.originalImageUrl ?? null;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!derivedReferenceImageUrl) {
      return;
    }

    setReferenceImageState(prev => {
      if (prev.source === "override" && prev.url && prev.url !== derivedReferenceImageUrl) {
        return prev;
      }
      if (prev.source === "derived" && prev.url === derivedReferenceImageUrl) {
        return prev;
      }
      const sameUrl = prev.url === derivedReferenceImageUrl;
      return {
        url: derivedReferenceImageUrl,
        signature: sameUrl ? prev.signature : prev.signature + 1,
        source: "derived"
      };
    });
  }, [derivedReferenceImageUrl]);

  const referenceImageUrl = useMemo(() => {
    if (referenceImageState.url) {
      return referenceImageState.url;
    }
    if (selectedRecord?.imageUrl || selectedRecord?.originalImageUrl) {
      return selectedRecord.imageUrl ?? selectedRecord.originalImageUrl ?? null;
    }
    if (historyRecords.length) {
      const first = historyRecords[0];
      return first.imageUrl ?? first.originalImageUrl ?? null;
    }
    return null;
  }, [historyRecords, referenceImageState.url, selectedRecord]);

  const hasReference = Boolean(referenceImageUrl);
  const showGenerationSuccess = showSuccessFor(currentRequestId);
  const successRecordId = generationSnapshot.resultRecordId ?? null;

  // Store the latest new record for processing
  const [newRecordToProcess, setNewRecordToProcess] = useState<GeneratedImageDocument | null>(null);
  const lastAutoSelectedIdRef = useRef<string | null>(null);


  const buildReferenceEntry = useCallback((record: GeneratedImageDocument): GeneratedImageDocument => {
    const metadata = { ...(record.metadata ?? {}) } as Record<string, unknown>;
    delete metadata.referenceId;
    return {
      ...record,
      id: REFERENCE_IMAGE_DOC_ID,
      originalImageUrl: record.originalImageUrl ?? record.imageUrl,
      thumbnailUrl: record.thumbnailUrl ?? record.imageUrl,
      diff: undefined,
      metadata: { ...metadata, isReference: true }
    };
  }, []);

  const mergeLocalRecord = useCallback(
    (
      record: GeneratedImageDocument,
      { promoteToReference = false, broadcast = true }: { promoteToReference?: boolean; broadcast?: boolean } = {}
    ): GeneratedImageDocument | null => {
      const newReferenceEntry = promoteToReference ? buildReferenceEntry(record) : null;

      setLocalRecords(prev => {
        const existingReference = promoteToReference
          ? null
          : prev.find(item => item.id === REFERENCE_IMAGE_DOC_ID) ?? null;
        const others = prev.filter(item => item.id !== REFERENCE_IMAGE_DOC_ID && item.id !== record.id);
        const referenceEntry = promoteToReference ? newReferenceEntry : existingReference;
        return referenceEntry ? [referenceEntry, record, ...others] : [record, ...others];
      });

      if (promoteToReference && newReferenceEntry && broadcast) {
        broadcastReferenceUpdate(newReferenceEntry, "studio");
      }

      return promoteToReference ? newReferenceEntry : null;
    },
    [buildReferenceEntry]
  );

  // Process new record after mergeLocalRecord and selectImageAuto are defined
  useEffect(() => {
    if (newRecordToProcess) {
      mergeLocalRecord(newRecordToProcess, { promoteToReference: false });
      selectImageAuto(newRecordToProcess.id, newRecordToProcess);
      setFreshlyGeneratedRecord(newRecordToProcess);
      setNewRecordToProcess(null); // Clear after processing
    }
  }, [newRecordToProcess, mergeLocalRecord, selectImageAuto]);

  useEffect(() => {
    const targetId = generationSnapshot.resultRecordId;
    if (!targetId) {
      return;
    }

    if (lastAutoSelectedIdRef.current === targetId) {
      return;
    }

    const candidate = mergedRecords.find(record => record.id === targetId);
    if (!candidate) {
      return;
    }

    lastAutoSelectedIdRef.current = targetId;
    selectImageAuto(targetId, candidate);
  }, [generationSnapshot.resultRecordId, mergedRecords, selectImageAuto]);

  const promoteReferenceImage = async (
  imageUrl: string,
  { recordId, metadata }: { recordId?: string; metadata?: Record<string, unknown> } = {}
) => {
  const id =
    recordId ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `reference-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const now = new Date().toISOString();
  const baseMetadata: Record<string, unknown> = { ...(metadata ?? {}) };

  const baseRecord: GeneratedImageDocument = {
    id,
    userId: user?.uid ?? "local",
    mode: "create",
    promptMeta: {
      rawPrompt: "사용자 기준 이미지",
      refinedPrompt: "사용자 기준 이미지"
    },
    status: "completed",
    imageUrl,
    thumbnailUrl: imageUrl,
    originalImageUrl: imageUrl,
    metadata: baseMetadata,
    model: "reference-upload",
    createdAt: now,
    updatedAt: now
  };

  const referenceEntry = mergeLocalRecord(baseRecord, { promoteToReference: true });
  if (referenceEntry) {
    await persistReferenceEntry(referenceEntry, now);
  }
};

  const persistReferenceEntry = useCallback(
    async (entry: GeneratedImageDocument, nowIso: string) => {
      if (!user || !shouldUseFirestore) {
        return;
      }

      const imageUrl = entry.imageUrl ?? entry.originalImageUrl;
      if (!imageUrl) {
        console.warn("기준 이미지 URL을 찾을 수 없어 동기화를 건너뜁니다.");
        return;
      }

      const originalImageUrl = entry.originalImageUrl ?? imageUrl;
      const thumbnailUrl = entry.thumbnailUrl ?? imageUrl;

      try {
        await saveGeneratedImageDoc(user.uid, REFERENCE_IMAGE_DOC_ID, {
          mode: entry.mode,
          status: entry.status,
          promptMeta: entry.promptMeta,
          imageUrl,
          thumbnailUrl,
          originalImageUrl,
          metadata: { ...(entry.metadata ?? {}), isReference: true },
          model: entry.model,
          costCredits: entry.costCredits,
          createdAtIso: entry.createdAt ?? nowIso,
          updatedAtIso: nowIso
        });
      } catch (error) {
        console.error("기준 이미지 동기화 실패", error);
        toast.error("기준 이미지를 저장하는 중 문제가 발생했습니다.");
      }
    },
    [shouldUseFirestore, user]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = readStoredReference();
    if (stored) {
      mergeLocalRecord(stored, { promoteToReference: true, broadcast: false });
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ReferenceSyncPayload>).detail;
      if (!detail || detail.source === "studio") {
        return;
      }
      if (!detail.record) {
        setLocalRecords(prev => prev.filter(item => item.id !== REFERENCE_IMAGE_DOC_ID));
        selectImage(null);
        return;
      }
      // Ignore reference updates from other users
      const currentUid = user?.uid;
      if (detail.record.userId && detail.record.userId !== currentUid) {
        return;
      }
      const referenceEntry = mergeLocalRecord(detail.record, { promoteToReference: true, broadcast: false });
      if (referenceEntry && user && shouldUseFirestore) {
        void persistReferenceEntry(referenceEntry, new Date().toISOString());
      }
    };

    window.addEventListener(REFERENCE_SYNC_EVENT, handler as EventListener);
    return () => window.removeEventListener(REFERENCE_SYNC_EVENT, handler as EventListener);
  }, [mergeLocalRecord, persistReferenceEntry, setLocalRecords, shouldUseFirestore, user]);

  const handleGenerate = (action: "primary" | "remix") => {
    const execute = async () => {
      const guard = startGeneration();
      setCurrentRequestId(guard.requestId);

      // Set up 30-second timeout fallback
      const timeoutId = setTimeout(() => {
        console.warn('Generation timeout after 30 seconds, forcing completion');
        guard.onError('Generation timeout - please try again');
        clearActiveGuard();
        setCurrentRequestId(null);
      }, 30000);

      setActiveGuard({
        requestId: guard.requestId,
        onSuccess: guard.onSuccess,
        onError: guard.onError,
        timeoutId
      });

      const fallbackCandidate = selectedRecord ?? historyRecords[0] ?? null;
      const primaryReferenceRecord = referenceRecord ?? null;
      const referenceCandidate = primaryReferenceRecord ?? fallbackCandidate;


      const normalizedCameraSettings = normalizeCameraSettings(
        cameraAngle,
        subjectDirection,
        cameraDirection,
        zoomLevel
      );

      const apertureLabel = formatAperture(aperture);
      const effectiveCameraAngle = normalizedCameraSettings.angle;
      const subjectDirectionSetting = normalizedCameraSettings.subjectDirection;
      const cameraDirectionSetting = normalizedCameraSettings.cameraDirection;
      const zoomSetting = normalizedCameraSettings.zoom;

      const cameraPayload: CameraSettingsPayload = {
        aperture: apertureLabel,
        ...(effectiveCameraAngle ? { angle: effectiveCameraAngle } : {}),
        ...(subjectDirectionSetting ? { subjectDirection: subjectDirectionSetting } : {}),
        ...(cameraDirectionSetting ? { cameraDirection: cameraDirectionSetting } : {}),
        ...(zoomSetting ? { zoom: zoomSetting } : {})
      };
      const cameraGuidance = buildCameraAdjustmentInstruction(normalizedCameraSettings);
      const aspectRatioValue = aspectRatio;
      const shouldApplyAspectRatio = aspectRatioValue !== DEFAULT_ASPECT_RATIO;
      const aspectRatioLabel = getAspectRatioLabel(aspectRatioValue);

      const referenceImageForRequest =
        primaryReferenceRecord?.imageUrl ??
        primaryReferenceRecord?.originalImageUrl ??
        referenceImageState.url ??
        referenceCandidate?.originalImageUrl ??
        referenceCandidate?.imageUrl ??
        null;

      const referenceMetadata = (referenceCandidate?.metadata ?? {}) as { referenceId?: string | null };
      const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

      // Define mode variables
      const isCameraMode = activeMode === "camera";
      const isLightingMode = activeMode === "lighting";
      const isPoseMode = activeMode === "pose";

      const lightingGuidance = isLightingMode ? buildLightingInstruction(lightingSelections) : null;
      const poseGuidance = isPoseMode ? buildPoseInstruction(poseSelections) : null;
      const applyLightingGuidanceTo = (value: string | null | undefined) =>
        isLightingMode ? combinePromptWithGuidance(value, lightingGuidance) : value ?? "";
      const applyPoseGuidanceTo = (value: string | null | undefined) =>
        isPoseMode ? combinePromptWithGuidance(value, poseGuidance) : value ?? "";

      const hasCameraReference = Boolean(referenceImageForRequest || uniqueGalleryReferences.length);
      const cameraPromptFallback = buildCameraPrompt({ settings: normalizedCameraSettings });
      const defaultCameraFallback = cameraPromptFallback;
      const hasCameraPromptFallback = Boolean(defaultCameraFallback && defaultCameraFallback.trim().length);

      const effectiveNegativePrompt = isCameraMode
        ? [negativePrompt, CAMERA_MODE_NEGATIVE_GUARD]
            .filter(value => value && value.trim().length)
            .join(", ")
        : negativePrompt;

      const hasLightingInstruction = Boolean(isLightingMode && lightingGuidance && lightingGuidance?.trim().length);
      const hasPoseInstruction = Boolean(isPoseMode && poseGuidance && poseGuidance?.trim().length);

      if (
        !prompt &&
        !refinedPrompt &&
        !(isCameraMode && hasCameraPromptFallback) &&
        !(isLightingMode && hasLightingInstruction) &&
        !(isPoseMode && hasPoseInstruction)
      ) {
        toast.error(
          isLightingMode
            ? "조명 및 배색 프리셋을 선택하거나 프롬프트를 입력해주세요."
            : isPoseMode
              ? "포즈/감정 프리셋을 선택하거나 프롬프트를 입력해주세요."
              : "프롬프트를 입력해주세요."
       );
       guard.onError("validation");
        clearActiveGuard();
        setCurrentRequestId(null);
        return;
      }

      const cameraOnlyPrompt = isCameraMode
        ? applyCameraPromptDirectives(null, cameraGuidance)
        : null;

      // Clean base prompt to avoid accumulated history
      const getCleanBasePrompt = (candidate: GeneratedImageDocument | null): string => {
        if (!candidate?.promptMeta) {
          return hasCameraPromptFallback ? defaultCameraFallback : prompt;
        }

        // If rawPrompt is a system message, try to get actual user prompt
        const rawPrompt = candidate.promptMeta.rawPrompt;
        if (rawPrompt === "사용자 기준 이미지 업로드" || !rawPrompt || rawPrompt.trim().length === 0) {
          return hasCameraPromptFallback ? defaultCameraFallback : prompt;
        }

        // Remove accumulated "Apply the following adjustments:" sections
        const lines = rawPrompt.split('\n');
        const cleanLines = lines.filter(line => !line.startsWith('Apply the following adjustments:'));
        const cleanPrompt = cleanLines.join('\n').trim();

        return cleanPrompt || (hasCameraPromptFallback ? defaultCameraFallback : prompt);
      };

      const basePromptForRemixRaw = getCleanBasePrompt(referenceCandidate);
      const userPromptInput = refinedPrompt || prompt;
      const hasUserPrompt = Boolean(userPromptInput && userPromptInput.trim().length);
      const defaultPromptFallback =
        isCameraMode
          ? defaultCameraFallback
          : isLightingMode
            ? LIGHTING_MODE_BASE_PROMPT
            : CHARACTER_BASE_PROMPT_FALLBACK;
      let basePromptForRemix: string;
      let basePromptDefault: string;

      if (isCameraMode) {
        const effectiveCameraPrompt = cameraOnlyPrompt ?? CAMERA_MODE_DEFAULT_DIRECTIVE;
        basePromptForRemix = effectiveCameraPrompt;
        basePromptDefault = effectiveCameraPrompt;
      } else {
        const basePromptDefaultRaw = hasUserPrompt ? userPromptInput : defaultPromptFallback;
        basePromptForRemix = combinePromptWithGuidance(basePromptForRemixRaw, cameraGuidance);
        basePromptDefault = combinePromptWithGuidance(basePromptDefaultRaw, cameraGuidance);
      }

      // Remove duplicate mode adjustments - they will be applied later in the new logic
      const basePrompt =
        action === "remix"
          ? basePromptForRemix && basePromptForRemix.trim().length
            ? basePromptForRemix
            : basePromptDefault
          : basePromptDefault;
      const userInstruction = action === "remix" && !isCameraMode ? prompt : undefined;

      // Define rawPromptForRequest for API call
      const rawPromptForRequest = basePrompt;

      const primaryModel = "imagen-3.0-generate-002";
      const previewModel = "gemini-2.5-flash-image-preview";


      // Build prompt components separately
      const currentBasePrompt = action === "remix" ? basePrompt : basePromptDefault;

      // Check if lighting adjustments are from presets (not user input)
      const hasLightingPresets = Object.values(lightingSelections).some(selections =>
        selections.length > 0 && !selections.every(s => s === "default")
      );

      // Collect mode-specific adjustments (only from presets, not user input)
      const modeAdjustments = {
        camera: (activeMode === "camera" && cameraGuidance) ? cameraGuidance : undefined,
        pose: (isPoseMode && poseGuidance) ? poseGuidance : undefined,
        // Only include lighting guidance if it's from preset selection, not user input
        lighting: (isLightingMode && lightingGuidance && hasLightingPresets) ? lightingGuidance : undefined
      };

      // Build the prompt step by step
      let promptToSend = currentBasePrompt;

      // Apply mode adjustments to base prompt
      if (modeAdjustments.camera) {
        promptToSend = applyCameraPromptDirectives(promptToSend, cameraGuidance);
      }
      if (modeAdjustments.pose) {
        promptToSend = applyPoseGuidanceTo(promptToSend);
      }
      if (modeAdjustments.lighting) {
        promptToSend = applyLightingGuidanceTo(promptToSend);
      }

      // Handle user instructions for remix actions
      const currentUserInstructions: string[] = [];
      if (action === "remix" && userInstruction && userInstruction.trim().length) {
        currentUserInstructions.push(userInstruction.trim());
        promptToSend = `${promptToSend}\nApply the following adjustments: ${userInstruction}`;
      }

      let promptSummary: string | undefined;
      let promptCameraNotes: string | undefined;
      let promptGeneratedBy: "manual" | "gpt-manual" | "gpt-auto" = "manual";

      // Handle GPT prompt generation
      if (useGptPrompt) {
        const gptResult = await requestGptPrompt({
          basePrompt: promptToSend,
          userPrompt: userInstruction,
          negativePrompt: effectiveNegativePrompt,
          angle: effectiveCameraAngle,
          aperture: apertureLabel,
          aspectRatio: shouldApplyAspectRatio ? aspectRatioValue : undefined,
          gallery: uniqueGalleryReferences,
          subjectDirection: subjectDirectionSetting,
          cameraDirection: cameraDirectionSetting,
          zoom: zoomSetting,
          source: "gpt-auto"
        });

        if (gptResult?.finalPrompt) {
          promptToSend = gptResult.finalPrompt;
          promptSummary = gptResult.summary;
          promptCameraNotes = gptResult.cameraNotes;
          promptGeneratedBy = isCameraMode ? "manual" : "gpt-auto";
        } else {
          promptGeneratedBy = "manual";
        }
      }

      // Create new prompt details for history
      const actualUserPrompt = action === "remix" ? prompt : (refinedPrompt || prompt);
      const newPromptDetails: PromptDetails = {
        basePrompt: actualUserPrompt || currentBasePrompt,
        userInstructions: currentUserInstructions.length > 0 ? currentUserInstructions : undefined,
        modeAdjustments: Object.values(modeAdjustments).some(Boolean) ? modeAdjustments : undefined,
        gptGenerated: promptSummary || promptCameraNotes ? {
          summary: promptSummary,
          cameraNotes: promptCameraNotes,
          finalPrompt: useGptPrompt ? promptToSend : undefined
        } : undefined,
        source: promptGeneratedBy,
        timestamp: new Date().toISOString()
      };

      // Update the last prompt details for future reference
      setLastPromptDetails(newPromptDetails);

      if (action === "remix" && !referenceImageForRequest) {
        toast.error("기준 이미지를 먼저 업로드하거나 생성해주세요.");
        guard.onError("missing-reference");
        clearActiveGuard();
        setCurrentRequestId(null);
        return;
      }

      const isCreateAction = action === "primary" && activeMode === "create";
      const baseModel = isCreateAction ? primaryModel : previewModel;
      const shouldUsePreview = Boolean(referenceImageForRequest) && action !== "primary";
      const targetModel = shouldUsePreview ? previewModel : baseModel;

      const generationOptions: Record<string, unknown> = {
        action,
        model: targetModel,
        outputMimeType: "image/png"
      };

      if (referenceImageForRequest) {
        generationOptions.referenceImageUrl = referenceImageForRequest;
      }
      if (shouldApplyAspectRatio) {
        generationOptions.aspectRatio = aspectRatioValue;
      }

      if (uniqueGalleryReferences.length) {
        generationOptions.referenceGallery = uniqueGalleryReferences;
      }

      try {

        const result = await callGenerateApi(
          {
            prompt: rawPromptForRequest,
            refinedPrompt: promptToSend,
            negativePrompt: effectiveNegativePrompt,
            mode: activeMode,
            camera: cameraPayload,
            options: generationOptions
          },
          guard.signal
        );


        if (!result.ok) {
          toast.error("이미지 생성에 실패했습니다.", {
            description: result.reason ?? "잠시 후 다시 시도해주세요."
          });
          guard.onError(result.reason ?? "generate-failed");
          clearActiveGuard();
          setCurrentRequestId(null);
          return;
        }

        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `local-${Date.now()}`;
        const now = new Date().toISOString();
        const baseImage = result.base64Image ?? result.imageUrl;
        if (!baseImage) {
          toast.error("이미지 데이터를 찾을 수 없습니다.");
          guard.onError("missing-image");
          clearActiveGuard();
          setCurrentRequestId(null);
          return;
        }

        let storedImageUrl = baseImage;
        let storedThumbnailUrl = baseImage;
        const beforeUrl = referenceImageForRequest ?? undefined;

        const referenceSourceId = primaryReferenceRecord
          ? referenceMetadata.referenceId ??
            (primaryReferenceRecord.id !== REFERENCE_IMAGE_DOC_ID ? primaryReferenceRecord.id : null)
          : fallbackCandidate?.id ?? null;

        const metadataPayload: Record<string, unknown> = {
          camera: getCameraAngleLabel(effectiveCameraAngle),
          aperture: apertureLabel,
          subjectDirection: getDirectionalLabel(subjectDirectionSetting, DEFAULT_SUBJECT_DIRECTION),
          cameraDirection: getDirectionalLabel(cameraDirectionSetting, DEFAULT_CAMERA_DIRECTION),
          zoom: getDirectionalLabel(zoomSetting, DEFAULT_ZOOM_LEVEL),
          aspectRatio: aspectRatioLabel,
          action,
          referenceId: referenceSourceId,
          promptGeneratedBy,
          negativePrompt: effectiveNegativePrompt
        };
        if (promptSummary) {
          metadataPayload.promptSummary = promptSummary;
        }
        if (promptCameraNotes) {
          metadataPayload.promptCameraNotes = promptCameraNotes;
        }
        if (isLightingMode) {
          metadataPayload.lighting = cloneLightingSelections(lightingSelections);
        }
        if (isPoseMode) {
          metadataPayload.pose = clonePoseSelections(poseSelections);
        }
        if (uniqueGalleryReferences.length) {
          metadataPayload.referenceGallery = uniqueGalleryReferences;
          metadataPayload.referenceGalleryCount = uniqueGalleryReferences.length;
        }

        if (user && shouldUseFirestore) {
          try {
            const blob = await dataUrlToBlob(baseImage);
            const uploadResult = await uploadUserImage(user.uid, id, blob);
            storedImageUrl = uploadResult.url;
            storedThumbnailUrl = uploadResult.url;
            await saveGeneratedImageDoc(user.uid, id, {
              mode: activeMode,
              status: "completed",
              promptMeta: {
                rawPrompt: rawPromptForRequest,
                refinedPrompt: promptToSend,
                negativePrompt: effectiveNegativePrompt,
                camera: cameraPayload,
                aspectRatio: aspectRatioValue,
                referenceGallery: uniqueGalleryReferences,
                ...(isLightingMode ? { lighting: cloneLightingSelections(lightingSelections) } : {}),
                ...(isPoseMode ? { pose: clonePoseSelections(poseSelections) } : {})
              },
              imageUrl: storedImageUrl,
              thumbnailUrl: storedThumbnailUrl,
              originalImageUrl: storedImageUrl,
              diff: beforeUrl
                ? {
                    beforeUrl,
                    afterUrl: storedImageUrl,
                    sliderLabelBefore: "기준 이미지",
                    sliderLabelAfter: "생성 결과"
                  }
                : undefined,
              metadata: metadataPayload,
              model: targetModel,
              costCredits: result.costCredits,
              createdAtIso: now,
              updatedAtIso: now
            });
          } catch (error) {
            console.error(error);
            toast.error("이미지 결과를 저장하는 중 오류가 발생했습니다.");
          }
        }

        const newRecord: GeneratedImageDocument = {
          id,
          userId: user?.uid ?? "local",
          mode: activeMode,
          promptMeta: {
            rawPrompt: rawPromptForRequest,
            refinedPrompt: promptToSend,
            negativePrompt: effectiveNegativePrompt,
            camera: cameraPayload,
            aspectRatio: aspectRatioValue,
            referenceGallery: uniqueGalleryReferences,
            ...(isLightingMode ? { lighting: cloneLightingSelections(lightingSelections) } : {})
          },
          status: "completed",
          imageUrl: storedImageUrl,
          thumbnailUrl: storedThumbnailUrl,
          originalImageUrl: beforeUrl ?? storedImageUrl,
          diff: beforeUrl
            ? {
                beforeUrl,
                afterUrl: storedImageUrl,
                sliderLabelBefore: "기준 이미지",
                sliderLabelAfter: "생성 결과"
              }
            : undefined,
          metadata: metadataPayload,
          model: targetModel,
          createdAt: now,
          updatedAt: now
        };

        const promoteToReference = !hasReferenceDoc && action === "primary";
        const referenceEntry = mergeLocalRecord(newRecord, { promoteToReference });
        if (referenceEntry && promoteToReference) {
          setReferenceImageOverride(storedImageUrl);
        }

        // Set freshly generated record for immediate display
        setFreshlyGeneratedRecord(newRecord);

        // Clear active guard directly since we're handling success here
        if (activeGuard && activeGuard.requestId === guard.requestId) {
          if (activeGuard.timeoutId) {
            clearTimeout(activeGuard.timeoutId);
          }
          clearActiveGuard();
        }
        guard.onSuccess(newRecord.id);
        selectImageAuto(id, newRecord);
        if (referenceEntry) {
          await persistReferenceEntry(referenceEntry, now);
        }
        const comparisonTargetId = primaryReferenceRecord?.id && primaryReferenceRecord.id !== id
          ? primaryReferenceRecord.id
          : referenceCandidate?.id && referenceCandidate.id !== id
            ? referenceCandidate.id
            : null;
        setComparisonImageId(comparisonTargetId ?? null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          guard.onCancel();
          clearActiveGuard();
          setCurrentRequestId(null);
          return;
        }
        const description = error instanceof Error ? error.message : undefined;
        toast.error("이미지 생성 중 오류가 발생했습니다.", {
          description: description && description !== "generate-failed" ? description : undefined
        });
        guard.onError(error instanceof Error ? error.message : undefined);
        clearActiveGuard();
        setCurrentRequestId(null);
      }
    };

    void execute();
  };
  const handleReferenceUpload = async (file: File) => {
    try {
      const dataUrl = await readFileAsDataURL(file);
      const now = new Date().toISOString();
      const recordId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `upload-${Date.now()}`;

      let storedUrl = dataUrl;

      if (user && shouldUseFirestore) {
        try {
          const blob = await dataUrlToBlob(dataUrl);
          const uploadResult = await uploadUserImage(user.uid, recordId, blob);
          storedUrl = uploadResult.url;
          await saveGeneratedImageDoc(user.uid, recordId, {
            mode: "create",
            status: "completed",
            promptMeta: {
              rawPrompt: "사용자 기준 이미지 업로드",
              refinedPrompt: "사용자 기준 이미지 업로드"
            },
            imageUrl: storedUrl,
            thumbnailUrl: storedUrl,
            originalImageUrl: storedUrl,
            metadata: { upload: true },
            model: "reference-upload",
            createdAtIso: now,
            updatedAtIso: now
          });
        } catch (error) {
          console.error(error);
          toast.error("업로드한 이미지를 저장하는 중 오류가 발생했습니다.");
          return;
        }
      }

      const previousReferenceUrl = referenceImageState.url ?? referenceRecord?.imageUrl ?? referenceRecord?.originalImageUrl ?? null;
      setReferenceImageOverride(storedUrl);

      try {
        await promoteReferenceImage(storedUrl, { recordId, metadata: { upload: true } });
        toast.success("기준 이미지를 추가했습니다.");
      } catch (error) {
        console.error(error);
        setReferenceImageOverride(previousReferenceUrl);
        toast.error("기준 이미지 업로드에 실패했습니다.");
      }
    } catch (error) {
      console.error(error);
      toast.error("기준 이미지 업로드에 실패했습니다.");
    }
  };



  const handleReferenceSlotAdd = () => {
    setReferenceSlots(prev => {
      if (prev.length >= MAX_REFERENCE_SLOT_COUNT) {
        toast.error(`참조 이미지는 최대 ${MAX_REFERENCE_SLOT_COUNT}개까지 추가할 수 있습니다.`);
        return prev;
      }
      return [...prev, createReferenceSlot()];
    });
  };

  const handleReferenceSlotClear = (slotId: string) => {
    const slot = referenceSlots.find(item => item.id === slotId);
    if (!slot?.imageUrl) {
      toast.info("삭제할 참조 이미지가 없습니다.");
      return;
    }

    setReferenceSlots(prev =>
      prev.map(item =>
        item.id === slotId
          ? { ...item, imageUrl: null, updatedAt: new Date().toISOString() }
          : item
      )
    );
    toast.success("참조 이미지를 삭제했습니다.");
  };

  const handleReferenceSlotUpload = async (slotId: string, file: File) => {
    const slot = referenceSlots.find(item => item.id === slotId);
    if (!slot) {
      toast.error("참조 슬롯을 찾을 수 없습니다.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataURL(file);
      let storedUrl = dataUrl;

      if (user && shouldUseFirestore) {
        try {
          const blob = await dataUrlToBlob(dataUrl);
          const uploadResult = await uploadUserImage(user.uid, `reference-slot-${slotId}`, blob);
          storedUrl = uploadResult.url;
        } catch (error) {
          console.error("reference slot upload error", error);
          toast.error("참조 이미지를 업로드하지 못했습니다.");
          return;
        }
      }

      setReferenceSlots(prev =>
        prev.map(item =>
          item.id === slotId
            ? { ...item, imageUrl: storedUrl, updatedAt: new Date().toISOString() }
            : item
        )
      );
      toast.success("참조 이미지를 추가했습니다.");
    } catch (error) {
      console.error("reference slot upload error", error);
      toast.error("참조 이미지 업로드에 실패했습니다.");
    }
  };

  const handleReferenceSlotSelect = async (slotId: string) => {
    const slot = referenceSlots.find(item => item.id === slotId);
    if (!slot?.imageUrl) {
      toast.error("먼저 이미지를 업로드해주세요.");
      return;
    }

    const previousReferenceUrl = referenceImageState.url ?? referenceRecord?.imageUrl ?? referenceRecord?.originalImageUrl ?? null;
    setReferenceImageOverride(slot.imageUrl);

    try {
      await promoteReferenceImage(slot.imageUrl, { metadata: { referenceSlotId: slotId, source: "reference-slot" } });
      setReferenceSlots(prev =>
        prev.map(item =>
          item.id === slotId ? { ...item, updatedAt: new Date().toISOString() } : item
        )
      );
      toast.success("기준 이미지로 설정했습니다.");
    } catch (error) {
      console.error("reference slot select error", error);
      setReferenceImageOverride(previousReferenceUrl);
      toast.error("기준 이미지를 설정하지 못했습니다.");
    }
  };

  type ReferenceRequirement = "none" | "primary" | "any";

  type ViewBatchOutcome = {
    status: "success" | "failed" | "network" | "error" | "canceled";
    label: string;
    reason?: string;
  };

interface RunViewBatchParams {
  views: ViewSpec[];
  actionLabel: string;
  batchLabel: string;
  basePromptDefault: string;
  targetModel: string;
  referenceImageForRequest: string | null;
  uniqueGalleryReferences: string[];
  effectiveCameraAngle: string | undefined;
  cameraPayload: CameraSettingsPayload;
  apertureLabel: string;
  shouldApplyAspectRatio: boolean;
  aspectRatioValue: AspectRatioPreset;
  aspectRatioLabel: string;
  referenceMetadata: { referenceId?: string | null };
  referenceRecord: GeneratedImageDocument | null;
  fallbackCandidate: GeneratedImageDocument | null;
  setPending: (value: boolean) => void;
  referenceRequirement?: ReferenceRequirement;
  missingReferenceMessage?: string;
  promptFallback?: string;
  singleViewGuideline?: string;
  negativePromptEnforcement?: string;
  perViewToast?: boolean;
  parallel?: boolean;
  disableGpt?: boolean;
  onViewProgress?: (view: ViewSpec, index: number, total: number) => void;
  onViewResult?: (
    view: ViewSpec,
    index: number,
    total: number,
    outcome: ViewBatchOutcome
  ) => void;
  onRecordGenerated?: (record: GeneratedImageDocument) => void;
  interRequestDelayMs?: number;
  abortSignal?: AbortSignal;
}

const runViewBatch = async ({
  views,
  actionLabel,
  batchLabel,
  basePromptDefault,
  targetModel,
  referenceImageForRequest,
  uniqueGalleryReferences,
  effectiveCameraAngle,
  cameraPayload,
  apertureLabel,
  shouldApplyAspectRatio,
  aspectRatioValue,
  aspectRatioLabel,
  referenceMetadata,
  referenceRecord: referenceRecordParam,
  fallbackCandidate,
  setPending,
  referenceRequirement = "none",
  missingReferenceMessage,
  promptFallback = CHARACTER_BASE_PROMPT_FALLBACK,
  singleViewGuideline = CHARACTER_SINGLE_VIEW_GUIDELINE,
  negativePromptEnforcement = CHARACTER_NEGATIVE_ENFORCEMENT,
  perViewToast = false,
  parallel = false,
  disableGpt = false,
  onViewProgress,
  onViewResult,
  onRecordGenerated,
  interRequestDelayMs = 0,
  abortSignal
}: RunViewBatchParams) => {
    if (abortSignal?.aborted) {
      return;
    }

    if (referenceRequirement === "primary" && !referenceImageForRequest) {
      toast.error(missingReferenceMessage ?? "기준 이미지를 먼저 준비해주세요.");
      return;
    }
    if (
      referenceRequirement === "any" &&
      !referenceImageForRequest &&
      uniqueGalleryReferences.length === 0
    ) {
      toast.error(
        missingReferenceMessage ?? "생성을 위해 기준 이미지 혹은 참조 이미지를 먼저 준비해주세요."
      );
      return;
    }

    const targetDimensions = shouldApplyAspectRatio
      ? getAspectRatioDimensions(aspectRatioValue)
      : null;

    const isCameraMode = activeMode === "camera";
    const isLightingMode = activeMode === "lighting";
    const isPoseMode = activeMode === "pose";

    const normalizedBatchCameraSettings = normalizeCameraSettings(
      cameraPayload.angle ?? DEFAULT_CAMERA_ANGLE,
      cameraPayload.subjectDirection ?? DEFAULT_SUBJECT_DIRECTION,
      cameraPayload.cameraDirection ?? DEFAULT_CAMERA_DIRECTION,
      cameraPayload.zoom ?? DEFAULT_ZOOM_LEVEL
    );
    const batchCameraGuidance = buildCameraAdjustmentInstruction(normalizedBatchCameraSettings);
    const batchLightingGuidance = isLightingMode ? buildLightingInstruction(lightingSelections) : null;
    const applyBatchLighting = (value: string | null | undefined) =>
      isLightingMode ? combinePromptWithGuidance(value, batchLightingGuidance) : value ?? "";
    const batchPoseGuidance = isPoseMode ? buildPoseInstruction(poseSelections) : null;
    const applyBatchPose = (value: string | null | undefined) =>
      isPoseMode ? combinePromptWithGuidance(value, batchPoseGuidance) : value ?? "";

    const effectivePromptFallback = isCameraMode
      ? CAMERA_MODE_DEFAULT_DIRECTIVE
      : isLightingMode
        ? LIGHTING_MODE_BASE_PROMPT
        : isPoseMode
          ? POSE_MODE_BASE_PROMPT
          : promptFallback;
    const rawPromptBase = basePromptDefault && basePromptDefault.trim().length
      ? basePromptDefault
      : effectivePromptFallback;

    const rawPromptWithLighting = isLightingMode ? applyBatchLighting(rawPromptBase) : rawPromptBase;
    const rawPromptWithPose = isPoseMode ? applyBatchPose(rawPromptWithLighting) : rawPromptWithLighting;

    const rawPromptForRequest = isCameraMode
      ? applyCameraPromptDirectives(null, batchCameraGuidance)
      : rawPromptWithPose;

    const negativePromptToSend = negativePrompt && negativePrompt.trim().length
      ? `${negativePrompt}, ${negativePromptEnforcement}`
      : negativePromptEnforcement;

    setPending(true);

    const generateSingleView = async (
      view: ViewSpec,
      index: number,
      total: number
    ): Promise<ViewBatchOutcome> => {
      if (abortSignal?.aborted) {
        return { status: "canceled", label: view.label, reason: "aborted" };
      }
      try {
        const cameraSettingsForGuidance = normalizeCameraSettings(
          cameraPayload.angle ?? DEFAULT_CAMERA_ANGLE,
          cameraPayload.subjectDirection ?? DEFAULT_SUBJECT_DIRECTION,
          cameraPayload.cameraDirection ?? DEFAULT_CAMERA_DIRECTION,
          cameraPayload.zoom ?? DEFAULT_ZOOM_LEVEL
        );
        const cameraGuidance = buildCameraAdjustmentInstruction(cameraSettingsForGuidance);

        const viewInstructionSegments = [
          `${view.instruction}.`,
          isCameraMode ? CAMERA_MODE_PROMPT_GUIDELINE : singleViewGuideline,
          cameraGuidance,
          "Keep design consistent with the supplied references."
        ].filter(Boolean) as string[];
        const viewInstruction = viewInstructionSegments.join(" ");

        let viewPrompt = `${rawPromptForRequest}
${viewInstruction}`;
        let promptSummary = lastPromptDetails?.gptGenerated?.summary;
        let promptCameraNotes = lastPromptDetails?.gptGenerated?.cameraNotes;
        let promptGeneratedBy: string = lastPromptDetails?.source ?? "manual";

        const shouldUseGpt = useGptPrompt && !disableGpt;

        if (shouldUseGpt) {
          const gptResult = await requestGptPrompt({
            basePrompt: rawPromptForRequest,
            userPrompt: viewInstruction,
            negativePrompt: negativePromptToSend,
            angle: effectiveCameraAngle,
            aperture: apertureLabel,
            aspectRatio: shouldApplyAspectRatio ? aspectRatioValue : undefined,
            gallery: uniqueGalleryReferences,
            subjectDirection: cameraPayload.subjectDirection,
            cameraDirection: cameraPayload.cameraDirection,
            zoom: cameraPayload.zoom,
            source: "gpt-auto"
          });
          if (gptResult?.finalPrompt) {
            viewPrompt = gptResult.finalPrompt;
            promptSummary = gptResult.summary;
            promptCameraNotes = gptResult.cameraNotes;
            promptGeneratedBy = "gpt-auto";
          } else {
            promptSummary = undefined;
            promptCameraNotes = undefined;
            promptGeneratedBy = "manual";
          }
        }

        if (isCameraMode) {
          viewPrompt = applyCameraPromptDirectives(null, cameraGuidance);
        }
        if (isLightingMode && batchLightingGuidance) {
          viewPrompt = applyBatchLighting(viewPrompt);
        }
        if (isPoseMode && batchPoseGuidance) {
          viewPrompt = applyBatchPose(viewPrompt);
        }

        const generationOptions: Record<string, unknown> = {
          action: actionLabel,
          model: targetModel,
          outputMimeType: "image/png",
          characterView: view.id,
          characterViewLabel: view.label
        };
        if (referenceImageForRequest) {
          generationOptions.referenceImageUrl = referenceImageForRequest;
        }
        if (shouldApplyAspectRatio) {
          generationOptions.aspectRatio = aspectRatioValue;
        }
        if (uniqueGalleryReferences.length) {
          generationOptions.referenceGallery = uniqueGalleryReferences;
        }
        if (targetDimensions) {
          generationOptions.dimensions = targetDimensions;
        }

        let result;
        try {
          result = await callGenerateApi({
            prompt: rawPromptForRequest,
            refinedPrompt: viewPrompt,
            negativePrompt: negativePromptToSend,
            mode: activeMode,
            camera: cameraPayload,
            options: generationOptions
          }, abortSignal);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return { status: "canceled", label: view.label, reason: "aborted" };
          }
          console.error("multi-view request failed", view.id, error);
          toast.error(`${view.label} 뷰 생성 실패`, {
            description: "네트워크 환경을 확인한 후 다시 시도해주세요."
          });
          return { status: "network", label: view.label, reason: "network" };
        }

        if (!result.ok) {
          toast.error(`${view.label} 뷰 생성 실패`, {
            description: result.reason ?? "잠시 후 다시 시도해주세요."
          });
          return {
            status: "failed",
            label: view.label,
            reason: result.reason ?? "unknown"
          };
        }

        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${actionLabel}-${view.id}-${Date.now()}`;
        const now = new Date().toISOString();
        const baseImage = result.base64Image ?? result.imageUrl;
        if (!baseImage) {
          toast.error(`${view.label} 뷰 생성 실패`, {
            description: "이미지 데이터를 찾을 수 없습니다."
          });
          return { status: "failed", label: view.label, reason: "empty" };
        }

        let storedImageUrl = baseImage;
        let storedThumbnailUrl = baseImage;
        const beforeUrl = referenceImageForRequest ?? undefined;

        const referenceSourceId = referenceRecordParam
          ? referenceMetadata.referenceId ??
            (referenceRecordParam.id !== REFERENCE_IMAGE_DOC_ID ? referenceRecordParam.id : null)
          : fallbackCandidate?.id ?? null;

        const metadataPayload: Record<string, unknown> = {
          camera: getCameraAngleLabel(effectiveCameraAngle),
          aperture: apertureLabel,
          subjectDirection: getDirectionalLabel(
            cameraPayload.subjectDirection,
            DEFAULT_SUBJECT_DIRECTION
          ),
          cameraDirection: getDirectionalLabel(
            cameraPayload.cameraDirection,
            DEFAULT_CAMERA_DIRECTION
          ),
          zoom: getDirectionalLabel(cameraPayload.zoom, DEFAULT_ZOOM_LEVEL),
          aspectRatio: aspectRatioLabel,
          action: `${actionLabel}-${view.id}`,
          referenceId: referenceSourceId,
          promptGeneratedBy,
          characterView: view.id,
          characterViewLabel: view.label,
          characterViewInstruction: viewInstruction
        };
        metadataPayload.sequenceIndex = index + 1;
        metadataPayload.sequenceTotal = total;
        if (isLightingMode) {
          metadataPayload.lighting = cloneLightingSelections(lightingSelections);
        }
        if (isPoseMode) {
          metadataPayload.pose = clonePoseSelections(poseSelections);
        }
        if (uniqueGalleryReferences.length) {
          metadataPayload.referenceGallery = uniqueGalleryReferences;
          metadataPayload.referenceGalleryCount = uniqueGalleryReferences.length;
        }
        if (promptSummary) {
          metadataPayload.promptSummary = promptSummary;
        }
        if (promptCameraNotes) {
          metadataPayload.promptCameraNotes = promptCameraNotes;
        }

        if (user && shouldUseFirestore) {
          try {
            const blob = await dataUrlToBlob(baseImage);
            const uploadResult = await uploadUserImage(user.uid, id, blob);
            storedImageUrl = uploadResult.url;
            storedThumbnailUrl = uploadResult.url;
            await saveGeneratedImageDoc(user.uid, id, {
              mode: activeMode,
              status: "completed",
              promptMeta: {
                rawPrompt: rawPromptForRequest,
                refinedPrompt: viewPrompt,
                negativePrompt: negativePromptToSend,
                camera: cameraPayload,
                aspectRatio: aspectRatioValue,
                referenceGallery: uniqueGalleryReferences,
                ...(isLightingMode ? { lighting: cloneLightingSelections(lightingSelections) } : {}),
                ...(isPoseMode ? { pose: clonePoseSelections(poseSelections) } : {})
              },
              imageUrl: storedImageUrl,
              thumbnailUrl: storedImageUrl,
              originalImageUrl: storedImageUrl,
              diff: beforeUrl
                ? {
                    beforeUrl,
                    afterUrl: storedImageUrl,
                    sliderLabelBefore: "기준 이미지",
                    sliderLabelAfter: "생성 결과"
                  }
                : undefined,
              metadata: metadataPayload,
              model: targetModel,
              costCredits: result.costCredits,
              createdAtIso: now,
              updatedAtIso: now
            });
          } catch (error) {
            console.error("multi-view upload error", view.id, error);
          }
        }

        const newRecord: GeneratedImageDocument = {
          id,
          userId: user?.uid ?? "local",
          mode: activeMode,
          promptMeta: {
            rawPrompt: rawPromptForRequest,
            refinedPrompt: viewPrompt,
            negativePrompt: negativePromptToSend,
            camera: cameraPayload,
            aspectRatio: aspectRatioValue,
            referenceGallery: uniqueGalleryReferences
          },
          status: "completed",
          imageUrl: storedImageUrl,
          thumbnailUrl: storedImageUrl,
          originalImageUrl: beforeUrl ?? storedImageUrl,
          diff: beforeUrl
            ? {
                beforeUrl,
                afterUrl: storedImageUrl,
                sliderLabelBefore: "기준 이미지",
                sliderLabelAfter: "생성 결과"
              }
            : undefined,
          metadata: metadataPayload,
          model: targetModel,
          createdAt: now,
          updatedAt: now
        };

        mergeLocalRecord(newRecord, { promoteToReference: false });
        selectImageAuto(id, newRecord);
        onRecordGenerated?.(newRecord);
        const batchComparisonTargetId = referenceRecordParam?.id && referenceRecordParam.id !== id
          ? referenceRecordParam.id
          : fallbackCandidate?.id && fallbackCandidate.id !== id
            ? fallbackCandidate.id
            : null;
        setComparisonImageId(batchComparisonTargetId ?? null);

        if (perViewToast) {
          toast.success(`${view.label} 뷰 생성 완료`);
        }

        return { status: "success", label: view.label };
      } catch (error) {
        console.error("multi-view unexpected error", view.id, error);
        toast.error(`${view.label} 뷰 생성 실패`, {
          description: error instanceof Error ? error.message : "알 수 없는 오류"
        });
        return {
          status: "error",
          label: view.label,
          reason: error instanceof Error ? error.message : "unknown"
        };
      }
    };

    try {
      const generationResults: ViewBatchOutcome[] = [];

      if (parallel) {
        generationResults.push(
          ...(await Promise.all(
            views.map((view, index) => {
              onViewProgress?.(view, index, views.length);
              return generateSingleView(view, index, views.length).then(outcome => {
                onViewResult?.(view, index, views.length, outcome);
                return outcome;
              });
            })
          ))
        );
      } else {
        for (let index = 0; index < views.length; index++) {
          const view = views[index];
          onViewProgress?.(view, index, views.length);
          const outcome = await generateSingleView(view, index, views.length);
          generationResults.push(outcome);
          onViewResult?.(view, index, views.length, outcome);
          if (abortSignal?.aborted) {
            break;
          }
          if (interRequestDelayMs > 0 && index < views.length - 1) {
            await new Promise(resolve => setTimeout(resolve, interRequestDelayMs));
          }
        }
      }

      if (abortSignal?.aborted) {
        return;
      }

      const successes = generationResults.filter(result => result.status === "success");
      const failures = generationResults.filter(result => result.status !== "success");

      if (successes.length === 0) {
        toast.error(`${batchLabel} 생성에 실패했습니다.`);
        return;
      }

      if (failures.length) {
        const failedLabels = failures.map(result => result.label).join(", ");
        toast.warning(`일부 뷰 생성 실패: ${failedLabels}`);
      }

      toast.success(`${batchLabel} ${successes.length}장 생성 완료`);
    } finally {
      setPending(false);
    }
  };

  const generateCharacterSet = async (
    args: {
      basePromptDefault: string;
      referenceImageForRequest: string | null;
      uniqueGalleryReferences: string[];
      effectiveCameraAngle: string | undefined;
      cameraPayload: CameraSettingsPayload;
      apertureLabel: string;
      shouldApplyAspectRatio: boolean;
      aspectRatioValue: AspectRatioPreset;
      aspectRatioLabel: string;
      targetModel: string;
      referenceMetadata: { referenceId?: string | null };
      referenceRecord: GeneratedImageDocument | null;
      fallbackCandidate: GeneratedImageDocument | null;
      actionLabel: string;
    },
    guard: ReturnType<typeof startGeneration>,
    context: {
      primaryReferenceRecord: GeneratedImageDocument | null;
      referenceCandidate: GeneratedImageDocument | null;
    }
  ) => {
    let lastRecord: GeneratedImageDocument | null = null;

    try {
      await runViewBatch({
        ...args,
        views: CHARACTER_VIEWS,
        batchLabel: "캐릭터셋",
        setPending: setCharacterBatchPending,
        referenceRequirement: "any",
        missingReferenceMessage: "캐릭터셋 생성을 위해 기준 혹은 참조 이미지를 먼저 준비해주세요.",
        promptFallback: CHARACTER_BASE_PROMPT_FALLBACK,
        singleViewGuideline: CHARACTER_SINGLE_VIEW_GUIDELINE,
        negativePromptEnforcement: CHARACTER_NEGATIVE_ENFORCEMENT,
        perViewToast: true,
        parallel: true,
        onRecordGenerated: record => {
          lastRecord = record;
        },
        abortSignal: guard.signal
      });

      if (guard.signal.aborted) {
        guard.onCancel();
        setCurrentRequestId(null);
        return;
      }

      if (!lastRecord) {
        guard.onError("character-no-result");
        clearActiveGuard();
        setCurrentRequestId(null);
        return;
      }

      guard.onSuccess((lastRecord as GeneratedImageDocument).id);
      setActiveGuard(null);
      const { primaryReferenceRecord, referenceCandidate } = context;
      const comparisonTargetId = primaryReferenceRecord?.id && primaryReferenceRecord.id !== (lastRecord as GeneratedImageDocument).id
        ? primaryReferenceRecord.id
        : referenceCandidate?.id && referenceCandidate.id !== (lastRecord as GeneratedImageDocument).id
          ? referenceCandidate.id
          : null;
      setComparisonImageId(comparisonTargetId ?? null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        guard.onCancel();
        clearActiveGuard();
        setCurrentRequestId(null);
        return;
      }
      guard.onError(error instanceof Error ? error.message : undefined);
      setActiveGuard(null);
      setCurrentRequestId(null);
    }
  };

  const generateView360 = async (
    args: {
      basePromptDefault: string;
      referenceImageForRequest: string | null;
      uniqueGalleryReferences: string[];
      effectiveCameraAngle: string | undefined;
      cameraPayload: CameraSettingsPayload;
      apertureLabel: string;
      shouldApplyAspectRatio: boolean;
      aspectRatioValue: AspectRatioPreset;
      aspectRatioLabel: string;
      targetModel: string;
      referenceMetadata: { referenceId?: string | null };
      referenceRecord: GeneratedImageDocument | null;
      fallbackCandidate: GeneratedImageDocument | null;
      actionLabel: string;
    },
    guard: ReturnType<typeof startGeneration>,
    context: {
      primaryReferenceRecord: GeneratedImageDocument | null;
      referenceCandidate: GeneratedImageDocument | null;
    }
  ) => {
    const total = TURNAROUND_VIEWS.length;
    let lastRecord: GeneratedImageDocument | null = null;
    toast.info("360도 뷰 12컷 생성을 시작합니다. 기준 캐릭터를 유지하며 카메라를 회전합니다.");
    const progressToastId = toast.loading(`360도 뷰 생성 준비 중...`);
    try {
      await runViewBatch({
        ...args,
        views: TURNAROUND_VIEWS,
        batchLabel: "360도 뷰",
        setPending: setView360BatchPending,
        referenceRequirement: "primary",
        missingReferenceMessage: "360도 뷰 생성을 위해 기준 이미지를 먼저 준비해주세요.",
        promptFallback: TURNAROUND_BASE_PROMPT_FALLBACK,
        singleViewGuideline: TURNAROUND_SINGLE_VIEW_GUIDELINE,
        negativePromptEnforcement: TURNAROUND_NEGATIVE_ENFORCEMENT,
        perViewToast: false,
        parallel: false,
        disableGpt: true,
        onViewProgress: (view, index) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            id: progressToastId,
            duration: 5000
          });
        },
        onViewResult: (view, index, _total, outcome) => {
          if (outcome.status === "success") {
            toast.success(`${view.label} (${index + 1}/${total}) 완료`, {
              id: progressToastId,
              duration: 1800
            });
          } else {
            toast.error(`${view.label} 실패`, {
              id: progressToastId,
              description: outcome.reason,
              duration: 2500
            });
          }
        },
        onRecordGenerated: record => {
          lastRecord = record;
        },
        interRequestDelayMs: 1500,
        abortSignal: guard.signal
      });

      if (guard.signal.aborted) {
        guard.onCancel();
        setCurrentRequestId(null);
        return;
      }

      if (!lastRecord) {
        guard.onError("view360-no-result");
        clearActiveGuard();
        setCurrentRequestId(null);
        return;
      }

      guard.onSuccess((lastRecord as GeneratedImageDocument).id);
      setActiveGuard(null);
      const { primaryReferenceRecord, referenceCandidate } = context;
      const comparisonTargetId = primaryReferenceRecord?.id && primaryReferenceRecord.id !== (lastRecord as GeneratedImageDocument).id
        ? primaryReferenceRecord.id
        : referenceCandidate?.id && referenceCandidate.id !== (lastRecord as GeneratedImageDocument).id
          ? referenceCandidate.id
          : null;
      setComparisonImageId(comparisonTargetId ?? null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        guard.onCancel();
        clearActiveGuard();
        setCurrentRequestId(null);
      } else {
        guard.onError(error instanceof Error ? error.message : undefined);
        clearActiveGuard();
        setCurrentRequestId(null);
      }
    } finally {
      toast.dismiss(progressToastId);
    }
  };


  const handleSetReferenceFromHistory = async (recordId: string) => {
    const candidate = mergedRecords.find(record => record.id === recordId);
    if (!candidate) {
      toast.error("선택한 기록을 찾을 수 없습니다.");
      return;
    }

    const now = new Date().toISOString();
    const newUrl = candidate.imageUrl ?? candidate.originalImageUrl ?? null;
    const previousReferenceUrl = referenceImageState.url ?? referenceRecord?.imageUrl ?? referenceRecord?.originalImageUrl ?? null;
    if (newUrl) {
      setReferenceImageOverride(newUrl);
    }

    try {
      const referenceEntry = mergeLocalRecord(candidate, { promoteToReference: true });
      if (referenceEntry) {
        await persistReferenceEntry(referenceEntry, now);
      }
    } catch (error) {
      console.error("history reference select error", error);
      if (newUrl) {
        setReferenceImageOverride(previousReferenceUrl);
      }
      toast.error("기준 이미지를 업데이트하지 못했습니다.");
      return;
    }

    selectImage(recordId);
    toast.success("기준 이미지를 업데이트했습니다.");
  };

  const handleToggleFavorite = async (recordId: string) => {
    const target = mergedRecords.find(record => record.id === recordId);
    if (!target) {
      toast.error("기록을 찾을 수 없습니다.");
      return;
    }

    const nextFavorite = target.metadata?.favorite !== true;

    const updatedRecord: GeneratedImageDocument = {
      ...target,
      metadata: { ...(target.metadata ?? {}), favorite: nextFavorite }
    };

    setLocalRecords(prev => {
      const exists = prev.some(record => record.id === recordId);

      if (exists) {
        return prev.map(record => (record.id === recordId ? updatedRecord : record));
      }

      return [updatedRecord, ...prev];
    });

  if (historyView === "favorite") {
    const nextFavorites = historyRecordsAll
      .map(record => (record.id === recordId ? updatedRecord : record))
      .filter(record => record.metadata?.favorite === true);

    if (!nextFavorite) {
      if (selectedImageId === recordId) {
        const fallbackId = nextFavorites.find(item => item.id !== recordId)?.id ?? null;
        selectImage(fallbackId);
      }
    } else if (!selectedImageId) {
      const firstFavorite = nextFavorites[0];
      if (firstFavorite) {
        selectImage(firstFavorite.id);
      }
    }
  }

    if (user && shouldUseFirestore) {
      try {
        await updateGeneratedImageDoc(user.uid, recordId, {
          metadata: { ...(target.metadata ?? {}), favorite: nextFavorite }
        });
      } catch (error) {
        console.warn("Failed to update favorite flag", error);
      }
    }

    toast.success(nextFavorite ? "즐겨찾기에 추가했습니다." : "즐겨찾기를 해제했습니다.");
  };

  const handleSetComparison = (recordId: string) => {
    setComparisonImageId(current => (current === recordId ? null : recordId));
    const target = mergedRecords.find(record => record.id === recordId);
    if (!target) {
      return;
    }
    if (comparisonImageId === recordId) {
      toast.info("비교 이미지를 해제했습니다.");
    } else {
      toast.success("비교 영역에 이미지를 추가했습니다.");
    }
  };

  const handleDownloadRecord = (recordId: string) => {
    const target = mergedRecords.find(record => record.id === recordId);
    const url = target?.imageUrl ?? target?.originalImageUrl;
    if (!target || !url) {
      toast.error("다운로드할 이미지를 찾을 수 없습니다.");
      return;
    }

    if (typeof window !== "undefined") {
      if (url.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = url;
        link.download = `${target.id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const mediaUrl = url.includes("alt=media") ? url : `${url}${url.includes('?') ? '&' : '?'}alt=media`;
      const downloadUrl = `/api/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(
        `${target.id}.png`
      )}`;

      window.location.assign(downloadUrl);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (recordId === REFERENCE_IMAGE_DOC_ID) {
      handleReferenceRemove();
      return;
    }

    const target = mergedRecords.find(record => record.id === recordId);
    if (!target) {
      toast.error("삭제할 이미지를 찾을 수 없습니다.");
      return;
    }

    setLocalRecords(prev => prev.filter(record => record.id !== recordId));

    if (selectedImageId === recordId) {
      const fallbackId = historyRecords.find(record => record.id !== recordId)?.id ?? null;
      selectImage(fallbackId);
    }

    if (user && shouldUseFirestore) {
      try {
        await deleteGeneratedImageDoc(user.uid, recordId);
        if (target.imageUrl) {
          await deleteUserImage(user.uid, recordId);
        }
      } catch (error) {
        console.warn("Failed to delete remote record", error);
      }
    }

    toast.success("이미지를 삭제했습니다.");
  };

  const handlePreviewRecord = (record: GeneratedImageDocument) => {
    setPreviewRecord(record);
  };

  const handleHistorySelect = useCallback((id: string) => {
    selectImage(id);
  }, [selectImage]);

  const handlePromptChange = (value: string) => {
    setPrompt(value);
    setLastPromptDetails(null);
  };

  const handleRefinedPromptChange = (value: string) => {
    setRefinedPrompt(value);
    setLastPromptDetails(null);
  };

  const handleNegativePromptChange = (value: string) => {
    setNegativePrompt(value);
  };

  const handleCameraAngleChange = (value: string) => {
    setCameraAngle(value);
    setLastPromptDetails(null);
  };

  const handleSubjectDirectionChange = (value: string) => {
    setSubjectDirection(value);
    setLastPromptDetails(null);
  };

  const handleCameraDirectionChange = (value: string) => {
    setCameraDirection(value);
    setLastPromptDetails(null);
  };

  const handleZoomLevelChange = (value: string) => {
    setZoomLevel(value);
    setLastPromptDetails(null);
  };

  const handleResetPresets = () => {
    setCameraAngle(DEFAULT_CAMERA_ANGLE);
    setSubjectDirection(DEFAULT_SUBJECT_DIRECTION);
    setCameraDirection(DEFAULT_CAMERA_DIRECTION);
    setZoomLevel(DEFAULT_ZOOM_LEVEL);
    setAperture(APERTURE_DEFAULT);
    setAspectRatio(DEFAULT_ASPECT_RATIO);
    setLightingSelections({
      illumination: [],
      atmosphere: [],
      time: [],
      cinematic: [],
      artistic: [],
      harmony: [],
      mood: []
    });
    setPoseSelections({ expression: ["default"], posture: ["default"] });
    setLastPromptDetails(null);
    toast.success("프리셋을 초기화했습니다.");
  };

  const handleLightingSelectionsChange = (category: LightingPresetCategory, values: string[]) => {
    setLightingSelections(prev => {
      const unique = Array.from(new Set(values.filter(Boolean)));
      return prev[category].length === unique.length && prev[category].every(item => unique.includes(item))
        ? prev
        : { ...prev, [category]: unique };
    });
    setLastPromptDetails(null);
  };

  const handlePoseSelectionsChange = (category: PosePresetCategory, values: string[]) => {
    setPoseSelections(prev => {
      const unique = Array.from(new Set(values.filter(Boolean)));
      return prev[category].length === unique.length && prev[category].every(item => unique.includes(item))
        ? prev
        : { ...prev, [category]: unique };
    });
    setLastPromptDetails(null);
  };

  const handleApertureChange = (value: number) => {
    const clamped = Math.min(Math.max(value, APERTURE_MIN), APERTURE_MAX);
    setAperture(clamped);
    setLastPromptDetails(null);
  };

  const handleAspectRatioChange = (value: AspectRatioPreset) => {
    setAspectRatio(value);
    setLastPromptDetails(null);
  };

  const requestGptPrompt = async (params?: RequestGptPromptArgs) => {
    const fallbackBasePromptFromParams = params?.basePrompt;
    const defaultAngle = cameraAngle === DEFAULT_CAMERA_ANGLE ? undefined : cameraAngle;
    const apertureLabel = formatAperture(aperture);
    const aspectRatioValue = aspectRatio === DEFAULT_ASPECT_RATIO ? undefined : aspectRatio;
    const subjectDirectionValue =
      subjectDirection === DEFAULT_SUBJECT_DIRECTION ? undefined : subjectDirection;
    const cameraDirectionValue =
      cameraDirection === DEFAULT_CAMERA_DIRECTION ? undefined : cameraDirection;
    const zoomValue = zoomLevel === DEFAULT_ZOOM_LEVEL ? undefined : zoomLevel;
    const galleryFromState = collectReferenceGalleryUrls();
    const mergedParams = {
      basePrompt: refinedPrompt || prompt,
      negativePrompt,
      angle: defaultAngle,
      aperture: apertureLabel,
      aspectRatio: aspectRatioValue,
      gallery: galleryFromState,
      subjectDirection: subjectDirectionValue,
      cameraDirection: cameraDirectionValue,
      zoom: zoomValue,
      source: "gpt-manual" as const,
      ...params
    };

    const {
      basePrompt,
      userPrompt,
      negativePrompt: negative,
      angle,
      aperture: apertureValue,
      aspectRatio: aspectRatioInstruction,
      gallery,
      subjectDirection: subjectDirectionInstruction,
      cameraDirection: cameraDirectionInstruction,
      zoom: zoomInstruction,
      source
    } = mergedParams;

    const resolvedBasePrompt = basePrompt && basePrompt.trim().length
      ? basePrompt
      : fallbackBasePromptFromParams && fallbackBasePromptFromParams.trim().length
        ? fallbackBasePromptFromParams
        : undefined;

    if (!resolvedBasePrompt) {
      toast.error("프롬프트를 입력해주세요.");
      return null;
    }

    const normalizedCameraSettingsForPrompt = normalizeCameraSettings(
      angle ?? DEFAULT_CAMERA_ANGLE,
      subjectDirectionInstruction ?? DEFAULT_SUBJECT_DIRECTION,
      cameraDirectionInstruction ?? DEFAULT_CAMERA_DIRECTION,
      zoomInstruction ?? DEFAULT_ZOOM_LEVEL
    );
    const cameraGuidanceForPrompt = buildCameraAdjustmentInstruction(normalizedCameraSettingsForPrompt);

    let basePromptForRequest = resolvedBasePrompt;
    const isCameraMode = activeMode === "camera";
    const isLightingMode = activeMode === "lighting";
    const isPoseMode = activeMode === "pose";
    const lightingGuidanceForPrompt = isLightingMode ? buildLightingInstruction(lightingSelections) : null;
    const poseGuidanceForPrompt = isPoseMode ? buildPoseInstruction(poseSelections) : null;
    if (isCameraMode) {
      basePromptForRequest = applyCameraPromptDirectives(basePromptForRequest, cameraGuidanceForPrompt);
      const finalPrompt = basePromptForRequest;
      const cameraNotes = cameraGuidanceForPrompt ?? finalPrompt;
      setRefinedPrompt(finalPrompt);
      setLastPromptDetails({
        basePrompt: finalPrompt,
        gptGenerated: { cameraNotes },
        source,
        timestamp: new Date().toISOString()
      });
      return { finalPrompt, summary: undefined, cameraNotes };
    }

    if (isLightingMode) {
      basePromptForRequest = combinePromptWithGuidance(basePromptForRequest, lightingGuidanceForPrompt);
    }
    if (isPoseMode) {
      basePromptForRequest = combinePromptWithGuidance(basePromptForRequest, poseGuidanceForPrompt);
    }

    setGptLoading(true);
    try {
      const response = await fetch("/api/prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          basePrompt: basePromptForRequest,
          userPrompt,
          negativePrompt: negative,
          aspectRatio: aspectRatioInstruction,
          referenceGallery: gallery && gallery.length ? gallery : undefined,
          camera: {
            angle,
            aperture: apertureValue,
            subjectDirection: subjectDirectionInstruction,
            cameraDirection: cameraDirectionInstruction,
            zoom: zoomInstruction
          }
        })
      });

      const data = (await response.json()) as {
        ok: boolean;
        finalPrompt?: string;
        summary?: string;
        cameraNotes?: string;
        reason?: string;
      };

      if (!response.ok || !data.ok || !data.finalPrompt) {
        setLastPromptDetails(null);
        toast.error(data.reason ?? "프롬프트 변환에 실패했습니다.");
        return null;
      }

      setRefinedPrompt(data.finalPrompt);
      setLastPromptDetails({
        basePrompt: data.finalPrompt,
        gptGenerated: {
          summary: data.summary,
          cameraNotes: data.cameraNotes,
          finalPrompt: data.finalPrompt
        },
        source,
        timestamp: new Date().toISOString()
      });
      return data;
    } catch (error) {
      console.error("requestGptPrompt error", error);
      setLastPromptDetails(null);
      toast.error("프롬프트 생성 중 오류가 발생했습니다.");
      return null;
    } finally {
      setGptLoading(false);
    }
  };

  const handleReferenceRemove = () => {
    if (!referenceRecord) {
      toast.info("삭제할 기준 이미지가 없습니다.");
      return;
    }

    const referenceId = referenceRecord.id ?? REFERENCE_IMAGE_DOC_ID;

    if (user && shouldUseFirestore) {
      deleteGeneratedImageDoc(user.uid, referenceId).catch(error => {
        console.warn("Failed to delete reference document", error);
      });
      deleteUserImage(user.uid, referenceId).catch(error => {
        console.warn("Failed to delete reference image", error);
      });
    }

    setLocalRecords(prev => prev.filter(record => record.id !== REFERENCE_IMAGE_DOC_ID));
    broadcastReferenceUpdate(null, "studio");
    setReferenceImageOverride(null);
    toast.success("기준 이미지를 삭제했습니다.");
  };

  const handleRefinePrompt = async () => {
    const gallery = collectReferenceGalleryUrls();
    const normalizedCameraSettings = normalizeCameraSettings(
      cameraAngle,
      subjectDirection,
      cameraDirection,
      zoomLevel
    );
    const hasCameraReference = Boolean(referenceRecord || gallery.length);
    const cameraPromptFallback = buildCameraPrompt({
      settings: normalizedCameraSettings
    });

    const baseForGpt = (() => {
      const refined = refinedPrompt && refinedPrompt.trim().length ? refinedPrompt : null;
      if (refined) {
        return refined;
      }
      const raw = prompt && prompt.trim().length ? prompt : null;
      if (raw) {
        return raw;
      }
      if (activeMode === "camera") {
        return cameraPromptFallback;
      }
      if (activeMode === "lighting") {
        return LIGHTING_MODE_BASE_PROMPT;
      }
      return null;
    })();

    if (!baseForGpt) {
      toast.error("프롬프트를 입력해주세요.");
      return;
    }

    const result = await requestGptPrompt({
      basePrompt: baseForGpt,
      source: "gpt-manual",
      aspectRatio: aspectRatio === DEFAULT_ASPECT_RATIO ? undefined : aspectRatio,
      gallery
    });
    if (result) {
      toast.success("GPT가 프롬프트를 보정했습니다.");
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="border-b bg-gradient-to-r from-background via-background to-background/95 shadow-sm">
        <div className="flex items-center justify-between px-8 py-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold text-foreground tracking-tight">작업 공간</h2>
            <p className="text-sm text-muted-foreground">프롬프트 작성부터 결과 비교까지 한 번에 관리하세요.</p>
          </div>
          <div className="hidden items-center gap-3 text-sm text-muted-foreground md:flex">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium">
                {loading ? "기록 동기화 중" : `최근 기록 ${historyRecords.length}건`}
              </span>
            </div>
          </div>
        </div>
        <div className="border-t bg-muted/60 backdrop-blur-sm">
          <Tabs value={activeMode} onValueChange={value => setActiveMode(value as GenerationMode)}>
            <div className="px-4 py-3">
              <TabsList className="flex flex-wrap gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-1 shadow-sm border">
                {MODES.map(mode => (
                  mode.href ? (
                    <Link
                      key={mode.id}
                      href={mode.href}
                      className={cn(
                        "rounded-lg border border-transparent px-3 py-2 text-xs transition-all duration-200",
                        "bg-background/70 text-foreground hover:bg-primary/10 hover:border-primary/20",
                        "flex flex-col text-center shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                      )}
                    >
                      <span className="font-medium leading-none">{mode.label}</span>
                    </Link>
                  ) : (
                    <TabsTrigger
                      key={mode.id}
                      value={mode.id}
                      className={cn(
                        "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg",
                        "rounded-lg border border-transparent px-3 py-2 text-xs transition-all duration-200",
                        "bg-background/50 text-muted-foreground hover:bg-background/70 hover:text-foreground",
                        "data-[state=active]:border-primary/30 hover:shadow-sm transform hover:-translate-y-0.5",
                        "flex flex-col text-center"
                      )}
                    >
                      <span className="font-medium leading-none">{mode.label}</span>
                    </TabsTrigger>
                  )
                ))}
              </TabsList>
            </div>
          </Tabs>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex flex-1 gap-0 p-4 lg:flex-row flex-col"
      >
        {/* Left Panel - Prompt Panel */}
        <div
          className={cn(
            "flex-shrink-0 relative",
            "lg:block hidden", // Hide on mobile, show on desktop
            resizable.isCollapsed.left && "lg:hidden"
          )}
          style={{
            width: `${resizable.leftWidth}px`
          }}
        >
          {/* Panel Collapse Button */}
          <button
            onClick={resizable.toggleLeftPanel}
            className={cn(
              "absolute top-4 -right-3 z-10 w-6 h-6 rounded-full",
              "bg-background border border-border shadow-sm",
              "flex items-center justify-center text-xs",
              "hover:bg-accent transition-colors"
            )}
            title="패널 접기"
          >
            ←
          </button>
          <PromptPanel
            mode={activeMode}
            prompt={prompt}
            refinedPrompt={refinedPrompt}
            negativePrompt={negativePrompt}
            cameraAngle={cameraAngle}
            aperture={aperture}
            aspectRatio={aspectRatio}
            subjectDirection={subjectDirection}
            cameraDirection={cameraDirection}
            zoomLevel={zoomLevel}
            useGpt={useGptPrompt}
            onToggleGpt={() => setUseGptPrompt(prev => !prev)}
            gptLoading={gptLoading}
            onPromptChange={handlePromptChange}
            onRefinedPromptChange={handleRefinedPromptChange}
            onNegativePromptChange={handleNegativePromptChange}
            onCameraAngleChange={handleCameraAngleChange}
            onApertureChange={handleApertureChange}
            onAspectRatioChange={handleAspectRatioChange}
            onSubjectDirectionChange={handleSubjectDirectionChange}
            onCameraDirectionChange={handleCameraDirectionChange}
            onZoomLevelChange={handleZoomLevelChange}
            lightingSelections={lightingSelections}
            onLightingSelectionsChange={handleLightingSelectionsChange}
            poseSelections={poseSelections}
            onPoseSelectionsChange={handlePoseSelectionsChange}
            onResetPresets={handleResetPresets}
            onGenerate={handleGenerate}
            onRefinePrompt={handleRefinePrompt}
            generating={isGenerating || characterBatchPending || view360BatchPending}
          />
        </div>

        {/* Left Panel Expand Button (when collapsed) */}
        {resizable.isCollapsed.left && (
          <div className="hidden lg:flex">
            <button
              onClick={resizable.toggleLeftPanel}
              className={cn(
                "w-6 h-full flex items-center justify-center",
                "bg-background border-r border-border",
                "hover:bg-accent transition-colors",
                "text-xs"
              )}
              title="패널 펼치기"
            >
              →
            </button>
          </div>
        )}

        {/* Left Drag Handle */}
        {!resizable.isCollapsed.left && (
          <div className="hidden lg:flex">
            <DragHandle
              orientation="vertical"
              onDrag={resizable.handleLeftDrag}
              onDragEnd={() => {}}
              onDoubleClick={resizable.resetToDefault}
            />
          </div>
        )}

        {/* Center Panel - Workspace Panel */}
        <div
          className="flex-1 min-w-0 px-2"
          style={{
            width: `${resizable.centerWidth}px`
          }}
        >
          <WorkspacePanel
          mode={activeMode}
          record={selectedRecord}
          comparisonRecord={comparisonRecord}
          prompt={prompt}
          refinedPrompt={refinedPrompt}
          cameraAngle={cameraAngle}
          aperture={aperture}
          aspectRatio={aspectRatio}
          subjectDirection={subjectDirection}
          cameraDirection={cameraDirection}
          zoomLevel={zoomLevel}
          referenceImageUrl={referenceImageUrl}
          referenceImageKey={referenceImageState.signature}
          isGenerating={isGenerating}
          showGenerationSuccess={showGenerationSuccess}
          successRecordId={successRecordId ?? undefined}
          promptDetails={lastPromptDetails}
          onClickCompare={record => {
            if (!record) {
              return;
            }
            selectImageAuto(record.id, record);
            const comparisonSource = referenceRecord && referenceRecord.id !== record.id
              ? referenceRecord.id
              : comparisonImageId && comparisonImageId !== record.id && mergedRecords.some(item => item.id === comparisonImageId)
                ? comparisonImageId
                : mergedRecords.find(item => item.id !== record.id)?.id ?? null;
            setComparisonImageId(comparisonSource ?? null);
          }}
          onDismissGenerationStatus={() => setCurrentRequestId(null)}
          onClearComparison={() => setComparisonImageId(null)}
          />
        </div>

        {/* Right Drag Handle */}
        {!resizable.isCollapsed.right && (
          <div className="hidden lg:flex">
            <DragHandle
              orientation="vertical"
              onDrag={resizable.handleRightDrag}
              onDragEnd={() => {}}
              onDoubleClick={resizable.resetToDefault}
            />
          </div>
        )}

        {/* Right Panel Expand Button (when collapsed) */}
        {resizable.isCollapsed.right && (
          <div className="hidden lg:flex">
            <button
              onClick={resizable.toggleRightPanel}
              className={cn(
                "w-6 h-full flex items-center justify-center",
                "bg-background border-l border-border",
                "hover:bg-accent transition-colors",
                "text-xs"
              )}
              title="패널 펼치기"
            >
              ←
            </button>
          </div>
        )}

        {/* Right Panel - History Panel */}
        <div
          className={cn(
            "flex-shrink-0 relative",
            "lg:block hidden", // Hide on mobile, show on desktop
            resizable.isCollapsed.right && "lg:hidden"
          )}
          style={{
            width: `${resizable.rightWidth}px`
          }}
        >
          {/* Panel Collapse Button */}
          <button
            onClick={resizable.toggleRightPanel}
            className={cn(
              "absolute top-4 -left-3 z-10 w-6 h-6 rounded-full",
              "bg-background border border-border shadow-sm",
              "flex items-center justify-center text-xs",
              "hover:bg-accent transition-colors"
            )}
            title="패널 접기"
          >
            →
          </button>
          <HistoryPanel
          records={historyRecords}
          selectedId={selectedImageId}
          onSelect={handleHistorySelect}
          referenceImageUrl={referenceImageUrl}
          referenceImageKey={referenceImageState.signature}
          onUploadReference={handleReferenceUpload}
          onRemoveReference={handleReferenceRemove}
          hasReference={hasReference}
          onSetReference={handleSetReferenceFromHistory}
          onToggleFavorite={handleToggleFavorite}
          onDownload={handleDownloadRecord}
          onDelete={handleDeleteRecord}
          comparisonId={comparisonImageId}
          onCompare={handleSetComparison}
          onClearComparison={() => setComparisonImageId(null)}
          view={historyView}
          onChangeView={setHistoryView}
          onPreview={handlePreviewRecord}
          referenceSlots={referenceSlots}
          onReferenceSlotUpload={handleReferenceSlotUpload}
          onReferenceSlotClear={handleReferenceSlotClear}
          onReferenceSlotSelect={handleReferenceSlotSelect}
          onReferenceSlotAdd={handleReferenceSlotAdd}
          referenceSlotsLimit={MAX_REFERENCE_SLOT_COUNT}
          emptyStateMessage={user ? "생성된 이미지가 아직 없습니다." : "로그인하여 생성 기록을 확인하세요."}
          emptyStateFavoriteMessage={user ? "즐겨찾기에 추가한 이미지가 없습니다." : "로그인 후 즐겨찾기를 사용할 수 있습니다."}
          />
        </div>
      </div>

      {previewRecord ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setPreviewRecord(null)}
        >
          <div className="relative h-full w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-xl border border-white/20 bg-black/90 shadow-lg">
            <button
              type="button"
              className="absolute right-4 top-4 rounded-full bg-white/20 px-3 py-1 text-xs text-white backdrop-blur"
              onClick={event => {
                event.stopPropagation();
                setPreviewRecord(null);
              }}
            >
              닫기
            </button>
            {previewRecord.imageUrl ? (
              <img
                src={previewRecord.imageUrl}
                alt={previewRecord.promptMeta?.rawPrompt ?? "preview"}
                className="h-full w-full object-contain"
              />
            ) : previewRecord.originalImageUrl ? (
              <img
                src={previewRecord.originalImageUrl}
                alt={previewRecord.promptMeta?.rawPrompt ?? "preview"}
                className="h-full w-full object-contain"
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}
