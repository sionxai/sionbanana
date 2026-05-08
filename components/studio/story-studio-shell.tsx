"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Download,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  X
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_GENERATION_OPTIONS,
  GenerationOptionsPanel,
  type GenerationOptionsValue
} from "@/components/studio/generation-options-panel";
import { persistRecordsMerge, broadcastHistoryUpdate } from "@/components/studio/history-sync";
import { MAX_IMAGE_ZOOM, MIN_IMAGE_ZOOM, useImagePanZoom } from "@/components/studio/use-image-pan-zoom";
import { callGenerateApi, type GenerateResponse } from "@/hooks/use-generate-image";
import { ASPECT_RATIO_PRESETS, DEFAULT_ASPECT_RATIO } from "@/lib/aspect";
import { runWithConcurrency } from "@/lib/concurrency";
import { resizeImageToDataUrl } from "@/lib/image-resize";
import { parseStoryMentions } from "@/lib/story-mentions";
import {
  STORY_REFERENCE_SLOT_COUNT,
  findReferenceByHandle,
  getRegisteredHandles,
  loadStoryReferences,
  saveStoryReference,
  subscribeStoryReferences,
  type StoryReference,
  type StoryReferenceLibrary,
  type StoryReferenceRole
} from "@/lib/story-references";
import { TONE_CATEGORY_LABELS, TONE_OPTIONS, type ToneCategory, type ToneOption } from "@/lib/story-tones";
import type { AspectRatioPreset, GeneratedImageDocument } from "@/lib/types";
import { cn } from "@/lib/utils";

type SceneStatus = "idle" | "generating" | "completed" | "error";
type StoryMode = "review" | "instant";

const TONE_CATEGORY_ORDER: ToneCategory[] = ["cinematic", "commercial", "documentary", "vlog"];

type Scene = {
  id: string;
  prompt: string;
  mentions: string[];
  status: SceneStatus;
  resultUrl?: string;
  resultRecord?: GeneratedImageDocument;
  resultFormat?: GenerationOptionsValue["format"];
  error?: string;
};

type SlotUploadHandler = (role: StoryReferenceRole, slotIndex: number, event: ChangeEvent<HTMLInputElement>) => void;

type StoryReferenceUploadResponse =
  | { ok: true; imageUrl: string; id: string }
  | { ok: false; reason?: string };

type StoryboardHandleInput = {
  handle: string;
  role: StoryReferenceRole;
  description?: string;
};

type StoryboardSceneResponse = {
  prompt?: unknown;
  mentions?: unknown;
  invalidMentions?: unknown;
};

type StoryboardResponse =
  | { ok: true; scenes: StoryboardSceneResponse[]; meta?: { model?: string } }
  | { ok: false; reason?: string };

function getRoleSlots(library: StoryReferenceLibrary, role: StoryReferenceRole) {
  return role === "character" ? library.characters : library.locations;
}

function getRoleLabel(role: StoryReferenceRole) {
  return role === "character" ? "인물" : "로케이션";
}

function getSlotUploadKey(role: StoryReferenceRole, slotIndex: number): string {
  return `${role}:${slotIndex}`;
}

function uniqueHandles(handles: string[]): string[] {
  return Array.from(new Set(handles));
}

function formatHandleList(handles: string[]): string {
  return handles.map(handle => `@${handle}`).join(", ");
}

function normalizeHandle(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^@+/, "") : "";
}

function normalizeMentionList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueHandles(value.map(normalizeHandle).filter(Boolean));
}

function getStoryInputReason(storyText: string, library: StoryReferenceLibrary): string | null {
  const trimmed = storyText.trim();
  if (!trimmed) {
    return "스토리를 입력해주세요.";
  }
  if (trimmed.length > 2000) {
    return "스토리는 2000자 이내로 입력해주세요.";
  }
  const parsed = parseStoryMentions(trimmed, library);
  if (parsed.invalid.length) {
    return `등록되지 않은 핸들: ${formatHandleList(uniqueHandles(parsed.invalid))}`;
  }
  const hasUsableReference = flattenReferences(library).some(ref => ref.handle.trim() && ref.imageUrl);
  if (!hasUsableReference) {
    return "이미지가 등록된 핸들이 최소 1개 필요합니다.";
  }
  return null;
}

function validateScenePrompt(prompt: string, library: StoryReferenceLibrary): { mentions: string[]; error: string | null } {
  const parsed = parseStoryMentions(prompt, library);
  if (parsed.invalid.length) {
    return {
      mentions: parsed.mentioned,
      error: `등록되지 않은 핸들: ${formatHandleList(uniqueHandles(parsed.invalid))}`
    };
  }
  if (parsed.mentioned.length === 0) {
    return {
      mentions: [],
      error: "씬에 최소 한 개 이상의 @핸들이 필요합니다."
    };
  }
  if (parsed.mentioned.length > 8) {
    return {
      mentions: parsed.mentioned,
      error: "한 씬에 사용할 수 있는 핸들은 최대 8개입니다."
    };
  }
  const missingImages = parsed.mentioned.filter(handle => {
    const ref = findReferenceByHandle(library, handle);
    return !ref?.imageUrl;
  });
  if (missingImages.length) {
    return {
      mentions: parsed.mentioned,
      error: `이미지가 등록되지 않은 핸들: ${formatHandleList(missingImages)}`
    };
  }
  return { mentions: parsed.mentioned, error: null };
}

function flattenReferences(library: StoryReferenceLibrary): StoryReference[] {
  return [...library.characters, ...library.locations].filter((ref): ref is StoryReference => ref !== null);
}

function buildStoryboardHandles(library: StoryReferenceLibrary): StoryboardHandleInput[] {
  return getRegisteredHandles(library)
    .map(handle => findReferenceByHandle(library, handle))
    .filter((ref): ref is StoryReference => ref !== null)
    .map(ref => ({
      handle: ref.handle,
      role: ref.role,
      ...(ref.description ? { description: ref.description } : {})
    }));
}

