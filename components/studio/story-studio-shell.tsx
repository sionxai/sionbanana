"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, Image as ImageIcon, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { persistRecordsMerge, broadcastHistoryUpdate } from "@/components/studio/history-sync";
import { callGenerateApi } from "@/hooks/use-generate-image";
import { ASPECT_RATIO_PRESETS, DEFAULT_ASPECT_RATIO } from "@/lib/aspect";
import { resizeImageToDataUrl } from "@/lib/image-resize";
import { parseStoryMentions, type ParsedStory } from "@/lib/story-mentions";
import {
  STORY_REFERENCE_SLOT_COUNT,
  findReferenceByHandle,
  loadStoryReferences,
  saveStoryReference,
  subscribeStoryReferences,
  type StoryReference,
  type StoryReferenceLibrary,
  type StoryReferenceRole
} from "@/lib/story-references";
import type { AspectRatioPreset, GeneratedImageDocument } from "@/lib/types";
import { cn } from "@/lib/utils";

type StoryResultState =
  | { status: "idle"; imageUrl?: undefined; error?: undefined }
  | { status: "loading"; imageUrl?: undefined; error?: undefined }
  | { status: "success"; imageUrl: string; error?: undefined }
  | { status: "error"; imageUrl?: undefined; error: string };

type SlotUploadHandler = (role: StoryReferenceRole, slotIndex: number, event: ChangeEvent<HTMLInputElement>) => void;

const EMPTY_RESULT: StoryResultState = { status: "idle" };

type StoryReferenceUploadResponse =
  | { ok: true; imageUrl: string; id: string }
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

function getDisableReason(parsed: ParsedStory): string | null {
  if (parsed.invalid.length) {
    const uniqueInvalid = Array.from(new Set(parsed.invalid));
    return `등록되지 않은 핸들: ${uniqueInvalid.map(handle => `@${handle}`).join(", ")}`;
  }
  if (parsed.mentioned.length === 0) {
    return "최소 한 개 이상의 @핸들을 사용해주세요.";
  }
  if (parsed.mentioned.length > 8) {
    return "스토리 한 컷에 사용할 수 있는 핸들은 최대 8개입니다.";
  }
  return null;
}

function flattenReferences(library: StoryReferenceLibrary): StoryReference[] {
  return [...library.characters, ...library.locations].filter((ref): ref is StoryReference => ref !== null);
}

