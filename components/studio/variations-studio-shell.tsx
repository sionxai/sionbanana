"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { GenerationMode, GeneratedImageDocument } from "@/lib/types";
import {
  APERTURE_DEFAULT,
  DEFAULT_CAMERA_ANGLE,
  DEFAULT_CAMERA_DIRECTION,
  DEFAULT_SUBJECT_DIRECTION,
  DEFAULT_ZOOM_LEVEL
} from "@/lib/camera";
import { DEFAULT_ASPECT_RATIO } from "@/lib/aspect";
import { callGenerateApi } from "@/hooks/use-generate-image";
import { useAuth } from "@/components/providers/auth-provider";
import { deleteUserImage, uploadUserImage } from "@/lib/firebase/storage";
import { deleteGeneratedImageDoc, saveGeneratedImageDoc, updateGeneratedImageDoc } from "@/lib/firebase/firestore";
import { shouldUseFirestore } from "@/lib/env";
import { useGeneratedImages } from "@/hooks/use-generated-images";
import Image from "next/image";
import { LOCAL_STORAGE_KEY } from "@/components/studio/constants";
import {
  HISTORY_SYNC_EVENT,
  broadcastHistoryUpdate,
  mergeHistoryRecords,
  type HistorySyncPayload
} from "@/components/studio/history-sync";
import { usePresetLibrary } from "@/components/studio/preset-library-context";
import { FALLBACK_STORYBOARD_STYLES } from "@/data/storyboard-styles";
import type { StoryboardStyle } from "@/lib/storyboard/types";
import { cn } from "@/lib/utils";

const MAX_VARIATIONS = 30;

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

const VARIATION_TYPE_LABEL: Record<VariationType, string> = {
  camera: "카메라",
  lighting: "조명",
  pose: "포즈",
  external: "외부",
  style: "스타일"
};