function createGeneratedId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `story-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSceneId(index: number): string {
  return `story-scene-${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 8)}`;
}

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

function getImageFormatExtension(format?: GenerationOptionsValue["format"]): string {
  if (format === "jpeg") {
    return "jpg";
  }
  return format ?? "png";
}

function getStoryKeyvisualFilename(index: number): string {
  return `sionbanana-story-keyvisual-${String(index + 1).padStart(2, "0")}.png`;
}

function buildReferenceMap(references: StoryReference[]): string {
  return references
    .map((ref, index) => `Image ${index + 1} = ${ref.role === "character" ? "Character" : "Location"} reference for @${ref.handle}`)
    .join("; ");
}

const STORY_CONTINUITY_LOCK =
  "Series continuity: keep recurring @handles visually consistent across scenes; preserve established identity, scale, wardrobe cues, and location character unless this scene explicitly changes them.";

function buildFinalPrompt(scenePrompt: string, references: StoryReference[], toneSuffix?: string): string {
  const refMap = buildReferenceMap(references);
  return [
    `Reference map: ${refMap}.`,
    `Detailed scene image prompt: ${scenePrompt}`,
    STORY_CONTINUITY_LOCK,
    toneSuffix
  ].filter(Boolean).join(" ");
}

function getSceneStatusLabel(status: SceneStatus): string {
  switch (status) {
    case "generating":
      return "생성 중";
    case "completed":
      return "완료";
    case "error":
      return "오류";
    default:
      return "대기";
  }
}

function getSceneStatusVariant(status: SceneStatus): "default" | "secondary" | "outline" | "success" | "destructive" {
  switch (status) {
    case "generating":
      return "secondary";
    case "completed":
      return "success";
    case "error":
      return "destructive";
    default:
      return "outline";
  }
}

function getSceneBoardGridClass(sceneTotal: number): string {
  if (sceneTotal === 1) {
    return "mx-auto grid w-full max-w-3xl gap-4";
  }
  return "grid gap-4 md:grid-cols-2 2xl:grid-cols-3";
}

function normalizeGeneratedImages(response: GenerateResponse, fallbackPrefix: string) {
  const images =
    Array.isArray(response.images) && response.images.length > 0
      ? response.images.map((image, imageIndex) => ({
          id:
            typeof image.id === "string" && image.id.length > 0
              ? image.id
              : getLocalImageId(image.imageUrl) ?? `${fallbackPrefix}-${imageIndex + 1}-${createGeneratedId()}`,
          imageUrl: image.imageUrl ?? image.base64Image ?? null
        }))
      : [
          {
            id:
              typeof response.id === "string" && response.id.length > 0
                ? response.id
                : getLocalImageId(response.imageUrl ?? response.base64Image) ?? `${fallbackPrefix}-${createGeneratedId()}`,
            imageUrl: response.imageUrl ?? response.base64Image ?? null
          }
        ];

  return images.filter((image): image is { id: string; imageUrl: string } => Boolean(image.imageUrl));
}

function createSceneFromStoryboard(
  rawScene: StoryboardSceneResponse,
  index: number,
  library: StoryReferenceLibrary
): Scene | null {
  const prompt = typeof rawScene.prompt === "string" ? rawScene.prompt.trim() : "";
  if (!prompt) {
    return null;
  }

  const validation = validateScenePrompt(prompt, library);
  const responseMentions = normalizeMentionList(rawScene.mentions);
  const invalidMentions = normalizeMentionList(rawScene.invalidMentions);
  const mentions = uniqueHandles([...validation.mentions, ...responseMentions]);
  const invalidReason = invalidMentions.length ? `등록되지 않은 핸들: ${formatHandleList(invalidMentions)}` : null;
  const error = invalidReason ?? validation.error;

  return {
    id: createSceneId(index),
    prompt,
    mentions,
    status: error ? "error" : "idle",
    error: error ?? undefined
  };
}

export function StoryStudioShell() {
  const [library, setLibrary] = useState<StoryReferenceLibrary>(() => loadStoryReferences());
  const [storyText, setStoryText] = useState("");
  const [sceneCount, setSceneCount] = useState(5);
  const [mode, setMode] = useState<StoryMode>("instant");
  const [toneId, setToneId] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>(DEFAULT_ASPECT_RATIO);
  const [imageGenOptions, setImageGenOptions] = useState<GenerationOptionsValue>(DEFAULT_GENERATION_OPTIONS);
  const [previewRecord, setPreviewRecord] = useState<GeneratedImageDocument | null>(null);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isAnyGenerating, setIsAnyGenerating] = useState(false);
  const [uploadingSlots, setUploadingSlots] = useState<Record<string, boolean>>({});
  const generationLockRef = useRef(false);
  const previewZoom = useImagePanZoom({ min: MIN_IMAGE_ZOOM, max: MAX_IMAGE_ZOOM, wheelRequiresModifier: false });

  useEffect(() => {
    setLibrary(loadStoryReferences());
    return subscribeStoryReferences(nextLibrary => {
      setLibrary(nextLibrary);
    });
  }, []);

  useEffect(() => {
    setScenes(current =>
      current.map(scene => {
        if (scene.status === "generating" || scene.status === "completed") {
          return scene;
        }
        const validation = validateScenePrompt(scene.prompt, library);
        return {
          ...scene,
          mentions: validation.mentions,
          status: validation.error ? "error" : "idle",
          error: validation.error ?? undefined
        };
      })
    );
  }, [library]);

  useEffect(() => {
    previewZoom.reset();
  }, [previewRecord?.id, previewZoom.reset]);

  const storyMentions = useMemo(() => parseStoryMentions(storyText, library), [library, storyText]);
  const registeredReferences = useMemo(() => flattenReferences(library), [library]);
  const inputReason = useMemo(() => getStoryInputReason(storyText, library), [library, storyText]);
  const selectedTone = useMemo(() => TONE_OPTIONS.find(tone => tone.id === toneId) ?? null, [toneId]);
  const hasGeneratingScene = scenes.some(scene => scene.status === "generating");
  const isBusy = isAnyGenerating || isSplitting || isGeneratingAll || hasGeneratingScene;

  const acquireGenerationLock = useCallback(() => {
    if (generationLockRef.current) {
      toast.info("이미 생성 작업이 진행 중입니다.");
      return false;
    }
    generationLockRef.current = true;
    setIsAnyGenerating(true);
    return true;
  }, []);

  const releaseGenerationLock = useCallback(() => {
    generationLockRef.current = false;
    setIsAnyGenerating(false);
  }, []);

  const persistSlot = useCallback(
    (
      role: StoryReferenceRole,
      slotIndex: number,
      patch: Partial<Pick<StoryReference, "handle" | "imageUrl" | "description">>
    ) => {
      const current = getRoleSlots(library, role)[slotIndex];
      const nextHandle = patch.handle ?? current?.handle ?? "";
      const nextImageUrl = patch.imageUrl ?? current?.imageUrl ?? "";
      const nextDescription = patch.description ?? current?.description;

      try {
        const nextLibrary =
          !nextHandle.trim() && !nextImageUrl
            ? saveStoryReference(role, slotIndex, null)
            : saveStoryReference(role, slotIndex, {
                handle: nextHandle,
                imageUrl: nextImageUrl,
                description: nextDescription
              });
        setLibrary(nextLibrary);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "레퍼런스를 저장하지 못했습니다.");
      }
    },
    [library]
  );

  const handleSlotUpload: SlotUploadHandler = useCallback(
    (role, slotIndex, event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("이미지 파일만 업로드할 수 있습니다.");
        input.value = "";
        return;
      }

      const uploadKey = getSlotUploadKey(role, slotIndex);
      setUploadingSlots(current => ({ ...current, [uploadKey]: true }));

      void resizeImageToDataUrl(file, { maxSize: 1920, mime: "image/jpeg", quality: 0.85 })
        .then(async ({ dataUrl }) => {
          const response = await fetch("/api/story-references", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: dataUrl })
          });
          const body = (await response.json().catch(() => null)) as StoryReferenceUploadResponse | null;

          if (!body) {
            throw new Error("이미지 업로드 응답을 읽지 못했습니다.");
          }

          if (!body.ok) {
            throw new Error(body.reason ?? "이미지 업로드에 실패했습니다.");
          }

          if (!response.ok) {
            throw new Error("이미지 업로드에 실패했습니다.");
          }

          const latestLibrary = loadStoryReferences();
          const latestSlot = getRoleSlots(latestLibrary, role)[slotIndex];
          const nextLibrary = saveStoryReference(role, slotIndex, {
            handle: latestSlot?.handle ?? "",
            imageUrl: body.imageUrl,
            description: latestSlot?.description
          });
          setLibrary(nextLibrary);
          toast.success(`${getRoleLabel(role)} 이미지를 저장했습니다.`);
        })
        .catch(error => {
          toast.error(error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.");
        })
        .finally(() => {
          input.value = "";
          setUploadingSlots(current => {
            const next = { ...current };
            delete next[uploadKey];
            return next;
          });
        });
    },
    []
  );

  const generateSceneImage = useCallback(
    async (scene: Scene, sceneIndex: number, totalScenes: number): Promise<GeneratedImageDocument> => {
      const validation = validateScenePrompt(scene.prompt, library);
      if (validation.error) {
        throw new Error(validation.error);
      }

      const mentionedRefs = validation.mentions
        .map(handle => findReferenceByHandle(library, handle))
        .filter((ref): ref is StoryReference => ref !== null);
      const toneSuffix = TONE_OPTIONS.find(tone => tone.id === toneId)?.promptSuffix;
      const finalPrompt = buildFinalPrompt(scene.prompt, mentionedRefs, toneSuffix);
      const referenceGallery = mentionedRefs.slice(1).map(ref => ref.imageUrl);
      const referenceMap = buildReferenceMap(mentionedRefs);

      const response = await callGenerateApi({
        mode: "create",
        prompt: finalPrompt,
        refinedPrompt: finalPrompt,
        options: {
          action: "story-keyvisual-multi",
          aspectRatio,
          outputMimeType: "image/png",
          quality: imageGenOptions.quality,
          imageSize: imageGenOptions.size,
          format: imageGenOptions.format,
          moderation: imageGenOptions.moderation,
          count: imageGenOptions.count,
          batchItemId: scene.id,
          batchItemName: `story-scene-${sceneIndex + 1}`,
          referenceImageUrl: mentionedRefs[0]?.imageUrl,
          referenceGallery
        }
      });

      if (!response.ok) {
        throw new Error(response.reason ?? "잠시 후 다시 시도해주세요.");
      }

      const generatedImages = normalizeGeneratedImages(response, `story-scene-${sceneIndex + 1}`);
      const primaryImage = generatedImages[0];
      if (!primaryImage) {
        throw new Error("이미지 데이터를 찾을 수 없습니다.");
      }

      const now = new Date().toISOString();
      const historyRecords: GeneratedImageDocument[] = generatedImages.map((image, imageIndex) => ({
        id: image.id,
        userId: "local",
        mode: "create",
        promptMeta: {
          rawPrompt: scene.prompt,
          refinedPrompt: finalPrompt,
          aspectRatio,
          referenceGallery
        },
        status: "completed",
        imageUrl: image.imageUrl,
        thumbnailUrl: image.imageUrl,
        originalImageUrl: image.imageUrl,
        metadata: {
          action: "story-keyvisual-multi",
          referenceMap,
          storySourcePrompt: storyText,
          storyScenePrompt: scene.prompt,
          mentionedHandles: validation.mentions,
          referencedSlots: mentionedRefs.map(ref => ({
            handle: ref.handle,
            role: ref.role,
            slotIndex: ref.slotIndex
          })),
          storySceneIndex: sceneIndex + 1,
          storySceneTotal: totalScenes,
          storyCopyIndex: imageIndex + 1,
          storyCopyTotal: generatedImages.length,
          storyOutputFormat: imageGenOptions.format,
          storyImageSize: imageGenOptions.size,
          storyQuality: imageGenOptions.quality,
          storyModeration: imageGenOptions.moderation,
          storyToneId: selectedTone?.id ?? null,
          storyToneLabel: selectedTone?.label ?? null,
          storyToneCategory: selectedTone?.category ?? null,
          generationOptions: {
            quality: imageGenOptions.quality,
            imageSize: imageGenOptions.size,
            format: imageGenOptions.format,
            moderation: imageGenOptions.moderation,
            count: imageGenOptions.count
          },
          costCredits: response.costCredits
        },
        model: response.model ?? "gpt-image-2",
        costCredits: response.costCredits,
        createdAt: now,
        updatedAt: now
      }));

      const merged = persistRecordsMerge(historyRecords);
      broadcastHistoryUpdate(merged, "story");
      return historyRecords[0];
    },
    [aspectRatio, imageGenOptions, library, selectedTone, storyText, toneId]
  );

  const generateSceneTargets = useCallback(
    async (
      targets: Array<{ scene: Scene; index: number }>,
      totalScenes: number,
      options: { markAllBusy?: boolean; skipGenerationLock?: boolean } = {}
    ) => {
      if (!targets.length) {
        return;
      }
      const markAllBusy = options.markAllBusy ?? targets.length > 1;
      const shouldManageLock = !options.skipGenerationLock;

      if (shouldManageLock && !acquireGenerationLock()) {
        return;
      }

      try {
        const prepared = targets.map(target => {
          const validation = validateScenePrompt(target.scene.prompt, library);
          return {
            ...target,
            scene: {
              ...target.scene,
              mentions: validation.mentions,
              status: validation.error ? "error" as const : "idle" as const,
              error: validation.error ?? undefined,
              resultUrl: validation.error ? undefined : target.scene.resultUrl,
              resultRecord: validation.error ? undefined : target.scene.resultRecord,
              resultFormat: validation.error ? undefined : target.scene.resultFormat
            },
            error: validation.error
          };
        });
        const preparedById = new Map(prepared.map(item => [item.scene.id, item]));
        const validTargets = prepared.filter(item => !item.error);

        setScenes(current =>
          current.map(scene => {
            const preparedScene = preparedById.get(scene.id);
            if (!preparedScene) {
              return scene;
            }
            if (preparedScene.error) {
              return {
                ...preparedScene.scene,
                status: "error",
                error: preparedScene.error,
                resultUrl: undefined,
                resultRecord: undefined,
                resultFormat: undefined
              };
            }
            return {
              ...preparedScene.scene,
              status: "generating",
              error: undefined,
              resultUrl: undefined,
              resultRecord: undefined,
              resultFormat: undefined
            };
          })
        );

        if (!validTargets.length) {
          toast.error("생성 가능한 씬이 없습니다.");
          return;
        }

        if (markAllBusy) {
          setIsGeneratingAll(true);
        }

        const settled = await runWithConcurrency(validTargets, 4, async target => {
          try {
            const record = await generateSceneImage(target.scene, target.index, totalScenes);
            setScenes(current =>
              current.map(scene =>
                scene.id === target.scene.id
                  ? {
                      ...scene,
                      status: "completed",
                      resultUrl: getRecordGeneratedImageUrl(record) ?? undefined,
                      resultRecord: record,
                      resultFormat: imageGenOptions.format,
                      error: undefined
                    }
                  : scene
              )
            );
            return record;
          } catch (error) {
            setScenes(current =>
              current.map(scene =>
                scene.id === target.scene.id
                  ? {
                      ...scene,
                      status: "error",
                      resultUrl: undefined,
                      resultRecord: undefined,
                      resultFormat: undefined,
                      error: error instanceof Error ? error.message : "이미지 생성 중 오류가 발생했습니다."
                    }
                  : scene
              )
            );
            throw error;
          }
        });

        const successCount = settled.filter(result => result.status === "fulfilled").length;
        const failCount = settled.length - successCount;
        if (successCount) {
          toast.success(`${successCount}개 씬 생성을 완료했습니다.`);
        }
        if (failCount) {
          toast.error(`${failCount}개 씬 생성에 실패했습니다.`);
        }
      } finally {
        if (markAllBusy) {
          setIsGeneratingAll(false);
        }
        if (shouldManageLock) {
          releaseGenerationLock();
        }
      }
    },
    [acquireGenerationLock, generateSceneImage, imageGenOptions.format, library, releaseGenerationLock]
  );

  const handleGenerate = useCallback(async () => {
    if (inputReason) {
      toast.error(inputReason);
      return;
    }

    const handles = buildStoryboardHandles(library);
    if (!handles.length) {
      toast.error("등록된 핸들이 최소 1개 필요합니다.");
      return;
    }
    if (!acquireGenerationLock()) {
      return;
    }

    setIsSplitting(true);
    try {
      const response = await fetch("/api/story/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story: storyText.trim(),
          sceneCount,
          handles
        })
      });
      const body = (await response.json().catch(() => null)) as StoryboardResponse | null;

      if (!body) {
        throw new Error("스토리 분할 응답을 읽지 못했습니다.");
      }
      if (!body.ok) {
        throw new Error(body.reason ?? "스토리 분할에 실패했습니다.");
      }
      if (!response.ok) {
        throw new Error("스토리 분할에 실패했습니다.");
      }
      if (!Array.isArray(body.scenes)) {
        throw new Error("스토리 분할 결과 없음");
      }

      const nextScenes = body.scenes
        .map((scene, index) => createSceneFromStoryboard(scene, index, library))
        .filter((scene): scene is Scene => scene !== null);

      if (!nextScenes.length) {
        throw new Error("스토리 분할 결과 없음");
      }

      setScenes(nextScenes);
      toast.success(`${nextScenes.length}개 씬으로 분할했습니다.`);

      if (mode === "instant") {
        setIsSplitting(false);
        await generateSceneTargets(
          nextScenes.map((scene, index) => ({ scene, index })),
          nextScenes.length,
          { markAllBusy: true, skipGenerationLock: true }
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "스토리 분할 중 오류가 발생했습니다.");
    } finally {
      setIsSplitting(false);
      releaseGenerationLock();
    }
  }, [acquireGenerationLock, generateSceneTargets, inputReason, library, mode, releaseGenerationLock, sceneCount, storyText]);

  const handleGenerateAll = useCallback(() => {
    void generateSceneTargets(
      scenes.map((scene, index) => ({ scene, index })),
      scenes.length,
      { markAllBusy: true }
    );
  }, [generateSceneTargets, scenes]);

  const handleDownloadCompletedImages = useCallback(() => {
    const completedImages = scenes
      .filter(scene => scene.status === "completed" && scene.resultRecord?.imageUrl)
      .map(scene => scene.resultRecord?.imageUrl)
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl));

    if (!completedImages.length) {
      toast.info("다운로드할 완료 이미지가 없습니다.");
      return;
    }

    completedImages.forEach((imageUrl, index) => {
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = imageUrl;
        link.download = getStoryKeyvisualFilename(index);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 150);
    });
  }, [scenes]);

  const handleRetryFailedScenes = useCallback(() => {
    const targets = scenes
      .map((scene, index) => ({ scene, index }))
      .filter(target => target.scene.status === "error");

    if (!targets.length) {
      toast.info("재시도할 실패 씬이 없습니다.");
      return;
    }

    void generateSceneTargets(targets, scenes.length, { markAllBusy: true });
  }, [generateSceneTargets, scenes]);

  const handleRegenerateScene = useCallback(
    (sceneId: string) => {
      const index = scenes.findIndex(scene => scene.id === sceneId);
      if (index < 0) {
        return;
      }
      void generateSceneTargets([{ scene: scenes[index], index }], scenes.length, { markAllBusy: false });
    },
    [generateSceneTargets, scenes]
  );

  const handleMoveScene = useCallback((sceneId: string, direction: "up" | "down") => {
    setScenes(current => {
      const index = current.findIndex(scene => scene.id === sceneId);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }, []);

  const handleScenePromptChange = useCallback(
    (sceneId: string, prompt: string) => {
      setScenes(current =>
        current.map(scene => {
          if (scene.id !== sceneId) {
            return scene;
          }
          const validation = validateScenePrompt(prompt, library);
          return {
            ...scene,
            prompt,
            mentions: validation.mentions,
            status: validation.error ? "error" : "idle",
            error: validation.error ?? undefined,
            resultUrl: undefined,
            resultRecord: undefined,
            resultFormat: undefined
          };
        })
      );
    },
    [library]
  );

  const handleResplit = useCallback(() => {
    const hasGeneratedResults = scenes.some(
      scene => scene.status === "completed" || scene.resultUrl || scene.resultRecord
    );
    if (
      hasGeneratedResults &&
      !window.confirm("이미 생성된 결과가 있습니다. 다시 분할하면 결과가 사라집니다. 계속할까요?")
    ) {
      return;
    }
    void handleGenerate();
  }, [handleGenerate, scenes]);

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">스토리</h1>
            <p className="text-sm text-muted-foreground">등록한 인물과 로케이션을 @핸들로 호출해 여러 컷의 키비주얼을 구성합니다.</p>
          </div>
          <Badge variant="secondary" className="w-fit">Phase 2</Badge>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="space-y-5">
            <CharacterLibrary
              library={library}
              uploadingSlots={uploadingSlots}
              onHandleChange={(slotIndex, handle) => persistSlot("character", slotIndex, { handle })}
              onImageUpload={handleSlotUpload}
              onImageClear={slotIndex => persistSlot("character", slotIndex, { imageUrl: "" })}
            />
            <LocationLibrary
              library={library}
              uploadingSlots={uploadingSlots}
              onHandleChange={(slotIndex, handle) => persistSlot("location", slotIndex, { handle })}
              onImageUpload={handleSlotUpload}
              onImageClear={slotIndex => persistSlot("location", slotIndex, { imageUrl: "" })}
            />
          </div>

          <div className="space-y-5">
            <StoryPromptInput
              storyText={storyText}
              onStoryTextChange={setStoryText}
              sceneCount={sceneCount}
              onSceneCountChange={setSceneCount}
              mode={mode}
              onModeChange={setMode}
              toneId={toneId}
              selectedTone={selectedTone}
              onToneChange={setToneId}
              aspectRatio={aspectRatio}
              onAspectRatioChange={setAspectRatio}
              registeredReferences={registeredReferences}
              storyMentionCount={storyMentions.mentioned.length}
              inputReason={inputReason}
              busy={isBusy}
              onGenerate={() => void handleGenerate()}
            />

            <SceneBoard
              scenes={scenes}
              mode={mode}
              busy={isBusy}
              allGenerationActive={isBusy}
              onPromptChange={handleScenePromptChange}
              onDownloadCompletedImages={handleDownloadCompletedImages}
              onGenerateAll={handleGenerateAll}
              onRetryFailedScenes={handleRetryFailedScenes}
              onRegenerateScene={handleRegenerateScene}
              onMoveScene={handleMoveScene}
              onPreviewRecord={setPreviewRecord}
              onResplit={handleResplit}
            />
          </div>
        </div>
      </div>

      <GenerationOptionsPanel value={imageGenOptions} onChange={setImageGenOptions} />

      {previewRecord ? (
        <StoryImagePreviewModal
          record={previewRecord}
          zoom={previewZoom}
          onClose={() => setPreviewRecord(null)}
        />
      ) : null}
    </div>
  );
}

function CharacterLibrary({
  library,
  uploadingSlots,
  onHandleChange,
  onImageUpload,
  onImageClear
}: {
  library: StoryReferenceLibrary;
  uploadingSlots: Record<string, boolean>;
  onHandleChange: (slotIndex: number, handle: string) => void;
  onImageUpload: SlotUploadHandler;
  onImageClear: (slotIndex: number) => void;
}) {
  return (
    <ReferenceLibrary
      title="인물 라이브러리"
      role="character"
      slots={library.characters}
      uploadingSlots={uploadingSlots}
      imagePlaceholder="인물 이미지"
      handlePlaceholder="예: 민수"
      onHandleChange={onHandleChange}
      onImageUpload={onImageUpload}
      onImageClear={onImageClear}
    />
  );
}

function LocationLibrary({
  library,
  uploadingSlots,
  onHandleChange,
  onImageUpload,
  onImageClear
}: {
  library: StoryReferenceLibrary;
  uploadingSlots: Record<string, boolean>;
  onHandleChange: (slotIndex: number, handle: string) => void;
  onImageUpload: SlotUploadHandler;
  onImageClear: (slotIndex: number) => void;
}) {
  return (
    <ReferenceLibrary
      title="로케이션 라이브러리"
      role="location"
      slots={library.locations}
      uploadingSlots={uploadingSlots}
      imagePlaceholder="로케이션 이미지"
      handlePlaceholder="예: 카페"
      onHandleChange={onHandleChange}
      onImageUpload={onImageUpload}
      onImageClear={onImageClear}
    />
  );
}

function ReferenceLibrary({
  title,
  role,
  slots,
  uploadingSlots,
  imagePlaceholder,
  handlePlaceholder,
  onHandleChange,
  onImageUpload,
  onImageClear
}: {
  title: string;
  role: StoryReferenceRole;
  slots: (StoryReference | null)[];
  uploadingSlots: Record<string, boolean>;
  imagePlaceholder: string;
  handlePlaceholder: string;
  onHandleChange: (slotIndex: number, handle: string) => void;
  onImageUpload: SlotUploadHandler;
  onImageClear: (slotIndex: number) => void;
}) {
  return (
    <Card className="rounded-lg">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        {Array.from({ length: STORY_REFERENCE_SLOT_COUNT }, (_, slotIndex) => {
          const slot = slots[slotIndex] ?? null;
          const inputId = `${role}-story-reference-${slotIndex}`;
          const isUploading = uploadingSlots[getSlotUploadKey(role, slotIndex)] ?? false;
          return (
            <div key={slotIndex} className="rounded-lg border border-border/70 bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Label htmlFor={`${inputId}-handle`} className="text-xs text-muted-foreground">
                  슬롯 {slotIndex + 1}
                </Label>
                {slot?.handle ? (
                  <Badge variant={role === "character" ? "default" : "secondary"}>@{slot.handle}</Badge>
                ) : null}
              </div>
              <Input
                id={`${inputId}-handle`}
                value={slot?.handle ?? ""}
                onChange={event => onHandleChange(slotIndex, event.target.value)}
                placeholder={handlePlaceholder}
                className="mb-3"
              />
              <div className="overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
                <div className="relative flex aspect-[4/3] items-center justify-center bg-background">
                  {slot?.imageUrl ? (
                    <img
                      src={slot.imageUrl}
                      alt={slot.handle || imagePlaceholder}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                      <ImageIcon className="h-5 w-5" />
                      <span>{imagePlaceholder}</span>
                    </div>
                  )}
                  {isUploading ? (
                    <div className="absolute flex flex-col items-center gap-2 rounded-md bg-background/80 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span>저장 중</span>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 border-t border-border/70 bg-card p-2">
                  <input
                    id={inputId}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploading}
                    onChange={event => onImageUpload(role, slotIndex, event)}
                  />
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className={cn("flex-1", isUploading && "pointer-events-none opacity-70")}
                  >
                    <label htmlFor={isUploading ? undefined : inputId} className="cursor-pointer" aria-disabled={isUploading}>
                      {isUploading ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {isUploading ? "저장 중" : "업로드"}
                    </label>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onImageClear(slotIndex)}
                    disabled={!slot?.imageUrl || isUploading}
                    aria-label={`${title} 슬롯 ${slotIndex + 1} 이미지 클리어`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function StoryPromptInput({
  storyText,
  onStoryTextChange,
  sceneCount,
  onSceneCountChange,
  mode,
  onModeChange,
  toneId,
  selectedTone,
  onToneChange,
  aspectRatio,
  onAspectRatioChange,
  registeredReferences,
  storyMentionCount,
  inputReason,
  busy,
  onGenerate
}: {
  storyText: string;
  onStoryTextChange: (value: string) => void;
  sceneCount: number;
  onSceneCountChange: (value: number) => void;
  mode: StoryMode;
  onModeChange: (value: StoryMode) => void;
  toneId: string | null;
  selectedTone: ToneOption | null;
  onToneChange: (value: string | null) => void;
  aspectRatio: AspectRatioPreset;
  onAspectRatioChange: (value: AspectRatioPreset) => void;
  registeredReferences: StoryReference[];
  storyMentionCount: number;
  inputReason: string | null;
  busy: boolean;
  onGenerate: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const actionLabel = mode === "review" ? "스토리보드 분할" : "자동 생성";
  const selectedToneSummary = selectedTone
    ? `${TONE_CATEGORY_LABELS[selectedTone.category]} / ${selectedTone.label}`
    : "기본 (없음)";

  const insertHandle = useCallback(
    (handle: string) => {
      const spacer = storyText && !/\s$/.test(storyText) ? " " : "";
      onStoryTextChange(`${storyText}${spacer}@${handle} `);
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [onStoryTextChange, storyText]
  );

  return (
    <Card className="rounded-lg">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">스토리 프롬프트</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs text-muted-foreground">등록된 핸들</Label>
            <span className="text-xs text-muted-foreground">입력 {storyMentionCount}/8</span>
          </div>
          <ScrollArea className="max-h-28 rounded-lg border border-border/70 bg-background p-3">
            {registeredReferences.length ? (
              <div className="flex flex-wrap gap-2">
                {registeredReferences.map(ref => (
                  <Button
                    key={ref.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => insertHandle(ref.handle)}
                    disabled={!ref.handle}
                  >
                    @{ref.handle}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {ref.role === "character" ? "인물" : "로케이션"}
                    </span>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">등록된 핸들이 없습니다.</p>
            )}
          </ScrollArea>
        </div>

        <div className="space-y-2">
          <Textarea
            ref={textareaRef}
            value={storyText}
            onChange={event => onStoryTextChange(event.target.value)}
            placeholder="비 오는 밤, 오래 헤어진 두 사람이 작은 카페 앞에서 다시 만난다."
            className="min-h-[180px] resize-none"
            maxLength={2000}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>필요하면 @핸들을 직접 포함할 수 있습니다.</span>
            <span>{storyText.trim().length}/2000</span>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border/70 bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">톤</Label>
            <Badge variant="outline">선택된 톤: {selectedToneSummary}</Badge>
          </div>
          <Button
            type="button"
            variant={toneId === null ? "default" : "outline"}
            size="sm"
            onClick={() => onToneChange(null)}
            disabled={busy}
            title="톤 suffix를 추가하지 않습니다."
            aria-label="기본 톤: 톤 suffix를 추가하지 않습니다."
          >
            기본 (없음)
          </Button>
          <Tabs defaultValue="cinematic" className="space-y-3">
            <TabsList className="grid h-auto w-full grid-cols-4 gap-1 bg-muted p-1">
              {TONE_CATEGORY_ORDER.map(category => (
                <TabsTrigger key={category} value={category} className="px-2 py-1.5 text-xs">
                  {TONE_CATEGORY_LABELS[category]}
                </TabsTrigger>
              ))}
            </TabsList>
            {TONE_CATEGORY_ORDER.map(category => (
              <TabsContent key={category} value={category} className="mt-0">
                <ToggleGroup
                  type="single"
                  value={toneId ?? ""}
                  onValueChange={value => onToneChange(value || null)}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5"
                  disabled={busy}
                >
                  {TONE_OPTIONS.filter(tone => tone.category === category).map(tone => (
                    <ToggleGroupItem
                      key={tone.id}
                      value={tone.id}
                      className="h-auto min-h-9 min-w-0 px-2 py-2 text-xs leading-tight"
                      title={tone.description}
                      aria-label={`${TONE_CATEGORY_LABELS[tone.category]} ${tone.label}: ${tone.description}`}
                    >
                      {tone.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs text-muted-foreground">컷 수</Label>
              <Badge variant="outline">{sceneCount}</Badge>
            </div>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[sceneCount]}
              onValueChange={value => onSceneCountChange(value[0] ?? 5)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">모드</Label>
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={value => value && onModeChange(value as StoryMode)}
              className="grid grid-cols-2 gap-2"
              disabled={busy}
            >
              <ToggleGroupItem value="review" className="min-w-0 px-3">
                검토
              </ToggleGroupItem>
              <ToggleGroupItem value="instant" className="min-w-0 px-3">
                즉시
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">AspectRatio</Label>
          <ToggleGroup
            type="single"
            value={aspectRatio}
            onValueChange={value => value && onAspectRatioChange(value as AspectRatioPreset)}
            className="flex flex-wrap justify-start gap-2"
          >
            {ASPECT_RATIO_PRESETS.map(preset => (
              <ToggleGroupItem key={preset.value} value={preset.value} className="min-w-0 px-3">
                {preset.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {inputReason ? (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            {inputReason}
          </p>
        ) : null}

        <Button
          type="button"
          className="w-full"
          onClick={onGenerate}
          disabled={Boolean(inputReason) || busy}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {busy ? "진행 중" : actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

function SceneBoard({
  scenes,
  mode,
  busy,
  allGenerationActive,
  onPromptChange,
  onDownloadCompletedImages,
  onGenerateAll,
  onRetryFailedScenes,
  onRegenerateScene,
  onMoveScene,
  onPreviewRecord,
  onResplit
}: {
  scenes: Scene[];
  mode: StoryMode;
  busy: boolean;
  allGenerationActive: boolean;
  onPromptChange: (sceneId: string, prompt: string) => void;
  onDownloadCompletedImages: () => void;
  onGenerateAll: () => void;
  onRetryFailedScenes: () => void;
  onRegenerateScene: (sceneId: string) => void;
  onMoveScene: (sceneId: string, direction: "up" | "down") => void;
  onPreviewRecord: (record: GeneratedImageDocument) => void;
  onResplit: () => void;
}) {
  const hasScenes = scenes.length > 0;
  const canGenerateAll = hasScenes && mode === "review" && !busy;
  const completedImageCount = scenes.filter(scene => scene.status === "completed" && scene.resultRecord?.imageUrl).length;
  const failedSceneCount = scenes.filter(scene => scene.status === "error").length;

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-col gap-3 p-4 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">스토리보드</CardTitle>
          <p className="text-xs text-muted-foreground">{hasScenes ? `${scenes.length}개 씬` : "분할된 씬이 없습니다."}</p>
        </div>
        {hasScenes ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDownloadCompletedImages}
              disabled={completedImageCount === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              완료 이미지 전체 다운로드
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetryFailedScenes}
              disabled={failedSceneCount === 0 || busy}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              실패 씬 재시도
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onResplit} disabled={busy}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              전체 재분할
            </Button>
            {mode === "review" ? (
              <Button type="button" size="sm" onClick={onGenerateAll} disabled={!canGenerateAll}>
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                전체 생성
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        {hasScenes ? (
          <div className={getSceneBoardGridClass(scenes.length)}>
            {scenes.map((scene, index) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                index={index}
                editable={mode === "review" && scene.status !== "generating" && scene.status !== "completed"}
                allGenerationActive={allGenerationActive}
                onPromptChange={onPromptChange}
                onRegenerateScene={onRegenerateScene}
                onMoveScene={onMoveScene}
                onPreviewRecord={onPreviewRecord}
                moveDisabled={busy}
                isFirst={index === 0}
                isLast={index === scenes.length - 1}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background text-sm text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
            <span>스토리를 분할하면 씬 카드가 표시됩니다.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SceneCard({
  scene,
  index,
  editable,
  allGenerationActive,
  onPromptChange,
  onRegenerateScene,
  onMoveScene,
  onPreviewRecord,
  moveDisabled,
  isFirst,
  isLast
}: {
  scene: Scene;
  index: number;
  editable: boolean;
  allGenerationActive: boolean;
  onPromptChange: (sceneId: string, prompt: string) => void;
  onRegenerateScene: (sceneId: string) => void;
  onMoveScene: (sceneId: string, direction: "up" | "down") => void;
  onPreviewRecord: (record: GeneratedImageDocument) => void;
  moveDisabled: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isGenerating = scene.status === "generating";
  const isCompleted = scene.status === "completed" && Boolean(scene.resultUrl);
  const canRegenerate = !allGenerationActive && !isGenerating;
  const downloadExtension = getImageFormatExtension(scene.resultFormat);
  const [isGeneratedPromptOpen, setIsGeneratedPromptOpen] = useState(false);
  const generatedPrompt = scene.resultRecord?.promptMeta?.refinedPrompt ?? scene.prompt;

  return (
    <div className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">씬 {index + 1}</span>
          <Badge variant={getSceneStatusVariant(scene.status)}>{getSceneStatusLabel(scene.status)}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onMoveScene(scene.id, "up")}
            disabled={moveDisabled || isFirst}
            aria-label={`씬 ${index + 1} 위로 이동`}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onMoveScene(scene.id, "down")}
            disabled={moveDisabled || isLast}
            aria-label={`씬 ${index + 1} 아래로 이동`}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRegenerateScene(scene.id)}
            disabled={!canRegenerate}
            aria-label={`씬 ${index + 1} 재생성`}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <Textarea
          value={scene.prompt}
          onChange={event => onPromptChange(scene.id, event.target.value)}
          readOnly={!editable}
          className={cn("min-h-[112px] resize-none text-sm", !editable && "bg-muted/30")}
        />

        <div className="flex min-h-7 flex-wrap gap-1.5">
          {scene.mentions.length ? (
            scene.mentions.map(handle => (
              <Badge key={handle} variant="secondary" className="max-w-full truncate">
                @{handle}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">멘션 없음</span>
          )}
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-foreground"
            onClick={() => setIsGeneratedPromptOpen(current => !current)}
            aria-expanded={isGeneratedPromptOpen}
          >
            <span>생성 프롬프트</span>
            {isGeneratedPromptOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {isGeneratedPromptOpen ? (
            <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words border-t border-border/70 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {generatedPrompt}
            </pre>
          ) : null}
        </div>

        <div
          className={cn(
            "flex aspect-square min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/20",
            isCompleted && "bg-black"
          )}
        >
          {isGenerating ? (
            <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span>생성 중</span>
            </div>
          ) : isCompleted ? (
            <button
              type="button"
              className="h-full w-full cursor-zoom-in"
              onClick={() => scene.resultRecord && onPreviewRecord(scene.resultRecord)}
              disabled={!scene.resultRecord}
              aria-label={`씬 ${index + 1} 이미지 크게 보기`}
            >
              <img
                src={scene.resultUrl}
                alt={`스토리 씬 ${index + 1}`}
                className="h-full w-full object-contain"
              />
            </button>
          ) : scene.status === "error" ? (
            <div className="max-w-[260px] space-y-2 px-4 text-center">
              <p className="text-sm font-medium text-destructive">생성 불가</p>
              <p className="text-xs text-muted-foreground">{scene.error ?? "씬을 확인해주세요."}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <span>대기 중</span>
            </div>
          )}
        </div>

        <Button asChild variant="outline" className="w-full" disabled={!isCompleted}>
          <a href={isCompleted ? scene.resultUrl : "#"} download={`sionbanana-story-scene-${index + 1}.${downloadExtension}`}>
            <Download className="mr-2 h-4 w-4" />
            다운로드
          </a>
        </Button>
      </div>
    </div>
  );
}

function StoryImagePreviewModal({
  record,
  zoom,
  onClose
}: {
  record: GeneratedImageDocument;
  zoom: ReturnType<typeof useImagePanZoom>;
  onClose: () => void;
}) {
  const imageUrl = getRecordGeneratedImageUrl(record);
  const promptText = getRecordPromptText(record);
  const zoomPercent = Math.round(zoom.scale * 100);
  const recordFormat = record.metadata?.storyOutputFormat;
  const downloadExtension = getImageFormatExtension(
    recordFormat === "png" || recordFormat === "jpeg" || recordFormat === "webp" ? recordFormat : undefined
  );

  const handleCopyPrompt = useCallback(async () => {
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
  }, [promptText]);

  const handleDownload = useCallback(() => {
    if (!imageUrl) {
      toast.error("다운로드할 이미지를 찾을 수 없습니다.");
      return;
    }
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `sionbanana-story-${record.id}.${downloadExtension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [downloadExtension, imageUrl, record.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 lg:p-6"
      onClick={onClose}
    >
      <div
        className="relative grid h-full max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-xl border border-white/20 bg-background shadow-2xl lg:grid-cols-[minmax(0,1fr)_360px]"
        onClick={event => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-4 top-4 z-30 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur transition hover:bg-black/70"
          onClick={onClose}
        >
          닫기
        </button>

        <div className="flex min-h-0 flex-col bg-black">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="text-sm font-semibold">스토리 씬 이미지</p>
              <p className="truncate text-xs text-white/60">
                {record.model} · {new Date(record.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="mr-14 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => zoom.zoomOut()} disabled={zoom.scale <= MIN_IMAGE_ZOOM}>
                축소
              </Button>
              <Button size="sm" variant="secondary" onClick={() => zoom.reset()} disabled={zoom.scale === 1}>
                {zoomPercent}%
              </Button>
              <Button size="sm" variant="secondary" onClick={() => zoom.zoomIn()} disabled={zoom.scale >= MAX_IMAGE_ZOOM}>
                확대
              </Button>
            </div>
          </div>

          <div
            {...zoom.bind}
            className={cn(
              "relative flex min-h-[50vh] flex-1 touch-none select-none items-center justify-center overflow-hidden bg-black",
              zoom.isPanning ? "cursor-grabbing" : "cursor-grab"
            )}
            title="마우스 휠로 확대/축소, 드래그로 이동, 더블클릭으로 원래대로"
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={promptText || "story preview"}
                className="max-h-full max-w-full object-contain will-change-transform"
                draggable={false}
                style={{
                  transform: `translate(${zoom.transform.panX}px, ${zoom.transform.panY}px) scale(${zoom.transform.scale})`,
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
            <h2 className="text-base font-semibold text-foreground">프롬프트와 옵션</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void handleCopyPrompt()} disabled={!promptText}>
              프롬프트 복사
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownload} disabled={!imageUrl}>
              다운로드
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">생성 프롬프트</p>
            <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
              {promptText || "저장된 프롬프트가 없습니다."}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="rounded-lg border bg-background/60 p-2">
              <p className="font-medium text-foreground">모드</p>
              <p className="uppercase">{record.mode}</p>
            </div>
            <div className="rounded-lg border bg-background/60 p-2">
              <p className="font-medium text-foreground">모델</p>
              <p>{record.model}</p>
            </div>
            <div className="rounded-lg border bg-background/60 p-2">
              <p className="font-medium text-foreground">파일</p>
              <p>{imageUrl?.startsWith("/api/images/") ? "로컬 원본" : "이미지 URL"}</p>
            </div>
            <div className="rounded-lg border bg-background/60 p-2">
              <p className="font-medium text-foreground">포맷</p>
              <p className="uppercase">{downloadExtension}</p>
            </div>
            <div className="rounded-lg border bg-background/60 p-2">
              <p className="font-medium text-foreground">씬</p>
              <p>
                {String(record.metadata?.storySceneIndex ?? "-")} / {String(record.metadata?.storySceneTotal ?? "-")}
              </p>
            </div>
            <div className="rounded-lg border bg-background/60 p-2">
              <p className="font-medium text-foreground">크기</p>
              <p>{String(record.metadata?.storyImageSize ?? "auto")}</p>
            </div>
            <div className="rounded-lg border bg-background/60 p-2">
              <p className="font-medium text-foreground">품질</p>
              <p>{String(record.metadata?.storyQuality ?? "-")}</p>
            </div>
            <div className="rounded-lg border bg-background/60 p-2">
              <p className="font-medium text-foreground">Copy</p>
              <p>
                {String(record.metadata?.storyCopyIndex ?? "-")} / {String(record.metadata?.storyCopyTotal ?? "-")}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
