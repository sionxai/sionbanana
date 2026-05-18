"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_GENERATION_OPTIONS,
  GenerationOptionsPanel,
  type GenerationOptionsValue
} from "@/components/studio/generation-options-panel";
import { MAX_IMAGE_ZOOM, MIN_IMAGE_ZOOM, useImagePanZoom } from "@/components/studio/use-image-pan-zoom";
import type { GenerationMode, GeneratedImageDocument } from "@/lib/types";
import {
  APERTURE_DEFAULT,
  DEFAULT_CAMERA_ANGLE,
  DEFAULT_CAMERA_DIRECTION,
  DEFAULT_SUBJECT_DIRECTION,
  DEFAULT_ZOOM_LEVEL,
  formatAperture
} from "@/lib/camera";
import { DEFAULT_ASPECT_RATIO } from "@/lib/aspect";
import { isHistoryRecordFavorite, setHistoryRecordFavorite } from "@/lib/history-records";
import { callGenerateApi } from "@/hooks/use-generate-image";
const LOCAL_AUTH = { user: { uid: "local" } } as const;
const useLocalUser = () => LOCAL_AUTH;
import { useGeneratedImages } from "@/hooks/use-generated-images";
import Image from "next/image";
import { LOCAL_STORAGE_KEY } from "@/components/studio/constants";
import {
  HISTORY_SYNC_EVENT,
  broadcastHistoryUpdate,
  mergeHistoryRecords,
  persistRecordsMerge,
  removeRecordFromLocalStorage,
  type HistorySyncPayload
} from "@/components/studio/history-sync";
import { usePresetLibrary } from "@/components/studio/preset-library-context";
import { FALLBACK_STORYBOARD_STYLES } from "@/data/storyboard-styles";
import type { StoryboardStyle } from "@/lib/storyboard/types";
import { cn } from "@/lib/utils";

const MAX_VARIATIONS = 30;
const INITIAL_HISTORY_VISIBLE_COUNT = 36;
const HISTORY_VISIBLE_INCREMENT = 36;

function getLocalImageId(url?: string | null): string | null {
  const match = url?.match(/^\/api\/images\/([A-Za-z0-9_\-]+)/);
  return match?.[1] ?? null;
}

function getRecordGeneratedImageUrl(record?: GeneratedImageDocument | null): string | null {
  return record?.imageUrl ?? record?.thumbnailUrl ?? record?.originalImageUrl ?? null;
}

function getRecordPromptText(record?: GeneratedImageDocument | null): string {
  return record?.promptMeta?.refinedPrompt || record?.promptMeta?.rawPrompt || "";
}

type VariationType = "camera" | "lighting" | "pose" | "external" | "style";

interface VariationItem {
  id: string;
  index: number;
  type: VariationType;
  preset: any;
  status: "pending" | "generating" | "completed" | "error";
  imageUrl?: string;
  error?: string;
}

type VariationApiImage = {
  id?: string;
  imageUrl?: string;
  base64Image?: string | null;
};

const VARIATION_TYPE_LABEL: Record<VariationType, string> = {
  camera: "카메라",
  lighting: "조명",
  pose: "포즈",
  external: "외부",
  style: "스타일"
};

