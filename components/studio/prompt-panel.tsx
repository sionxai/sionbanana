"use client";

import { useCallback, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AspectRatioPreset, GenerationMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  APERTURE_DEFAULT,
  APERTURE_MAX,
  APERTURE_MIN,
  APERTURE_NONE,
  DEFAULT_CAMERA_ANGLE,
  DEFAULT_CAMERA_DIRECTION,
  DEFAULT_SUBJECT_DIRECTION,
  DEFAULT_ZOOM_LEVEL,
  formatAperture
} from "@/lib/camera";
import { ASPECT_RATIO_PRESETS, DEFAULT_ASPECT_RATIO } from "@/lib/aspect";
import type { LightingPresetCategory, LightingSelections, PosePresetCategory, PoseSelections } from "@/components/studio/types";
import { generateCombinedCameraPrompt } from "@/components/studio/camera-config";
import { usePresetLibrary } from "@/components/studio/preset-library-context";
import type { ExternalPresetOption } from "@/components/studio/external-preset-config";

const CAMERA_ANGLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: DEFAULT_CAMERA_ANGLE, label: "기본값" },
  { value: "로우앵글", label: "로우앵글" },
  { value: "웜즈아이", label: "웜즈아이" },
  { value: "하이앵글", label: "하이앵글" },
  { value: "버드아이", label: "버드아이" },
  { value: "더치앵글", label: "더치앵글" },
  { value: "아이레벨", label: "아이레벨" },
  { value: "반대방향", label: "반대방향" },
  { value: "오버숄더", label: "오버숄더" }
];

const SUBJECT_DIRECTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: DEFAULT_SUBJECT_DIRECTION, label: "기본값" },
  { value: "정면", label: "정면" },
  { value: "좌측면", label: "좌측면" },
  { value: "우측면", label: "우측면" },
  { value: "후면", label: "후면" },
  { value: "위에서", label: "위에서" },
  { value: "아래에서", label: "아래에서" }
];

const CAMERA_DIRECTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: DEFAULT_CAMERA_DIRECTION, label: "기본값" },
  { value: "정면", label: "정면" },
  { value: "좌측면", label: "좌측면" },
  { value: "우측면", label: "우측면" },
  { value: "후면", label: "후면" },
  { value: "위에서", label: "위에서" },
  { value: "아래에서", label: "아래에서" }
];

const ZOOM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: DEFAULT_ZOOM_LEVEL, label: "기본값" },
  { value: "줌인", label: "줌인" },
  { value: "줌아웃", label: "줌아웃" },
  { value: "확대", label: "확대" }
];

const APERTURE_MARKS = [0, 12, 28, 56, 110, 160, 220];

interface PromptPanelProps {
  mode: GenerationMode;
  prompt: string;
  refinedPrompt: string;
  negativePrompt: string;
  cameraAngle: string;
  aperture: number;
  aspectRatio: AspectRatioPreset;
  subjectDirection: string;
  cameraDirection: string;
  zoomLevel: string;
  useGpt: boolean;
  onToggleGpt: () => void;
  gptLoading?: boolean;
  onPromptChange: (value: string) => void;
  onRefinedPromptChange: (value: string) => void;
  onNegativePromptChange: (value: string) => void;
  onCameraAngleChange: (value: string) => void;
  onApertureChange: (value: number) => void;
  onAspectRatioChange: (value: AspectRatioPreset) => void;
  onSubjectDirectionChange: (value: string) => void;
  onCameraDirectionChange: (value: string) => void;
  onZoomLevelChange: (value: string) => void;
  lightingSelections?: LightingSelections;
  onLightingSelectionsChange?: (category: LightingPresetCategory, values: string[]) => void;
  poseSelections?: PoseSelections;
  onPoseSelectionsChange?: (category: PosePresetCategory, values: string[]) => void;
  onResetPresets?: () => void;
  onGenerate?: (action: "primary" | "remix") => void;
  onRefinePrompt?: () => void;
  generating?: boolean;
}

