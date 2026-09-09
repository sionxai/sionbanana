"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Film, ImageIcon, Loader2, Sparkles, Upload, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { loadCharacters, type Character } from "@/lib/characters";
import {
  MOTION_ACTION_PRESETS,
  motionActionPresetValues,
  type MotionActionPreset
} from "@/lib/motion/prompt";
import type { MotionProject } from "@/lib/motion/types";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ACTION_OPTIONS = motionActionPresetValues.map(value => ({
  value,
  ...MOTION_ACTION_PRESETS[value]
}));

type MotionCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (project: MotionProject) => void | Promise<void>;
};

type VideoMode = "loop" | "oneshot";

type StoredVideo = {
  id: string;
  createdAtIso: string;
  prompt: string;
  model: string | null;
  duration: number | null;
  resolution: string | null;
  aspectRatio: string | null;
  videoUrl: string;
};

type VideoProbe = {
  video: {
    width: number;
    height: number;
    fps: number;
    frameCount: number;
    durationSec: number;
  };
  loop: { period: number; start: number; closureError: number } | null;
  segment: { start: number; end: number } | null;
  suggested: {
    mode: VideoMode;
    range: { start: number; end: number };
    frameIndices: number[];
    derivedFps: number;
  } | null;
  contactSheet: string | null;
};

type VideoListResponse = { ok?: boolean; videos?: StoredVideo[]; reason?: string };
type VideoProbeResponse = { ok?: boolean; reason?: string } & Partial<VideoProbe>;

function responseReason(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "reason" in body) {
    const reason = (body as { reason?: unknown }).reason;
    if (typeof reason === "string" && reason) return reason;
  }
  return fallback;
}

