"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { MotionCreateDialog } from "@/components/studio/motion/motion-create-dialog";
import { MotionEditorPanel } from "@/components/studio/motion/motion-editor-panel";
import { MotionPlayer } from "@/components/studio/motion/motion-player";
import { MotionSetBoard } from "@/components/studio/motion/motion-set-board";
import { MotionSetDialog } from "@/components/studio/motion/motion-set-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MotionSet } from "@/lib/motion/set-types";
import type { MotionProject } from "@/lib/motion/types";

type MotionProjectSummary = Pick<MotionProject, "id" | "name" | "createdAtIso"> & {
  frameCount: number;
  thumbnailPath?: string;
};

type MotionProjectPatch = Partial<
  Pick<MotionProject, "sliceMode" | "grid" | "matte" | "frames" | "animations">
>;

type MotionSetSummary = Pick<MotionSet, "id" | "name" | "createdAtIso" | "updatedAtIso" | "status"> & {
  members: Array<Pick<MotionSet["members"][number], "action" | "status" | "projectId">>;
};

const SET_STATUSES = new Set<MotionSet["status"]>(["pending", "running", "ready", "partial", "failed"]);
const MEMBER_STATUSES = new Set<MotionSet["members"][number]["status"]>([
  "pending",
  "running",
  "ready",
  "failed"
]);

function responseReason(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "reason" in body) {
    const reason = (body as { reason?: unknown }).reason;
    if (typeof reason === "string" && reason) return reason;
  }
  return fallback;
}

function assetUrl(projectId: string, path: string, version?: number): string {
  const base = `/api/motion/projects/${encodeURIComponent(projectId)}/asset/${path}`;
  return version ? `${base}?v=${version}` : base;
}

function isMotionSetSummary(value: unknown): value is MotionSetSummary {
  if (!value || typeof value !== "object") return false;
  const set = value as Record<string, unknown>;
  if (
    typeof set.id !== "string" ||
    typeof set.name !== "string" ||
    typeof set.createdAtIso !== "string" ||
    typeof set.updatedAtIso !== "string" ||
    typeof set.status !== "string" ||
    !SET_STATUSES.has(set.status as MotionSet["status"]) ||
    !Array.isArray(set.members)
  ) {
    return false;
  }
  return set.members.every(member => {
    if (!member || typeof member !== "object") return false;
    const item = member as Record<string, unknown>;
    return (
      typeof item.action === "string" &&
      typeof item.status === "string" &&
      MEMBER_STATUSES.has(item.status as MotionSet["members"][number]["status"]) &&
      (typeof item.projectId === "string" || item.projectId === null)
    );
  });
}

