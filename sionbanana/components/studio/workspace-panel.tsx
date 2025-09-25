"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AspectRatioPreset, GeneratedImageDocument, GenerationMode } from "@/lib/types";
import type { PromptDetails } from "@/components/studio/types";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { POSE_PRESET_GROUPS } from "@/components/studio/pose-config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DiffSlider } from "@/components/studio/diff-slider";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CAMERA_DIRECTION,
  DEFAULT_SUBJECT_DIRECTION,
  DEFAULT_ZOOM_LEVEL,
  formatAperture,
  getCameraAngleLabel,
  getDirectionalLabel
} from "@/lib/camera";
import { getAspectRatioLabel } from "@/lib/aspect";

interface WorkspacePanelProps {
  mode: GenerationMode;
  record: GeneratedImageDocument | null;
  comparisonRecord: GeneratedImageDocument | null;
  prompt: string;
  refinedPrompt: string;
  cameraAngle: string;
  aperture: number;
  aspectRatio: AspectRatioPreset;
  referenceImageUrl?: string | null;
  referenceImageKey?: number;
  subjectDirection: string;
  cameraDirection: string;
  zoomLevel: string;
  isGenerating: boolean;
  showGenerationSuccess?: boolean;
  successRecordId?: string;
  promptDetails?: PromptDetails | null;
  onClickCompare?: (record: GeneratedImageDocument) => void;
  onDismissGenerationStatus?: () => void;
  onClearComparison?: () => void;
}

const modeLabelMap: Record<GenerationMode, string> = {
  create: "이미지 생성",
  remix: "이미지 리믹스",
  camera: "카메라 앵글",
  external: "외부 프리셋",
  crop: "크롭",
  "prompt-adapt": "프롬프트 변환",
  lighting: "조명",
  pose: "포즈",
  upscale: "업스케일",
  sketch: "스케치 변환"
};


