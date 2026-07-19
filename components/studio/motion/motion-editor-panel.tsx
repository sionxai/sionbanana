"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MotionProject } from "@/lib/motion/types";

type MotionEditorPanelProps = {
  project: MotionProject;
  cacheVersion: number;
  isPatching: boolean;
  onMatteDirtyChange: (dirty: boolean) => void;
  updateProject: (
    patch: Partial<
      Pick<MotionProject, "sliceMode" | "grid" | "matte" | "frames" | "animations">
    >
  ) => Promise<MotionProject>;
};

const SLIDER_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End"
]);

function frameAssetUrl(projectId: string, frameIndex: number, cacheVersion: number): string {
  const fileName = `f${String(frameIndex + 1).padStart(2, "0")}.png`;
  return `/api/motion/projects/${encodeURIComponent(projectId)}/asset/derived/frames/${fileName}?v=${cacheVersion}`;
}

export function MotionEditorPanel({
  project,
  cacheVersion,
  isPatching,
  onMatteDirtyChange,
  updateProject
}: MotionEditorPanelProps) {
  const [matteDraft, setMatteDraft] = useState<MotionProject["matte"]>(project.matte);
  const [gridCols, setGridCols] = useState(project.grid.cols);
  const [gridRows, setGridRows] = useState(project.grid.rows);
  const [mattePending, setMattePending] = useState(false);
  const [includeGif, setIncludeGif] = useState(true);
  const [gifFps, setGifFps] = useState(project.animations[0]?.fps ?? 12);
  const [isExporting, setIsExporting] = useState(false);
  const matteDraftRef = useRef(matteDraft);
  const matteDirtyRef = useRef(false);
  const matteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sliderInteractingRef = useRef(false);
  const isPatchingRef = useRef(isPatching);
  const synchronizedProjectIdRef = useRef(project.id);
  const mountedRef = useRef(true);
  const onMatteDirtyChangeRef = useRef(onMatteDirtyChange);

  useEffect(() => {
    onMatteDirtyChangeRef.current = onMatteDirtyChange;
  }, [onMatteDirtyChange]);

  useEffect(() => {
    isPatchingRef.current = isPatching;
  }, [isPatching]);

  useEffect(() => {
    setGifFps(project.animations[0]?.fps ?? 12);
  }, [project.animations, project.id]);

  const setMatteDirty = useCallback((dirty: boolean) => {
    if (matteDirtyRef.current === dirty) return;
    matteDirtyRef.current = dirty;
    onMatteDirtyChangeRef.current(dirty);
  }, []);

  const clearMatteTimer = useCallback((updateState = true) => {
    if (matteTimerRef.current) {
      clearTimeout(matteTimerRef.current);
      matteTimerRef.current = null;
    }
    if (updateState) setMattePending(false);
  }, []);

  useEffect(() => {
    const changedProject = synchronizedProjectIdRef.current !== project.id;
    if (changedProject) {
      synchronizedProjectIdRef.current = project.id;
      clearMatteTimer();
      setMatteDirty(false);
      sliderInteractingRef.current = false;
    }
    if (changedProject || !matteDirtyRef.current) {
      matteDraftRef.current = project.matte;
      setMatteDraft(project.matte);
    }
    setGridCols(project.grid.cols);
    setGridRows(project.grid.rows);
  }, [clearMatteTimer, project.grid, project.id, project.matte, setMatteDirty]);

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        clearMatteTimer(false);
      };
    },
    [clearMatteTimer]
  );

  const scheduleMattePatch = useCallback(() => {
    clearMatteTimer();
    if (!matteDirtyRef.current || sliderInteractingRef.current) return;
    setMattePending(true);

    const sendWhenReady = () => {
      if (!mountedRef.current) return;
      if (isPatchingRef.current) {
        matteTimerRef.current = setTimeout(sendWhenReady, 500);
        return;
      }
      matteTimerRef.current = null;
      setMattePending(false);
      const nextMatte = matteDraftRef.current;
      setMatteDirty(false);
      void updateProject({ matte: nextMatte }).catch(error => {
        if (!mountedRef.current) return;
        setMatteDirty(true);
        if (error instanceof Error && error.message === "다른 변경사항을 재빌드하고 있습니다.") {
          setMattePending(true);
          matteTimerRef.current = setTimeout(sendWhenReady, 500);
          return;
        }
        toast.error(error instanceof Error ? error.message : "매트를 재빌드하지 못했습니다.");
      });
    };

    matteTimerRef.current = setTimeout(sendWhenReady, 500);
  }, [clearMatteTimer, setMatteDirty, updateProject]);

  const changeMatte = useCallback(
    (next: MotionProject["matte"], schedule = true) => {
      matteDraftRef.current = next;
      setMatteDirty(true);
      setMatteDraft(next);
      if (schedule) scheduleMattePatch();
    },
    [scheduleMattePatch, setMatteDirty]
  );

  const beginSliderInteraction = () => {
    clearMatteTimer();
    sliderInteractingRef.current = true;
  };

  const endSliderInteraction = () => {
    sliderInteractingRef.current = false;
    scheduleMattePatch();
  };

  const handleSliderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!SLIDER_KEYS.has(event.key)) return;
    clearMatteTimer();
    sliderInteractingRef.current = true;
  };

  const handleSliderKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!SLIDER_KEYS.has(event.key)) return;
    sliderInteractingRef.current = false;
    scheduleMattePatch();
  };

  const commitGrid = async () => {
    if (project.sliceMode !== "grid") return;
    if (
      !Number.isInteger(gridCols) ||
      !Number.isInteger(gridRows) ||
      gridCols < 1 ||
      gridRows < 1
    ) {
      toast.error("격자 열과 행은 1 이상의 정수여야 합니다.");
      return;
    }
    if (gridCols === project.grid.cols && gridRows === project.grid.rows) return;

    const includeMatte = matteDirtyRef.current;
    clearMatteTimer();
    if (includeMatte) setMatteDirty(false);
    try {
      const rebuilt = await updateProject({
        grid: { ...project.grid, cols: gridCols, rows: gridRows },
        ...(includeMatte ? { matte: matteDraftRef.current } : {})
      });
      if (!mountedRef.current) return;
      setGridCols(rebuilt.grid.cols);
      setGridRows(rebuilt.grid.rows);
      toast.success("격자를 재빌드했습니다.");
    } catch (error) {
      if (!mountedRef.current) return;
      if (includeMatte) setMatteDirty(true);
      toast.error(error instanceof Error ? error.message : "격자를 재빌드하지 못했습니다.");
    }
  };

  const commitSliceMode = async (sliceMode: MotionProject["sliceMode"]) => {
    if (sliceMode === project.sliceMode) return;
    const includeMatte = matteDirtyRef.current;
    clearMatteTimer();
    if (includeMatte) setMatteDirty(false);
    try {
      const rebuilt = await updateProject({
        sliceMode,
        ...(includeMatte ? { matte: matteDraftRef.current } : {})
      });
      if (!mountedRef.current) return;
      setGridCols(rebuilt.grid.cols);
      setGridRows(rebuilt.grid.rows);
      toast.success(sliceMode === "auto" ? "자동 슬라이싱을 적용했습니다." : "격자 슬라이싱을 적용했습니다.");
    } catch (error) {
      if (!mountedRef.current) return;
      if (includeMatte) setMatteDirty(true);
      toast.error(error instanceof Error ? error.message : "슬라이싱 모드를 변경하지 못했습니다.");
    }
  };

  const patchFrame = async (frameIndex: number, field: "excluded" | "flipX", value: boolean) => {
    const includeMatte = matteDirtyRef.current;
    clearMatteTimer();
    if (includeMatte) setMatteDirty(false);
    const frames = project.frames.map(frame =>
      frame.index === frameIndex ? { ...frame, [field]: value } : frame
    );
    try {
      await updateProject({
        frames,
        ...(includeMatte ? { matte: matteDraftRef.current } : {})
      });
    } catch (error) {
      if (!mountedRef.current) return;
      if (includeMatte) setMatteDirty(true);
      toast.error(error instanceof Error ? error.message : "프레임을 재빌드하지 못했습니다.");
    }
  };

  const exportAssets = async () => {
    if (isExporting) return;
    if (includeGif && (!Number.isSafeInteger(gifFps) || gifFps < 1)) {
      toast.error("GIF fps는 1 이상의 정수여야 합니다.");
      return;
    }

    setIsExporting(true);
    try {
      const query = new URLSearchParams({ gif: includeGif ? "1" : "0" });
      if (includeGif) query.set("fps", String(gifFps));
      const response = await fetch(
        `/api/motion/projects/${encodeURIComponent(project.id)}/export?${query.toString()}`
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { reason?: unknown } | null;
        throw new Error(
          typeof payload?.reason === "string" ? payload.reason : "에셋을 내보내지 못했습니다."
        );
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      try {
        const disposition = response.headers.get("Content-Disposition") ?? "";
        const fileName = disposition.match(/filename="([A-Za-z0-9.-]+)"/)?.[1];
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = fileName ?? `${project.id}-motion.zip`;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      }
      toast.success("모션 에셋 ZIP을 준비했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "에셋을 내보내지 못했습니다.");
    } finally {
      if (mountedRef.current) setIsExporting(false);
    }
  };

  const disabled = isPatching;

  return (
    <div className="min-w-0 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">매트 조절</CardTitle>
          {isPatching ? (
            <Badge variant="warning">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
              재빌드 중
            </Badge>
          ) : mattePending || matteDirtyRef.current ? (
            <Badge variant="secondary">변경 대기 중</Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>모드</Label>
            <ToggleGroup
              type="single"
              value={matteDraft.mode}
              disabled={disabled}
              className="grid grid-cols-3 gap-2"
              onValueChange={value => {
                if (value === "none" || value === "keyColor" || value === "edgeFlood") {
                  changeMatte({
                    ...matteDraftRef.current,
                    mode: value,
                    ...(value === "keyColor" && !matteDraftRef.current.keyColor
                      ? { keyColor: "#FF00FF" }
                      : {})
                  });
                }
              }}
            >
              <ToggleGroupItem value="none" className="min-w-0" disabled={disabled}>
                없음
              </ToggleGroupItem>
              <ToggleGroupItem value="keyColor" className="min-w-0" disabled={disabled}>
                키 컬러
              </ToggleGroupItem>
              <ToggleGroupItem value="edgeFlood" className="min-w-0" disabled={disabled}>
                가장자리
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {matteDraft.mode === "keyColor" ? (
            <div className="space-y-2">
              <Label htmlFor="motion-key-color">키 컬러</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="motion-key-color"
                  type="color"
                  value={matteDraft.keyColor ?? "#FF00FF"}
                  disabled={disabled}
                  className="w-16 p-1"
                  onChange={event =>
                    changeMatte({ ...matteDraftRef.current, keyColor: event.target.value.toUpperCase() })
                  }
                />
                <span className="font-mono text-sm">{matteDraft.keyColor ?? "#FF00FF"}</span>
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>허용 오차</Label>
              <span className="text-sm tabular-nums text-muted-foreground">{matteDraft.tolerance}</span>
            </div>
            <div
              onPointerDown={beginSliderInteraction}
              onPointerUp={endSliderInteraction}
              onPointerCancel={endSliderInteraction}
              onKeyDown={handleSliderKeyDown}
              onKeyUp={handleSliderKeyUp}
              onBlur={() => {
                if (!sliderInteractingRef.current) return;
                sliderInteractingRef.current = false;
                scheduleMattePatch();
              }}
            >
              <Slider
                min={0}
                max={100}
                step={1}
                value={[matteDraft.tolerance]}
                disabled={disabled}
                onValueChange={value =>
                  changeMatte(
                    { ...matteDraftRef.current, tolerance: Math.round(value[0] ?? 0) },
                    false
                  )
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>부드러움</Label>
              <span className="text-sm tabular-nums text-muted-foreground">{matteDraft.softness}</span>
            </div>
            <div
              onPointerDown={beginSliderInteraction}
              onPointerUp={endSliderInteraction}
              onPointerCancel={endSliderInteraction}
              onKeyDown={handleSliderKeyDown}
              onKeyUp={handleSliderKeyUp}
              onBlur={() => {
                if (!sliderInteractingRef.current) return;
                sliderInteractingRef.current = false;
                scheduleMattePatch();
              }}
            >
              <Slider
                min={0}
                max={10}
                step={1}
                value={[matteDraft.softness]}
                disabled={disabled}
                onValueChange={value =>
                  changeMatte(
                    { ...matteDraftRef.current, softness: Math.round(value[0] ?? 0) },
                    false
                  )
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="motion-despill">디스필</Label>
              <p className="text-xs text-muted-foreground">피사체 가장자리의 키 컬러를 줄입니다.</p>
            </div>
            <Switch
              id="motion-despill"
              checked={matteDraft.despill}
              disabled={disabled}
              onCheckedChange={checked =>
                changeMatte({ ...matteDraftRef.current, despill: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">슬라이싱</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>모드</Label>
            <ToggleGroup
              type="single"
              value={project.sliceMode}
              disabled={disabled}
              className="grid grid-cols-2 gap-2"
              onValueChange={value => {
                if (value === "auto" || value === "grid") void commitSliceMode(value);
              }}
            >
              <ToggleGroupItem value="auto" disabled={disabled}>
                자동 감지
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" disabled={disabled}>
                격자 고정
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {project.sliceMode === "auto" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                감지 결과 {project.grid.cols} × {project.grid.rows}
              </span>
              <Badge variant="secondary">
                신뢰도 {Math.round(project.sliceConfidence * 100)}%
              </Badge>
              {project.sliceConfidence < 0.7 ? (
                <Badge variant="warning">격자와 다르게 감지됨 — 확인 필요</Badge>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="editor-grid-cols">열</Label>
              <Input
                id="editor-grid-cols"
                type="number"
                min={1}
                step={1}
                value={gridCols}
                disabled={disabled || project.sliceMode !== "grid"}
                onChange={event => setGridCols(Number(event.target.value))}
                onKeyDown={event => {
                  if (event.key === "Enter") void commitGrid();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editor-grid-rows">행</Label>
              <Input
                id="editor-grid-rows"
                type="number"
                min={1}
                step={1}
                value={gridRows}
                disabled={disabled || project.sliceMode !== "grid"}
                onChange={event => setGridRows(Number(event.target.value))}
                onKeyDown={event => {
                  if (event.key === "Enter") void commitGrid();
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {project.sliceMode === "auto"
                ? project.frames.length
                : gridCols > 0 && gridRows > 0
                  ? gridCols * gridRows
                  : 0}
              프레임
            </span>
            <Button
              size="sm"
              disabled={
                disabled ||
                project.sliceMode !== "grid" ||
                (gridCols === project.grid.cols && gridRows === project.grid.rows)
              }
              onClick={() => void commitGrid()}
            >
              격자 적용
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">프레임</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3">
              {project.frames.map(frame => (
                <div key={frame.index} className="w-36 overflow-hidden rounded-lg border bg-card">
                  <div className="relative aspect-square bg-muted/30">
                    <div
                      role="img"
                      aria-label={`${frame.index + 1}번 프레임`}
                      className={`h-full w-full bg-contain bg-center bg-no-repeat ${frame.flipX ? "-scale-x-100" : ""} ${
                        frame.excluded ? "opacity-35" : ""
                      }`}
                      style={{
                        backgroundImage: `url("${frameAssetUrl(project.id, frame.index, cacheVersion)}")`
                      }}
                    />
                    <Badge variant="secondary" className="absolute left-2 top-2">
                      {frame.index + 1}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="space-y-3 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`frame-${frame.index}-excluded`} className="text-xs">
                        제외
                      </Label>
                      <Switch
                        id={`frame-${frame.index}-excluded`}
                        checked={frame.excluded}
                        disabled={disabled}
                        onCheckedChange={checked =>
                          void patchFrame(frame.index, "excluded", checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`frame-${frame.index}-flip`} className="text-xs">
                        좌우 반전
                      </Label>
                      <Switch
                        id={`frame-${frame.index}-flip`}
                        checked={frame.flipX}
                        disabled={disabled}
                        onCheckedChange={checked => void patchFrame(frame.index, "flipX", checked)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">에셋 내보내기</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="motion-export-gif">GIF 포함</Label>
              <p className="text-xs text-muted-foreground">미리보기·공유용 GIF를 함께 만듭니다.</p>
            </div>
            <Switch
              id="motion-export-gif"
              checked={includeGif}
              disabled={disabled || isExporting}
              onCheckedChange={setIncludeGif}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="motion-export-fps">GIF fps</Label>
            <Input
              id="motion-export-fps"
              type="number"
              min={1}
              step={1}
              value={gifFps}
              disabled={disabled || isExporting || !includeGif}
              onChange={event => setGifFps(Number(event.target.value))}
            />
          </div>
          <Button
            className="w-full"
            disabled={disabled || isExporting}
            onClick={() => void exportAssets()}
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ZIP 준비 중
              </>
            ) : (
              "에셋 내보내기(ZIP)"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
