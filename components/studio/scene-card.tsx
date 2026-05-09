"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Download,
  Image as ImageIcon,
  Loader2,
  RefreshCw
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { GenerationOptionsValue } from "@/components/studio/generation-options-panel";
import type { SceneCinematography } from "@/lib/story-cinematography";
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
  onRegenerateScene: (sceneId: string) => void;
  onMoveScene: (sceneId: string, direction: "up" | "down") => void;
  onPreviewRecord: (record: GeneratedImageDocument) => void;
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

export function SceneCard({
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
}: SceneCardProps) {
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
