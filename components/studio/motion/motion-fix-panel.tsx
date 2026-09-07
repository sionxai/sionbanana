"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Copy, Eraser, Loader2, Paintbrush, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import type { MotionPreviewCandidate } from "@/components/studio/motion/motion-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { candidateSchema, type Candidate, type MotionProject } from "@/lib/motion/types";

type CandidateSummary = Pick<Candidate, "id" | "mode" | "status" | "createdAtIso" | "appliedAtIso"> & {
  frames: number[];
};

type CellMask = { image: HTMLImageElement; mask: HTMLCanvasElement };

type MotionFixPanelProps = {
  project: MotionProject;
  cacheVersion: number;
  selectedFrameIndices: number[];
  previewCandidate: MotionPreviewCandidate | null;
  isBusy: boolean;
  hasPendingMatte: boolean;
  runProjectMutation: <T>(request: () => Promise<T>) => Promise<T>;
  onProjectChanged: (project: MotionProject) => void;
  onPreviewCandidateChange: (candidate: MotionPreviewCandidate | null) => void;
  onWorkerActiveChange: (active: boolean) => void;
};

const INSTRUCTION_PRESETS = [
  { label: "자세", value: "자세를 자연스럽게 교정하고 이전·다음 프레임의 동작 흐름을 유지하세요." },
  { label: "손·무기 접촉", value: "손·무기 접촉 위치를 자연스럽게 연결하세요." },
  { label: "크기 튐", value: "캐릭터 크기 튐을 줄이고 프레임 간 비율을 유지하세요." },
  { label: "장비 변형", value: "장비 변형을 바로잡고 형태를 일관되게 유지하세요." },
  { label: "동작 연결", value: "동작 연결이 부드럽게 이어지도록 중간 포즈를 보정하세요." }
];
const PROTECT_PRESETS = ["얼굴", "머리", "의상", "무기", "배경"];

function cellUrl(projectId: string, frameIndex: number): string {
  return "/api/motion/projects/" + encodeURIComponent(projectId) + "/cells/" + frameIndex;
}

function candidateUrl(projectId: string, candidateId: string, frameIndex: number): string {
  const fileName = "f" + String(frameIndex + 1).padStart(2, "0") + ".png";
  return "/api/motion/projects/" + encodeURIComponent(projectId) + "/asset/candidates/" + encodeURIComponent(candidateId) + "/frames/" + fileName;
}

function candidatesUrl(projectId: string): string {
  return "/api/motion/projects/" + encodeURIComponent(projectId) + "/candidates";
}

function responseReason(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "reason" in body) {
    const reason = (body as { reason?: unknown }).reason;
    if (typeof reason === "string" && reason) return reason;
  }
  return fallback;
}

function isCandidateSummary(value: unknown): value is CandidateSummary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    (candidate.mode === "mask" || candidate.mode === "strip" || candidate.mode === "upload") &&
    (candidate.status === "pending" || candidate.status === "running" || candidate.status === "ready" || candidate.status === "failed") &&
    Array.isArray(candidate.frames) &&
    candidate.frames.every(index => Number.isInteger(index) && index >= 0)
  );
}

function isCandidate(value: unknown): value is Candidate {
  return candidateSchema.safeParse(value).success;
}

function hasPaintedPixels(mask: HTMLCanvasElement): boolean {
  const context = mask.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  const pixels = context.getImageData(0, 0, mask.width, mask.height).data;
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] < 255) return true;
  }
  return false;
}

function exportBinaryMask(mask: HTMLCanvasElement): string {
  const context = mask.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("마스크를 읽지 못했습니다.");
  const data = context.getImageData(0, 0, mask.width, mask.height);
  for (let offset = 0; offset < data.data.length; offset += 4) {
    const painted = data.data[offset + 3] < 255;
    data.data[offset] = 0;
    data.data[offset + 1] = 0;
    data.data[offset + 2] = 0;
    data.data[offset + 3] = painted ? 0 : 255;
  }
  const output = document.createElement("canvas");
  output.width = mask.width;
  output.height = mask.height;
  const outputContext = output.getContext("2d");
  if (!outputContext) throw new Error("마스크를 내보내지 못했습니다.");
  outputContext.putImageData(data, 0, 0);
  return output.toDataURL("image/png");
}

