"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Frame, MotionProject } from "@/lib/motion/types";

export type MotionPreviewCandidate = {
  id: string;
  frames: number[];
};

type MotionPlayerProps = {
  project: MotionProject;
  cacheVersion: number;
  isPatching: boolean;
  selectedFrameIndices: number[];
  previewCandidate: MotionPreviewCandidate | null;
  onSelectedFrameIndicesChange: (indices: number[]) => void;
  updateProject: (
    patch: Partial<Pick<MotionProject, "grid" | "matte" | "frames" | "animations">>
  ) => Promise<MotionProject>;
};

function frameAssetUrl(projectId: string, frameIndex: number, cacheVersion: number): string {
  const fileName = `f${String(frameIndex + 1).padStart(2, "0")}.png`;
  return `/api/motion/projects/${encodeURIComponent(projectId)}/asset/derived/frames/${fileName}?v=${cacheVersion}`;
}

function candidateAssetUrl(projectId: string, candidateId: string, frameIndex: number): string {
  const fileName = `f${String(frameIndex + 1).padStart(2, "0")}.png`;
  return `/api/motion/projects/${encodeURIComponent(projectId)}/asset/candidates/${encodeURIComponent(candidateId)}/frames/${fileName}`;
}

function describeSelection(indices: number[]): string {
  if (indices.length === 0) return "선택된 프레임 없음";
  const sorted = [...indices].sort((left, right) => left - right);
  const contiguous = sorted.every((index, position) => position === 0 || index === sorted[position - 1] + 1);
  const label = contiguous
    ? sorted.length === 1
      ? String(sorted[0] + 1)
      : `${sorted[0] + 1}~${sorted[sorted.length - 1] + 1}`
    : sorted.map(index => index + 1).join(", ");
  return `선택 구간: ${label} (${sorted.length}장)`;
}

type AlphaAnalysis = {
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX: number;
  pivotY: number;
};

function analyzeAlpha(image: HTMLImageElement): AlphaAnalysis | null {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width < 1 || height < 1) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  const foreground: Array<{ x: number; y: number }> = [];
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < width * height; index += 1) {
    if (pixels[index * 4 + 3] <= 8) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    foreground.push({ x, y });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return null;
  const ys = foreground.map(pixel => pixel.y).sort((left, right) => left - right);
  const pivotY = ys[Math.floor((ys.length - 1) * 0.95)] ?? maxY;
  const baselinePixels = foreground.filter(pixel => pixel.y >= pivotY);
  const pivotX = Math.round(
    baselinePixels.reduce((sum, pixel) => sum + pixel.x, 0) / baselinePixels.length
  );
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, pivotX, pivotY };
}

function drawCandidatePreview(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  frame: Frame,
  alpha: AlphaAnalysis | null
): void {
  if (!alpha || alpha.w < 1 || alpha.h < 1 || frame.trim.h < 1) return;
  const scale = frame.trim.h / alpha.h;
  const destinationX = frame.pivot.x - (alpha.pivotX - alpha.x) * scale;
  const destinationY = frame.pivot.y - (alpha.pivotY - alpha.y) * scale;
  context.drawImage(
    image,
    alpha.x,
    alpha.y,
    alpha.w,
    alpha.h,
    destinationX,
    destinationY,
    alpha.w * scale,
    alpha.h * scale
  );
}