export function VariationsStudioShell() {
  const { user } = useLocalUser();
  const { records, loading } = useGeneratedImages();
  const [localHistory, setLocalHistory] = useState<GeneratedImageDocument[]>([]);
  const [stylePresets, setStylePresets] = useState<StoryboardStyle[]>(FALLBACK_STORYBOARD_STYLES);
  const [styleLoading, setStyleLoading] = useState(false);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [selectedStylePresets, setSelectedStylePresets] = useState<string[]>([]);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(INITIAL_HISTORY_VISIBLE_COUNT);
  const [previewRecord, setPreviewRecord] = useState<GeneratedImageDocument | null>(null);
  const [imageGenOptions, setImageGenOptions] = useState<GenerationOptionsValue>(DEFAULT_GENERATION_OPTIONS);
  const previewZoom = useImagePanZoom({ min: MIN_IMAGE_ZOOM, max: MAX_IMAGE_ZOOM, wheelRequiresModifier: false });

  useEffect(() => {
    let cancelled = false;
    async function loadStyles() {
      try {
        setStyleLoading(true);
        setStyleError(null);
        const response = await fetch("/api/storyboard/styles");
        if (!response.ok) {
          throw new Error("failed");
        }
        const data = (await response.json().catch(() => ({}))) as { styles?: StoryboardStyle[] } | undefined;
        const styles = Array.isArray(data?.styles) ? data?.styles ?? [] : [];
        if (!cancelled) {
          setStylePresets(styles.length ? styles : FALLBACK_STORYBOARD_STYLES);
        }
      } catch (error) {
        console.warn("[VariationsStudio] failed to load storyboard styles", error);
        if (!cancelled) {
          setStyleError("스타일 정보를 불러오지 못했습니다. 기본 프리셋을 사용합니다.");
          setStylePresets(FALLBACK_STORYBOARD_STYLES);
        }
      } finally {
        if (!cancelled) {
          setStyleLoading(false);
        }
      }
    }

    loadStyles();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load presets from Firestore
  const { cameraGroups, lightingGroups, poseGroups, externalGroups } = usePresetLibrary();

  // Flatten groups into arrays for backward compatibility
  const CAMERA_PRESETS = useMemo(
    () => cameraGroups.flatMap(group => group.options),
    [cameraGroups]
  );

  const LIGHTING_PRESETS = useMemo(
    () =>
      lightingGroups.flatMap(group =>
        group.options.map(opt => ({ id: opt.value, name: opt.label, instruction: opt.prompt }))
      ),
    [lightingGroups]
  );

  const POSE_PRESETS = useMemo(
    () =>
      poseGroups.flatMap(group =>
        group.options
          .filter(opt => opt.value !== "default")
          .map(opt => ({ id: opt.value, name: opt.label, instruction: opt.prompt }))
      ),
    [poseGroups]
  );

  const EXTERNAL_PRESETS = useMemo(
    () => externalGroups.flatMap(group => group.options),
    [externalGroups]
  );

  const STYLE_PRESETS = useMemo(() =>
    stylePresets.map(style => ({
      id: style.id,
      name: style.label,
      instruction: style.prompt?.trim() ?? "",
      description: style.description,
      label: style.label,
      previewImage: style.referenceImageUrl,
      previewGradient: style.previewGradient,
      raw: style
    })),
  [stylePresets]);

  useEffect(() => {
    setSelectedStylePresets(prev => prev.filter(id => STYLE_PRESETS.some(p => p.id === id && !!p.instruction)));
  }, [STYLE_PRESETS]);

  // Base image state
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [basePrompt, setBasePrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preset selection states - arrays for individual selections
  const [selectedCameraPresets, setSelectedCameraPresets] = useState<string[]>([]);
  const [selectedLightingPresets, setSelectedLightingPresets] = useState<string[]>([]);
  const [selectedPosePresets, setSelectedPosePresets] = useState<string[]>([]);
  const [selectedExternalPresets, setSelectedExternalPresets] = useState<string[]>([]);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [variationItems, setVariationItems] = useState<VariationItem[]>([]);

  // Calculate variation items based on selected presets
  const calculatedVariations = useMemo(() => {
    const variations: VariationItem[] = [];
    let index = 1;

    const appendVariation = (
      type: VariationType,
      preset: { id: string; name?: string; label?: string; instruction?: string; description?: string }
    ) => {
      if (index > MAX_VARIATIONS) {
        return;
      }
      const variationId = `${type}-${preset.id}`;
      variations.push({
        id: variationId,
        index,
        type,
        preset,
        status: "pending"
      });
      index += 1;
    };

    selectedCameraPresets.forEach(presetId => {
      const preset = CAMERA_PRESETS.find(p => p.id === presetId);
      if (preset) {
        appendVariation("camera", preset);
      }
    });

    selectedLightingPresets.forEach(presetId => {
      const preset = LIGHTING_PRESETS.find(p => p.id === presetId);
      if (preset) {
        appendVariation("lighting", preset);
      }
    });

    selectedPosePresets.forEach(presetId => {
      const preset = POSE_PRESETS.find(p => p.id === presetId);
      if (preset) {
        appendVariation("pose", preset);
      }
    });

    selectedStylePresets.forEach(presetId => {
      const preset = STYLE_PRESETS.find(p => p.id === presetId);
      if (preset) {
        appendVariation("style", preset);
      }
    });

    selectedExternalPresets.forEach(presetId => {
      const preset = EXTERNAL_PRESETS.find(p => p.id === presetId);
      if (preset) {
        appendVariation("external", preset);
      }
    });

    return variations;
  }, [
    selectedCameraPresets,
    selectedLightingPresets,
    selectedPosePresets,
    selectedStylePresets,
    selectedExternalPresets,
    CAMERA_PRESETS,
    LIGHTING_PRESETS,
    POSE_PRESETS,
    STYLE_PRESETS,
    EXTERNAL_PRESETS
  ]);

  useEffect(() => {
    setVariationItems(prev => {
      if (prev === calculatedVariations) {
        return prev;
      }
      const previousMap = new Map(prev.map(item => [item.id, item]));
      const merged = calculatedVariations.map(item => {
        const existing = previousMap.get(item.id);
        if (!existing) {
          return item;
        }
        return {
          ...item,
          status: existing.status,
          imageUrl: existing.imageUrl,
          error: existing.error
        };
      });
      if (merged.length === prev.length && merged.every((item, index) => item.id === prev[index].id && item.status === prev[index].status && item.imageUrl === prev[index].imageUrl && item.error === prev[index].error)) {
        return prev;
      }
      return merged;
    });
  }, [calculatedVariations]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const loadLocalHistory = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
        if (Array.isArray(stored)) {
          setLocalHistory(stored as GeneratedImageDocument[]);
        }
      } catch (error) {
        console.warn("[Variations] Failed to parse local history:", error);
      }
    };

    loadLocalHistory();

    const handleHistorySync = (event: Event) => {
      const detail = (event as CustomEvent<HistorySyncPayload>).detail;
      if (!detail?.records) {
        return;
      }
      setLocalHistory(prev => mergeHistoryRecords(detail.records as GeneratedImageDocument[], prev));
    };

    window.addEventListener(HISTORY_SYNC_EVENT, handleHistorySync as EventListener);

    return () => window.removeEventListener(HISTORY_SYNC_EVENT, handleHistorySync as EventListener);
  }, []);

  const normalizeTimestamp = useCallback((value: any) => {
    if (!value) return new Date().toISOString();
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed).toISOString();
      }
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Date(value).toISOString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "object" && typeof value.toDate === "function") {
      try {
        return value.toDate().toISOString();
      } catch (error) {
        console.warn("[Variations] Failed to convert timestamp:", error);
      }
    }
    return new Date().toISOString();
  }, []);

  const remoteVariationRecords = useMemo(() => {
    return records
      .map(record => ({
        ...record,
        createdAt: normalizeTimestamp(record.createdAt),
        updatedAt: normalizeTimestamp(record.updatedAt ?? record.createdAt)
      }));
  }, [normalizeTimestamp, records]);

  const localVariationRecords = useMemo(() => {
    return localHistory
      .map(record => ({
        ...record,
        createdAt: normalizeTimestamp(record.createdAt),
        updatedAt: normalizeTimestamp(record.updatedAt ?? record.createdAt)
      }));
  }, [localHistory, normalizeTimestamp]);

  const allRecentImageRecords = useMemo(() => {
    const merged = mergeHistoryRecords(remoteVariationRecords, localVariationRecords);
    return merged.filter(record => Boolean(getRecordGeneratedImageUrl(record)));
  }, [localVariationRecords, remoteVariationRecords]);
  const visibleRecentImageRecords = useMemo(
    () => allRecentImageRecords.slice(0, historyVisibleCount),
    [allRecentImageRecords, historyVisibleCount]
  );
  const hasMoreRecentImages = historyVisibleCount < allRecentImageRecords.length;

  // Base image upload handler
  const handleBaseImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('파일 크기는 10MB 이하여야 합니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setBaseImage(result);
    };
    reader.readAsDataURL(file);
  }, []);

  // Preset selection handlers
  const handleCameraPresetChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value && !selectedCameraPresets.includes(value)) {
      setSelectedCameraPresets(prev => [...prev, value]);
    }
    event.target.value = ""; // Reset select
  }, [selectedCameraPresets]);

  const handleLightingPresetChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value && !selectedLightingPresets.includes(value)) {
      setSelectedLightingPresets(prev => [...prev, value]);
    }
    event.target.value = ""; // Reset select
  }, [selectedLightingPresets]);

  const handlePosePresetChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value && !selectedPosePresets.includes(value)) {
      setSelectedPosePresets(prev => [...prev, value]);
    }
    event.target.value = ""; // Reset select
  }, [selectedPosePresets]);

  const handleExternalPresetChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value && !selectedExternalPresets.includes(value)) {
      setSelectedExternalPresets(prev => [...prev, value]);
    }
    event.target.value = ""; // Reset select
  }, [selectedExternalPresets]);

  const toggleStylePreset = useCallback((styleId: string) => {
    setSelectedStylePresets(prev => {
      if (prev.includes(styleId)) {
        return prev.filter(id => id !== styleId);
      }
      const target = STYLE_PRESETS.find(preset => preset.id === styleId);
      if (!target) {
        return prev;
      }
      if (!target.instruction) {
        toast.error("프롬프트가 없는 스타일은 사용할 수 없습니다.");
        return prev;
      }
      return [...prev, styleId];
    });
  }, [STYLE_PRESETS]);

  // Remove preset handlers
  const removeCameraPreset = useCallback((presetId: string) => {
    setSelectedCameraPresets(prev => prev.filter(id => id !== presetId));
  }, []);

  const removeLightingPreset = useCallback((presetId: string) => {
    setSelectedLightingPresets(prev => prev.filter(id => id !== presetId));
  }, []);

  const removePosePreset = useCallback((presetId: string) => {
    setSelectedPosePresets(prev => prev.filter(id => id !== presetId));
  }, []);

  const removeExternalPreset = useCallback((presetId: string) => {
    setSelectedExternalPresets(prev => prev.filter(id => id !== presetId));
  }, []);

  const removeStylePreset = useCallback((presetId: string) => {
    setSelectedStylePresets(prev => prev.filter(id => id !== presetId));
  }, []);

  // Base image handlers
  const handleRemoveBaseImage = useCallback(() => {
    setBaseImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast.success('기준 이미지가 제거되었습니다.');
  }, []);

  // History action handlers
  const handleToggleFavorite = useCallback(async (recordId: string) => {
    const record = allRecentImageRecords.find(r => r.id === recordId);
    if (!record || !user) return;
    const nextFavorite = !isHistoryRecordFavorite(record);
    const updatedRecord = setHistoryRecordFavorite(record, nextFavorite);

    setLocalHistory(prev => {
      const exists = prev.some(item => item.id === recordId);
      return exists
        ? prev.map(item => (item.id === recordId ? updatedRecord : item))
        : [updatedRecord, ...prev];
    });

    const merged = persistRecordsMerge([updatedRecord]);
    broadcastHistoryUpdate(merged, "variations");
    toast.success(nextFavorite ? "즐겨찾기에 추가했습니다." : "즐겨찾기를 해제했습니다.");
  }, [allRecentImageRecords, user]);

  const handleDeleteRecord = useCallback(async (recordId: string) => {
    const record = allRecentImageRecords.find(r => r.id === recordId);
    if (!record || !user) return;

    setLocalHistory(prev => prev.filter(r => r.id !== recordId));
    removeRecordFromLocalStorage(recordId);
    const localImageId = getLocalImageId(record.imageUrl) ?? recordId;
    if (record.imageUrl?.startsWith("/api/images/")) {
      try {
        await fetch(`/api/images/${localImageId}`, { method: "DELETE" });
      } catch (error) {
        console.warn("[VariationsStudio] Failed to delete local image file", error);
      }
    }
    toast.success('이미지가 삭제되었습니다.');
  }, [allRecentImageRecords, user, localHistory]);

  const handlePreviewRecord = useCallback((record: GeneratedImageDocument) => {
    setPreviewRecord(record);
    previewZoom.reset();
  }, [previewZoom]);

  const closePreviewRecord = useCallback(() => {
    setPreviewRecord(null);
    previewZoom.reset();
  }, [previewZoom]);

  const handleCopyPreviewPrompt = useCallback(async () => {
    const promptText = getRecordPromptText(previewRecord);
    if (!promptText) {
      toast.error("복사할 프롬프트가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(promptText);
      toast.success("프롬프트를 복사했습니다.");
    } catch {
      toast.error("프롬프트 복사에 실패했습니다.");
    }
  }, [previewRecord]);

  const handleSetPreviewAsBaseImage = useCallback(() => {
    const imageUrl = getRecordGeneratedImageUrl(previewRecord);
    if (!imageUrl) {
      toast.error("기준 이미지로 등록할 이미지를 찾을 수 없습니다.");
      return;
    }

    setBaseImage(imageUrl);
    closePreviewRecord();
    toast.success("기준 이미지로 설정되었습니다.");
  }, [closePreviewRecord, previewRecord]);

  const handleDownloadPreviewRecord = useCallback(() => {
    const imageUrl = getRecordGeneratedImageUrl(previewRecord);
    if (!previewRecord || !imageUrl) {
      toast.error("다운로드할 이미지를 찾을 수 없습니다.");
      return;
    }

    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `variation-${previewRecord.id}.png`;
    link.click();
  }, [previewRecord]);

  const handleDeletePreviewRecord = useCallback(async () => {
    if (!previewRecord) {
      return;
    }

    const confirmed = window.confirm("이 이미지를 삭제하시겠습니까?");
    if (!confirmed) {
      return;
    }

    const recordId = previewRecord.id;
    closePreviewRecord();
    await handleDeleteRecord(recordId);
  }, [closePreviewRecord, handleDeleteRecord, previewRecord]);

  // Generation handler with retry logic
  const handleStartGeneration = useCallback(async () => {
    if (!baseImage || variationItems.length === 0 || !user) {
      toast.error('기준 이미지와 프리셋을 선택해주세요.');
      return;
    }

    setIsGenerating(true);

    try {
      const promises = variationItems.map(async (item, index) => {
        // Stagger requests to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, index * 1000));

        setVariationItems(prev => prev.map(vi =>
          vi.id === item.id ? { ...vi, status: "generating" } : vi
        ));

        const presetName = item.preset.name || item.preset.label || item.preset.id || "스타일";
        const presetPrompt = item.preset.instruction || item.preset.description || item.preset.name;

        if (!presetPrompt || typeof presetPrompt !== "string" || !presetPrompt.trim()) {
          setVariationItems(prev => prev.map(vi =>
            vi.id === item.id
              ? {
                  ...vi,
                  status: "error",
                  error: "선택한 프리셋에 사용할 수 있는 프롬프트가 없습니다."
                }
              : vi
          ));
          return;
        }

        const basePromptText = basePrompt.trim();
        const presetPromptText = presetPrompt.trim();
        const variationPrompt = [
          basePromptText,
          `${VARIATION_TYPE_LABEL[item.type]} preset (${presetName}): ${presetPromptText}`
        ]
          .filter(Boolean)
          .join("\n\n");
        const requestPrompt = basePromptText || presetPromptText;
        const requestRefinedPrompt = variationPrompt !== requestPrompt ? variationPrompt : undefined;

        let retryCount = 0;
        const maxRetries = 2;
        let response: any = null;

        while (retryCount <= maxRetries) {
          try {
            response = await callGenerateApi({
              mode: "remix" as GenerationMode,
              prompt: requestPrompt,
              refinedPrompt: requestRefinedPrompt,
              camera: {
                angle: DEFAULT_CAMERA_ANGLE,
                aperture: formatAperture(APERTURE_DEFAULT),
                subjectDirection: DEFAULT_SUBJECT_DIRECTION,
                cameraDirection: DEFAULT_CAMERA_DIRECTION,
                zoom: DEFAULT_ZOOM_LEVEL
              },
              options: {
                referenceImage: baseImage,
                aspectRatio: DEFAULT_ASPECT_RATIO,
                quality: imageGenOptions.quality,
                imageSize: imageGenOptions.size,
                format: imageGenOptions.format,
                moderation: imageGenOptions.moderation,
                count: imageGenOptions.count
              }
            });
            break; // Success, exit retry loop
          } catch (error) {
            retryCount++;
            if (retryCount > maxRetries) {
              throw error; // Final attempt failed
            }
            console.log(`🔄 Retrying ${presetName} (attempt ${retryCount + 1}/${maxRetries + 1})`);
            await new Promise(resolve => setTimeout(resolve, 2000 * retryCount)); // Exponential backoff
          }
        }

        try {
          if (response && response.ok && (response.imageUrl || response.base64Image)) {
            const responseImages = Array.isArray(response.images)
              ? (response.images as VariationApiImage[])
              : [];
            const generatedImages =
              responseImages.length > 0
                ? responseImages
                    .map((image, imageIndex) => ({
                      id:
                        typeof image.id === "string" && image.id.length > 0
                          ? image.id
                          : getLocalImageId(image.imageUrl) ?? `${item.id}-${imageIndex + 1}`,
                      imageUrl: image.imageUrl ?? image.base64Image ?? null
                    }))
                    .filter((image): image is { id: string; imageUrl: string } => Boolean(image.imageUrl))
                : [
                    {
                      id:
                        typeof response.id === "string" && response.id.length > 0
                          ? response.id
                          : getLocalImageId(response.imageUrl ?? response.base64Image) ?? item.id,
                      imageUrl: response.imageUrl ?? response.base64Image ?? null
                    }
                  ].filter((image): image is { id: string; imageUrl: string } => Boolean(image.imageUrl));

            const primaryImage = generatedImages[0];
            if (!primaryImage) {
              throw new Error("이미지 데이터를 찾을 수 없습니다.");
            }

            setVariationItems(prev => prev.map(vi =>
              vi.id === item.id ? {
                ...vi,
                status: "completed",
                imageUrl: primaryImage.imageUrl
              } : vi
            ));

            // Update history (localStorage only)
            const nowIso = new Date().toISOString();
            const historyRecords: GeneratedImageDocument[] = generatedImages.map((image, imageIndex) => ({
              id: image.id,
              userId: "local",
              mode: "remix" as const,
              status: "completed" as const,
              imageUrl: image.imageUrl,
              originalImageUrl: baseImage,
              thumbnailUrl: image.imageUrl,
              prompt: variationPrompt,
              promptMeta: {
                rawPrompt: requestPrompt,
                refinedPrompt: variationPrompt,
                guidance: [presetPromptText]
              },
              createdAt: nowIso,
              updatedAt: nowIso,
              createdAtIso: nowIso,
              updatedAtIso: nowIso,
              model: "gpt-image-2",
              metadata: {
                batchType: "variations",
                variationType: item.type,
                variationIndex: item.index,
                variationLabel: presetName,
                variationItemId: item.id,
                variationCopyIndex: imageIndex + 1,
                variationCopyTotal: generatedImages.length,
                fileId: image.id,
                generationOptions: {
                  quality: imageGenOptions.quality,
                  size: imageGenOptions.size,
                  format: imageGenOptions.format,
                  moderation: imageGenOptions.moderation,
                  count: imageGenOptions.count
                }
              }
            }));

            const merged = persistRecordsMerge(historyRecords);
            broadcastHistoryUpdate(merged, "variations");
          } else {
            throw new Error(response?.reason || '이미지 생성에 실패했습니다.');
          }
        } catch (error) {
          console.error('Variation generation error:', error);
          setVariationItems(prev => prev.map(vi =>
            vi.id === item.id ? {
              ...vi,
              status: "error",
              error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
            } : vi
          ));
        }
      });

      await Promise.all(promises);
      toast.success('모든 변형 이미지 생성이 완료되었습니다!');

    } catch (error) {
      console.error('Batch generation error:', error);
      toast.error('변형 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  }, [baseImage, basePrompt, imageGenOptions, variationItems, user]);

  const canGenerate = Boolean(baseImage && variationItems.length > 0 && !isGenerating);
  const previewImageUrl = getRecordGeneratedImageUrl(previewRecord);
  const previewPromptText = getRecordPromptText(previewRecord);
  const previewZoomPercent = Math.round(previewZoom.scale * 100);

  return (
    <div className="flex h-screen bg-background">
      <GenerationOptionsPanel value={imageGenOptions} onChange={setImageGenOptions} />
      {/* Left Panel - Controls */}
      <div className="flex w-96 flex-col border-r bg-muted/30">
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          <h1 className="text-lg font-semibold">변형 생성</h1>
          <Badge variant="outline">{variationItems.length}/30</Badge>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-4">
            {/* Base Image Upload */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">기준 이미지</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBaseImageUpload}
                  className="hidden"
                  ref={fileInputRef}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1"
                    size="sm"
                  >
                    {baseImage ? '변경' : '업로드'}
                  </Button>
                  {baseImage && (
                    <Button
                      variant="destructive"
                      onClick={handleRemoveBaseImage}
                      size="sm"
                    >
                      삭제
                    </Button>
                  )}
                </div>
                {baseImage && (
                  <div className="relative aspect-square w-full mx-auto">
                    <Image
                      src={baseImage}
                      alt="Base image"
                      fill
                      className="rounded-md object-cover"
                      sizes="(max-width: 384px) 100vw, 384px"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">공통 프롬프트</CardTitle>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  모든 변형에 유지할 캐릭터, 분위기, 품질 조건을 입력하세요. 선택한 프리셋 지시는 이 내용 뒤에 추가됩니다.
                </p>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={basePrompt}
                  onChange={event => setBasePrompt(event.target.value)}
                  placeholder="예: Preserve the same character identity, clean line art, soft cinematic lighting..."
                  className="min-h-28 resize-y text-sm"
                />
              </CardContent>
            </Card>

            {/* Camera Presets - Grouped Dropdowns */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">카메라 프리셋</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cameraGroups.map(group => (
                  <div key={group.id}>
                    <Label htmlFor={`camera-${group.id}`} className="text-xs text-muted-foreground">{group.title}</Label>
                    <select
                      id={`camera-${group.id}`}
                      onChange={handleCameraPresetChange}
                      className="w-full mt-1 p-2 border border-input bg-background rounded-md text-sm"
                    >
                      <option value="">{group.title} 선택...</option>
                      {group.options.filter(p => !selectedCameraPresets.includes(p.id)).map(preset => (
                        <option key={preset.id} value={preset.id}>{preset.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {selectedCameraPresets.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">선택된 프리셋</Label>
                    <div className="space-y-1">
                      {selectedCameraPresets.map(presetId => {
                        const preset = CAMERA_PRESETS.find(p => p.id === presetId);
                        return preset ? (
                          <div key={presetId} className="flex items-center justify-between bg-muted/50 p-2 rounded text-xs">
                            <span>{preset.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeCameraPreset(presetId)}
                              className="h-auto p-1 text-xs"
                            >
                              ✕
                            </Button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lighting Presets - Grouped Dropdowns */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">조명 프리셋</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lightingGroups.map(group => (
                  <div key={group.key}>
                    <Label htmlFor={`lighting-${group.key}`} className="text-xs text-muted-foreground">{group.title}</Label>
                    <select
                      id={`lighting-${group.key}`}
                      onChange={handleLightingPresetChange}
                      className="w-full mt-1 p-2 border border-input bg-background rounded-md text-sm"
                    >
                      <option value="">{group.title} 선택...</option>
                      {group.options.filter(p => !selectedLightingPresets.includes(p.value)).map(preset => (
                        <option key={preset.value} value={preset.value}>{preset.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {selectedLightingPresets.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">선택된 프리셋</Label>
                    <div className="space-y-1">
                      {selectedLightingPresets.map(presetId => {
                        const preset = LIGHTING_PRESETS.find(p => p.id === presetId);
                        return preset ? (
                          <div key={presetId} className="flex items-center justify-between bg-muted/50 p-2 rounded text-xs">
                            <span>{preset.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLightingPreset(presetId)}
                              className="h-auto p-1 text-xs"
                            >
                              ✕
                            </Button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pose Presets - Grouped Dropdowns */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">포즈 프리셋</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {poseGroups.map(group => (
                  <div key={group.key}>
                    <Label htmlFor={`pose-${group.key}`} className="text-xs text-muted-foreground">{group.title}</Label>
                    <select
                      id={`pose-${group.key}`}
                      onChange={handlePosePresetChange}
                      className="w-full mt-1 p-2 border border-input bg-background rounded-md text-sm"
                    >
                      <option value="">{group.title} 선택...</option>
                      {group.options.filter(p => p.value !== "default" && !selectedPosePresets.includes(p.value)).map(preset => (
                        <option key={preset.value} value={preset.value}>{preset.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {selectedPosePresets.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">선택된 프리셋</Label>
                    <div className="space-y-1">
                      {selectedPosePresets.map(presetId => {
                        const preset = POSE_PRESETS.find(p => p.id === presetId);
                        return preset ? (
                          <div key={presetId} className="flex items-center justify-between bg-muted/50 p-2 rounded text-xs">
                            <span>{preset.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removePosePreset(presetId)}
                              className="h-auto p-1 text-xs"
                            >
                              ✕
                            </Button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Style Presets */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">스타일 프리셋</CardTitle>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  영상 프리셋을 활용해 스타일 가이드를 변형으로 생성합니다. 카드를 클릭하여 선택/해제할 수 있습니다.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {styleLoading ? (
                  <div className="rounded-md border border-dashed border-border/60 bg-muted/40 py-4 text-center text-xs text-muted-foreground">
                    스타일 정보를 불러오는 중입니다...
                  </div>
                ) : null}
                {styleError ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                    {styleError}
                  </div>
                ) : null}
                <div className="grid gap-2">
                  {STYLE_PRESETS.map(style => {
                    const isSelected = selectedStylePresets.includes(style.id);
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => toggleStylePreset(style.id)}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg border p-3 text-left transition",
                          "hover:border-primary/60 hover:shadow-sm",
                          isSelected ? "border-primary bg-primary/5" : "border-border/60 bg-background"
                        )}
                      >
                        <div className="relative h-14 w-20 flex-shrink-0 overflow-hidden rounded-md">
                          {style.previewImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={style.previewImage}
                              alt={style.name}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div
                              className={cn(
                                "h-full w-full transition-transform duration-300 group-hover:scale-105",
                                style.previewGradient ?? "from-slate-700 via-slate-900 to-black",
                                "bg-gradient-to-br"
                              )}
                            />
                          )}
                          {isSelected ? (
                            <Badge className="absolute right-1 top-1 text-[10px]" variant="default">
                              선택
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-foreground truncate">{style.name}</span>
                          </div>
                          {style.description ? (
                            <p className="text-[11px] text-muted-foreground line-clamp-2">{style.description}</p>
                          ) : null}
                          {!style.instruction ? (
                            <p className="text-[10px] text-muted-foreground/70">프롬프트 정보가 없어 적용할 수 없습니다.</p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedStylePresets.length > 0 ? (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">선택된 스타일</Label>
                    <div className="space-y-1">
                      {selectedStylePresets.map(presetId => {
                        const preset = STYLE_PRESETS.find(p => p.id === presetId);
                        if (!preset) return null;
                        return (
                          <div key={presetId} className="flex items-center justify-between rounded bg-muted/50 px-3 py-2 text-xs">
                            <span className="truncate">{preset.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeStylePreset(presetId)}
                              className="h-auto p-1 text-xs"
                            >
                              ✕
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* External Presets - Grouped Dropdowns */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">외부 프리셋</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {externalGroups.map(group => (
                  <div key={group.id}>
                    <Label htmlFor={`external-${group.id}`} className="text-xs text-muted-foreground">{group.title}</Label>
                    <select
                      id={`external-${group.id}`}
                      onChange={handleExternalPresetChange}
                      className="w-full mt-1 p-2 border border-input bg-background rounded-md text-sm"
                    >
                      <option value="">{group.title} 선택...</option>
                      {group.options.filter(p => !selectedExternalPresets.includes(p.id)).map(preset => (
                        <option key={preset.id} value={preset.id}>{preset.labelKo || preset.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {selectedExternalPresets.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">선택된 프리셋</Label>
                    <div className="space-y-1">
                      {selectedExternalPresets.map(presetId => {
                        const preset = EXTERNAL_PRESETS.find(p => p.id === presetId);
                        return preset ? (
                          <div key={presetId} className="flex items-center justify-between bg-muted/50 p-2 rounded text-xs">
                            <span>{preset.labelKo || preset.label}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeExternalPreset(presetId)}
                              className="h-auto p-1 text-xs"
                            >
                              ✕
                            </Button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Generate Button */}
            <Button
              onClick={handleStartGeneration}
              disabled={!canGenerate}
              className="w-full"
              size="lg"
            >
              {isGenerating ? '변형 생성 중...' : `${variationItems.length}개 변형 생성`}
            </Button>
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel - Results Grid */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b px-6">
          <h2 className="text-lg font-semibold">변형 결과</h2>
          <div className="text-sm text-muted-foreground">
            {variationItems.filter(item => item.status === "completed").length}/{variationItems.length} 완료
          </div>
        </div>

        {/* Results Grid */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-8">
            {/* Current Variations */}
            <div>
              <h3 className="text-sm font-medium mb-4">현재 변형 생성</h3>
              {variationItems.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                  프리셋을 선택하여 변형을 추가하세요
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {variationItems.map((item) => (
                    <Card key={item.id} className="overflow-hidden">
                      <CardContent className="p-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              {item.index}번
                            </Badge>
                            <Badge
                              variant={
                                item.status === "completed" ? "default" :
                                item.status === "generating" ? "secondary" :
                                item.status === "error" ? "destructive" : "outline"
                              }
                              className="text-xs"
                            >
                              {item.status === "pending" ? "대기" :
                               item.status === "generating" ? "생성중" :
                               item.status === "completed" ? "완료" : "오류"}
                            </Badge>
                          </div>

                          <div className="aspect-square relative bg-muted rounded-md overflow-hidden">
                            {item.imageUrl ? (
                              <Image
                                src={item.imageUrl}
                                alt={`Variation ${item.index}`}
                                fill
                                className="object-cover"
                                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                {item.status === "generating" ? (
                                  <div className="flex flex-col items-center gap-2">
                                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    <span className="text-xs">생성 중...</span>
                                  </div>
                                ) : item.status === "error" ? (
                                  <div className="flex flex-col items-center gap-2 text-destructive">
                                    <span className="text-lg">⚠️</span>
                                    <span className="text-xs">오류 발생</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-2">
                                    <span className="text-lg">⏳</span>
                                    <span className="text-xs">대기 중</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="text-xs space-y-1">
                            <div className="font-medium truncate">{item.preset.name || item.preset.label || item.preset.id}</div>
                            <div className="text-muted-foreground">
                              {VARIATION_TYPE_LABEL[item.type]} 프리셋
                            </div>
                          </div>

                          {item.error && (
                            <div className="text-xs text-destructive p-2 bg-destructive/10 rounded">
                              {item.error}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Generated Images */}
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">최근 생성 이미지</h3>
                {allRecentImageRecords.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {Math.min(historyVisibleCount, allRecentImageRecords.length)}/{allRecentImageRecords.length}
                  </span>
                ) : null}
              </div>
              {loading && visibleRecentImageRecords.length === 0 ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : visibleRecentImageRecords.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                  아직 생성된 이미지가 없습니다
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                    {visibleRecentImageRecords.map((record) => {
                      const imageUrl = getRecordGeneratedImageUrl(record);
                      return (
                        <Card
                          key={record.id}
                          className="overflow-hidden group cursor-zoom-in transition hover:border-primary/50"
                          onClick={() => handlePreviewRecord(record)}
                        >
                          <CardContent className="p-2">
                            <div className="space-y-2">
                              <div className="aspect-square relative bg-muted rounded-md overflow-hidden">
                                {imageUrl && (
                                  <Image
                                    src={imageUrl}
                                    alt={record.promptMeta?.refinedPrompt || "Generated variation"}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 16.67vw"
                                  />
                                )}
                                {/* Hover overlay with actions */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full text-xs h-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (imageUrl) {
                                        setBaseImage(imageUrl);
                                        toast.success('기준 이미지로 설정되었습니다.');
                                      }
                                    }}
                                  >
                                    기준이미지 등록
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={isHistoryRecordFavorite(record) ? "secondary" : "outline"}
                                    className="w-full text-xs h-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleFavorite(record.id);
                                    }}
                                  >
                                    {isHistoryRecordFavorite(record) ? "★" : "☆"} 즐겨찾기
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="w-full text-xs h-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (imageUrl) {
                                        const link = document.createElement('a');
                                        link.href = imageUrl;
                                        link.download = `variation-${record.id}.png`;
                                        link.click();
                                      }
                                    }}
                                  >
                                    다운로드
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="w-full text-xs h-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm('이 이미지를 삭제하시겠습니까?')) {
                                        handleDeleteRecord(record.id);
                                      }
                                    }}
                                  >
                                    삭제
                                  </Button>
                                </div>
                              </div>
                              <div className="text-xs space-y-1">
                                <div className="font-medium truncate">
                                  {(record.metadata as any)?.variationLabel || record.promptMeta?.refinedPrompt || "Generated image"}
                                </div>
                                <div className="text-muted-foreground text-xs">
                                  {new Date(record.createdAt).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  {hasMoreRecentImages ? (
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        onClick={() => setHistoryVisibleCount(count => count + HISTORY_VISIBLE_INCREMENT)}
                      >
                        더 보기
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {previewRecord ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 lg:p-6"
          onClick={closePreviewRecord}
        >
          <div
            className="relative grid h-full max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-xl border border-white/20 bg-background shadow-2xl lg:grid-cols-[minmax(0,1fr)_360px]"
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-4 top-4 z-30 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur transition hover:bg-black/70"
              onClick={event => {
                event.stopPropagation();
                closePreviewRecord();
              }}
            >
              닫기
            </button>
            <div className="flex min-h-0 flex-col bg-black">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-white">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">원본 이미지</p>
                  <p className="truncate text-xs text-white/60">
                    {previewRecord.model} · {new Date(previewRecord.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="mr-14 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => previewZoom.zoomOut()}
                    disabled={previewZoom.scale <= MIN_IMAGE_ZOOM}
                  >
                    축소
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => previewZoom.reset()}
                    disabled={previewZoom.scale === 1}
                  >
                    {previewZoomPercent}%
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => previewZoom.zoomIn()}
                    disabled={previewZoom.scale >= MAX_IMAGE_ZOOM}
                  >
                    확대
                  </Button>
                </div>
              </div>
              <div
                {...previewZoom.bind}
                className={cn(
                  "relative flex min-h-[50vh] flex-1 touch-none select-none items-center justify-center overflow-hidden bg-black",
                  previewZoom.isPanning ? "cursor-grabbing" : "cursor-grab"
                )}
                title="마우스 휠로 확대/축소, 드래그로 이동, 더블클릭으로 원래대로"
              >
                {previewImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewImageUrl}
                    alt={previewPromptText || "preview"}
                    className="max-h-full max-w-full object-contain will-change-transform"
                    draggable={false}
                    style={{
                      transform: `translate(${previewZoom.transform.panX}px, ${previewZoom.transform.panY}px) scale(${previewZoom.transform.scale})`,
                      transformOrigin: "center center"
                    }}
                  />
                ) : (
                  <div className="text-sm text-white/70">이미지를 불러올 수 없습니다.</div>
                )}
              </div>
            </div>
            <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-border bg-card p-4 lg:border-l lg:border-t-0">
              <div className="space-y-1 pr-10 lg:pr-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">생성 기록</p>
                <h2 className="text-base font-semibold text-foreground">프롬프트와 액션</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={handleSetPreviewAsBaseImage} disabled={!previewImageUrl}>
                  기준이미지 등록
                </Button>
                <Button size="sm" variant="outline" onClick={() => void handleCopyPreviewPrompt()} disabled={!previewPromptText}>
                  프롬프트 복사
                </Button>
                <Button size="sm" variant="outline" onClick={handleDownloadPreviewRecord} disabled={!previewImageUrl}>
                  다운로드
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void handleDeletePreviewRecord()}>
                  삭제
                </Button>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">생성 프롬프트</p>
                <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
                  {previewPromptText || "저장된 프롬프트가 없습니다."}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="rounded-lg border bg-background/60 p-2">
                  <p className="font-medium text-foreground">모드</p>
                  <p className="uppercase">{previewRecord.mode}</p>
                </div>
                <div className="rounded-lg border bg-background/60 p-2">
                  <p className="font-medium text-foreground">모델</p>
                  <p>{previewRecord.model}</p>
                </div>
                <div className="rounded-lg border bg-background/60 p-2">
                  <p className="font-medium text-foreground">파일</p>
                  <p>{previewImageUrl?.startsWith("/api/images/") ? "로컬 원본" : "이미지 URL"}</p>
                </div>
                {(previewRecord.metadata as any)?.variationLabel ? (
                  <div className="rounded-lg border bg-background/60 p-2">
                    <p className="font-medium text-foreground">변형</p>
                    <p>{(previewRecord.metadata as any).variationLabel}</p>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
}
