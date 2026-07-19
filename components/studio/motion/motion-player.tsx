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
import type { MotionProject } from "@/lib/motion/types";

type MotionPlayerProps = {
  project: MotionProject;
  cacheVersion: number;
  isPatching: boolean;
  updateProject: (
    patch: Partial<Pick<MotionProject, "grid" | "matte" | "frames" | "animations">>
  ) => Promise<MotionProject>;
};

function frameAssetUrl(projectId: string, frameIndex: number, cacheVersion: number): string {
  const fileName = `f${String(frameIndex + 1).padStart(2, "0")}.png`;
  return `/api/motion/projects/${encodeURIComponent(projectId)}/asset/derived/frames/${fileName}?v=${cacheVersion}`;
}

export function MotionPlayer({
  project,
  cacheVersion,
  isPatching,
  updateProject
}: MotionPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const directionRef = useRef<1 | -1>(1);
  const settingsProjectRef = useRef("");
  const initialAnimation = project.animations[0];
  const [fps, setFps] = useState(initialAnimation?.fps ?? 12);
  const [loopMode, setLoopMode] = useState<MotionProject["animations"][number]["loop"]>(
    initialAnimation?.loop ?? "loop"
  );
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showChecker, setShowChecker] = useState(true);

  const activeFrames = useMemo(
    () => project.frames.filter(frame => !frame.excluded),
    [project.frames]
  );
  const activeFrameSignature = activeFrames.map(frame => frame.index).join(",");
  const currentFrame = activeFrames[currentPosition] ?? activeFrames[0] ?? null;

  useEffect(() => {
    if (settingsProjectRef.current === project.id) return;
    settingsProjectRef.current = project.id;
    const animation = project.animations[0];
    setFps(animation?.fps ?? 12);
    setLoopMode(animation?.loop ?? "loop");
  }, [project.animations, project.id]);

  useEffect(() => {
    setCurrentPosition(0);
    directionRef.current = 1;
    lastFrameTimeRef.current = null;
  }, [project.id, project.frames.length, cacheVersion, activeFrameSignature]);

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (isLoadingImages || !currentFrame) return;
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
  }, [currentFrame, isLoadingImages, project.canvas.h, project.canvas.w]);

  useEffect(() => {
    if (!isPlaying || isLoadingImages || imageError || activeFrames.length <= 1) return;

    const animate = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) lastFrameTimeRef.current = timestamp;
      const frameDuration = 1000 / fps;
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
  }, [activeFrames.length, fps, imageError, isLoadingImages, isPlaying, loopMode]);

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
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label>FPS</Label>
            <span className="text-sm tabular-nums text-muted-foreground">{fps}</span>
          </div>
          <Slider
            min={1}
            max={30}
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