export function MotionPlayer({
  project,
  cacheVersion,
  isPatching,
  selectedFrameIndices,
  previewCandidate,
  onSelectedFrameIndicesChange,
  updateProject
}: MotionPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const previewImagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const previewAlphaRef = useRef<Map<number, AlphaAnalysis | null>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const directionRef = useRef<1 | -1>(1);
  const currentFrameRef = useRef<MotionProject["frames"][number] | null>(null);
  const settingsProjectRef = useRef("");
  const selectionAnchorRef = useRef<number | null>(null);
  const initialAnimation = project.animations[0];
  const [fps, setFps] = useState(initialAnimation?.fps ?? 12);
  const [loopMode, setLoopMode] = useState<MotionProject["animations"][number]["loop"]>(
    initialAnimation?.loop ?? "loop"
  );
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [imageError, setImageError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [showChecker, setShowChecker] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.25 | 0.5 | 1>(1);

  const activeFrames = useMemo(
    () => project.frames.filter(frame => !frame.excluded),
    [project.frames]
  );
  const activeFrameSignature = activeFrames.map(frame => frame.index).join(",");
  const selectedFrameSet = useMemo(() => new Set(selectedFrameIndices), [selectedFrameIndices]);
  const previewFrameSet = useMemo(
    () => new Set(previewCandidate?.frames ?? []),
    [previewCandidate?.frames]
  );
  const currentFrame = activeFrames[currentPosition] ?? activeFrames[0] ?? null;
  currentFrameRef.current = currentFrame;
  const durationSeconds = useMemo(
    () =>
      activeFrames.reduce(
        (total, frame) => total + (frame.durationMs ?? 1000 / fps),
        0
      ) / 1000,
    [activeFrames, fps]
  );
  const excludedDuplicateFrames = project.duplicateDetection?.excludedFrames.length ?? 0;
  const hasMirroredRows = project.mirrorDetection?.rows.some(row => row.mirrored) ?? false;

  useEffect(() => {
    if (settingsProjectRef.current === project.id) return;
    settingsProjectRef.current = project.id;
    const animation = project.animations[0];
    setFps(animation?.fps ?? 12);
    setLoopMode(animation?.loop ?? "loop");
    selectionAnchorRef.current = null;
  }, [project.animations, project.id]);

  useEffect(() => {
    setCurrentPosition(0);
    directionRef.current = 1;
    lastFrameTimeRef.current = null;
  }, [project.id, project.frames.length, cacheVersion, activeFrameSignature]);

  useEffect(() => {
    const anchor = selectionAnchorRef.current;
    if (anchor !== null && !project.frames.some(frame => frame.index === anchor)) {
      selectionAnchorRef.current = null;
    }
  }, [cacheVersion, project.frames]);

  useEffect(() => {
    let disposed = false;
    setIsPlaying(false);
    setIsLoadingImages(true);
    setImageError(null);
    imagesRef.current = new Map();

    const preload = project.frames.map(
      frame =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            if (!disposed) imagesRef.current.set(frame.index, image);
            resolve();
          };
          image.onerror = () => reject(new Error(`${frame.index + 1}번 프레임을 불러오지 못했습니다.`));
          image.src = frameAssetUrl(project.id, frame.index, cacheVersion);
        })
    );

    void Promise.all(preload)
      .then(() => {
        if (disposed) return;
        setIsLoadingImages(false);
        setIsPlaying(activeFrames.length > 1);
      })
      .catch(error => {
        if (disposed) return;
        setIsLoadingImages(false);
        setImageError(error instanceof Error ? error.message : "프레임을 불러오지 못했습니다.");
      });

    return () => {
      disposed = true;
    };
  }, [activeFrames.length, cacheVersion, project.frames, project.id]);

  useEffect(() => {
    let disposed = false;
    previewImagesRef.current = new Map();
    previewAlphaRef.current = new Map();
    setPreviewError(null);
    if (!previewCandidate) {
      setPreviewVersion(version => version + 1);
      return () => {
        disposed = true;
      };
    }
    const frameIndices = [...new Set(previewCandidate.frames)];
    const failedFrames: number[] = [];
    void Promise.all(
      frameIndices.map(
        frameIndex =>
          new Promise<void>(resolve => {
            const image = new Image();
            image.onload = () => {
              if (!disposed) {
                const alpha = analyzeAlpha(image);
                previewImagesRef.current.set(frameIndex, image);
                previewAlphaRef.current.set(frameIndex, alpha);
                if (!alpha) failedFrames.push(frameIndex);
              }
              resolve();
            };
            image.onerror = () => {
              failedFrames.push(frameIndex);
              resolve();
            };
            image.src = candidateAssetUrl(project.id, previewCandidate.id, frameIndex);
          })
      )
    ).then(() => {
      if (!disposed) {
        setPreviewError(
          failedFrames.length > 0
            ? failedFrames.map(index => String(index + 1)).join(", ") + "번 후보 프레임을 불러오지 못해 원본을 표시합니다."
            : null
        );
        setPreviewVersion(version => version + 1);
      }
    });
    return () => {
      disposed = true;
    };
  }, [previewCandidate, project.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (isLoadingImages || !currentFrame) return;
    const previewImage =
      previewCandidate &&
      selectedFrameSet.has(currentFrame.index) &&
      previewFrameSet.has(currentFrame.index)
        ? previewImagesRef.current.get(currentFrame.index)
        : null;
    if (previewImage) {
      context.save();
      context.imageSmoothingEnabled = true;
      if (currentFrame.flipX) {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }
      drawCandidatePreview(
        context,
        previewImage,
        currentFrame,
        previewAlphaRef.current.get(currentFrame.index) ?? null
      );
      context.restore();
      return;
    }
    const image = imagesRef.current.get(currentFrame.index);
    if (!image) return;

    context.save();
    context.imageSmoothingEnabled = false;
    if (currentFrame.flipX) {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.restore();
  }, [
    currentFrame,
    isLoadingImages,
    previewCandidate,
    previewFrameSet,
    previewVersion,
    project.canvas.h,
    project.canvas.w,
    selectedFrameSet
  ]);

  useEffect(() => {
    if (!isPlaying || isLoadingImages || imageError || activeFrames.length <= 1) return;

    const animate = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) lastFrameTimeRef.current = timestamp;
      const frameDuration = (currentFrameRef.current?.durationMs ?? 1000 / fps) / playbackSpeed;
      if (timestamp - lastFrameTimeRef.current >= frameDuration) {
        lastFrameTimeRef.current = timestamp;
        setCurrentPosition(previous => {
          if (loopMode === "pingpong") {
            const next = previous + directionRef.current;
            if (next >= activeFrames.length) {
              directionRef.current = -1;
              return Math.max(0, activeFrames.length - 2);
            }
            if (next < 0) {
              directionRef.current = 1;
              return Math.min(activeFrames.length - 1, 1);
            }
            return next;
          }

          if (previous >= activeFrames.length - 1) {
            if (loopMode === "once") {
              setIsPlaying(false);
              return previous;
            }
            return 0;
          }
          return previous + 1;
        });
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastFrameTimeRef.current = null;
    };
  }, [activeFrames.length, fps, imageError, isLoadingImages, isPlaying, loopMode, playbackSpeed]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    },
    []
  );

  const stepFrame = (direction: -1 | 1) => {
    if (activeFrames.length === 0) return;
    setIsPlaying(false);
    directionRef.current = direction;
    setCurrentPosition(previous => (previous + direction + activeFrames.length) % activeFrames.length);
  };

  const togglePlayback = () => {
    if (isLoadingImages || imageError || activeFrames.length <= 1) return;
    if (!isPlaying && loopMode === "once" && currentPosition >= activeFrames.length - 1) {
      setCurrentPosition(0);
      directionRef.current = 1;
    }
    setIsPlaying(value => !value);
  };

  const selectTimelineFrame = (frameIndex: number, shiftKey: boolean) => {
    if (isPatching) return;
    const anchor = selectionAnchorRef.current;
    if (shiftKey && anchor !== null) {
      const start = Math.min(anchor, frameIndex);
      const end = Math.max(anchor, frameIndex);
      onSelectedFrameIndicesChange(
        Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
      );
      return;
    }
    selectionAnchorRef.current = frameIndex;
    onSelectedFrameIndicesChange([frameIndex]);
  };

  const saveAnimation = async () => {
    const animations: MotionProject["animations"] =
      project.animations.length > 0
        ? project.animations.map((animation, index) =>
            index === 0 ? { ...animation, fps, loop: loopMode } : animation
          )
        : [
            {
              name: "기본",
              frameIndices: activeFrames.map(frame => frame.index),
              fps,
              loop: loopMode
            }
          ];
    try {
      await updateProject({ animations });
      toast.success("재생 설정을 저장했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "재생 설정을 저장하지 못했습니다.");
    }
  };

  const checkerStyle = showChecker
    ? {
        backgroundColor: "#ffffff",
        backgroundImage:
          "linear-gradient(45deg, #d4d4d4 25%, transparent 25%), linear-gradient(-45deg, #d4d4d4 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d4 75%), linear-gradient(-45deg, transparent 75%, #d4d4d4 75%)",
        backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
        backgroundSize: "16px 16px"
      }
    : undefined;

  return (
    <Card className="min-w-0 self-start xl:sticky xl:top-6">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="truncate text-lg">{project.name}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            캔버스 {project.canvas.w}×{project.canvas.h}
          </p>
        </div>
        <Badge variant="secondary">{activeFrames.length}개 재생</Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-lg border bg-muted/30 p-4">
          <div className="max-h-[520px] max-w-full overflow-hidden rounded border" style={checkerStyle}>
            <canvas
              ref={canvasRef}
              width={project.canvas.w}
              height={project.canvas.h}
              className="block h-auto max-h-[500px] max-w-full object-contain"
            />
          </div>
          {isLoadingImages ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/75 text-sm">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
              프레임 불러오는 중…
            </div>
          ) : null}
          {imageError ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/85 px-6 text-center text-sm text-destructive">
              {imageError}
            </div>
          ) : null}
          {!isLoadingImages && !imageError && activeFrames.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/75 px-6 text-center text-sm text-muted-foreground">
              제외되지 않은 프레임이 없습니다.
            </div>
          ) : null}
        </div>

        {previewCandidate ? (
          <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
            <p>선택 구간에서 후보 프리뷰를 보고 있습니다. 적용 전까지 프로젝트에는 저장되지 않습니다.</p>
            {previewError ? <p className="text-destructive">{previewError}</p> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => stepFrame(-1)}
            disabled={isLoadingImages || activeFrames.length === 0}
            aria-label="이전 프레임"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="icon"
            onClick={togglePlayback}
            disabled={isLoadingImages || Boolean(imageError) || activeFrames.length <= 1}
            aria-label={isPlaying ? "일시정지" : "재생"}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" aria-hidden />
            ) : (
              <Play className="h-4 w-4" aria-hidden />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => stepFrame(1)}
            disabled={isLoadingImages || activeFrames.length === 0}
            aria-label="다음 프레임"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          <span className="ml-2 text-sm tabular-nums text-muted-foreground">
            {currentFrame ? `프레임 ${currentFrame.index + 1} / ${project.frames.length}` : "프레임 없음"}
          </span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {activeFrames.length}장 / {fps} FPS / {durationSeconds.toFixed(2)}초
          </span>
          {excludedDuplicateFrames > 0 ? (
            <Badge variant="secondary">중복 행 제외 {excludedDuplicateFrames}장</Badge>
          ) : null}
          {hasMirroredRows ? <Badge variant="secondary">2행 반전 보정</Badge> : null}
          <ToggleGroup
            type="single"
            value={String(playbackSpeed)}
            onValueChange={value => {
              if (value === "0.25" || value === "0.5" || value === "1") {
                setPlaybackSpeed(Number(value) as 0.25 | 0.5 | 1);
                lastFrameTimeRef.current = null;
              }
            }}
          >
            <ToggleGroupItem value="0.25" aria-label="0.25배 속도">
              0.25×
            </ToggleGroupItem>
            <ToggleGroupItem value="0.5" aria-label="0.5배 속도">
              0.5×
            </ToggleGroupItem>
            <ToggleGroupItem value="1" aria-label="1배 속도">
              1×
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label>타임라인</Label>
            <span className="text-xs font-medium text-muted-foreground">
              {describeSelection(selectedFrameIndices)}
            </span>
          </div>
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-2">
              {project.frames.map(frame => (
                <button
                  key={frame.index}
                  type="button"
                  disabled={isPatching}
                  onClick={event => selectTimelineFrame(frame.index, event.shiftKey)}
                  className={`relative w-20 overflow-hidden rounded-md border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    selectedFrameSet.has(frame.index)
                      ? "border-primary ring-2 ring-primary/30"
                      : "hover:border-primary/60"
                  }`}
                  aria-pressed={selectedFrameSet.has(frame.index)}
                  aria-label={`${frame.index + 1}번 프레임 선택${frame.override ? ", 수정됨" : ""}`}
                >
                  <div
                    className={`aspect-square bg-muted/30 bg-contain bg-center bg-no-repeat ${
                      frame.flipX ? "-scale-x-100" : ""
                    } ${frame.excluded ? "opacity-35" : ""}`}
                    style={{
                      backgroundImage: `url("${frameAssetUrl(project.id, frame.index, cacheVersion)}")`
                    }}
                  />
                  <div className="flex items-center justify-between border-t px-2 py-1 text-xs">
                    <span>{frame.index + 1}</span>
                    {frame.override ? (
                      <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                        수정됨
                      </Badge>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            클릭으로 한 장을 선택하고 Shift+클릭으로 연속 구간을 선택합니다.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label>FPS</Label>
            <span className="text-sm tabular-nums text-muted-foreground">{fps}</span>
          </div>
          <Slider
            min={1}
            max={60}
            step={1}
            value={[fps]}
            onValueChange={value => setFps(Math.round(value[0] ?? 12))}
          />
        </div>

        <div className="space-y-2">
          <Label>루프 모드</Label>
          <ToggleGroup
            type="single"
            value={loopMode}
            className="grid grid-cols-3 gap-2"
            onValueChange={value => {
              if (value === "loop" || value === "pingpong" || value === "once") {
                setLoopMode(value);
                directionRef.current = 1;
              }
            }}
          >
            <ToggleGroupItem value="loop" className="min-w-0">
              반복
            </ToggleGroupItem>
            <ToggleGroupItem value="pingpong" className="min-w-0">
              왕복
            </ToggleGroupItem>
            <ToggleGroupItem value="once" className="min-w-0">
              한 번
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="space-y-1">
            <Label htmlFor="motion-checker">체크무늬 배경</Label>
            <p className="text-xs text-muted-foreground">투명 영역을 확인합니다.</p>
          </div>
          <Switch id="motion-checker" checked={showChecker} onCheckedChange={setShowChecker} />
        </div>

        <Button className="w-full" disabled={isPatching} onClick={() => void saveAnimation()}>
          {isPatching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden />
          )}
          재생 설정 저장
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          FPS와 루프 변경은 저장 버튼을 누를 때 프로젝트에 반영됩니다.
        </p>
      </CardContent>
    </Card>
  );
}
