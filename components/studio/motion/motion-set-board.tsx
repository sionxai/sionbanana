"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MotionActionPreset } from "@/lib/motion/prompt";
import { MOTION_ACTION_PRESETS } from "@/lib/motion/prompt";
import { motionSetSchema, type MotionSet } from "@/lib/motion/set-types";
import { motionProjectSchema } from "@/lib/motion/types";

type MotionSetBoardProps = {
  setId: string;
  onOpenProject: (projectId: string) => void | Promise<void>;
  onSetUpdated: (set: MotionSet) => void;
  onDeleted: (setId: string) => void;
  onBusyChange: (busy: boolean) => void;
};

type ProjectMetrics = {
  activeFrames: number;
  excludedDuplicates: number;
  hasMirroredRows: boolean;
};

type BoardStatus = MotionSet["status"] | MotionSet["members"][number]["status"];

const sessionProjectMetrics = new Map<string, ProjectMetrics>();
const sessionProjectMetricRequests = new Map<string, Promise<ProjectMetrics>>();

function responseReason(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "reason" in body) {
    const reason = (body as { reason?: unknown }).reason;
    if (typeof reason === "string" && reason) return reason;
  }
  return fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function statusLabel(status: BoardStatus): string {
  switch (status) {
    case "pending":
      return "대기";
    case "running":
      return "생성 중";
    case "ready":
      return "준비됨";
    case "partial":
      return "일부 완료";
    case "failed":
      return "실패";
  }
}

function StatusBadge({ status, reason }: { status: BoardStatus; reason?: string | null }) {
  const variant =
    status === "ready"
      ? "success"
      : status === "failed"
        ? "destructive"
        : status === "partial"
          ? "warning"
          : status === "running"
            ? "default"
            : "secondary";
  const label = statusLabel(status);
  return (
    <Badge
      variant={variant}
      className={status === "running" ? "border-transparent bg-blue-500/10 text-blue-600" : undefined}
      title={status === "failed" ? reason ?? "생성에 실패했습니다." : undefined}
    >
      {status === "running" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden /> : null}
      <span aria-label={status === "failed" && reason ? `${label}: ${reason}` : label}>{label}</span>
    </Badge>
  );
}

