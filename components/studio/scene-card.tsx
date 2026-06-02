"use client";

import { useState, type ChangeEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  RefreshCw
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GenerationOptionsValue } from "@/components/studio/generation-options-panel";
import { VideoModal } from "@/components/studio/video-modal";
import {
  ANGLE_OPTIONS,
  FRAMING_OPTIONS,
  SPECIAL_OPTIONS,
  getCinematographyAngleOption,
  getCinematographyFramingOption,
  getCinematographySpecialOption,
  type CinematographyAngle,
  type CinematographyFraming,
  type CinematographySpecial,
  type SceneCinematography
} from "@/lib/story-cinematography";
import type { GeneratedImageDocument } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SceneStatus = "idle" | "generating" | "completed" | "error";

export type Scene = {
  id: string;
  prompt: string;
  mentions: string[];
  cinematography: SceneCinematography;
  status: SceneStatus;
  resultUrl?: string;
  resultRecord?: GeneratedImageDocument;
  resultFormat?: GenerationOptionsValue["format"];
  error?: string;
};

type SceneCardProps = {
  scene: Scene;
  index: number;
  editable: boolean;
  allGenerationActive: boolean;
  onPromptChange: (sceneId: string, prompt: string) => void;
  onCinematographyChange: (sceneId: string, next: SceneCinematography) => void;
  onRegenerateScene: (sceneId: string) => void;
  onMoveScene: (sceneId: string, direction: "up" | "down") => void;
  onPreviewRecord: (record: GeneratedImageDocument) => void;
  toneLabel: string | null;
  moveDisabled: boolean;
  isFirst: boolean;
  isLast: boolean;
};

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

function getImageFormatExtension(format?: GenerationOptionsValue["format"]): string {
  if (format === "jpeg") {
    return "jpg";
  }
  return format ?? "png";
}

const ANGLE_CHIP_LABELS: Record<CinematographyAngle, string> = {
  "eye-level": "아이",
  "high-angle": "하이",
  "low-angle": "로우",
  "dutch-angle": "더치",
  "birds-eye": "버드",
  "worms-eye": "웜"
};

function getCinematographyChipLabel(cinematography: SceneCinematography): string {
  const framing = getCinematographyFramingOption(cinematography.framing);
  const special = cinematography.special ? getCinematographySpecialOption(cinematography.special) : null;
  return [framing.code, ANGLE_CHIP_LABELS[cinematography.angle], special?.label].filter(Boolean).join(" · ");
}

export function formatScenePromptPreview(scene: Scene, toneLabel: string | null): string {
  const framing = getCinematographyFramingOption(scene.cinematography.framing);
  const angle = getCinematographyAngleOption(scene.cinematography.angle);
  const special = scene.cinematography.special ? getCinematographySpecialOption(scene.cinematography.special) : null;
  const cameraLabels = [framing.label, angle.label, special?.label].filter(Boolean).join(", ");
  const lines = [scene.prompt, "", `카메라: ${cameraLabels}.`];

  if (toneLabel) {
    lines.push(`톤: ${toneLabel}.`);
  }

  return lines.join("\n");
}

export function SceneCard({
  scene,
  index,
  editable,
  allGenerationActive,
  onPromptChange,
  onCinematographyChange,
  onRegenerateScene,
  onMoveScene,
  onPreviewRecord,
  toneLabel,
  moveDisabled,
  isFirst,
  isLast
}: SceneCardProps) {
  const isGenerating = scene.status === "generating";
  const isCompleted = scene.status === "completed" && Boolean(scene.resultUrl);
  const canRegenerate = !allGenerationActive && !isGenerating;
  const downloadExtension = getImageFormatExtension(scene.resultFormat);
  const [isGeneratedPromptOpen, setIsGeneratedPromptOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const generatedPrompt = scene.status === "completed" && scene.resultRecord
    ? scene.resultRecord.promptMeta?.refinedPrompt ?? scene.prompt
    : formatScenePromptPreview(scene, toneLabel);
  const cinematographyControlsDisabled = allGenerationActive || isGenerating;
  const chipLabel = getCinematographyChipLabel(scene.cinematography);
  const framingSelectId = `${scene.id}-framing`;
  const angleSelectId = `${scene.id}-angle`;
  const specialSelectId = `${scene.id}-special`;
  const videoSourceImageUrl = scene.resultRecord?.imageUrl ?? scene.resultUrl ?? "";
  const videoDefaultPrompt = "카메라가 부드럽게 움직이고 장면에 자연스러운 생동감이 더해집니다.";
  const canCreateVideo = isCompleted && Boolean(scene.resultRecord?.id && videoSourceImageUrl);

  const handleFramingChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onCinematographyChange(scene.id, {
      ...scene.cinematography,
      framing: event.target.value as CinematographyFraming
    });
  };

  const handleAngleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onCinematographyChange(scene.id, {
      ...scene.cinematography,
      angle: event.target.value as CinematographyAngle
    });
  };

  const handleSpecialChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    onCinematographyChange(scene.id, {
      ...scene.cinematography,
      special: value === "none" ? null : value as CinematographySpecial
    });
  };

  return (
    <div className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">씬 {index + 1}</span>
          <Badge variant={getSceneStatusVariant(scene.status)}>{getSceneStatusLabel(scene.status)}</Badge>
          <span className="whitespace-nowrap rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] leading-4 tracking-normal text-muted-foreground">
            {chipLabel}
          </span>
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor={framingSelectId} className="text-[11px] text-muted-foreground">
              Framing
            </Label>
            <select
              id={framingSelectId}
              value={scene.cinematography.framing}
              onChange={handleFramingChange}
              disabled={cinematographyControlsDisabled}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {FRAMING_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={angleSelectId} className="text-[11px] text-muted-foreground">
              Angle
            </Label>
            <select
              id={angleSelectId}
              value={scene.cinematography.angle}
              onChange={handleAngleChange}
              disabled={cinematographyControlsDisabled}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ANGLE_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={specialSelectId} className="text-[11px] text-muted-foreground">
              Special
            </Label>
            <select
              id={specialSelectId}
              value={scene.cinematography.special ?? "none"}
              onChange={handleSpecialChange}
              disabled={cinematographyControlsDisabled}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="none">없음</option>
              {SPECIAL_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
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

        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" className="w-full" disabled={!isCompleted}>
            <a href={isCompleted ? scene.resultUrl : "#"} download={`sionbanana-story-scene-${index + 1}.${downloadExtension}`}>
              <Download className="mr-2 h-4 w-4" />
              다운로드
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setIsVideoModalOpen(true)}
            disabled={!canCreateVideo}
          >
            <Film className="mr-2 h-4 w-4" />
            영상화
          </Button>
        </div>
      </div>
      {scene.resultRecord ? (
        <VideoModal
          open={isVideoModalOpen}
          onOpenChange={setIsVideoModalOpen}
          sourceImageId={scene.resultRecord.id}
          sourceImageUrl={videoSourceImageUrl}
          defaultPrompt={videoDefaultPrompt}
        />
      ) : null}
    </div>
  );
}