function displayFrames(indices: number[]): string {
  return indices.map(index => String(index + 1)).join(", ");
}

export function MotionFixPanel({
  project,
  cacheVersion,
  selectedFrameIndices,
  previewCandidate,
  isBusy,
  hasPendingMatte,
  runProjectMutation,
  onProjectChanged,
  onPreviewCandidateChange,
  onWorkerActiveChange
}: MotionFixPanelProps) {
  const displayRef = useRef<HTMLCanvasElement | null>(null);
  const masksRef = useRef<Map<number, CellMask>>(new Map());
  const loadsRef = useRef<Map<number, Promise<CellMask>>>(new Map());
  const scopeRef = useRef("");
  const candidateRequestRef = useRef(0);
  const pointerRef = useRef<{ id: number; frameIndex: number; x: number; y: number } | null>(null);
  const [mode, setMode] = useState<"mask" | "strip">("mask");
  const [instruction, setInstruction] = useState("");
  const [protect, setProtect] = useState<string[]>([]);
  const [protectDraft, setProtectDraft] = useState("");
  const [brushSize, setBrushSize] = useState(36);
  const [eraser, setEraser] = useState(false);
  const [activeMaskFrame, setActiveMaskFrame] = useState<number | null>(null);
  const [maskVersion, setMaskVersion] = useState(0);
  const [isLoadingCells, setIsLoadingCells] = useState(false);
  const [cellError, setCellError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [selectedCandidateFrames, setSelectedCandidateFrames] = useState<Record<string, number[]>>({});
  const [pollAttempt, setPollAttempt] = useState(0);

  const selectedFrames = useMemo(
    () => [...new Set(selectedFrameIndices)].sort((left, right) => left - right),
    [selectedFrameIndices]
  );
  const sourceSignature = project.frames
    .map(frame => String(frame.index) + ":" + frame.source.w + "x" + frame.source.h + ":" + frame.flipX)
    .join(",");
  const scope = project.id + ":" + cacheVersion + ":" + sourceSignature;
  const stripInfo = useMemo(() => {
    if (selectedFrames.length === 0) return { anchors: [] as number[], reason: "타임라인에서 프레임을 선택해주세요." };
    if (selectedFrames.length > 6) return { anchors: [] as number[], reason: "앵커 스트립은 최대 6장까지 생성할 수 있습니다." };
    if (!selectedFrames.every((index, position) => position === 0 || index === selectedFrames[position - 1] + 1)) {
      return { anchors: [] as number[], reason: "앵커 스트립은 연속된 프레임만 사용할 수 있습니다." };
    }
    const anchors = [selectedFrames[0] - 1, selectedFrames[selectedFrames.length - 1] + 1].filter(
      index => index >= 0 && index < project.frames.length
    );
    return anchors.length > 0
      ? { anchors, reason: null }
      : { anchors, reason: "프로젝트 전체 구간은 바깥 앵커가 없어 스트립을 생성할 수 없습니다." };
  }, [project.frames.length, selectedFrames]);

  const ensureCell = useCallback(async (frameIndex: number): Promise<CellMask> => {
    const existing = masksRef.current.get(frameIndex);
    if (existing) return existing;
    const loading = loadsRef.current.get(frameIndex);
    if (loading) return loading;
    const requestScope = scope;
    const promise = (async () => {
      const response = await fetch(cellUrl(project.id, frameIndex), { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(responseReason(body, String(frameIndex + 1) + "번 셀을 불러오지 못했습니다."));
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const value = new Image();
          value.onload = () => resolve(value);
          value.onerror = () => reject(new Error(String(frameIndex + 1) + "번 셀 이미지를 읽지 못했습니다."));
          value.src = objectUrl;
        });
        if (scopeRef.current !== requestScope) throw new Error("프레임 선택이 변경되었습니다.");
        const mask = document.createElement("canvas");
        mask.width = image.naturalWidth;
        mask.height = image.naturalHeight;
        const context = mask.getContext("2d");
        if (!context) throw new Error("마스크 캔버스를 만들지 못했습니다.");
        context.fillStyle = "#000000";
        context.fillRect(0, 0, mask.width, mask.height);
        const state = { image, mask };
        masksRef.current.set(frameIndex, state);
        return state;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    })();
    loadsRef.current.set(frameIndex, promise);
    try {
      return await promise;
    } finally {
      loadsRef.current.delete(frameIndex);
    }
  }, [project.id, scope]);

  const redrawMask = useCallback(() => {
    if (activeMaskFrame === null) return;
    const display = displayRef.current;
    const state = masksRef.current.get(activeMaskFrame);
    if (!display || !state) return;
    display.width = state.mask.width;
    display.height = state.mask.height;
    const context = display.getContext("2d");
    const maskContext = state.mask.getContext("2d", { willReadFrequently: true });
    if (!context || !maskContext) return;
    context.clearRect(0, 0, display.width, display.height);
    context.drawImage(state.image, 0, 0);
    const mask = maskContext.getImageData(0, 0, display.width, display.height);
    const overlay = context.createImageData(display.width, display.height);
    for (let offset = 0; offset < mask.data.length; offset += 4) {
      if (mask.data[offset + 3] === 255) continue;
      overlay.data[offset] = 239;
      overlay.data[offset + 1] = 68;
      overlay.data[offset + 2] = 68;
      overlay.data[offset + 3] = 115;
    }
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = display.width;
    overlayCanvas.height = display.height;
    const overlayContext = overlayCanvas.getContext("2d");
    if (!overlayContext) return;
    overlayContext.putImageData(overlay, 0, 0);
    context.drawImage(overlayCanvas, 0, 0);
  }, [activeMaskFrame]);

  useEffect(() => {
    scopeRef.current = scope;
    masksRef.current.clear();
    loadsRef.current.clear();
    pointerRef.current = null;
    setActiveMaskFrame(null);
    setCellError(null);
    setMaskVersion(version => version + 1);
  }, [scope]);

  useEffect(() => {
    let disposed = false;
    if (selectedFrames.length === 0) {
      setIsLoadingCells(false);
      return () => {
        disposed = true;
      };
    }
    setIsLoadingCells(true);
    setCellError(null);
    void (async () => {
      try {
        for (const index of selectedFrames) await ensureCell(index);
        if (!disposed) setMaskVersion(version => version + 1);
      } catch (error) {
        if (!disposed) setCellError(error instanceof Error ? error.message : "셀을 불러오지 못했습니다.");
      } finally {
        if (!disposed) setIsLoadingCells(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [ensureCell, selectedFrames]);

  useEffect(() => {
    if (activeMaskFrame === null || !selectedFrames.includes(activeMaskFrame)) {
      setActiveMaskFrame(selectedFrames[0] ?? null);
    }
  }, [activeMaskFrame, selectedFrames]);

  useEffect(() => {
    redrawMask();
  }, [maskVersion, redrawMask]);

  const refreshCandidates = useCallback(async () => {
    const requestId = ++candidateRequestRef.current;
    setIsLoadingCandidates(true);
    try {
      const response = await fetch(candidatesUrl(project.id), { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; candidates?: unknown; reason?: string } | null;
      if (!response.ok || body?.ok !== true || !Array.isArray(body.candidates) || !body.candidates.every(isCandidateSummary)) {
        throw new Error(responseReason(body, "후보 목록을 불러오지 못했습니다."));
      }
      const details: Candidate[] = [];
      for (const summary of body.candidates) {
        const detailResponse = await fetch(candidatesUrl(project.id) + "/" + encodeURIComponent(summary.id), { cache: "no-store" });
        const detailBody = (await detailResponse.json().catch(() => null)) as { ok?: boolean; candidate?: unknown; reason?: string } | null;
        if (!detailResponse.ok || detailBody?.ok !== true || !isCandidate(detailBody.candidate)) {
          throw new Error(responseReason(detailBody, "후보 상세를 불러오지 못했습니다."));
        }
        details.push(detailBody.candidate);
      }
      if (candidateRequestRef.current !== requestId) return;
      setCandidates(details);
      setCandidateError(null);
      onWorkerActiveChange(details.some(candidate => candidate.status === "pending" || candidate.status === "running"));
    } catch (error) {
      if (candidateRequestRef.current !== requestId) return;
      setCandidateError(error instanceof Error ? error.message : "후보 목록을 불러오지 못했습니다.");
    } finally {
      if (candidateRequestRef.current === requestId) {
        setIsLoadingCandidates(false);
        setPollAttempt(attempt => attempt + 1);
      }
    }
  }, [onWorkerActiveChange, project.id]);

  useEffect(() => {
    candidateRequestRef.current += 1;
    setCandidates([]);
    setCandidateError(null);
    onWorkerActiveChange(false);
    void refreshCandidates();
    return () => {
      candidateRequestRef.current += 1;
    };
  }, [project.id, refreshCandidates, onWorkerActiveChange]);

  useEffect(() => {
    if (!candidateError && !candidates.some(candidate => candidate.status === "pending" || candidate.status === "running")) return;
    const timer = window.setTimeout(() => void refreshCandidates(), 3000);
    return () => window.clearTimeout(timer);
  }, [candidateError, candidates, pollAttempt, refreshCandidates]);

  useEffect(() => {
    setSelectedCandidateFrames(current => {
      const next = { ...current };
      for (const candidate of candidates) {
        if (next[candidate.id]) continue;
        const candidateFrames = candidate.frames.map(frame => frame.index);
        const matching = candidateFrames.filter(index => selectedFrames.includes(index));
        next[candidate.id] = matching.length > 0 ? matching : candidateFrames;
      }
      return next;
    });
  }, [candidates, selectedFrames]);

  const paint = (frameIndex: number, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const state = masksRef.current.get(frameIndex);
    const context = state?.mask.getContext("2d");
    if (!state || !context) return;
    context.save();
    context.globalCompositeOperation = eraser ? "source-over" : "destination-out";
    context.strokeStyle = "#000000";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brushSize;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
    setMaskVersion(version => version + 1);
  };

  const pointFor = (event: PointerEvent<HTMLCanvasElement>, state: CellMask) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(state.mask.width, (event.clientX - bounds.left) * state.mask.width / bounds.width)),
      y: Math.max(0, Math.min(state.mask.height, (event.clientY - bounds.top) * state.mask.height / bounds.height))
    };
  };

  const fillMask = (frameIndex: number, paintAll: boolean) => {
    const state = masksRef.current.get(frameIndex);
    const context = state?.mask.getContext("2d");
    if (!state || !context) return;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, state.mask.width, state.mask.height);
    if (!paintAll) {
      context.fillStyle = "#000000";
      context.fillRect(0, 0, state.mask.width, state.mask.height);
    }
    context.restore();
    setMaskVersion(version => version + 1);
  };

  const copyMask = async () => {
    if (activeMaskFrame === null) return;
    const source = masksRef.current.get(activeMaskFrame);
    if (!source) return;
    try {
      for (const index of selectedFrames) {
        if (index === activeMaskFrame) continue;
        const target = await ensureCell(index);
        const context = target.mask.getContext("2d");
        if (!context) throw new Error("대상 마스크를 만들지 못했습니다.");
        context.clearRect(0, 0, target.mask.width, target.mask.height);
        context.drawImage(source.mask, 0, 0, target.mask.width, target.mask.height);
      }
      setMaskVersion(version => version + 1);
      toast.success("마스크를 선택한 다른 셀 크기에 맞춰 복사했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "마스크를 복사하지 못했습니다.");
    }
  };

  const addProtect = () => {
    const value = protectDraft.trim();
    if (value && !protect.includes(value)) setProtect(current => [...current, value]);
    setProtectDraft("");
  };

  const createCandidate = async () => {
    if (isBusy || hasPendingMatte || selectedFrames.length === 0) return;
    if (mode === "strip" && stripInfo.reason) {
      toast.error(stripInfo.reason);
      return;
    }
    try {
      const candidate = await runProjectMutation(async () => {
        const frames = mode === "mask"
          ? await Promise.all(selectedFrames.map(async index => {
              const state = await ensureCell(index);
              if (!hasPaintedPixels(state.mask)) throw new Error(String(index + 1) + "번 프레임에서 수정할 영역을 칠해주세요.");
              return { index, mask: exportBinaryMask(state.mask) };
            }))
          : selectedFrames.map(index => ({ index }));
        if (scopeRef.current !== scope) throw new Error("프로젝트 또는 프레임 구간이 변경되었습니다.");
        const response = await fetch(candidatesUrl(project.id), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode, frames, instruction: instruction.trim() || null, protect })
        });
        const body = (await response.json().catch(() => null)) as { ok?: boolean; candidate?: unknown; reason?: string } | null;
        if (!response.ok || body?.ok !== true || !isCandidate(body.candidate)) {
          throw new Error(responseReason(body, "수정 후보를 만들지 못했습니다."));
        }
        return body.candidate;
      });
      setCandidates(current => [candidate, ...current.filter(value => value.id !== candidate.id)]);
      onWorkerActiveChange(candidate.status === "pending" || candidate.status === "running");
      toast.success("수정 후보 생성을 요청했습니다. 완료 상태를 확인하는 중입니다.");
      void refreshCandidates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수정 후보를 만들지 못했습니다.");
    }
  };

  const applyCandidate = async (candidate: Candidate) => {
    if (isBusy || hasPendingMatte) return;
    const frames = (selectedCandidateFrames[candidate.id] ?? []).filter(index => candidate.frames.some(frame => frame.index === index));
    if (frames.length === 0) {
      toast.error("적용할 후보 프레임을 하나 이상 선택해주세요.");
      return;
    }
    if (!window.confirm(displayFrames(frames) + "번 프레임에 이 후보를 적용할까요?")) return;
    try {
      const updated = await runProjectMutation(async () => {
        const response = await fetch(candidatesUrl(project.id) + "/" + encodeURIComponent(candidate.id) + "/apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ frames })
        });
        const body = (await response.json().catch(() => null)) as { ok?: boolean; project?: MotionProject; reason?: string } | null;
        if (!response.ok || body?.ok !== true || !body.project) throw new Error(responseReason(body, "후보를 적용하지 못했습니다."));
        return body.project;
      });
      onProjectChanged(updated);
      onPreviewCandidateChange(null);
      toast.success("선택한 후보 프레임을 적용했습니다.");
      void refreshCandidates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "후보를 적용하지 못했습니다.");
    }
  };

  const revertFrames = async (frames: number[], label: string) => {
    if (isBusy || hasPendingMatte) return;
    if (frames.length === 0) return;
    if (!window.confirm(label + "을(를) 되돌릴까요?")) return;
    try {
      const updated = await runProjectMutation(async () => {
        const response = await fetch("/api/motion/projects/" + encodeURIComponent(project.id) + "/revert", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ frames })
        });
        const body = (await response.json().catch(() => null)) as { ok?: boolean; project?: MotionProject; reason?: string } | null;
        if (!response.ok || body?.ok !== true || !body.project) throw new Error(responseReason(body, "프레임 수정을 되돌리지 못했습니다."));
        return body.project;
      });
      onProjectChanged(updated);
      onPreviewCandidateChange(null);
      toast.success("선택한 프레임 수정을 되돌렸습니다.");
      void refreshCandidates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "프레임 수정을 되돌리지 못했습니다.");
    }
  };

  const deleteCandidate = async (candidate: Candidate) => {
    if (!window.confirm("후보를 삭제할까요? 적용된 프레임은 그대로 유지됩니다.")) return;
    candidateRequestRef.current += 1;
    try {
      await runProjectMutation(async () => {
        const response = await fetch(candidatesUrl(project.id) + "/" + encodeURIComponent(candidate.id), { method: "DELETE" });
        const body = (await response.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
        if (!response.ok || body?.ok !== true) throw new Error(responseReason(body, "후보를 삭제하지 못했습니다."));
      });
      setCandidates(current => current.filter(value => value.id !== candidate.id));
      setSelectedCandidateFrames(current => {
        const { [candidate.id]: removed, ...remaining } = current;
        void removed;
        return remaining;
      });
      if (previewCandidate?.id === candidate.id) onPreviewCandidateChange(null);
      toast.success("후보를 삭제했습니다.");
      void refreshCandidates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "후보를 삭제하지 못했습니다.");
    }
  };

  const disabled = isBusy || hasPendingMatte;
  const activeMask = activeMaskFrame === null ? null : masksRef.current.get(activeMaskFrame);
  const allOverrideFrames = project.frames.filter(frame => frame.override).map(frame => frame.index);
  const selectedOverrideFrames = selectedFrames.filter(index => allOverrideFrames.includes(index));

  return (
    <div className="min-w-0 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">모션 수정</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">선택 구간에만 후보를 만들고, 적용 전에는 원본을 바꾸지 않습니다.</p>
          </div>
          {isBusy ? <Badge variant="warning"><Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />요청 중</Badge> : null}
        </CardHeader>
        <CardContent className="space-y-5">
          {hasPendingMatte ? <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">매트 변경을 저장하는 중입니다. 완료된 뒤 후보를 생성해주세요.</p> : null}
          <ToggleGroup type="single" value={mode} disabled={disabled} className="grid grid-cols-2 gap-2" onValueChange={value => {
            if (value === "mask" || value === "strip") setMode(value);
          }}>
            <ToggleGroupItem value="mask">마스크 편집</ToggleGroupItem>
            <ToggleGroupItem value="strip">앵커 스트립 재생성</ToggleGroupItem>
          </ToggleGroup>
          <div className="space-y-2">
            <Label>수정 지시</Label>
            <div className="flex flex-wrap gap-2">
              {INSTRUCTION_PRESETS.map(preset => <Button key={preset.label} type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setInstruction(preset.value)}>{preset.label}</Button>)}
            </div>
            <Textarea value={instruction} maxLength={4000} disabled={disabled} onChange={event => setInstruction(event.target.value)} placeholder="수정할 동작과 연결 조건을 입력하세요." className="min-h-[96px]" />
          </div>
          <div className="space-y-2">
            <Label>보호할 요소</Label>
            <div className="flex flex-wrap gap-2">
              {PROTECT_PRESETS.map(value => <Button key={value} type="button" variant={protect.includes(value) ? "default" : "outline"} size="sm" disabled={disabled} onClick={() => setProtect(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])}>{value}</Button>)}
              {protect.filter(value => !PROTECT_PRESETS.includes(value)).map(value => <Badge key={value} variant="secondary" className="gap-1 pr-1">{value}<button type="button" disabled={disabled} onClick={() => setProtect(current => current.filter(item => item !== value))} aria-label={value + " 보호 항목 삭제"}><X className="h-3 w-3" aria-hidden /></button></Badge>)}
            </div>
            <div className="flex gap-2">
              <Input value={protectDraft} maxLength={200} disabled={disabled} onChange={event => setProtectDraft(event.target.value)} onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addProtect();
                }
              }} placeholder="직접 보호 항목 추가" />
              <Button type="button" variant="outline" size="icon" disabled={disabled || !protectDraft.trim()} onClick={addProtect} aria-label="보호 항목 추가"><Plus className="h-4 w-4" aria-hidden /></Button>
            </div>
          </div>
          {mode === "mask" ? (
            <div className="space-y-4 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><Label>수정 영역</Label><p className="mt-1 text-xs text-muted-foreground">빨간 영역은 후보 생성 시 수정할 부분입니다.</p></div>
                <div className="flex gap-2">
                  <Button type="button" variant={eraser ? "default" : "outline"} size="sm" disabled={disabled} onClick={() => setEraser(value => !value)}>{eraser ? <Eraser className="mr-1 h-3.5 w-3.5" aria-hidden /> : <Paintbrush className="mr-1 h-3.5 w-3.5" aria-hidden />}{eraser ? "지우개" : "브러시"}</Button>
                  <Button type="button" variant="outline" size="sm" disabled={disabled || selectedFrames.length < 2 || !activeMask} onClick={() => void copyMask()}><Copy className="mr-1 h-3.5 w-3.5" aria-hidden />복사</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">{selectedFrames.map(index => <Button key={index} type="button" size="sm" variant={activeMaskFrame === index ? "default" : "outline"} disabled={disabled || isLoadingCells} onClick={() => setActiveMaskFrame(index)}>{index + 1}번</Button>)}</div>
              <div className="space-y-2"><div className="flex items-center justify-between"><Label>브러시 크기</Label><span className="text-sm tabular-nums text-muted-foreground">{brushSize}px</span></div><Slider min={4} max={160} step={1} value={[brushSize]} disabled={disabled} onValueChange={value => setBrushSize(Math.round(value[0] ?? 36))} /></div>
              <div className="relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-md border bg-muted/20 p-3">
                {isLoadingCells ? <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />셀 불러오는 중…</div> : null}
                {cellError ? <p className="px-4 text-center text-sm text-destructive">{cellError}</p> : null}
                {!isLoadingCells && !cellError && !activeMask ? <p className="text-sm text-muted-foreground">타임라인에서 프레임을 선택해주세요.</p> : null}
                <canvas ref={displayRef} className={activeMask ? "max-h-[420px] max-w-full touch-none cursor-crosshair rounded" : "hidden"} onPointerDown={event => {
                  if (disabled || activeMaskFrame === null) return;
                  const state = masksRef.current.get(activeMaskFrame);
                  if (!state) return;
                  const point = pointFor(event, state);
                  pointerRef.current = { id: event.pointerId, frameIndex: activeMaskFrame, ...point };
                  event.currentTarget.setPointerCapture(event.pointerId);
                  paint(activeMaskFrame, point, point);
                }} onPointerMove={event => {
                  const pointer = pointerRef.current;
                  if (!pointer || pointer.id !== event.pointerId) return;
                  const state = masksRef.current.get(pointer.frameIndex);
                  if (!state) return;
                  const point = pointFor(event, state);
                  paint(pointer.frameIndex, pointer, point);
                  pointerRef.current = { ...pointer, ...point };
                }} onPointerUp={event => {
                  if (pointerRef.current?.id !== event.pointerId) return;
                  pointerRef.current = null;
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                }} onPointerCancel={event => {
                  if (pointerRef.current?.id === event.pointerId) pointerRef.current = null;
                }} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={disabled || activeMaskFrame === null || !activeMask} onClick={() => activeMaskFrame !== null && fillMask(activeMaskFrame, false)}><RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />현재 마스크 초기화</Button>
                <Button type="button" variant="outline" size="sm" disabled={disabled || activeMaskFrame === null || !activeMask} onClick={() => activeMaskFrame !== null && fillMask(activeMaskFrame, true)}>선택 영역 전체</Button>
              </div>
            </div>
          ) : <div className="rounded-lg border p-3 text-sm"><p className="font-medium">선택 구간: {selectedFrames.length > 0 ? displayFrames(selectedFrames) : "없음"}</p>{stripInfo.reason ? <p className="mt-2 text-destructive">{stripInfo.reason}</p> : <p className="mt-2 text-muted-foreground">선택 구간 바로 바깥의 {displayFrames(stripInfo.anchors)}번 프레임을 고정 앵커로 사용해 동작을 이어갑니다.{stripInfo.anchors.length === 1 ? " 가장자리 구간이라 한쪽 앵커만 사용합니다." : ""}</p>}</div>}
          <Button className="w-full" disabled={disabled || selectedFrames.length === 0 || isLoadingCells || (mode === "strip" && Boolean(stripInfo.reason))} onClick={() => void createCandidate()}>{isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}수정 후보 생성</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div><CardTitle className="text-lg">수정 후보</CardTitle><p className="mt-1 text-xs text-muted-foreground">후보를 비교하고 선택한 프레임만 적용하거나 되돌립니다.</p></div>
          <Button type="button" variant="outline" size="sm" disabled={isLoadingCandidates} onClick={() => void refreshCandidates()}>{isLoadingCandidates ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}새로고침</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {candidateError ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{candidateError} 잠시 후 다시 확인합니다.</p> : null}
          {allOverrideFrames.length > 0 ? <div className="space-y-2 rounded-md border bg-muted/20 p-3"><p className="text-sm font-medium">적용된 프레임 되돌리기</p><p className="text-xs text-muted-foreground">후보를 삭제한 뒤에도 현재 프로젝트의 오버라이드를 선택 구간 또는 전체에서 되돌릴 수 있습니다.</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={isBusy || hasPendingMatte || selectedOverrideFrames.length === 0} onClick={() => void revertFrames(selectedOverrideFrames, "선택 구간의 적용 프레임")}>선택 구간 되돌리기</Button><Button type="button" variant="outline" size="sm" disabled={isBusy || hasPendingMatte} onClick={() => void revertFrames(allOverrideFrames, "프로젝트 전체의 적용 프레임")}>전체 되돌리기</Button></div></div> : null}
          {!isLoadingCandidates && !candidateError && candidates.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">아직 생성한 수정 후보가 없습니다.</p> : null}
          {candidates.map(candidate => {
            const checked = selectedCandidateFrames[candidate.id] ?? [];
            const applied = project.frames.filter(frame => frame.override?.candidateId === candidate.id).map(frame => frame.index);
            const selectedApplied = selectedFrames.filter(index => applied.includes(index));
            const previewFrames = candidate.frames
              .filter(frame => frame.file)
              .map(frame => frame.index);
            const previewable = candidate.status === "ready" && previewFrames.some(index => selectedFrames.includes(index));
            const isPreviewing = previewCandidate?.id === candidate.id;
            return <div key={candidate.id} className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Badge variant={candidate.status === "ready" ? "success" : candidate.status === "failed" ? "destructive" : "warning"}>{candidate.status === "ready" ? "준비됨" : candidate.status === "failed" ? "실패" : candidate.status === "running" ? "생성 중" : "대기"}</Badge><span className="text-sm font-medium">{candidate.mode === "mask" ? "마스크 편집" : "앵커 스트립"}</span>{candidate.appliedAtIso ? <Badge variant="secondary">적용 기록</Badge> : null}</div>
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={isBusy} onClick={() => void deleteCandidate(candidate)}><Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />삭제</Button>
              </div>
              {candidate.reason ? <p className="text-sm text-destructive">{candidate.reason}</p> : null}
              <div className="grid gap-2 sm:grid-cols-2">{candidate.frames.map(frame => {
                const source = project.frames[frame.index]?.source;
                const ratio = String(source?.w ?? 1) + " / " + String(source?.h ?? 1);
                return <div key={frame.index} className="overflow-hidden rounded-md border"><div className="grid grid-cols-2 gap-px bg-border"><div className="bg-muted/20 p-1"><div className="mb-1 text-[11px] text-muted-foreground">원본 {frame.index + 1}</div><div className="bg-muted/30 bg-contain bg-center bg-no-repeat" style={{ aspectRatio: ratio, backgroundImage: "url(" + cellUrl(project.id, frame.index) + ")" }} /></div><div className="bg-muted/20 p-1"><div className="mb-1 text-[11px] text-muted-foreground">후보</div>{candidate.status === "ready" && frame.file ? <div className="bg-muted/30 bg-contain bg-center bg-no-repeat" style={{ aspectRatio: ratio, backgroundImage: "url(" + candidateUrl(project.id, candidate.id, frame.index) + ")" }} /> : <div className="flex items-center justify-center bg-muted/30 text-xs text-muted-foreground" style={{ aspectRatio: ratio }}>{candidate.status === "failed" ? "생성 실패" : "생성 대기"}</div>}</div></div><label className="flex cursor-pointer items-center gap-2 border-t px-2 py-1.5 text-xs"><input type="checkbox" checked={checked.includes(frame.index)} disabled={isBusy || candidate.status !== "ready"} onChange={event => setSelectedCandidateFrames(current => ({ ...current, [candidate.id]: event.target.checked ? [...new Set([...(current[candidate.id] ?? []), frame.index])].sort((left, right) => left - right) : (current[candidate.id] ?? []).filter(index => index !== frame.index) }))} />{frame.index + 1}번 적용</label></div>;
              })}</div>
              {candidate.status === "ready" ? <div className="flex flex-wrap gap-2"><Button type="button" variant={isPreviewing ? "default" : "outline"} size="sm" disabled={isBusy || (!isPreviewing && !previewable)} onClick={() => onPreviewCandidateChange(isPreviewing ? null : { id: candidate.id, frames: previewFrames })}>{isPreviewing ? "미리 재생 끄기" : "선택 구간 미리 재생"}</Button><Button type="button" size="sm" disabled={isBusy || hasPendingMatte || checked.length === 0} onClick={() => void applyCandidate(candidate)}>선택 프레임 적용</Button><Button type="button" variant="outline" size="sm" disabled={isBusy || hasPendingMatte || selectedApplied.length === 0} onClick={() => void revertFrames(selectedApplied, "선택 구간의 적용 프레임")}>선택 구간 되돌리기</Button><Button type="button" variant="outline" size="sm" disabled={isBusy || hasPendingMatte || applied.length === 0} onClick={() => void revertFrames(applied, "이 후보의 적용 프레임 전체")}>이 후보 전체 되돌리기</Button></div> : null}
            </div>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}