export function MotionShell() {
  const [projects, setProjects] = useState<MotionProjectSummary[]>([]);
  const [sets, setSets] = useState<MotionSetSummary[]>([]);
  const [activeTab, setActiveTab] = useState<"projects" | "sets">("projects");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<MotionProject | null>(null);
  const [cacheVersion, setCacheVersion] = useState(() => Date.now());
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingSets, setIsLoadingSets] = useState(true);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isPatching, setIsPatching] = useState(false);
  const [isSetBusy, setIsSetBusy] = useState(false);
  const [hasPendingMatte, setHasPendingMatte] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [setDialogOpen, setSetDialogOpen] = useState(false);
  const selectedIdRef = useRef<string | null>(null);
  const patchingRef = useRef(false);
  const listRequestRef = useRef(0);
  const setListRequestRef = useRef(0);
  const navigationLocked = hasPendingMatte || isPatching || isSetBusy;

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const loadProjects = useCallback(async () => {
    const requestId = ++listRequestRef.current;
    setIsLoadingList(true);
    try {
      const response = await fetch("/api/motion/projects", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; projects?: MotionProjectSummary[]; reason?: string }
        | null;
      if (!response.ok || body?.ok !== true || !Array.isArray(body.projects)) {
        throw new Error(responseReason(body, "모션 목록을 불러오지 못했습니다."));
      }
      if (listRequestRef.current === requestId) setProjects(body.projects);
    } catch (error) {
      if (listRequestRef.current === requestId) {
        toast.error(error instanceof Error ? error.message : "모션 목록을 불러오지 못했습니다.");
      }
    } finally {
      if (listRequestRef.current === requestId) setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const loadSets = useCallback(async () => {
    const requestId = ++setListRequestRef.current;
    setIsLoadingSets(true);
    try {
      const response = await fetch("/api/motion/sets", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; sets?: MotionSetSummary[]; reason?: string }
        | null;
      if (!response.ok || body?.ok !== true || !Array.isArray(body.sets) || !body.sets.every(isMotionSetSummary)) {
        throw new Error(responseReason(body, "모션 세트 목록을 불러오지 못했습니다."));
      }
      if (setListRequestRef.current === requestId) setSets(body.sets);
    } catch (error) {
      if (setListRequestRef.current === requestId) {
        toast.error(error instanceof Error ? error.message : "모션 세트 목록을 불러오지 못했습니다.");
      }
    } finally {
      if (setListRequestRef.current === requestId) setIsLoadingSets(false);
    }
  }, []);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  const selectProject = useCallback(async (id: string) => {
    if (navigationLocked) {
      toast.error("현재 작업이 끝난 뒤 프로젝트를 열 수 있습니다.");
      return;
    }
    setActiveTab("projects");
    setSelectedSetId(null);
    selectedIdRef.current = id;
    setSelectedId(id);
    setSelectedProject(null);
    setIsLoadingProject(true);
    try {
      const response = await fetch(`/api/motion/projects/${encodeURIComponent(id)}`, {
        cache: "no-store"
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; project?: MotionProject; reason?: string }
        | null;
      if (!response.ok || body?.ok !== true || !body.project) {
        throw new Error(responseReason(body, "모션 상세를 불러오지 못했습니다."));
      }
      if (selectedIdRef.current === id) {
        setSelectedProject(body.project);
        setCacheVersion(Date.now());
      }
    } catch (error) {
      if (selectedIdRef.current === id) {
        toast.error(error instanceof Error ? error.message : "모션 상세를 불러오지 못했습니다.");
        setIsLoadingProject(false);
        setSelectedId(null);
        selectedIdRef.current = null;
      }
    } finally {
      if (selectedIdRef.current === id) setIsLoadingProject(false);
    }
  }, [navigationLocked]);

  const updateProject = useCallback(
    async (patch: MotionProjectPatch): Promise<MotionProject> => {
      const id = selectedIdRef.current;
      if (!id) throw new Error("먼저 모션을 선택해주세요.");
      if (patchingRef.current) throw new Error("다른 변경사항을 재빌드하고 있습니다.");

      patchingRef.current = true;
      setIsPatching(true);
      try {
        const response = await fetch(`/api/motion/projects/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch)
        });
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; project?: MotionProject; reason?: string }
          | null;
        if (!response.ok || body?.ok !== true || !body.project) {
          throw new Error(responseReason(body, "모션을 재빌드하지 못했습니다."));
        }
        if (selectedIdRef.current === id) {
          setSelectedProject(body.project);
          setCacheVersion(Date.now());
        }
        await loadProjects();
        return body.project;
      } finally {
        patchingRef.current = false;
        setIsPatching(false);
      }
    },
    [loadProjects]
  );

  const handleCreated = useCallback(
    async (project: MotionProject) => {
      setActiveTab("projects");
      setSelectedSetId(null);
      selectedIdRef.current = project.id;
      setSelectedId(project.id);
      setSelectedProject(project);
      setCacheVersion(Date.now());
      await loadProjects();
    },
    [loadProjects]
  );

  const updateSetSummary = useCallback((set: MotionSet) => {
    const summary: MotionSetSummary = {
      id: set.id,
      name: set.name,
      createdAtIso: set.createdAtIso,
      updatedAtIso: set.updatedAtIso,
      status: set.status,
      members: set.members.map(({ action, status, projectId }) => ({ action, status, projectId }))
    };
    setListRequestRef.current += 1;
    setIsLoadingSets(false);
    setSets(current => {
      const index = current.findIndex(item => item.id === set.id);
      if (index === -1) return [summary, ...current];
      return current.map(item => (item.id === set.id ? summary : item));
    });
  }, []);

  const selectSet = useCallback((setId: string) => {
    if (navigationLocked) {
      toast.error("현재 작업이 끝난 뒤 세트를 선택할 수 있습니다.");
      return;
    }
    setActiveTab("sets");
    selectedIdRef.current = null;
    setSelectedId(null);
    setSelectedProject(null);
    setIsLoadingProject(false);
    setSelectedSetId(setId);
  }, [navigationLocked]);

  const handleSetCreated = useCallback(
    (set: MotionSet) => {
      selectSet(set.id);
      updateSetSummary(set);
      void loadSets();
    },
    [loadSets, selectSet, updateSetSummary]
  );

  const handleSetDeleted = useCallback(
    (setId: string) => {
      setListRequestRef.current += 1;
      setIsLoadingSets(false);
      setSets(current => current.filter(set => set.id !== setId));
      if (selectedSetId === setId) setSelectedSetId(null);
      void loadSets();
    },
    [loadSets, selectedSetId]
  );

  const handleSetProjectOpen = useCallback(
    (projectId: string) => {
      if (navigationLocked) {
        toast.error("현재 편집 중인 변경사항을 먼저 저장해주세요.");
        return;
      }
      void loadProjects();
      void selectProject(projectId);
    },
    [loadProjects, navigationLocked, selectProject]
  );

  const handleSetBusyChange = useCallback((busy: boolean) => {
    setIsSetBusy(busy);
  }, []);

  const handleDelete = useCallback(
    async (project: MotionProjectSummary) => {
      if (!window.confirm(`"${project.name}" 모션을 삭제할까요?`)) return;
      setDeletingId(project.id);
      try {
        const response = await fetch(`/api/motion/projects/${encodeURIComponent(project.id)}`, {
          method: "DELETE"
        });
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; reason?: string }
          | null;
        if (!response.ok || body?.ok !== true) {
          throw new Error(responseReason(body, "모션을 삭제하지 못했습니다."));
        }
        if (selectedIdRef.current === project.id) {
          selectedIdRef.current = null;
          setSelectedId(null);
          setSelectedProject(null);
        }
        await loadProjects();
        toast.success("모션을 삭제했습니다.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "모션을 삭제하지 못했습니다.");
      } finally {
        setDeletingId(null);
      }
    },
    [loadProjects]
  );

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-primary" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">모션에셋</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          스프라이트 시트의 격자와 매트를 다듬고 캔버스에서 움직임을 확인합니다.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button className="w-full" disabled={navigationLocked} onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              새 모션
            </Button>
            <Button className="w-full" variant="outline" disabled={navigationLocked} onClick={() => setSetDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              새 세트
            </Button>
          </div>

          <Card>
            <CardContent className="p-3">
              <Tabs
                value={activeTab}
                onValueChange={value => {
                  if (value === "projects" || value === "sets") setActiveTab(value);
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="projects">프로젝트</TabsTrigger>
                  <TabsTrigger value="sets">세트</TabsTrigger>
                </TabsList>

                <TabsContent value="projects" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">프로젝트</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="프로젝트 목록 새로고침"
                      disabled={isLoadingList}
                      onClick={() => void loadProjects()}
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoadingList ? "animate-spin" : ""}`} aria-hidden />
                    </Button>
                  </div>
                  {isLoadingList && projects.length === 0 ? (
                    <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      불러오는 중…
                    </div>
                  ) : null}
                  {!isLoadingList && projects.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">아직 만든 모션이 없습니다.</p>
                  ) : null}
                  {projects.length > 0 ? (
                    <ScrollArea className="h-[calc(100vh-290px)] min-h-[320px]">
                      <div className="space-y-3 pr-3">
                        {projects.map(project => (
                          <div
                            key={project.id}
                            className={`overflow-hidden rounded-lg border transition-colors ${
                              selectedId === project.id && !selectedSetId ? "border-primary bg-primary/5" : "bg-card"
                            }`}
                          >
                            <button
                              type="button"
                              className="block w-full text-left"
                              disabled={navigationLocked}
                              onClick={() => void selectProject(project.id)}
                            >
                              <div
                                className="aspect-video bg-muted/40 bg-cover bg-center"
                                style={{
                                  backgroundImage: `url("${assetUrl(project.id, "derived/frames/f01.png", cacheVersion)}")`
                                }}
                              />
                              <div className="space-y-2 p-3">
                                <p className="truncate text-sm font-medium">{project.name}</p>
                                <div className="flex items-center justify-between gap-2">
                                  <Badge variant="secondary">{project.frameCount}프레임</Badge>
                                  <span className="text-xs text-muted-foreground">{formatDate(project.createdAtIso)}</span>
                                </div>
                              </div>
                            </button>
                            <div className="border-t p-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-destructive hover:text-destructive"
                                disabled={deletingId === project.id || navigationLocked}
                                onClick={() => void handleDelete(project)}
                              >
                                {deletingId === project.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                  <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                                )}
                                삭제
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : null}
                </TabsContent>

                <TabsContent value="sets" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">세트</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="세트 목록 새로고침"
                      disabled={isLoadingSets}
                      onClick={() => void loadSets()}
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoadingSets ? "animate-spin" : ""}`} aria-hidden />
                    </Button>
                  </div>
                  {isLoadingSets && sets.length === 0 ? (
                    <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      불러오는 중…
                    </div>
                  ) : null}
                  {!isLoadingSets && sets.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">아직 만든 세트가 없습니다.</p>
                  ) : null}
                  {sets.length > 0 ? (
                    <ScrollArea className="h-[calc(100vh-290px)] min-h-[320px]">
                      <div className="space-y-3 pr-3">
                        {sets.map(set => {
                          const readyCount = set.members.filter(member => member.status === "ready").length;
                          const statusVariant =
                            set.status === "ready"
                              ? "success"
                              : set.status === "failed"
                                ? "destructive"
                                : set.status === "partial"
                                  ? "warning"
                                  : set.status === "running"
                                    ? "default"
                                    : "secondary";
                          const statusLabel =
                            set.status === "ready"
                              ? "준비됨"
                              : set.status === "failed"
                                ? "실패"
                                : set.status === "partial"
                                  ? "일부 완료"
                                  : set.status === "running"
                                    ? "생성 중"
                                    : "대기";
                          return (
                            <button
                              key={set.id}
                              type="button"
                              disabled={navigationLocked}
                              onClick={() => selectSet(set.id)}
                              className={`block w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
                                selectedSetId === set.id ? "border-primary bg-primary/5" : "bg-card"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 truncate text-sm font-medium">{set.name}</p>
                                <Badge
                                  variant={statusVariant}
                                  className={set.status === "running" ? "border-transparent bg-blue-500/10 text-blue-600" : undefined}
                                >
                                  {statusLabel}
                                </Badge>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span>{set.members.length}개 동작</span>
                                <span>준비됨 {readyCount}/{set.members.length}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  ) : null}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </aside>

        <main className="min-w-0">
          {selectedSetId ? (
            <MotionSetBoard
              key={selectedSetId}
              setId={selectedSetId}
              onOpenProject={handleSetProjectOpen}
              onSetUpdated={updateSetSummary}
              onDeleted={handleSetDeleted}
              onBusyChange={handleSetBusyChange}
            />
          ) : null}

          {!selectedSetId && isLoadingProject ? (
            <div className="flex min-h-[440px] items-center justify-center rounded-xl border border-dashed">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
              <span className="text-sm text-muted-foreground">프로젝트 불러오는 중…</span>
            </div>
          ) : null}

          {!selectedSetId && !isLoadingProject && !selectedProject ? (
            <div className="flex min-h-[440px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
              왼쪽에서 프로젝트를 선택하거나 새 모션을 만들어주세요.
            </div>
          ) : null}

          {!selectedSetId && !isLoadingProject && selectedProject ? (
            <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(340px,0.8fr)_minmax(420px,1.2fr)]">
              <MotionEditorPanel
                project={selectedProject}
                cacheVersion={cacheVersion}
                isPatching={isPatching}
                onMatteDirtyChange={setHasPendingMatte}
                updateProject={updateProject}
              />
              <MotionPlayer
                project={selectedProject}
                cacheVersion={cacheVersion}
                isPatching={isPatching}
                updateProject={updateProject}
              />
            </div>
          ) : null}
        </main>
      </div>

      <MotionCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
      <MotionSetDialog
        open={setDialogOpen}
        onClose={() => setSetDialogOpen(false)}
        onCreated={handleSetCreated}
      />
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}
