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
    patch: Partial<Pick<MotionProject, "grid" | "matte" | "frames" | "animations">>
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
    if (synchronizedProjectIdRef.current === project.id) return;
    synchronizedProjectIdRef.current = project.id;
    clearMatteTimer();
    setMatteDirty(false);
    sliderInteractingRef.current = false;
    matteDraftRef.current = project.matte;
    setMatteDraft(project.matte);
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
          <CardTitle className="text-lg">격자 조절</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="editor-grid-cols">열</Label>
              <Input
                id="editor-grid-cols"
                type="number"
                min={1}
                step={1}
                value={gridCols}
                disabled={disabled}
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
                disabled={disabled}
                onChange={event => setGridRows(Number(event.target.value))}
                onKeyDown={event => {
                  if (event.key === "Enter") void commitGrid();
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {gridCols > 0 && gridRows > 0 ? gridCols * gridRows : 0}프레임
            </span>
            <Button
              size="sm"
              disabled={
                disabled ||
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
    </div>
  );
}