export function WorkspacePanel({
  mode,
  record,
  comparisonRecord,
  prompt,
  refinedPrompt,
  cameraAngle,
  aperture,
  aspectRatio,
  subjectDirection,
  cameraDirection,
  zoomLevel,
  referenceImageUrl,
  referenceImageKey = 0,
  isGenerating,
  showGenerationSuccess = false,
  successRecordId,
  promptDetails,
  onClickCompare,
  onDismissGenerationStatus,
  onClearComparison
}: WorkspacePanelProps) {
  const [showPromptDetail, setShowPromptDetail] = useState(false);
  const [imageZoomLevel, setImageZoomLevel] = useState(1.0);
  const comparisonImage = useMemo(() => {
    if (!comparisonRecord) {
      return null;
    }

    if (comparisonRecord.diff?.afterUrl) {
      return comparisonRecord.diff.afterUrl;
    }

    if (comparisonRecord.imageUrl) {
      return comparisonRecord.imageUrl;
    }

    return comparisonRecord.originalImageUrl ?? null;
  }, [comparisonRecord]);

  const beforeImage = useMemo(() => {
    if (referenceImageUrl) {
      return referenceImageUrl;
    }
    if (record?.diff?.beforeUrl) {
      return record.diff.beforeUrl;
    }
    if (record?.originalImageUrl && record.originalImageUrl !== record.imageUrl) {
      return record.originalImageUrl;
    }
    return undefined;
  }, [record, referenceImageUrl]);

  const afterImage = useMemo(() => {
    if (record?.diff?.afterUrl) {
      return record.diff.afterUrl;
    }
    if (record?.imageUrl) {
      return record.imageUrl;
    }
    return referenceImageUrl ?? undefined;
  }, [record, referenceImageUrl]);
  const applyCacheBust = useCallback(
    (value?: string | null) => {
      if (!value) {
        return undefined;
      }
      if (value.startsWith("data:")) {
        return value;
      }
      if (!referenceImageKey) {
        return value;
      }
      try {
        const url = new URL(value);
        url.searchParams.set("_cb", referenceImageKey.toString());
        return url.toString();
      } catch {
        return `${value}${value.includes("?") ? "&" : "?"}_cb=${referenceImageKey}`;
      }
    },
    [referenceImageKey]
  );
  const beforeImageWithBust = useMemo(() => applyCacheBust(beforeImage), [applyCacheBust, beforeImage]);
  const afterImageWithBust = useMemo(() => applyCacheBust(afterImage), [afterImage, applyCacheBust]);

  const isDiffAvailable = Boolean(beforeImage && afterImage && beforeImage !== afterImage);
  const beforeLabel = record?.diff?.sliderLabelBefore ?? "기준 이미지";
  const afterLabel = record?.diff?.sliderLabelAfter ?? "생성 결과";

  const comparisonAfterImage = useMemo(() => {
    if (!record) {
      return null;
    }
    if (record.diff?.afterUrl) {
      return record.diff.afterUrl;
    }
    if (record.imageUrl) {
      return record.imageUrl;
    }
    return record.originalImageUrl ?? null;
  }, [record]);

  const showComparison = Boolean(comparisonRecord && comparisonImage && comparisonAfterImage);
  const comparisonBeforeLabel = "비교 대상";
  const comparisonAfterLabel = "현재 선택";
  const comparisonDetails = showComparison && comparisonRecord ? comparisonRecord : null;

  const promptToShow = useMemo(() => {
    if (record?.promptMeta?.refinedPrompt) {
      return record.promptMeta.refinedPrompt;
    }
    if (refinedPrompt) {
      return refinedPrompt;
    }
    return record?.promptMeta?.rawPrompt ?? prompt;
  }, [prompt, record, refinedPrompt]);

  // Use promptDetails if available, otherwise fallback to record metadata
  const effectivePromptDetails = useMemo(() => {
    if (promptDetails) {
      return promptDetails;
    }

    // Fallback to existing record metadata for backward compatibility
    const promptSummary = typeof record?.metadata?.promptSummary === "string" ? record.metadata.promptSummary : undefined;
    const promptCameraNotes = typeof record?.metadata?.promptCameraNotes === "string" ? record.metadata.promptCameraNotes : undefined;
    const promptGeneratedByRaw = typeof record?.metadata?.promptGeneratedBy === "string" ? record.metadata.promptGeneratedBy : undefined;

    if (promptSummary || promptCameraNotes || promptGeneratedByRaw) {
      return {
        gptGenerated: promptSummary || promptCameraNotes ? {
          summary: promptSummary,
          cameraNotes: promptCameraNotes
        } : undefined,
        source: promptGeneratedByRaw as "manual" | "gpt-manual" | "gpt-auto" | undefined
      } as PromptDetails;
    }

    return null;
  }, [promptDetails, record]);

  const promptGeneratedByLabel = useMemo(() => {
    switch (effectivePromptDetails?.source) {
      case "gpt-auto":
        return "GPT 자동 보정";
      case "gpt-manual":
        return "GPT 수동 보정";
      case "manual":
        return "직접 작성";
      default:
        return null;
    }
  }, [effectivePromptDetails]);

  const cameraMeta = record?.promptMeta?.camera;

  const poseLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    POSE_PRESET_GROUPS.forEach(group => {
      group.options.forEach(option => {
        map[option.value] = option.label;
      });
    });
    return map;
  }, []);
  const poseMeta = (record?.promptMeta?.pose as Record<string, string[]> | undefined) || undefined;
  const expressionLabels = useMemo(() => {
    const values = poseMeta?.expression ?? [];
    return values.map(value => poseLabelMap[value] ?? value);
  }, [poseMeta, poseLabelMap]);
  const postureLabels = useMemo(() => {
    const values = poseMeta?.posture ?? [];
    return values.map(value => poseLabelMap[value] ?? value);
  }, [poseMeta, poseLabelMap]);
  const showPoseMeta = expressionLabels.length > 0 || postureLabels.length > 0;


  useEffect(() => setShowPromptDetail(false), [record?.id]);

  // 줌 레벨 관리 함수들
  const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 3.0;

  const handleZoom = useCallback((action: 'in' | 'out' | 'reset') => {
    setImageZoomLevel(currentLevel => {

      switch (action) {
        case 'in': {
          // 현재 레벨보다 큰 첫 번째 레벨 찾기
          for (let i = 0; i < ZOOM_LEVELS.length; i++) {
            if (ZOOM_LEVELS[i] > currentLevel) {
              return ZOOM_LEVELS[i];
            }
          }
          return MAX_ZOOM;
        }
        case 'out': {
          // 현재 레벨보다 작은 가장 큰 레벨 찾기
          for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
            if (ZOOM_LEVELS[i] < currentLevel) {
              return ZOOM_LEVELS[i];
            }
          }
          return MIN_ZOOM;
        }
        case 'reset':
          return 1.0;
        default:
          return currentLevel;
      }
    });
  }, []);

  // Keyboard shortcuts and mouse wheel support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return; // Don't handle shortcuts when typing in inputs
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '=':
          case '+':
            e.preventDefault();
            handleZoom('in');
            break;
          case '-':
            e.preventDefault();
            handleZoom('out');
            break;
          case '0':
            e.preventDefault();
            handleZoom('reset');
            break;
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          handleZoom('in');
        } else if (e.deltaY > 0) {
          handleZoom('out');
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('wheel', handleWheel);
    };
  }, [handleZoom]);

  const cameraAngleDisplay = getCameraAngleLabel(cameraMeta?.angle ?? cameraAngle);
  const apertureDisplay = cameraMeta?.aperture ?? formatAperture(aperture);
  const subjectDirectionDisplay = getDirectionalLabel(
    cameraMeta?.subjectDirection ?? subjectDirection,
    DEFAULT_SUBJECT_DIRECTION
  );
  const cameraDirectionDisplay = getDirectionalLabel(
    cameraMeta?.cameraDirection ?? cameraDirection,
    DEFAULT_CAMERA_DIRECTION
  );
  const zoomDisplay = getDirectionalLabel(cameraMeta?.zoom ?? zoomLevel, DEFAULT_ZOOM_LEVEL);

  const handleTogglePromptDetail = () => {
    if (!promptToShow) {
      return;
    }
    setShowPromptDetail(prev => !prev);
  };

  const handleCopyPrompt = async () => {
    if (!promptToShow) {
      return;
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(promptToShow);
        toast.success('프롬프트를 복사했습니다.');
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch (error) {
      console.error('Failed to copy prompt', error);
      toast.error('프롬프트 복사에 실패했습니다.');
    }
  };

  const hasAfterImage = Boolean(afterImage);
  const successBannerVisible = showGenerationSuccess && (!successRecordId || record?.id === successRecordId);
  const statusBadge = record
    ? record.status === "completed"
      ? <Badge variant="success">완료</Badge>
      : record.status === "failed"
        ? <Badge variant="destructive">실패</Badge>
        : <Badge variant="outline">대기중</Badge>
    : <Badge variant="outline">미생성</Badge>;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="uppercase tracking-wide">
              {modeLabelMap[mode]}
            </Badge>
            {statusBadge}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{record ? new Date(record.createdAt).toLocaleString() : "미생성"}</span>
            <Separator orientation="vertical" className="h-4" />
            <span>{record?.model ?? "Gemini Nano Banana"}</span>
          </div>
        </div>
        {hasAfterImage ? (
          <DiffSlider
            key={`${record?.id ?? "workspace-diff"}-${referenceImageKey ?? 0}`}
            beforeSrc={isDiffAvailable ? beforeImageWithBust : undefined}
            afterSrc={afterImageWithBust}
            labelBefore={beforeLabel}
            labelAfter={afterLabel}
            priority
            zoomLevel={imageZoomLevel}
            onZoomChange={setImageZoomLevel}
          />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-muted-foreground/40 bg-muted/30 text-sm text-muted-foreground">
            생성된 이미지가 없습니다. 좌측에서 프롬프트를 입력해 이미지를 생성해보세요.
          </div>
        )}
        {comparisonDetails ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/80 p-4 text-[11px] text-amber-900">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-amber-950">추가 비교</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={onClearComparison}
                disabled={!onClearComparison}
              >
                비교 해제
              </Button>
            </div>
            <DiffSlider
              key={`comparison-${comparisonRecord?.id ?? "diff"}-${referenceImageKey ?? 0}`}
              beforeSrc={applyCacheBust(comparisonImage)}
              afterSrc={applyCacheBust(comparisonAfterImage)}
              labelBefore={comparisonBeforeLabel}
              labelAfter={comparisonAfterLabel}
              zoomLevel={imageZoomLevel}
              onZoomChange={setImageZoomLevel}
            />
            <div className="flex flex-col gap-1 text-[11px] text-amber-900">
              <span>{new Date(comparisonDetails.createdAt).toLocaleString()}</span>
              <span className="font-medium text-amber-950/90">
                {comparisonDetails.promptMeta?.refinedPrompt ?? comparisonDetails.promptMeta?.rawPrompt}
              </span>
              <span className="text-amber-900/80">
                {comparisonDetails.model} • {comparisonDetails.costCredits ?? "-"} credits
              </span>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleZoom('out')}
            disabled={imageZoomLevel <= MIN_ZOOM}
          >
            축소
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleZoom('reset')}
            disabled={imageZoomLevel === 1.0}
          >
            {Math.round(imageZoomLevel * 100)}% (원래대로)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleZoom('in')}
            disabled={imageZoomLevel >= MAX_ZOOM}
          >
            확대
          </Button>
        </div>

        {isGenerating ? (
          <div
            className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary"
            role="status"
            aria-live="polite"
          >
            <span className="relative flex h-5 w-5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />
              <span className="relative inline-flex h-5 w-5 rounded-full bg-primary/70" />
            </span>
            <span>이미지를 생성 중입니다. 몇초가 소요될 수 있습니다.</span>
          </div>
        ) : null}

        {successBannerVisible ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-400/60 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <div className="flex flex-col gap-1">
              <span className="font-semibold">생성 완료</span>
              <span className="text-xs text-emerald-700/80">비교 패널에 생성 결과를 등록해 차이를 확인해보세요.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (record) {
                    onClickCompare?.(record);
                  }
                }}
                disabled={!record}
              >
                비교 이미지 등록
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDismissGenerationStatus?.()}>
                숨기기
              </Button>
            </div>
          </div>
        ) : null}

      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">프롬프트 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* 구조화된 프롬프트 정보 표시 */}
          {effectivePromptDetails ? (
            <div className="space-y-3">
              {/* 베이스 프롬프트 */}
              {effectivePromptDetails.basePrompt && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">베이스 프롬프트</p>
                  <div className="rounded-md border bg-muted/30 p-2 text-xs">
                    {effectivePromptDetails.basePrompt}
                  </div>
                </div>
              )}

              {/* 사용자 수정 지시사항 */}
              {effectivePromptDetails.userInstructions && effectivePromptDetails.userInstructions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">사용자 수정 요청</p>
                  <div className="space-y-1">
                    {effectivePromptDetails.userInstructions.map((instruction, index) => (
                      <div key={index} className="rounded-md border border-orange-200 bg-orange-50 p-2 text-xs text-orange-900">
                        {instruction}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 모드별 조정사항 */}
              {effectivePromptDetails.modeAdjustments && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">모드 조정사항</p>
                  <div className="space-y-1">
                    {effectivePromptDetails.modeAdjustments.camera && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
                        <strong>카메라:</strong> {effectivePromptDetails.modeAdjustments.camera}
                      </div>
                    )}
                    {effectivePromptDetails.modeAdjustments.pose && (
                      <div className="rounded-md border border-purple-200 bg-purple-50 p-2 text-xs text-purple-900">
                        <strong>포즈:</strong> {effectivePromptDetails.modeAdjustments.pose}
                      </div>
                    )}
                    {effectivePromptDetails.modeAdjustments.lighting && (
                      <div className="rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-900">
                        <strong>조명:</strong> {effectivePromptDetails.modeAdjustments.lighting}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* 기존 단일 프롬프트 표시 (폴백) */
            <div>
              <p className="font-medium text-foreground">GPT 변환 프롬프트</p>
              <div
                role={promptToShow ? "button" : undefined}
                tabIndex={promptToShow ? 0 : undefined}
                className={cn(
                  "mt-1 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary",
                  promptToShow
                    ? "cursor-pointer transition hover:border-primary/60 hover:bg-primary/15 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    : "opacity-70"
                )}
                onClick={handleTogglePromptDetail}
                onKeyDown={event => {
                  if (!promptToShow) {
                    return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleTogglePromptDetail();
                  }
                }}
              >
                <p className="line-clamp-3 whitespace-pre-wrap">
                  {promptToShow || "아직 변환된 프롬프트가 없습니다."}
                </p>
                {promptToShow ? (
                  <span className="mt-2 block text-xs text-primary/70">
                    {showPromptDetail ? "클릭하면 접을 수 있습니다." : "클릭하면 전체 프롬프트를 볼 수 있습니다."}
                  </span>
                ) : null}
              </div>
              {showPromptDetail && promptToShow ? (
                <div className="mt-3 space-y-2 rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>전체 프롬프트</span>
                    <Button variant="outline" size="sm" onClick={handleCopyPrompt}>
                      프롬프트 복사
                    </Button>
                  </div>
                  <pre className="whitespace-pre-wrap break-words text-sm text-foreground">{promptToShow}</pre>
                </div>
              ) : null}
            </div>
          )}

          {/* GPT 생성 메타 정보 */}
          {(effectivePromptDetails?.gptGenerated?.summary || effectivePromptDetails?.gptGenerated?.cameraNotes || promptGeneratedByLabel) && (
            <div className="space-y-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold text-amber-950">프롬프트 생성 메모</p>
              {promptGeneratedByLabel ? <p>생성 방식: {promptGeneratedByLabel}</p> : null}
              {effectivePromptDetails?.gptGenerated?.summary && <p>GPT 요약: {effectivePromptDetails.gptGenerated.summary}</p>}
              {effectivePromptDetails?.gptGenerated?.cameraNotes && <p>카메라 반영: {effectivePromptDetails.gptGenerated.cameraNotes}</p>}
            </div>
          )}

          {/* 전체 프롬프트 복사 버튼 */}
          {promptToShow && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleCopyPrompt}>
                프롬프트 복사
              </Button>
            </div>
          )}
          <Separator />
          <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
            <div>
              <span className="font-semibold text-foreground">카메라 앵글</span>
              <p className="mt-1 rounded-md bg-muted/40 px-3 py-2">
                {cameraAngleDisplay}
              </p>
            </div>
            <div>
              <span className="font-semibold text-foreground">조리개</span>
              <p className="mt-1 rounded-md bg-muted/40 px-3 py-2">
                {apertureDisplay}
              </p>
            </div>
            <div>
              <span className="font-semibold text-foreground">피사체 방향</span>
              <p className="mt-1 rounded-md bg-muted/40 px-3 py-2">{subjectDirectionDisplay}</p>
            </div>
            <div>
              <span className="font-semibold text-foreground">카메라 방향</span>
              <p className="mt-1 rounded-md bg-muted/40 px-3 py-2">{cameraDirectionDisplay}</p>
            </div>
            <div>
              <span className="font-semibold text-foreground">줌 설정</span>
              <p className="mt-1 rounded-md bg-muted/40 px-3 py-2">{zoomDisplay}</p>
            </div>
            <div>
              <span className="font-semibold text-foreground">비율</span>
              <p className="mt-1 rounded-md bg-muted/40 px-3 py-2">
                {getAspectRatioLabel(record?.promptMeta?.aspectRatio ?? aspectRatio)}
              </p>
            </div>
            <div>
              <span className="font-semibold text-foreground">사용 모델</span>
              <p className="mt-1 rounded-md bg-muted/40 px-3 py-2">{record?.model ?? "Gemini Nano Banana"}</p>
            </div>
            <div>
              <span className="font-semibold text-foreground">크레딧</span>
              <p className="mt-1 rounded-md bg-muted/40 px-3 py-2">{record?.costCredits ?? "추산 대기"}</p>
            </div>
            {showPoseMeta ? (
              <div className="md:col-span-2 space-y-1">
                <span className="font-semibold text-foreground">포즈/감정</span>
                {expressionLabels.length ? (
                  <p className="mt-1 rounded-md bg-muted/40 px-3 py-2">표정: {expressionLabels.join(", ")}</p>
                ) : null}
                {postureLabels.length ? (
                  <p className="rounded-md bg-muted/40 px-3 py-2">포즈: {postureLabels.join(", ")}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">작업 로그</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <LogItem label="생성 모드" value={modeLabelMap[record?.mode ?? mode]} />
          <LogItem label="프롬프트 길이" value={`${promptToShow.length} chars`} />
          <LogItem label="상태" value={record?.status ?? "대기중"} />
          <LogItem label="저장 위치" value={record?.imageUrl ? "Firebase Storage" : "미저장"} />
        </CardContent>
      </Card>
    </div>
  );
}

function LogItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
      <span className="font-medium text-foreground">{label}</span>
      <span className={cn("text-xs text-muted-foreground")}>{value}</span>
    </div>
  );
}
