import "server-only";

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { getDataDir } from "@/lib/local/storage";
import { MOTION_ACTION_PRESETS } from "@/lib/motion/prompt";
import { rebuildProject, type MotionProjectPatch } from "@/lib/motion/storage";
import {
  deriveSetStatus,
  motionSetBaseSchema,
  motionSetCommonSchema,
  motionSetMemberSchema,
  parseMotionSet,
  type MotionSet,
  type MotionSetMember
} from "@/lib/motion/set-types";
import type { Frame } from "@/lib/motion/types";

const SET_ID_RE = /^[A-Za-z0-9-]+$/;
const DEFAULT_GENERATION_TIMEOUT_MS = 180_000;
const STALE_RUNNING_GRACE_MS = 60_000;

type MotionSetSummary = Pick<
  MotionSet,
  "id" | "name" | "createdAtIso" | "updatedAtIso" | "status"
> & {
  members: Array<Pick<MotionSetMember, "action" | "status" | "projectId">>;
};

export type RunNextMemberDeps = {
  createProject: (body: object) => Promise<{ status: number; body: unknown }>;
  rebuildProject?: typeof rebuildProject;
  now?: () => Date;
};

export class MotionSetStorageError extends Error {
  readonly status: number;
  readonly code: "INVALID_ID" | "NOT_FOUND" | "CONFLICT";

  constructor(code: MotionSetStorageError["code"], message: string, status: number) {
    super(message);
    this.name = "MotionSetStorageError";
    this.code = code;
    this.status = status;
  }
}

const setLocks = new Map<string, Promise<void>>();

function assertSetId(id: string): void {
  if (!SET_ID_RE.test(id)) {
    throw new MotionSetStorageError(
      "INVALID_ID",
      "Motion set id must contain only letters, numbers, and hyphens.",
      400
    );
  }
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function generationTimeoutMs(): number {
  const parsed = Number(process.env.SIONBANANA_GEN_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_GENERATION_TIMEOUT_MS;
}

export function motionSetStaleMs(): number {
  return generationTimeoutMs() + STALE_RUNNING_GRACE_MS;
}

export function motionSetRoot(): string {
  return path.join(getDataDir(), "motion-sets");
}

export function setDir(id: string): string {
  assertSetId(id);
  const root = path.resolve(motionSetRoot());
  const candidate = path.resolve(root, id);
  if (path.dirname(candidate) !== root) {
    throw new MotionSetStorageError("INVALID_ID", "Invalid motion set path.", 400);
  }
  return candidate;
}

export async function withSetLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
  assertSetId(id);
  const previous = setLocks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const tail = previous.then(
    () => gate,
    () => gate
  );
  setLocks.set(id, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (setLocks.get(id) === tail) setLocks.delete(id);
  }
}

async function ensureMotionSetRoot(): Promise<string> {
  const root = motionSetRoot();
  await fs.mkdir(root, { recursive: true });
  const entry = await fs.lstat(root);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error("Motion sets root must be a regular, non-symbolic-link directory.");
  }
  return fs.realpath(root);
}

async function createUniqueSetDirectory(): Promise<{ id: string; directory: string }> {
  await ensureMotionSetRoot();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = `motion-set-${Date.now()}-${randomUUID()}`;
    const directory = setDir(id);
    try {
      await fs.mkdir(directory);
      return { id, directory };
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
  }
  throw new Error("Unable to allocate a unique motion set id.");
}

async function safeExistingSetDirectory(id: string): Promise<string> {
  const directory = setDir(id);
  try {
    const entry = await fs.lstat(directory);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new MotionSetStorageError("NOT_FOUND", `Motion set ${id} was not found.`, 404);
    }
    const [realRoot, realDirectory] = await Promise.all([
      fs.realpath(motionSetRoot()),
      fs.realpath(directory)
    ]);
    if (path.dirname(realDirectory) !== realRoot) {
      throw new MotionSetStorageError("NOT_FOUND", `Motion set ${id} was not found.`, 404);
    }
    return realDirectory;
  } catch (error) {
    if (error instanceof MotionSetStorageError) throw error;
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") {
      throw new MotionSetStorageError("NOT_FOUND", `Motion set ${id} was not found.`, 404);
    }
    throw error;
  }
}