export function MotionCreateDialog({ open, onClose, onCreated }: MotionCreateDialogProps) {
  const [name, setName] = useState("새 모션");
  const [sourceType, setSourceType] = useState<"reference" | "generate" | "upload" | "video">("reference");
  const [prompt, setPrompt] = useState("");
  const [referencePrompt, setReferencePrompt] = useState("");
  const [referenceAction, setReferenceAction] = useState<MotionActionPreset>("walk");
  const [referenceImage, setReferenceImage] = useState("");
  const [referencePreview, setReferencePreview] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [uploadName, setUploadName] = useState("");
  const [uploadDataUrl, setUploadDataUrl] = useState("");
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(2);
  const [isCreating, setIsCreating] = useState(false);
  const [videos, setVideos] = useState<StoredVideo[]>([]);
  const [isVideoListLoading, setIsVideoListLoading] = useState(false);
  const [videoListError, setVideoListError] = useState("");
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [videoMode, setVideoMode] = useState<VideoMode>("loop");
  const [videoCount, setVideoCount] = useState(8);
  const [videoStart, setVideoStart] = useState("");
  const [videoEnd, setVideoEnd] = useState("");
  const [videoFps, setVideoFps] = useState("");
  const [videoProbe, setVideoProbe] = useState<VideoProbe | null>(null);
  const [isVideoProbeLoading, setIsVideoProbeLoading] = useState(false);
  const [videoProbeError, setVideoProbeError] = useState("");
  const mountedRef = useRef(false);
  const selectedVideoIdRef = useRef("");
  const videoListRequestRef = useRef(0);
  const videoProbeRequestRef = useRef(0);
  const videoRangeWasEditedRef = useRef(false);
  const selectedAction = MOTION_ACTION_PRESETS[referenceAction];
  const frameCount =
    Number.isFinite(cols) && Number.isFinite(rows) && cols > 0 && rows > 0
      ? Math.floor(cols) * Math.floor(rows)
      : 0;
  const normalizedVideoCount = Math.floor(videoCount);
  const videoStartValue = videoStart.trim() === "" ? undefined : Number(videoStart);
  const videoEndValue = videoEnd.trim() === "" ? undefined : Number(videoEnd);
  const hasVideoRange = videoStartValue !== undefined || videoEndValue !== undefined;
  const videoRangeIsValid =
    !hasVideoRange ||
    (typeof videoStartValue === "number" &&
      typeof videoEndValue === "number" &&
      Number.isInteger(videoStartValue) &&
      Number.isInteger(videoEndValue) &&
      videoStartValue >= 0 &&
      videoEndValue > videoStartValue &&
      videoEndValue - videoStartValue >= normalizedVideoCount &&
      (!videoProbe || videoEndValue <= videoProbe.video.frameCount));
  const videoFpsValue = videoFps.trim() === "" ? undefined : Number(videoFps);
  const videoFpsIsValid =
    videoFpsValue === undefined ||
    (Number.isInteger(videoFpsValue) && videoFpsValue >= 1 && videoFpsValue <= 60);
  const canCreateVideo =
    Boolean(selectedVideoId) &&
    Boolean(videoProbe) &&
    !isVideoListLoading &&
    !isVideoProbeLoading &&
    Number.isInteger(videoCount) &&
    videoCount >= 2 &&
    videoCount <= 24 &&
    videoRangeIsValid &&
    videoFpsIsValid &&
    (videoProbe?.suggested !== null || hasVideoRange);

  const chooseVideo = useCallback((videoId: string) => {
    if (selectedVideoIdRef.current === videoId) return;
    selectedVideoIdRef.current = videoId;
    videoProbeRequestRef.current += 1;
    videoRangeWasEditedRef.current = false;
    setSelectedVideoId(videoId);
    setVideoStart("");
    setVideoEnd("");
    setVideoProbe(null);
    setVideoProbeError("");
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      videoListRequestRef.current += 1;
      videoProbeRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (open) setCharacters(loadCharacters());
  }, [open]);

  useEffect(() => {
    if (!open || sourceType !== "video") return;
    const controller = new AbortController();
    const requestId = ++videoListRequestRef.current;
    const isCurrent = () =>
      mountedRef.current && !controller.signal.aborted && requestId === videoListRequestRef.current;

    setIsVideoListLoading(true);
    setVideoListError("");
    void (async () => {
      try {
        const response = await fetch("/api/video?limit=50", { signal: controller.signal });
        const body = (await response.json().catch(() => null)) as VideoListResponse | null;
        if (!response.ok || body?.ok !== true || !Array.isArray(body.videos)) {
          throw new Error(responseReason(body, "저장된 영상을 불러오지 못했습니다."));
        }
        if (!isCurrent()) return;
        setVideos(body.videos);
        const currentVideoId = selectedVideoIdRef.current;
        const nextVideoId = body.videos.some(video => video.id === currentVideoId)
          ? currentVideoId
          : body.videos[0]?.id ?? "";
        if (nextVideoId !== currentVideoId) chooseVideo(nextVideoId);
      } catch (error) {
        if (!isCurrent()) return;
        setVideoListError(error instanceof Error ? error.message : "저장된 영상을 불러오지 못했습니다.");
      } finally {
        if (isCurrent()) setIsVideoListLoading(false);
      }
    })();

    return () => {
      controller.abort();
      if (videoListRequestRef.current === requestId) videoListRequestRef.current += 1;
    };
  }, [chooseVideo, open, sourceType]);

  useEffect(() => {
    if (!open || sourceType !== "video") return;
    if (!selectedVideoId) {
      setVideoProbe(null);
      setVideoProbeError("");
      setIsVideoProbeLoading(false);
      return;
    }

    const controller = new AbortController();
    const requestId = ++videoProbeRequestRef.current;
    const videoId = selectedVideoId;
    const isCurrent = () =>
      mountedRef.current && !controller.signal.aborted && requestId === videoProbeRequestRef.current;
    if (!videoRangeWasEditedRef.current) {
      setVideoStart("");
      setVideoEnd("");
    }
    setIsVideoProbeLoading(true);
    setVideoProbeError("");

    void (async () => {
      try {
        const params = new URLSearchParams({ mode: videoMode, count: String(videoCount) });
        const response = await fetch(`/api/video/${encodeURIComponent(videoId)}/frames?${params}`, {
          signal: controller.signal
        });
        const body = (await response.json().catch(() => null)) as VideoProbeResponse | null;
        if (
          !response.ok ||
          body?.ok !== true ||
          !body.video ||
          body.loop === undefined ||
          body.segment === undefined ||
          body.suggested === undefined ||
          body.contactSheet === undefined
        ) {
          throw new Error(responseReason(body, "영상 프레임을 분석하지 못했습니다."));
        }
        if (!isCurrent()) return;
        const probe: VideoProbe = {
          video: body.video,
          loop: body.loop,
          segment: body.segment,
          suggested: body.suggested,
          contactSheet: body.contactSheet
        };
        setVideoProbe(probe);
        if (!videoRangeWasEditedRef.current && selectedVideoIdRef.current === videoId && probe.suggested) {
          setVideoStart(String(probe.suggested.range.start));
          setVideoEnd(String(probe.suggested.range.end));
        }
      } catch (error) {
        if (!isCurrent()) return;
        setVideoProbe(null);
        setVideoProbeError(error instanceof Error ? error.message : "영상 프레임을 분석하지 못했습니다.");
      } finally {
        if (isCurrent()) setIsVideoProbeLoading(false);
      }
    })();

    return () => {
      controller.abort();
      if (videoProbeRequestRef.current === requestId) videoProbeRequestRef.current += 1;
    };
  }, [open, selectedVideoId, sourceType, videoCount, videoMode]);

  if (!open) return null;

  const handleReferenceFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      toast.error("PNG 또는 JPEG 파일만 참조할 수 있습니다.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("참조 이미지는 20MB 이하여야 합니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (!mountedRef.current) return;
      if (typeof reader.result !== "string") {
        toast.error("참조 이미지를 읽지 못했습니다.");
        return;
      }
      setReferenceImage(reader.result);
      setReferencePreview(reader.result);
      setReferenceName(file.name);
      setSelectedCharacterId("");
    };
    reader.onerror = () => {
      if (mountedRef.current) toast.error("참조 이미지를 읽지 못했습니다.");
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      toast.error("PNG 또는 JPEG 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("업로드 파일은 20MB 이하여야 합니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (!mountedRef.current) return;
      if (typeof reader.result !== "string") {
        toast.error("이미지 파일을 읽지 못했습니다.");
        return;
      }
      setUploadName(file.name);
      setUploadDataUrl(reader.result);
    };
    reader.onerror = () => {
      if (mountedRef.current) toast.error("이미지 파일을 읽지 못했습니다.");
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const normalizedCols = Math.max(1, Math.floor(cols));
    const normalizedRows = Math.max(1, Math.floor(rows));
    if (!trimmedName) {
      toast.error("모션 이름을 입력해주세요.");
      return;
    }
    if (sourceType !== "video" && (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1)) {
      toast.error("격자 열과 행은 1 이상의 정수여야 합니다.");
      return;
    }
    if (sourceType !== "upload" && sourceType !== "video" && normalizedCols * normalizedRows > 12) {
      toast.error("생성 스프라이트 시트는 최대 12장까지 지원합니다.");
      return;
    }
    if (sourceType === "generate" && !prompt.trim()) {
      toast.error("생성할 동작을 설명해주세요.");
      return;
    }
    if (sourceType === "reference" && !referenceImage) {
      toast.error("참조 이미지를 선택해주세요.");
      return;
    }
    if (sourceType === "reference" && !referencePrompt.trim()) {
      toast.error("참조 캐릭터가 수행할 동작을 설명해주세요.");
      return;
    }
    if (sourceType === "upload" && !uploadDataUrl) {
      toast.error("업로드할 PNG 또는 JPEG 파일을 선택해주세요.");
      return;
    }
    if (sourceType === "video") {
      if (!selectedVideoId) {
        toast.error("저장된 영상을 선택해주세요.");
        return;
      }
      if (!Number.isInteger(videoCount) || videoCount < 2 || videoCount > 24) {
        toast.error("프레임 수는 2에서 24 사이의 정수여야 합니다.");
        return;
      }
      if (!videoProbe) {
        toast.error("영상 프레임 분석이 끝난 뒤 다시 시도해주세요.");
        return;
      }
      if (!videoRangeIsValid) {
        toast.error("구간 시작과 끝은 유효한 프레임 범위여야 합니다.");
        return;
      }
      if (videoProbe.suggested === null && !hasVideoRange) {
        toast.error("움직임을 찾지 못했습니다. 구간 시작과 끝을 입력해주세요.");
        return;
      }
      if (!videoFpsIsValid) {
        toast.error("재생 FPS는 1에서 60 사이의 정수여야 합니다.");
        return;
      }
    }

    setIsCreating(true);
    try {
      const videoRange = hasVideoRange
        ? { start: videoStartValue!, end: videoEndValue! }
        : {};
      const payload =
        sourceType === "video"
          ? {
              name: trimmedName,
              source: {
                type: "video",
                videoId: selectedVideoId,
                mode: videoMode,
                count: normalizedVideoCount,
                ...videoRange
              },
              ...(videoFpsValue === undefined ? {} : { fps: videoFpsValue })
            }
          : {
              name: trimmedName,
              grid: {
                cols: normalizedCols,
                rows: normalizedRows,
                gutter: 0,
                remainderPolicy: "distribute"
              },
              source:
                sourceType === "reference"
                  ? {
                      type: "reference",
                      prompt: referencePrompt.trim(),
                      action: referenceAction,
                      referenceImage
                    }
                  : sourceType === "generate"
                  ? { type: "generate", prompt: prompt.trim() }
                  : { type: "upload", dataUrl: uploadDataUrl }
            };
      const response = await fetch("/api/motion/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; project?: MotionProject; reason?: string }
        | null;
      if (!response.ok || body?.ok !== true || !body.project) {
        throw new Error(responseReason(body, "모션을 만들지 못했습니다."));
      }
      await onCreated(body.project);
      if (!mountedRef.current) return;
      toast.success("새 모션을 만들었습니다.");
      onClose();
    } catch (error) {
      if (!mountedRef.current) return;
      toast.error(error instanceof Error ? error.message : "모션을 만들지 못했습니다.");
    } finally {
      if (mountedRef.current) setIsCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !isCreating) onClose();
      }}
    >
      <Card className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xl">새 모션</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isCreating} aria-label="닫기">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="motion-name">이름</Label>
            <Input
              id="motion-name"
              value={name}
              maxLength={200}
              disabled={isCreating}
              onChange={event => setName(event.target.value)}
            />
          </div>

          <Tabs
            value={sourceType}
            onValueChange={value => {
              if (value === "reference" || value === "generate" || value === "upload" || value === "video") {
                if (value === sourceType) return;
                videoListRequestRef.current += 1;
                videoProbeRequestRef.current += 1;
                setSourceType(value);
              }
            }}
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="reference" disabled={isCreating}>
                <ImageIcon className="mr-2 h-4 w-4" aria-hidden />
                참조 이미지
              </TabsTrigger>
              <TabsTrigger value="generate" disabled={isCreating}>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                생성
              </TabsTrigger>
              <TabsTrigger value="upload" disabled={isCreating}>
                <Upload className="mr-2 h-4 w-4" aria-hidden />
                업로드
              </TabsTrigger>
              <TabsTrigger value="video" disabled={isCreating}>
                <Film className="mr-2 h-4 w-4" aria-hidden />
                영상
              </TabsTrigger>
            </TabsList>
            <TabsContent value="reference" className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="motion-reference-upload">참조 이미지 파일</Label>
                <Input
                  id="motion-reference-upload"
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={isCreating}
                  onChange={handleReferenceFileChange}
                />
                <p className="text-xs text-muted-foreground">{referenceName || "PNG·JPEG, 최대 20MB"}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" aria-hidden />
                  또는 캐릭터 라이브러리에서 선택
                </div>
                {characters.length ? (
                  <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-4">
                    {characters.map(character => (
                      <button
                        key={character.id}
                        type="button"
                        disabled={isCreating}
                        aria-pressed={selectedCharacterId === character.id}
                        className={`rounded-md border p-2 text-left transition-colors hover:bg-muted ${
                          selectedCharacterId === character.id ? "border-primary bg-primary/5" : ""
                        }`}
                        onClick={() => {
                          setSelectedCharacterId(character.id);
                          setReferenceImage(character.primaryImageUrl);
                          setReferencePreview(character.thumbnailUrl || character.primaryImageUrl);
                          setReferenceName(character.name);
                        }}
                      >
                        <Image
                          src={character.thumbnailUrl || character.primaryImageUrl}
                          alt={character.name}
                          width={96}
                          height={96}
                          unoptimized
                          className="aspect-square w-full rounded object-cover"
                        />
                        <span className="mt-1 block truncate text-xs">{character.name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    저장된 캐릭터가 없습니다. 위에서 이미지 파일을 선택할 수 있습니다.
                  </p>
                )}
              </div>

              {referencePreview ? (
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <Image
                    src={referencePreview}
                    alt="선택한 참조 이미지 미리보기"
                    width={80}
                    height={80}
                    unoptimized
                    className="h-20 w-20 rounded object-cover"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">선택한 참조</p>
                    <p className="truncate text-xs text-muted-foreground">{referenceName}</p>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>동작 프리셋</Label>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="동작 프리셋">
                  {ACTION_OPTIONS.map(option => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={referenceAction === option.value ? "default" : "outline"}
                      disabled={isCreating}
                      aria-pressed={referenceAction === option.value}
                      onClick={() => setReferenceAction(option.value)}
                      className="h-auto min-h-12 flex-col gap-0.5 py-2"
                    >
                      <span>{option.label}</span>
                      <span className="text-[10px] font-normal opacity-80">
                        {option.defaultLoop === "loop" ? "반복" : "단발"} · 권장 {option.recommendedFrames}장
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="motion-reference-prompt">동작 설명</Label>
                <Textarea
                  id="motion-reference-prompt"
                  value={referencePrompt}
                  maxLength={20_000}
                  disabled={isCreating}
                  onChange={event => setReferencePrompt(event.target.value)}
                  placeholder='짧게 써도 됩니다. 예: "천천히 걷는다"'
                />
              </div>
            </TabsContent>
            <TabsContent value="generate" className="space-y-2">
              <Label htmlFor="motion-prompt">동작 설명</Label>
              <Textarea
                id="motion-prompt"
                value={prompt}
                maxLength={20_000}
                disabled={isCreating}
                onChange={event => setPrompt(event.target.value)}
                placeholder="무엇이 어떤 동작을 하는지 자유롭게 설명해주세요."
              />
            </TabsContent>
            <TabsContent value="upload" className="space-y-2">
              <Label htmlFor="motion-upload">스프라이트 시트</Label>
              <Input
                id="motion-upload"
                type="file"
                accept="image/png,image/jpeg"
                disabled={isCreating}
                onChange={handleFileChange}
              />
              <p className="text-xs text-muted-foreground">
                {uploadName || "PNG·JPEG, 최대 20MB"}
              </p>
            </TabsContent>
            <TabsContent value="video" className="space-y-4">
              {isVideoListLoading ? (
                <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  저장된 영상을 불러오는 중…
                </div>
              ) : null}
              {videoListError ? (
                <p className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">{videoListError}</p>
              ) : null}
              {!isVideoListLoading && !videoListError && videos.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  저장된 영상이 없습니다. 먼저 영상을 만드세요.
                </p>
              ) : null}
              {videos.length ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="motion-video">저장된 영상</Label>
                    <select
                      id="motion-video"
                      value={selectedVideoId}
                      disabled={isCreating || isVideoListLoading}
                      onChange={event => chooseVideo(event.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {videos.map(video => (
                        <option key={video.id} value={video.id}>
                          {video.id} · {new Date(video.createdAtIso).toLocaleString("ko-KR")} · {video.prompt.slice(0, 60) || "프롬프트 없음"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>모드</Label>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="영상 프레임 모드">
                      <label className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm">
                        <input
                          type="radio"
                          name="motion-video-mode"
                          value="loop"
                          checked={videoMode === "loop"}
                          disabled={isCreating}
                          onChange={() => {
                            videoProbeRequestRef.current += 1;
                            setVideoMode("loop");
                          }}
                        />
                        루프
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm">
                        <input
                          type="radio"
                          name="motion-video-mode"
                          value="oneshot"
                          checked={videoMode === "oneshot"}
                          disabled={isCreating}
                          onChange={() => {
                            videoProbeRequestRef.current += 1;
                            setVideoMode("oneshot");
                          }}
                        />
                        원샷
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="motion-video-count">프레임 수</Label>
                      <Input
                        id="motion-video-count"
                        type="number"
                        min={2}
                        max={24}
                        step={1}
                        value={videoCount}
                        disabled={isCreating}
                        onChange={event => {
                          const nextVideoCount = Number(event.target.value);
                          if (nextVideoCount === videoCount) return;
                          videoProbeRequestRef.current += 1;
                          setVideoCount(nextVideoCount);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="motion-video-fps">재생 FPS (선택)</Label>
                      <Input
                        id="motion-video-fps"
                        type="number"
                        min={1}
                        max={60}
                        step={1}
                        value={videoFps}
                        disabled={isCreating}
                        onChange={event => setVideoFps(event.target.value)}
                        placeholder="권장값 사용"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="motion-video-start">구간 시작 프레임 (선택)</Label>
                      <Input
                        id="motion-video-start"
                        type="number"
                        min={0}
                        step={1}
                        value={videoStart}
                        disabled={isCreating}
                        onChange={event => {
                          videoRangeWasEditedRef.current = true;
                          setVideoStart(event.target.value);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="motion-video-end">구간 끝 프레임 (선택)</Label>
                      <Input
                        id="motion-video-end"
                        type="number"
                        min={1}
                        step={1}
                        value={videoEnd}
                        disabled={isCreating}
                        onChange={event => {
                          videoRangeWasEditedRef.current = true;
                          setVideoEnd(event.target.value);
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    원본 프레임 번호 기준이며 끝 프레임은 제외됩니다. 시작·끝을 모두 비우면 자동 선택합니다.
                  </p>

                  {isVideoProbeLoading ? (
                    <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      영상 프레임을 분석하는 중…
                    </div>
                  ) : null}
                  {videoProbeError ? (
                    <p className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">{videoProbeError}</p>
                  ) : null}
                  {videoProbe ? (
                    <div className="space-y-3 rounded-md border p-3">
                      {videoProbe.contactSheet ? (
                        // Contact sheets are generated locally as data URLs, so next/image optimization is not applicable.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={videoProbe.contactSheet}
                          alt="선택한 영상의 접촉 시트"
                          className="max-h-64 w-full rounded object-contain"
                        />
                      ) : null}
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>
                          원본 {videoProbe.video.width} × {videoProbe.video.height} · {videoProbe.video.fps}fps · {videoProbe.video.frameCount}프레임 · {videoProbe.video.durationSec.toFixed(2)}초
                        </p>
                        {videoProbe.loop ? (
                          <p>
                            루프 감지: 주기 {videoProbe.loop.period}프레임 = {(videoProbe.loop.period / videoProbe.video.fps).toFixed(2)}초
                          </p>
                        ) : null}
                        {videoProbe.segment ? (
                          <p>활동 구간: {videoProbe.segment.start}~{videoProbe.segment.end}</p>
                        ) : null}
                        {videoProbe.suggested ? (
                          <p>
                            제안 프레임: {videoProbe.suggested.frameIndices.join(", ")} · 파생 {videoProbe.suggested.derivedFps}fps
                          </p>
                        ) : (
                          <p className="text-destructive">움직임을 찾지 못했습니다. 구간을 직접 입력하세요.</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </TabsContent>
          </Tabs>

          {sourceType !== "video" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="motion-cols">열</Label>
                  <Input
                    id="motion-cols"
                    type="number"
                    min={1}
                    step={1}
                    value={cols}
                    disabled={isCreating}
                    onChange={event => setCols(Number(event.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="motion-rows">행</Label>
                  <Input
                    id="motion-rows"
                    type="number"
                    min={1}
                    step={1}
                    value={rows}
                    disabled={isCreating}
                    onChange={event => setRows(Number(event.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  열×행 = {frameCount}장 · 권장 8장 · 생성 상한 12장
                </p>
                {sourceType === "reference" && selectedAction.cyclic ? (
                  <p>반복 행은 자동 제외됩니다(실효 4장일 수 있음)</p>
                ) : null}
              </div>
            </>
          ) : null}

          {isCreating ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
              <span>시트 생성 중… 최대 3분</span>
            </div>
          ) : null}

          <Button className="w-full" disabled={isCreating || (sourceType === "video" && !canCreateVideo)} onClick={() => void handleCreate()}>
            {isCreating ? "생성 중…" : "모션 생성"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