export function PromptPanel({
  mode,
  prompt,
  refinedPrompt,
  negativePrompt,
  cameraAngle,
  aperture,
  aspectRatio,
  subjectDirection,
  cameraDirection,
  zoomLevel,
  useGpt,
  onToggleGpt,
  gptLoading,
  onPromptChange,
  onRefinedPromptChange,
  onNegativePromptChange,
  onCameraAngleChange,
  onApertureChange,
  onAspectRatioChange,
    onSubjectDirectionChange,
    onCameraDirectionChange,
    onZoomLevelChange,
  lightingSelections,
  onLightingSelectionsChange,
  poseSelections,
  onPoseSelectionsChange,
  onResetPresets,
  onGenerate,
  onRefinePrompt,
  generating
}: PromptPanelProps) {
  const {
    externalGroups,
    lightingGroups,
    poseGroups,
    lightingLookup,
    generatePosePrompt
  } = usePresetLibrary();
  const apertureLabel = useMemo(() => formatAperture(aperture), [aperture]);
  const apertureValue = useMemo(() => [aperture], [aperture]);
  const handleApertureValueChange = useCallback(
    (value: number[]) => {
      const nextRaw = typeof value[0] === "number" ? value[0] : APERTURE_DEFAULT;
      const nearest = APERTURE_MARKS.reduce((prev, current) => {
        const prevDiff = Math.abs(prev - nextRaw);
        const currentDiff = Math.abs(current - nextRaw);
        return currentDiff < prevDiff ? current : prev;
      }, APERTURE_DEFAULT);

      if (nearest !== aperture) {
        onApertureChange(nearest);
      }
    },
    [aperture, onApertureChange]
  );
  const isCameraMode = mode === "camera";
  const isLightingMode = mode === "lighting";
  const isPoseMode = mode === "pose";
  const isExternalMode = mode === "external";
  const cameraCardTitle = isCameraMode ? "카메라 프롬프트" : "카메라 프리셋";

  const handleLightingSelectionsChange = useCallback(
    (category: LightingPresetCategory, values: string[]) => {
      onLightingSelectionsChange?.(category, values);

      // Update prompt input with selected lighting presets
      const lookup = lightingLookup[category] ?? {};
      const selectedPrompts = values
        .map(value => lookup[value])
        .filter(Boolean);

      if (selectedPrompts.length > 0) {
        // Set the first selected preset's prompt to the input field
        onPromptChange(selectedPrompts[0]);
      } else if (values.length === 0) {
        // Clear prompt if no presets selected for this category
        onPromptChange("");
      }
    },
    [lightingLookup, onLightingSelectionsChange, onPromptChange]
  );

  const handlePoseSelectionsChange = useCallback(
    (category: PosePresetCategory, values: string[]) => {
      onPoseSelectionsChange?.(category, values);

      // Get current selections from poseSelections state
      const currentExpression = poseSelections?.expression?.[0] || 'default';
      const currentPosture = poseSelections?.posture?.[0] || 'default';

      // Update the changed category
      const newSelections = {
        expression: category === 'expression' ? (values[0] || 'default') : currentExpression,
        posture: category === 'posture' ? (values[0] || 'default') : currentPosture,
      };

      // Generate combined prompt
      const combinedPrompt = generatePosePrompt(newSelections);
      onPromptChange(combinedPrompt);
    },
    [generatePosePrompt, onPoseSelectionsChange, onPromptChange, poseSelections]
  );

  const handleExternalPresetApply = useCallback(
    (option: ExternalPresetOption) => {
      onPromptChange(option.prompt);
      onRefinedPromptChange("");
    },
    [onPromptChange, onRefinedPromptChange]
  );

  const handleCameraAngleChangeInternal = useCallback(
    (value: string | undefined) => {
      onCameraAngleChange(value || DEFAULT_CAMERA_ANGLE);
    },
    [onCameraAngleChange]
  );

  const handleSubjectDirectionChangeInternal = useCallback(
    (value: string | undefined) => {
      onSubjectDirectionChange(value || DEFAULT_SUBJECT_DIRECTION);
    },
    [onSubjectDirectionChange]
  );

  const handleCameraDirectionChangeInternal = useCallback(
    (value: string | undefined) => {
      onCameraDirectionChange(value || DEFAULT_CAMERA_DIRECTION);
    },
    [onCameraDirectionChange]
  );

  const handleZoomLevelChangeInternal = useCallback(
    (value: string | undefined) => {
      onZoomLevelChange(value || DEFAULT_ZOOM_LEVEL);
    },
    [onZoomLevelChange]
  );

  const handleClearPrompt = useCallback(() => {
    onPromptChange("");
  }, [onPromptChange]);

  const handleCopyPrompt = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error("복사할 프롬프트가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("프롬프트가 클립보드에 복사되었습니다.");
    } catch (error) {
      toast.error("프롬프트 복사에 실패했습니다.");
    }
  }, [prompt]);

  const updateCameraPrompt = useCallback(() => {
    if (!isCameraMode) return;

    const combinedPrompt = generateCombinedCameraPrompt({
      angle: cameraAngle,
      aperture: formatAperture(aperture),
      subjectDirection: subjectDirection,
      cameraDirection: cameraDirection,
      zoom: zoomLevel
    });

    onPromptChange(combinedPrompt);
  }, [isCameraMode, cameraAngle, aperture, subjectDirection, cameraDirection, zoomLevel, onPromptChange]);

  // Auto-update camera prompt when settings change
  useEffect(() => {
    if (isCameraMode) {
      updateCameraPrompt();
    }
  }, [isCameraMode, cameraAngle, aperture, subjectDirection, cameraDirection, zoomLevel, updateCameraPrompt]);

  const promptCard = (
    <Card className="flex-1">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">프롬프트 입력</CardTitle>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4">
        <Textarea
          value={prompt}
          onChange={event => onPromptChange(event.target.value)}
          placeholder="생성하고 싶은 이미지를 자세히 설명해주세요..."
          className="min-h-[160px] resize-none"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="bg-sky-500 hover:bg-sky-500/90"
            onClick={() => onGenerate?.("primary")}
            disabled={generating}
          >
            {generating ? "생성 중..." : "이미지 생성"}
          </Button>
          <Button className="bg-amber-500 hover:bg-amber-500/90" onClick={() => onGenerate?.("remix")}>
            변형 생성
          </Button>
          <Button className="bg-red-500 hover:bg-red-500/90" onClick={handleClearPrompt}>
            지우기
          </Button>
          <Button className="bg-gray-500 hover:bg-gray-500/90" onClick={handleCopyPrompt}>
            프롬프트 복사
          </Button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">GPT 자동 보정</p>
              <p className="text-xs text-muted-foreground">카메라 옵션을 반영해 프롬프트를 재구성합니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={useGpt}
                onCheckedChange={() => onToggleGpt()}
                disabled={gptLoading || generating}
                aria-label="GPT 자동 보정 토글"
              />
              <span className="text-xs text-muted-foreground">{useGpt ? "켜짐" : "꺼짐"}</span>
            </div>
          </div>
          <Label className="text-xs text-muted-foreground">GPT 프롬프트 리라이팅</Label>
          <Textarea
            value={refinedPrompt}
            onChange={event => onRefinedPromptChange(event.target.value)}
            placeholder="GPT가 보완한 프롬프트가 여기에 표시됩니다."
            className="min-h-[120px] resize-none border-dashed"
            readOnly={gptLoading}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full border-dashed"
            onClick={onRefinePrompt}
            disabled={generating || gptLoading}
          >
            {gptLoading ? "GPT 생성 중..." : "GPT에게 프롬프트 개선 요청"}
          </Button>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">네거티브 프롬프트</Label>
          <Textarea
            value={negativePrompt}
            onChange={event => onNegativePromptChange(event.target.value)}
            placeholder="포함하고 싶지 않은 요소를 입력하세요."
            className="min-h-[100px] resize-none"
          />
        </div>
      </CardContent>
    </Card>
  );

  const lightingControlsCard =
    isLightingMode && lightingGroups.length ? (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">조명 및 배색 프리셋</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lightingGroups.map(group => {
            const selected = lightingSelections?.[group.key] ?? [];
            return (
              <div key={group.key} className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
                <div className="w-full shrink-0 text-xs font-medium text-muted-foreground md:w-28">
                  <div>{group.title}</div>
                  {group.description ? (
                    <p className="mt-1 text-[11px] text-muted-foreground/80">{group.description}</p>
                  ) : null}
                </div>
                <ToggleGroup
                  type="multiple"
                  value={selected}
                  onValueChange={values => handleLightingSelectionsChange(group.key, values)}
                  className="flex flex-wrap gap-2"
                  disabled={generating}
                >
                  {group.options.map(option => (
                    <ToggleGroupItem key={option.value} value={option.value} className="px-3 py-1 text-xs">
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            선택한 프리셋은 조명, 대기, 시간대, 컬러그레이딩에 대한 보조 문구로 자동 추가됩니다.
          </p>
        </CardContent>
      </Card>
    ) : null;

  const poseControlsCard =
    isPoseMode && poseGroups.length ? (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">포즈 · 감정 프리셋</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {poseGroups.map(group => {
            const selected = poseSelections?.[group.key] ?? [];
            return (
              <div key={group.key} className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
                <div className="w-full shrink-0 text-xs font-medium text-muted-foreground md:w-28">
                  <div>{group.title}</div>
                </div>
                <ToggleGroup
                  type="single"
                  value={selected[0] || "default"}
                  onValueChange={value => handlePoseSelectionsChange(group.key, [value || "default"])}
                  className="flex flex-wrap gap-2"
                  disabled={generating}
                >
                  {group.options.map(option => (
                    <ToggleGroupItem key={option.value} value={option.value} className="px-3 py-1 text-xs">
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            선택한 프리셋은 표정과 포즈 변경에 대한 보조 문구로 자동 추가됩니다.
          </p>
        </CardContent>
      </Card>
    ) : null;

  const cameraControlsCard =
    mode === "camera" || mode === "create" || mode === "crop" ? (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">{cameraCardTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isCameraMode ? (
            <>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">피사체 방향</Label>
                <ToggleGroup
                  type="single"
                  value={subjectDirection}
                  onValueChange={handleSubjectDirectionChangeInternal}
                  className="flex flex-wrap gap-2"
                >
                  {SUBJECT_DIRECTION_OPTIONS.map(option => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">카메라 방향</Label>
                <ToggleGroup
                  type="single"
                  value={cameraDirection}
                  onValueChange={handleCameraDirectionChangeInternal}
                  className="flex flex-wrap gap-2"
                >
                  {CAMERA_DIRECTION_OPTIONS.map(option => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">줌 설정</Label>
                <ToggleGroup
                  type="single"
                  value={zoomLevel}
                  onValueChange={handleZoomLevelChangeInternal}
                  className="flex flex-wrap gap-2"
                >
                  {ZOOM_OPTIONS.map(option => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </>
          ) : null}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">카메라 앵글</Label>
            <ToggleGroup
              type="single"
              value={cameraAngle}
              onValueChange={handleCameraAngleChangeInternal}
              className="flex flex-wrap gap-2"
            >
              {CAMERA_ANGLE_OPTIONS.map(option => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>조리개값</span>
              <span className="text-foreground">{apertureLabel}</span>
            </div>
            <Slider
              min={APERTURE_MIN}
              max={APERTURE_MAX}
              step={1}
              value={apertureValue}
              onValueChange={handleApertureValueChange}
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              {APERTURE_MARKS.map(mark => (
                <span key={mark}>{formatAperture(mark)}</span>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="border-dashed px-2 py-1 text-[11px]"
                onClick={() => onApertureChange(APERTURE_NONE)}
                disabled={generating || aperture === APERTURE_NONE}
              >
                기본값
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">비율 프리셋</Label>
            <ToggleGroup
              type="single"
              value={aspectRatio}
              onValueChange={value => value && onAspectRatioChange(value as AspectRatioPreset)}
              className="flex flex-wrap gap-2"
            >
              {ASPECT_RATIO_PRESETS.map(preset => (
                <ToggleGroupItem key={preset.value} value={preset.value}>
                  {preset.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="border-dashed px-2 py-1 text-[11px]"
                onClick={() => onAspectRatioChange(DEFAULT_ASPECT_RATIO)}
                disabled={generating || aspectRatio === DEFAULT_ASPECT_RATIO}
              >
                기본값 {ASPECT_RATIO_PRESETS.find(item => item.value === DEFAULT_ASPECT_RATIO)?.label ?? "원본 그대로"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    ) : null;

  const externalPresetCard =
    isExternalMode && externalGroups.length ? (
      <Card className="flex h-full flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">외부 프리셋</CardTitle>
          <p className="text-xs text-muted-foreground">
            버튼을 누르면 영문 프롬프트가 입력란에 추가됩니다. 대괄호 안의 값은 사용 목적에 맞게 조정하세요.
          </p>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-[520px]">
            <div className="space-y-5 px-4 pb-4">
              {externalGroups.map(group => (
                <div key={group.id} className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{group.title}</p>
                    {group.description ? (
                      <p className="text-[11px] text-muted-foreground/80">{group.description}</p>
                    ) : null}
                  </div>
                  <div className="grid gap-2">
                    {group.options.map(option => (
                      <Button
                        key={option.id}
                        variant="outline"
                        size="sm"
                        className="h-auto justify-start whitespace-normal text-left text-xs font-medium leading-tight normal-case"
                        onClick={() => handleExternalPresetApply(option)}
                        title={option.prompt}
                      >
                        <div className="flex flex-col items-start gap-1">
                          <span>{option.label}</span>
                          {option.labelKo ? (
                            <span className="text-[11px] text-muted-foreground/90">{option.labelKo}</span>
                          ) : null}
                          <span className="text-[11px] font-normal text-muted-foreground line-clamp-2">
                            {option.prompt}
                          </span>
                          {option.note ? (
                            <span className="text-[10px] text-muted-foreground/70">{option.note}</span>
                          ) : null}
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    ) : null;

  return (
    <div className="flex h-full flex-col gap-4">
      {onResetPresets ? (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="px-3"
            onClick={() => {
              onResetPresets();
              onPromptChange("");
              onRefinedPromptChange("");
              onNegativePromptChange("");
            }}
            disabled={generating}
          >
            프리셋 리셋
          </Button>
        </div>
      ) : null}
      {isCameraMode ? (
        <>
          {cameraControlsCard}
          {promptCard}
        </>
      ) : isLightingMode ? (
        <>
          {lightingControlsCard}
          {promptCard}
        </>
      ) : isPoseMode ? (
        <>
          {poseControlsCard}
          {promptCard}
        </>
      ) : isExternalMode ? (
        <>
          {externalPresetCard}
          {promptCard}
        </>
      ) : (
        <>
          {promptCard}
          {cameraControlsCard}
        </>
      )}

      {mode === "upscale" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">업스케일 옵션</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <p>• 2배 및 4배 업스케일 옵션을 지원합니다.</p>
            <p>• 디테일 보존 필터, 노이즈 제거 필터를 함께 적용할 수 있습니다.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline">2x 업스케일</Button>
              <Button variant="outline">4x 업스케일</Button>
              <Button variant="outline">디테일 보존</Button>
              <Button variant="outline">노이즈 제거</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "prompt-adapt" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">타 툴 프롬프트 변환</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <p>Midjourney, Stable Diffusion 등 타 플랫폼에 최적화된 프롬프트로 자동 변환합니다.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline">Midjourney v6</Button>
              <Button variant="outline">Stable Diffusion XL</Button>
              <Button variant="outline">Leonardo AI</Button>
              <Button variant="outline">Flux.1</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "sketch" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">스케치 업로드</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed">
              <p className="text-sm text-foreground">여기에 스케치를 드래그 앤 드롭</p>
              <p className="text-xs">PNG, JPG 지원 · 최대 20MB</p>
              <Button size="sm" className="mt-3">
                파일 선택
              </Button>
            </div>
            <p>스케치 윤곽선을 기반으로 색감과 조명을 자동 보정합니다.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