export function VariationsStudioShell() {
  const { user } = useAuth();
  const { records, loading } = useGeneratedImages();
  const [localHistory, setLocalHistory] = useState<GeneratedImageDocument[]>([]);
  const [stylePresets, setStylePresets] = useState<StoryboardStyle[]>(FALLBACK_STORYBOARD_STYLES);
  const [styleLoading, setStyleLoading] = useState(false);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [selectedStylePresets, setSelectedStylePresets] = useState<string[]>([]);

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
  const [baseImageFile, setBaseImageFile] = useState<File | null>(null);
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

  const recentVariationRecords = useMemo(() => {
    const merged = mergeHistoryRecords(remoteVariationRecords, localVariationRecords);
    return merged.slice(0, 12);
  }, [localVariationRecords, remoteVariationRecords]);

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
      setBaseImageFile(file);
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
    setBaseImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast.success('기준 이미지가 제거되었습니다.');
  }, []);

  // History action handlers
  const handleToggleFavorite = useCallback(async (recordId: string) => {
    const record = recentVariationRecords.find(r => r.id === recordId);
    if (!record || !user) return;

    const isFavorite = record.metadata?.favorite === true;
    const updatedMetadata = { ...record.metadata, favorite: !isFavorite };

    if (shouldUseFirestore) {
      try {
        await updateGeneratedImageDoc(user.uid, recordId, { metadata: updatedMetadata });
        toast.success(isFavorite ? '즐겨찾기에서 제거했습니다.' : '즐겨찾기에 추가했습니다.');
      } catch (error) {
        console.error('Failed to toggle favorite:', error);
        toast.error('즐겨찾기 변경에 실패했습니다.');
      }
    }
  }, [recentVariationRecords, user]);

  const handleDeleteRecord = useCallback(async (recordId: string) => {
    const record = recentVariationRecords.find(r => r.id === recordId);
    if (!record || !user) return;

    if (shouldUseFirestore) {
      try {
        await deleteGeneratedImageDoc(user.uid, recordId);
        if (record.imageUrl && !record.imageUrl.startsWith('data:')) {
          await deleteUserImage(user.uid, recordId);
        }
        toast.success('이미지가 삭제되었습니다.');
      } catch (error) {
        console.error('Failed to delete image:', error);
        toast.error('이미지 삭제에 실패했습니다.');
      }
    } else {
      setLocalHistory(prev => prev.filter(r => r.id !== recordId));
      const updated = localHistory.filter(r => r.id !== recordId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      toast.success('이미지가 삭제되었습니다.');
    }
  }, [recentVariationRecords, user, localHistory]);

  // Generation handler with retry logic
  const handleStartGeneration = useCallback(async () => {
    if (!baseImage || !baseImageFile || variationItems.length === 0 || !user) {
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

        let retryCount = 0;
        const maxRetries = 2;
        let response: any = null;

        while (retryCount <= maxRetries) {
          try {
            response = await callGenerateApi({
              mode: "remix" as GenerationMode,
              prompt: presetPrompt,
              options: {
                referenceImage: baseImage,
                aspectRatio: DEFAULT_ASPECT_RATIO,
                cameraAngle: DEFAULT_CAMERA_ANGLE,
                cameraDirection: DEFAULT_CAMERA_DIRECTION,
                subjectDirection: DEFAULT_SUBJECT_DIRECTION,
                zoomLevel: DEFAULT_ZOOM_LEVEL,
                aperture: APERTURE_DEFAULT
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
          if (response && response.ok && response.base64Image) {
            // NOTE: 서버(/api/generate)에서 이미 Storage 업로드 및 Firestore 저장을 수행하므로
            // 클라이언트에서 중복 저장하지 않음. base64 이미지를 직접 사용.

            setVariationItems(prev => prev.map(vi =>
              vi.id === item.id ? {
                ...vi,
                status: "completed",
                imageUrl: response.base64Image
              } : vi
            ));

            // Update history (localStorage only)
            const historyRecord = {
              id: item.id,
              imageUrl: response.base64Image,
              prompt: presetPrompt,
              createdAt: new Date().toISOString(),
              metadata: {
                batchType: "variations",
                variationType: item.type,
                variationIndex: item.index,
                variationLabel: presetName
              }
            };

            const existingHistory = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
            const newHistory = mergeHistoryRecords(existingHistory, [historyRecord as any]);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newHistory));
            broadcastHistoryUpdate(newHistory, "variations");
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
  }, [baseImage, baseImageFile, variationItems, user]);

  const canGenerate = baseImage && variationItems.length > 0 && !isGenerating;

  return (
    <div className="flex h-screen bg-background">
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
              <h3 className="text-sm font-medium mb-4">최근 생성된 변형</h3>
              {loading && recentVariationRecords.length === 0 ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : recentVariationRecords.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                  아직 생성된 변형이 없습니다
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                  {recentVariationRecords.map((record) => (
                      <Card key={record.id} className="overflow-hidden group">
                        <CardContent className="p-2">
                          <div className="space-y-2">
                            <div className="aspect-square relative bg-muted rounded-md overflow-hidden">
                              {record.imageUrl && (
                                <Image
                                  src={record.imageUrl}
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
                                    if (record.imageUrl) {
                                      setBaseImage(record.imageUrl);
                                      const file = new File([], 'reference.png');
                                      setBaseImageFile(file);
                                      toast.success('기준 이미지로 설정되었습니다.');
                                    }
                                  }}
                                >
                                  기준이미지 등록
                                </Button>
                                <Button
                                  size="sm"
                                  variant={record.metadata?.favorite ? "secondary" : "outline"}
                                  className="w-full text-xs h-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleFavorite(record.id);
                                  }}
                                >
                                  {record.metadata?.favorite ? '★' : '☆'} 즐겨찾기
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="w-full text-xs h-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (record.imageUrl) {
                                      const link = document.createElement('a');
                                      link.href = record.imageUrl;
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
                                {(record.metadata as any)?.variationLabel || record.promptMeta?.refinedPrompt || "Variation"}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {new Date(record.createdAt).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