function fetchProjectMetrics(projectId: string): Promise<ProjectMetrics> {
  const cached = sessionProjectMetrics.get(projectId);
  if (cached) return Promise.resolve(cached);
  const inFlight = sessionProjectMetricRequests.get(projectId);
  if (inFlight) return inFlight;

  const request = (async () => {
    const response = await fetch(`/api/motion/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; project?: unknown; reason?: string }
      | null;
    const parsedProject = motionProjectSchema.safeParse(body?.project);
    if (!response.ok || body?.ok !== true || !parsedProject.success) {
      throw new Error(responseReason(body, "프로젝트 정보를 불러오지 못했습니다."));
    }
    const metrics: ProjectMetrics = {
      activeFrames: parsedProject.data.frames.filter(frame => !frame.excluded).length,
      excludedDuplicates: parsedProject.data.duplicateDetection?.excludedFrames.length ?? 0,
      hasMirroredRows: parsedProject.data.mirrorDetection?.rows.some(row => row.mirrored) ?? false
    };
    sessionProjectMetrics.set(projectId, metrics);
    return metrics;
  })();
  sessionProjectMetricRequests.set(projectId, request);
  void request.then(
    () => sessionProjectMetricRequests.delete(projectId),
    () => sessionProjectMetricRequests.delete(projectId)
  );
  return request;
}

export function MotionSetBoard({ setId, onOpenProject, onSetUpdated, onDeleted, onBusyChange }: MotionSetBoardProps) {
  const [motionSet, setMotionSet] = useState<MotionSet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [regeneratingAction, setRegeneratingAction] = useState<MotionActionPreset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [projectMetrics, setProjectMetrics] = useState<Record<string, ProjectMetrics>>({});
  const mountedRef = useRef(true);
  const getRequestRef = useRef<number | null>(null);
  const getRequestSequenceRef = useRef(0);
  const mutationRequestRef = useRef(0);
  const mutationRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      getRequestRef.current = null;
      mutationRequestRef.current += 1;
      if (mutationRef.current) onBusyChange(false);
    };
  }, [onBusyChange]);

  const loadSet = useCallback(async () => {
    if (mutationRef.current) return;
    if (getRequestRef.current !== null) return;
    const requestId = ++getRequestSequenceRef.current;
    getRequestRef.current = requestId;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/motion/sets/${encodeURIComponent(setId)}`, { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; set?: unknown; reason?: string }
        | null;
      const parsedSet = motionSetSchema.safeParse(body?.set);
      if (!response.ok || body?.ok !== true || !parsedSet.success) {
        throw new Error(responseReason(body, "모션 세트를 불러오지 못했습니다."));
      }
      if (!mountedRef.current || getRequestRef.current !== requestId) return;
      setMotionSet(parsedSet.data);
      onSetUpdated(parsedSet.data);
    } catch (error) {
      if (mountedRef.current && getRequestRef.current === requestId) {
        toast.error(error instanceof Error ? error.message : "모션 세트를 불러오지 못했습니다.");
      }
    } finally {
      if (getRequestRef.current === requestId) {
        getRequestRef.current = null;
        if (mountedRef.current) setIsLoading(false);
      }
    }
  }, [onSetUpdated, setId]);

  useEffect(() => {
    setMotionSet(null);
    void loadSet();
    return () => {
      getRequestRef.current = null;
    };
  }, [loadSet]);

  useEffect(() => {
    if (!motionSet || !motionSet.members.some(member => member.status === "pending" || member.status === "running")) {
      return;
    }
    const interval = window.setInterval(() => {
      if (!document.hidden && !mutationRef.current) void loadSet();
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [loadSet, motionSet]);

  const loadProjectMetrics = useCallback(async (projectId: string) => {
    const hadRequest = sessionProjectMetricRequests.has(projectId);
    try {
      const metrics = await fetchProjectMetrics(projectId);
      if (mountedRef.current) setProjectMetrics(current => ({ ...current, [projectId]: metrics }));
    } catch (error) {
      if (mountedRef.current && !hadRequest) {
        toast.error(error instanceof Error ? error.message : "프로젝트 정보를 불러오지 못했습니다.");
      }
    }
  }, []);

  useEffect(() => {
    if (!motionSet) return;
    const timers = motionSet.members.flatMap(member => {
      if (member.status !== "ready" || !member.projectId || sessionProjectMetrics.has(member.projectId)) return [];
      return [window.setTimeout(() => void loadProjectMetrics(member.projectId as string), 0)];
    });
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [loadProjectMetrics, motionSet]);

  const handleRegenerate = async (action: MotionActionPreset) => {
    if (mutationRef.current) return;
    getRequestRef.current = null;
    const requestId = ++mutationRequestRef.current;
    let shouldReload = false;
    mutationRef.current = true;
    onBusyChange(true);
    setRegeneratingAction(action);
    try {
      const response = await fetch(`/api/motion/sets/${encodeURIComponent(setId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ regenerate: [action], start: true })
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; set?: unknown; reason?: string }
        | null;
      const parsedSet = motionSetSchema.safeParse(body?.set);
      if (!response.ok || body?.ok !== true || !parsedSet.success) {
        const fallback = response.status === 409 ? "생성 중인 동작은 재생성할 수 없습니다." : "동작을 재생성하지 못했습니다.";
        throw new Error(responseReason(body, fallback));
      }
      if (!mountedRef.current || mutationRequestRef.current !== requestId) return;
      setMotionSet(parsedSet.data);
      onSetUpdated(parsedSet.data);
      toast.success(`${MOTION_ACTION_PRESETS[action].label} 재생성을 시작했습니다.`);
      shouldReload = true;
    } catch (error) {
      if (mountedRef.current && mutationRequestRef.current === requestId) {
        toast.error(error instanceof Error ? error.message : "동작을 재생성하지 못했습니다.");
      }
    } finally {
      mutationRef.current = false;
      onBusyChange(false);
      if (mountedRef.current && mutationRequestRef.current === requestId) {
        setRegeneratingAction(null);
        if (!shouldReload) setIsLoading(false);
      }
      if (shouldReload && mountedRef.current) void loadSet();
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("프로젝트는 남고 세트 기록만 삭제됩니다.\n세트를 삭제할까요?")) return;
    if (mutationRef.current) return;
    getRequestRef.current = null;
    const requestId = ++mutationRequestRef.current;
    mutationRef.current = true;
    onBusyChange(true);
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/motion/sets/${encodeURIComponent(setId)}`, { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
      if (!response.ok || body?.ok !== true) {
        throw new Error(responseReason(body, "모션 세트를 삭제하지 못했습니다."));
      }
      if (!mountedRef.current || mutationRequestRef.current !== requestId) return;
      onDeleted(setId);
      toast.success("모션 세트 기록을 삭제했습니다.");
    } catch (error) {
      if (mountedRef.current && mutationRequestRef.current === requestId) {
        toast.error(error instanceof Error ? error.message : "모션 세트를 삭제하지 못했습니다.");
      }
    } finally {
      mutationRef.current = false;
      onBusyChange(false);
      if (mountedRef.current && mutationRequestRef.current === requestId) {
        setIsDeleting(false);
        setIsLoading(false);
      }
    }
  };

  if (isLoading && !motionSet) {
    return (
      <div className="flex min-h-[440px] items-center justify-center rounded-xl border border-dashed">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm text-muted-foreground">세트 불러오는 중…</span>
      </div>
    );
  }

  if (!motionSet) {
    return (
      <div className="flex min-h-[440px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
        세트를 불러오지 못했습니다. 목록에서 다시 선택해주세요.
      </div>
    );
  }

  const readyCount = motionSet.members.filter(member => member.status === "ready").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="min-w-0 space-y-2">
            <CardTitle className="truncate text-xl">{motionSet.name}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <StatusBadge status={motionSet.status} />
              <span>진행 {readyCount}/{motionSet.members.length}</span>
              <span>생성 {formatDate(motionSet.createdAtIso)}</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading || isDeleting || regeneratingAction !== null}
            onClick={() => void loadSet()}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden />
            새로고침
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">동작</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">썸네일</th>
                  <th className="px-4 py-3 font-medium">실효 프레임</th>
                  <th className="px-4 py-3 text-right font-medium">작업</th>
                </tr>
              </thead>
              <tbody>
                {motionSet.members.map(member => {
                  const metrics = member.projectId
                    ? projectMetrics[member.projectId] ?? sessionProjectMetrics.get(member.projectId)
                    : undefined;
                  const isRegenerating = regeneratingAction === member.action;
                  return (
                    <tr key={member.action} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{MOTION_ACTION_PRESETS[member.action].label}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={member.status} reason={member.reason} />
                      </td>
                      <td className="px-4 py-3">
                        {member.status === "ready" && member.projectId ? (
                          <Image
                            src={`/api/motion/projects/${encodeURIComponent(member.projectId)}/asset/derived/frames/f01.png`}
                            alt={`${MOTION_ACTION_PRESETS[member.action].label} 첫 프레임`}
                            width={80}
                            height={48}
                            unoptimized
                            className="h-12 w-20 rounded border bg-muted/40 object-cover"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {metrics ? (
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="secondary">{metrics.activeFrames}장</Badge>
                            {metrics.excludedDuplicates > 0 ? (
                              <Badge variant="secondary">중복 제외 {metrics.excludedDuplicates}</Badge>
                            ) : null}
                            {metrics.hasMirroredRows ? <Badge variant="secondary">2행 반전 보정</Badge> : null}
                          </div>
                        ) : member.status === "ready" ? (
                          <span className="text-xs text-muted-foreground">확인 중…</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!member.projectId || member.status !== "ready" || isDeleting}
                            onClick={() => {
                              if (member.projectId && !mutationRef.current) void onOpenProject(member.projectId);
                            }}
                          >
                            열기
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isDeleting || regeneratingAction !== null}
                            onClick={() => void handleRegenerate(member.action)}
                          >
                            {isRegenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden /> : null}
                            재생성
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end border-t p-3">
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={isDeleting || regeneratingAction !== null} onClick={() => void handleDelete()}>
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="mr-2 h-4 w-4" aria-hidden />}
              세트 삭제
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
