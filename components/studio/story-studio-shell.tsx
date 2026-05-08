"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, Image as ImageIcon, Loader2, RefreshCw, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { persistRecordsMerge, broadcastHistoryUpdate } from "@/components/studio/history-sync";
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
import type { AspectRatioPreset, GeneratedImageDocument } from "@/lib/types";
import { cn } from "@/lib/utils";

type SceneStatus = "idle" | "generating" | "completed" | "error";
type StoryMode = "review" | "instant";

type Scene = {
  id: string;
  prompt: string;
  mentions: string[];
  status: SceneStatus;
  resultUrl?: string;
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

function buildReferenceMap(references: StoryReference[]): string {
  return references
    .map((ref, index) => `Image ${index + 1} = ${ref.role === "character" ? "Character" : "Location"} "${ref.handle}"`)
    .join("; ");
}

function buildFinalPrompt(storyText: string, references: StoryReference[]): string {
  const refMap = buildReferenceMap(references);
  return `Reference map: ${refMap}. Use each labeled reference only for that named entity. Scene: ${storyText}.`;
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
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>(DEFAULT_ASPECT_RATIO);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [uploadingSlots, setUploadingSlots] = useState<Record<string, boolean>>({});

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

  const storyMentions = useMemo(() => parseStoryMentions(storyText, library), [library, storyText]);
  const registeredReferences = useMemo(() => flattenReferences(library), [library]);
  const inputReason = useMemo(() => getStoryInputReason(storyText, library), [library, storyText]);
  const isBusy = isSplitting || isGeneratingAll || scenes.some(scene => scene.status === "generating");

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

      const nextLibrary =
        !nextHandle.trim() && !nextImageUrl
          ? saveStoryReference(role, slotIndex, null)
          : saveStoryReference(role, slotIndex, {
              handle: nextHandle,
              imageUrl: nextImageUrl,
              description: nextDescription
            });
      setLibrary(nextLibrary);
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

          persistSlot(role, slotIndex, { imageUrl: body.imageUrl });
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
    [persistSlot]
  );

  const generateSceneImage = useCallback(
    async (scene: Scene, sceneIndex: number, totalScenes: number): Promise<string> => {
      const validation = validateScenePrompt(scene.prompt, library);
      if (validation.error) {
        throw new Error(validation.error);
      }

      const mentionedRefs = validation.mentions
        .map(handle => findReferenceByHandle(library, handle))
        .filter((ref): ref is StoryReference => ref !== null);
      const finalPrompt = buildFinalPrompt(scene.prompt, mentionedRefs);
      const referenceGallery = mentionedRefs.map(ref => ref.imageUrl);
      const referenceMap = buildReferenceMap(mentionedRefs);

      const response = await callGenerateApi({
        mode: "create",
        prompt: finalPrompt,
        refinedPrompt: finalPrompt,
        options: {
          action: "story-keyvisual-multi",
          aspectRatio,
          outputMimeType: "image/png",
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
          rawPrompt: storyText,
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
          costCredits: response.costCredits
        },
        model: response.model ?? "gpt-image-2",
        costCredits: response.costCredits,
        createdAt: now,
        updatedAt: now
      }));

      const merged = persistRecordsMerge(historyRecords);
      broadcastHistoryUpdate(merged, "story");
      return primaryImage.imageUrl;
    },
    [aspectRatio, library, storyText]
  );

  const generateSceneTargets = useCallback(
    async (targets: Array<{ scene: Scene; index: number }>, totalScenes: number) => {
      if (!targets.length) {
        return;
      }

      const prepared = targets.map(target => {
        const validation = validateScenePrompt(target.scene.prompt, library);
        return {
          ...target,
          scene: {
            ...target.scene,
            mentions: validation.mentions,
            status: validation.error ? "error" as const : "idle" as const,
            error: validation.error ?? undefined,
            resultUrl: validation.error ? undefined : target.scene.resultUrl
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
              resultUrl: undefined
            };
          }
          return {
            ...preparedScene.scene,
            status: "generating",
            error: undefined,
            resultUrl: undefined
          };
        })
      );

      if (!validTargets.length) {
        toast.error("생성 가능한 씬이 없습니다.");
        return;
      }

      setIsGeneratingAll(true);
      try {
        const settled = await runWithConcurrency(validTargets, 4, async target => {
          try {
            const imageUrl = await generateSceneImage(target.scene, target.index, totalScenes);
            setScenes(current =>
              current.map(scene =>
                scene.id === target.scene.id
                  ? {
                      ...scene,
                      status: "completed",
                      resultUrl: imageUrl,
                      error: undefined
                    }
                  : scene
              )
            );
            return imageUrl;
          } catch (error) {
            setScenes(current =>
              current.map(scene =>
                scene.id === target.scene.id
                  ? {
                      ...scene,
                      status: "error",
                      resultUrl: undefined,
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
        setIsGeneratingAll(false);
      }
    },
    [generateSceneImage, library]
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
        await generateSceneTargets(nextScenes.map((scene, index) => ({ scene, index })), nextScenes.length);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "스토리 분할 중 오류가 발생했습니다.");
    } finally {
      setIsSplitting(false);
    }
  }, [generateSceneTargets, inputReason, library, mode, sceneCount, storyText]);

  const handleGenerateAll = useCallback(() => {
    void generateSceneTargets(scenes.map((scene, index) => ({ scene, index })), scenes.length);
  }, [generateSceneTargets, scenes]);

  const handleRegenerateScene = useCallback(
    (sceneId: string) => {
      const index = scenes.findIndex(scene => scene.id === sceneId);
      if (index < 0) {
        return;
      }
      void generateSceneTargets([{ scene: scenes[index], index }], scenes.length);
    },
    [generateSceneTargets, scenes]
  );

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
            resultUrl: undefined
          };
        })
      );
    },
    [library]
  );

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
              onPromptChange={handleScenePromptChange}
              onGenerateAll={handleGenerateAll}
              onRegenerateScene={handleRegenerateScene}
              onResplit={() => void handleGenerate()}
            />
          </div>
        </div>
      </div>
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
  onPromptChange,
  onGenerateAll,
  onRegenerateScene,
  onResplit
}: {
  scenes: Scene[];
  mode: StoryMode;
  busy: boolean;
  onPromptChange: (sceneId: string, prompt: string) => void;
  onGenerateAll: () => void;
  onRegenerateScene: (sceneId: string) => void;
  onResplit: () => void;
}) {
  const hasScenes = scenes.length > 0;
  const canGenerateAll = hasScenes && mode === "review" && !busy;

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-col gap-3 p-4 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">스토리보드</CardTitle>
          <p className="text-xs text-muted-foreground">{hasScenes ? `${scenes.length}개 씬` : "분할된 씬이 없습니다."}</p>
        </div>
        {hasScenes ? (
          <div className="flex flex-wrap gap-2">
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
                busy={busy}
                onPromptChange={onPromptChange}
                onRegenerateScene={onRegenerateScene}
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
  busy,
  onPromptChange,
  onRegenerateScene
}: {
  scene: Scene;
  index: number;
  editable: boolean;
  busy: boolean;
  onPromptChange: (sceneId: string, prompt: string) => void;
  onRegenerateScene: (sceneId: string) => void;
}) {
  const isGenerating = scene.status === "generating";
  const isCompleted = scene.status === "completed" && Boolean(scene.resultUrl);
  const canRegenerate = !busy && !isGenerating;

  return (
    <div className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">씬 {index + 1}</span>
          <Badge variant={getSceneStatusVariant(scene.status)}>{getSceneStatusLabel(scene.status)}</Badge>
        </div>
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
            <img
              src={scene.resultUrl}
              alt={`스토리 씬 ${index + 1}`}
              className="h-full w-full object-contain"
            />
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
          <a href={isCompleted ? scene.resultUrl : "#"} download={`sionbanana-story-scene-${index + 1}.png`}>
            <Download className="mr-2 h-4 w-4" />
            다운로드
          </a>
        </Button>
      </div>
    </div>
  );
}