async function safeSetFile(directory: string, fileName: "set.json" | "reference.png", id: string): Promise<string> {
  const candidate = path.join(directory, fileName);
  try {
    const entry = await fs.lstat(candidate);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new MotionSetStorageError("NOT_FOUND", `Motion set ${id} was not found.`, 404);
    }
    const realCandidate = await fs.realpath(candidate);
    if (path.dirname(realCandidate) !== directory) {
      throw new MotionSetStorageError("NOT_FOUND", `Motion set ${id} was not found.`, 404);
    }
    return realCandidate;
  } catch (error) {
    if (error instanceof MotionSetStorageError) throw error;
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") {
      throw new MotionSetStorageError("NOT_FOUND", `Motion set ${id} was not found.`, 404);
    }
    throw error;
  }
}

async function writeSetJson(directory: string, set: MotionSet): Promise<void> {
  const target = path.join(directory, "set.json");
  const temp = path.join(directory, `.set-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, `${JSON.stringify(set, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined);
  }
}

async function updateSetUnlocked(
  id: string,
  mutator: (set: MotionSet) => MotionSet
): Promise<MotionSet> {
  const current = await readSetUnlocked(id);
  const updated = parseMotionSet({
    ...mutator(current),
    id: current.id,
    createdAtIso: current.createdAtIso,
    updatedAtIso: new Date().toISOString()
  });
  const directory = await safeExistingSetDirectory(id);
  await writeSetJson(directory, updated);
  return updated;
}

async function readSetUnlocked(id: string): Promise<MotionSet> {
  const directory = await safeExistingSetDirectory(id);
  const file = await safeSetFile(directory, "set.json", id);
  try {
    return parseMotionSet(JSON.parse(await fs.readFile(file, "utf8")));
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new MotionSetStorageError("NOT_FOUND", `Motion set ${id} was not found.`, 404);
    }
    throw error;
  }
}