function createGeneratedId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `story-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

export function StoryStudioShell() {
  const [library, setLibrary] = useState<StoryReferenceLibrary>(() => loadStoryReferences());
  const [storyText, setStoryText] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>(DEFAULT_ASPECT_RATIO);
  const [result, setResult] = useState<StoryResultState>(EMPTY_RESULT);
  const [uploadingSlots, setUploadingSlots] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLibrary(loadStoryReferences());
    return subscribeStoryReferences(nextLibrary => {
      setLibrary(nextLibrary);
    });
  }, []);

  const parsed = useMemo(() => parseStoryMentions(storyText, library), [library, storyText]);
  const registeredReferences = useMemo(() => flattenReferences(library), [library]);
  const disableReason = useMemo(() => getDisableReason(parsed), [parsed]);

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

  const handleGenerate = useCallback(() => {
    const currentParsed = parseStoryMentions(storyText, library);
    const reason = getDisableReason(currentParsed);
    if (reason) {
      toast.error(reason);
      return;
    }

    const mentionedRefs = currentParsed.mentioned
      .map(handle => findReferenceByHandle(library, handle))
      .filter((ref): ref is StoryReference => ref !== null);

    if (mentionedRefs.some(ref => !ref.imageUrl)) {
      toast.error("이미지가 등록되지 않은 핸들이 있습니다.");
      return;
    }

    const finalPrompt = buildFinalPrompt(storyText, mentionedRefs);
    const referenceGallery = mentionedRefs.map(ref => ref.imageUrl);
    const referenceMap = buildReferenceMap(mentionedRefs);

    setResult({ status: "loading" });

    const execute = async () => {
      try {
        const response = await callGenerateApi({
          mode: "create",
          prompt: finalPrompt,
          refinedPrompt: finalPrompt,
          options: {
            action: "story-keyvisual",
            aspectRatio,
            outputMimeType: "image/png",
            referenceImageUrl: mentionedRefs[0].imageUrl,
            referenceGallery
          }
        });

        if (!response.ok) {
          const message = response.reason ?? "잠시 후 다시 시도해주세요.";
          setResult({ status: "error", error: message });
          toast.error("이미지 생성에 실패했습니다.", { description: message });
          return;
        }

        const generatedImages =
          Array.isArray(response.images) && response.images.length > 0
            ? response.images
                .map((image, imageIndex) => ({
                  id:
                    typeof image.id === "string" && image.id.length > 0
                      ? image.id
                      : getLocalImageId(image.imageUrl) ?? `story-${imageIndex + 1}-${createGeneratedId()}`,
                  imageUrl: image.imageUrl ?? image.base64Image ?? null
                }))
                .filter((image): image is { id: string; imageUrl: string } => Boolean(image.imageUrl))
            : [
                {
                  id:
                    typeof response.id === "string" && response.id.length > 0
                      ? response.id
                      : getLocalImageId(response.imageUrl ?? response.base64Image) ?? createGeneratedId(),
                  imageUrl: response.imageUrl ?? response.base64Image ?? null
                }
              ].filter((image): image is { id: string; imageUrl: string } => Boolean(image.imageUrl));

        const primaryImage = generatedImages[0];
        if (!primaryImage) {
          const message = "이미지 데이터를 찾을 수 없습니다.";
          setResult({ status: "error", error: message });
          toast.error(message);
          return;
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
            action: "story-keyvisual",
            referenceMap,
            mentionedHandles: currentParsed.mentioned,
            referencedSlots: mentionedRefs.map(ref => ({
              handle: ref.handle,
              role: ref.role,
              slotIndex: ref.slotIndex
            })),
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
        setResult({ status: "success", imageUrl: primaryImage.imageUrl });
        toast.success("스토리 키비주얼을 생성했습니다.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "이미지 생성 중 오류가 발생했습니다.";
        setResult({ status: "error", error: message });
        toast.error("이미지 생성 중 오류가 발생했습니다.", { description: message });
      }
    };

    void execute();
  }, [aspectRatio, library, storyText]);

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">스토리</h1>
            <p className="text-sm text-muted-foreground">등록한 인물과 로케이션을 @핸들로 호출해 키비주얼 1장을 생성합니다.</p>
          </div>
          <Badge variant="secondary" className="w-fit">Phase 1</Badge>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)_minmax(0,420px)]">
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

          <StoryPromptInput
            storyText={storyText}
            onStoryTextChange={setStoryText}
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            registeredReferences={registeredReferences}
            parsed={parsed}
            disableReason={disableReason}
            generating={result.status === "loading"}
            onGenerate={handleGenerate}
          />

          <KeyVisualResult
            result={result}
            onRetry={handleGenerate}
          />
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
  aspectRatio,
  onAspectRatioChange,
  registeredReferences,
  parsed,
  disableReason,
  generating,
  onGenerate
}: {
  storyText: string;
  onStoryTextChange: (value: string) => void;
  aspectRatio: AspectRatioPreset;
  onAspectRatioChange: (value: AspectRatioPreset) => void;
  registeredReferences: StoryReference[];
  parsed: ParsedStory;
  disableReason: string | null;
  generating: boolean;
  onGenerate: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
            <span className="text-xs text-muted-foreground">{parsed.mentioned.length}/8 사용 중</span>
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
            placeholder="@민수와 @카페가 비 오는 밤에 마주치는 장면"
            className="min-h-[260px] resize-none"
          />
          <p className="text-xs text-muted-foreground">@핸들로 등록한 인물/로케이션을 호출하세요</p>
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

        {disableReason ? (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            {disableReason}
          </p>
        ) : null}

        <Button
          type="button"
          className="w-full"
          onClick={onGenerate}
          disabled={Boolean(disableReason) || generating}
        >
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          키비주얼 생성
        </Button>
      </CardContent>
    </Card>
  );
}

function KeyVisualResult({
  result,
  onRetry
}: {
  result: StoryResultState;
  onRetry: () => void;
}) {
  const isLoading = result.status === "loading";
  const hasImage = result.status === "success";
  const hasError = result.status === "error";

  return (
    <Card className="rounded-lg">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">키비주얼 결과</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <div
          className={cn(
            "flex min-h-[420px] items-center justify-center overflow-hidden rounded-lg border border-border bg-background",
            hasImage && "bg-black"
          )}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span>생성 중</span>
            </div>
          ) : hasImage ? (
            <img
              src={result.imageUrl}
              alt="스토리 키비주얼"
              className="h-full max-h-[640px] w-full object-contain"
            />
          ) : hasError ? (
            <div className="max-w-sm space-y-3 px-4 text-center">
              <p className="text-sm font-medium text-destructive">생성 실패</p>
              <p className="text-sm text-muted-foreground">{result.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                재시도
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <span>생성 결과 이미지</span>
            </div>
          )}
        </div>

        <Button asChild variant="outline" className="w-full" disabled={!hasImage}>
          <a href={hasImage ? result.imageUrl : "#"} download="sionbanana-story-keyvisual.png">
            <Download className="mr-2 h-4 w-4" />
            다운로드
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
