"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type VideoDuration = 3 | 5 | 10;
type VideoResolution = "480p" | "720p";
type VideoAspectRatio = "16:9" | "9:16" | "1:1";

type VideoGenerationResponse = {
  ok: boolean;
  id?: string;
  videoUrl?: string;
  reason?: string;
  code?: string;
};

export type VideoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceImageId: string;
  sourceImageUrl: string;
  defaultPrompt?: string;
};

const DURATION_OPTIONS: VideoDuration[] = [3, 5, 10];
const RESOLUTION_OPTIONS: VideoResolution[] = ["480p", "720p"];
const ASPECT_RATIO_OPTIONS: VideoAspectRatio[] = ["16:9", "9:16", "1:1"];
const DEFAULT_MOTION_PROMPT = "카메라가 천천히 이동하고 피사체에 자연스러운 움직임이 더해집니다.";

function shouldShowProxyHint(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("progrok") || normalized.includes("proxy") || normalized.includes("sionbanana_grok_proxy");
}

function getInitialPrompt(defaultPrompt?: string): string {
  return defaultPrompt?.trim() || DEFAULT_MOTION_PROMPT;
}

export function VideoModal({
  open,
  onOpenChange,
  sourceImageId,
  sourceImageUrl,
  defaultPrompt
}: VideoModalProps) {
  const titleId = useId();
  const promptId = useId();
  const durationId = useId();
  const resolutionId = useId();
  const aspectRatioId = useId();
  const abortControllerRef = useRef<AbortController | null>(null);
  const [prompt, setPrompt] = useState(() => getInitialPrompt(defaultPrompt));
  const [duration, setDuration] = useState<VideoDuration>(5);
  const [resolution, setResolution] = useState<VideoResolution>("720p");
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("16:9");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      return;
    }

    setPrompt(getInitialPrompt(defaultPrompt));
    setDuration(5);
    setResolution("720p");
    setAspectRatio("16:9");
    setErrorReason(null);
    setVideoUrl(null);
  }, [defaultPrompt, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setErrorReason("영상 프롬프트를 입력해주세요.");
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);
    setErrorReason(null);
    setVideoUrl(null);

    try {
      const response = await fetch("/api/video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceImageId,
          prompt: trimmedPrompt,
          duration,
          resolution,
          aspectRatio
        }),
        signal: controller.signal
      });
      const result = await response.json() as VideoGenerationResponse;

      if (!response.ok || !result.ok || !result.videoUrl) {
        setErrorReason(result.reason ?? "영상 생성에 실패했습니다.");
        return;
      }

      setVideoUrl(result.videoUrl);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setErrorReason(error instanceof Error ? error.message : "영상 생성에 실패했습니다.");
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsGenerating(false);
      }
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={event => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="mx-auto flex max-h-[calc(100vh-3rem)] max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              이미지 영상화
            </h2>
            <p className="text-xs text-muted-foreground">이미지에 모션을 더해 mp4 영상을 생성합니다.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={handleClose} aria-label="영상화 닫기">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-4 p-4 md:grid-cols-[280px_1fr]">
            <div className="space-y-2">
              <div className="overflow-hidden rounded-lg border border-border bg-muted">
                {sourceImageUrl ? (
                  <img src={sourceImageUrl} alt="영상화 소스 이미지" className="aspect-square h-full w-full object-contain" />
                ) : (
                  <div className="flex aspect-square items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    소스 이미지를 불러오지 못했습니다.
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor={promptId}>모션 프롬프트</Label>
                <Textarea
                  id={promptId}
                  value={prompt}
                  onChange={event => setPrompt(event.target.value)}
                  placeholder="예: 인물이 천천히 고개를 돌리고, 카메라는 부드럽게 줌인합니다."
                  className="min-h-[132px] resize-none"
                  disabled={isGenerating}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={durationId} className="text-xs text-muted-foreground">
                    Duration
                  </Label>
                  <select
                    id={durationId}
                    value={duration}
                    onChange={event => setDuration(Number(event.target.value) as VideoDuration)}
                    disabled={isGenerating}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {DURATION_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}초
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={resolutionId} className="text-xs text-muted-foreground">
                    Resolution
                  </Label>
                  <select
                    id={resolutionId}
                    value={resolution}
                    onChange={event => setResolution(event.target.value as VideoResolution)}
                    disabled={isGenerating}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {RESOLUTION_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={aspectRatioId} className="text-xs text-muted-foreground">
                    Aspect Ratio
                  </Label>
                  <select
                    id={aspectRatioId}
                    value={aspectRatio}
                    onChange={event => setAspectRatio(event.target.value as VideoAspectRatio)}
                    disabled={isGenerating}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ASPECT_RATIO_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isGenerating ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>영상 생성 중… 수 분 걸릴 수 있어요.</span>
                </div>
              ) : null}

              {errorReason ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <p>{errorReason}</p>
                  {shouldShowProxyHint(errorReason) ? (
                    <p className="mt-1 text-xs text-destructive/80">progrok proxy 실행 후 다시 시도해주세요.</p>
                  ) : null}
                </div>
              ) : null}

              {videoUrl ? (
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                  <video controls src={videoUrl} className="aspect-video w-full rounded-md bg-black" />
                  <Button asChild size="sm" variant="outline">
                    <a href={videoUrl} download={`sionbanana-video-${sourceImageId}.mp4`}>
                      <Download className="mr-2 h-4 w-4" />
                      다운로드
                    </a>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              닫기
            </Button>
            <Button type="submit" disabled={isGenerating || !sourceImageId || !prompt.trim()}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              영상 생성
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