export async function createSet(input: {
  name: string;
  base:
    | Omit<z.input<typeof motionSetBaseSchema>, "hasReference">
    | z.input<typeof motionSetBaseSchema>;
  common: z.input<typeof motionSetCommonSchema>;
  members: Array<z.input<typeof motionSetMemberSchema>>;
  referencePng?: Buffer;
}): Promise<MotionSet> {
  const { id, directory } = await createUniqueSetDirectory();
  const now = new Date().toISOString();
  try {
    const initial = parseMotionSet({
      id,
      name: input.name,
      createdAtIso: now,
      updatedAtIso: now,
      base: { ...input.base, hasReference: Boolean(input.referencePng) },
      common: input.common,
      members: input.members,
      status: "pending"
    });
    const set = parseMotionSet({ ...initial, status: deriveSetStatus(initial.members) });
    if (input.referencePng) {
      await fs.writeFile(path.join(directory, "reference.png"), input.referencePng, { flag: "wx" });
    }
    await writeSetJson(directory, set);
    return set;
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readSet(id: string): Promise<MotionSet> {
  assertSetId(id);
  return readSetUnlocked(id);
}

export async function listSets(): Promise<MotionSetSummary[]> {
  let entries;
  try {
    entries = await fs.readdir(motionSetRoot(), { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    throw error;
  }
  const sets: MotionSetSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !SET_ID_RE.test(entry.name)) continue;
    const set = await readSet(entry.name);
    sets.push({
      id: set.id,
      name: set.name,
      createdAtIso: set.createdAtIso,
      updatedAtIso: set.updatedAtIso,
      status: set.status,
      members: set.members.map(({ action, status, projectId }) => ({ action, status, projectId }))
    });
  }
  return sets.sort((first, second) => second.createdAtIso.localeCompare(first.createdAtIso));
}

export async function updateSet(
  id: string,
  mutator: (set: MotionSet) => MotionSet
): Promise<MotionSet> {
  return withSetLock(id, () => updateSetUnlocked(id, mutator));
}

function isFreshRunningMember(member: MotionSetMember, nowMs: number): boolean {
  if (member.status !== "running" || !member.startedAtIso) return false;
  const startedAtMs = Date.parse(member.startedAtIso);
  return Number.isFinite(startedAtMs) && nowMs - startedAtMs <= motionSetStaleMs();
}

export async function deleteSet(id: string): Promise<void> {
  await withSetLock(id, async () => {
    const set = await readSetUnlocked(id);
    if (set.members.some(member => isFreshRunningMember(member, Date.now()))) {
      throw new MotionSetStorageError(
        "CONFLICT",
        "A motion set member is still running.",
        409
      );
    }
    const directory = await safeExistingSetDirectory(id);
    try {
      await fs.rm(directory, { recursive: true, force: false });
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        throw new MotionSetStorageError("NOT_FOUND", `Motion set ${id} was not found.`, 404);
      }
      throw error;
    }
  });
}

export async function readReferencePng(id: string): Promise<Buffer | null> {
  const directory = await safeExistingSetDirectory(id);
  try {
    const file = await safeSetFile(directory, "reference.png", id);
    return fs.readFile(file);
  } catch (error) {
    if (error instanceof MotionSetStorageError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

export function buildMemberProjectRequest(
  set: MotionSet,
  member: MotionSetMember,
  referencePngBase64: string | null
): object {
  const preset = MOTION_ACTION_PRESETS[member.action];
  const memberPrompt = member.prompt?.trim();
  if (member.action === "custom" && !memberPrompt) {
    throw new TypeError("Custom motion members require a prompt.");
  }
  const prompt = memberPrompt
    ? `${set.base.description}. ${memberPrompt}`
    : `${set.base.description}. ${preset.label} motion`;
  const style = set.base.style?.trim();
  const source = referencePngBase64
    ? {
        type: "reference" as const,
        prompt,
        action: member.action,
        subjectType: set.base.subjectType,
        ...(style ? { style } : {}),
        referenceImage: { data: referencePngBase64, mimeType: "image/png" }
      }
    : {
        type: "generate" as const,
        prompt,
        action: member.action,
        subjectType: set.base.subjectType,
        ...(style ? { style } : {})
      };
  return {
    name: `${set.name} · ${preset.label}`,
    grid: {
      cols: member.overrides?.cols ?? set.common.cols,
      rows: member.overrides?.rows ?? set.common.rows
    },
    fps: member.overrides?.fps ?? set.common.fps,
    loop: member.overrides?.loop ?? preset.defaultLoop,
    autoFlipRows: set.base.allowMirror,
    source
  };
}

function responseProject(body: unknown): { id: string; frames: Frame[] | null } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const candidate = body as { ok?: unknown; project?: unknown };
  if (candidate.ok !== true || !candidate.project || typeof candidate.project !== "object") return null;
  const project = candidate.project as { id?: unknown; frames?: unknown };
  return typeof project.id === "string" && project.id
    ? { id: project.id, frames: Array.isArray(project.frames) ? (project.frames as Frame[]) : null }
    : null;
}

function responseFailureReason(status: number, body: unknown): string {
  const reason =
    body && typeof body === "object" && !Array.isArray(body) && typeof (body as { reason?: unknown }).reason === "string"
      ? (body as { reason: string }).reason
      : "motion project response did not include a project";
  return `http-${status}: ${reason}`;
}

export async function runNextMember(
  setId: string,
  deps: RunNextMemberDeps
): Promise<{ busy?: true; done?: boolean; member?: MotionSetMember }> {
  const now = deps.now ?? (() => new Date());
  const claim = await withSetLock(setId, async () => {
    const nowDate = now();
    const nowIso = nowDate.toISOString();
    const nowMs = nowDate.getTime();
    let set = await readSetUnlocked(setId);
    let hadStaleRunning = false;
    const staleMembers = set.members.map(member => {
      if (member.status !== "running" || isFreshRunningMember(member, nowMs)) return member;
      hadStaleRunning = true;
      return {
        ...member,
        status: "failed" as const,
        reason: "stale-running",
        finishedAtIso: nowIso
      };
    });
    if (hadStaleRunning) {
      set = await updateSetUnlocked(setId, current => ({
        ...current,
        members: staleMembers,
        status: deriveSetStatus(staleMembers)
      }));
    }
    if (set.members.some(member => isFreshRunningMember(member, nowMs))) {
      return { busy: true as const };
    }

    const pendingIndex = set.members.findIndex(member => member.status === "pending");
    if (pendingIndex === -1) {
      await updateSetUnlocked(setId, current => ({
        ...current,
        status: deriveSetStatus(current.members)
      }));
      return { done: true };
    }

    const claimStartedAtIso = nowIso;
    set = await updateSetUnlocked(setId, current => {
      const members = current.members.map((member, index) =>
        index === pendingIndex
          ? {
              ...member,
              status: "running" as const,
              projectId: null,
              reason: null,
              startedAtIso: claimStartedAtIso,
              finishedAtIso: null
            }
          : member
      );
      return { ...current, members, status: deriveSetStatus(members) };
    });
    return {
      set,
      member: set.members[pendingIndex],
      pendingIndex,
      startedAtIso: claimStartedAtIso
    };
  });

  if ("busy" in claim || "done" in claim) return claim;
  const { set, member: claimedMember, pendingIndex, startedAtIso: claimStartedAtIso } = claim;

  let finalStatus: "ready" | "failed" = "failed";
  let projectId: string | null = null;
  let reason: string | null = null;
  try {
    const referencePng = await readReferencePng(setId);
    const body = buildMemberProjectRequest(
      set,
      claimedMember,
      referencePng ? referencePng.toString("base64") : null
    );
    const response = await deps.createProject(body);
    const project = response.status === 201 ? responseProject(response.body) : null;
    if (!project) {
      reason = responseFailureReason(response.status, response.body);
    } else {
      if (set.base.facing === "left") {
        if (!project.frames) throw new Error("Motion project response did not include frames for left facing.");
        const rebuild = deps.rebuildProject ?? rebuildProject;
        await rebuild(project.id, {
          frames: project.frames.map(frame => ({ ...frame, flipX: !frame.flipX }))
        } as MotionProjectPatch);
      }
      finalStatus = "ready";
      projectId = project.id;
    }
  } catch (error) {
    reason = errorMessage(error);
  }

  return withSetLock(setId, async () => {
    const completed = await updateSetUnlocked(setId, current => {
      const member = current.members[pendingIndex];
      if (
        !member ||
        member.status !== "running" ||
        member.startedAtIso !== claimStartedAtIso ||
        member.action !== claimedMember.action
      ) {
        return current;
      }
      const members = current.members.map((candidate, index) =>
        index === pendingIndex
          ? {
              ...candidate,
              status: finalStatus,
              projectId: finalStatus === "ready" ? projectId : null,
              reason: finalStatus === "failed" ? reason : null,
              finishedAtIso: now().toISOString()
            }
          : candidate
      );
      return { ...current, members, status: deriveSetStatus(members) };
    });
    return { done: false, member: completed.members[pendingIndex] };
  });
}

export function spawnSetWorker(
  setId: string,
  baseUrl: string,
  spawnImpl: typeof spawn = spawn
): void {
  assertSetId(setId);
  const workerPath = path.join(process.cwd(), "scripts", "motion-set-worker.mjs");
  spawnImpl(process.execPath, [workerPath, setId, baseUrl], {
    detached: true,
    stdio: "ignore",
    env: process.env
  }).unref();
}
