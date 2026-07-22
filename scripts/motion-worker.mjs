#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findMotionServer } from "./motion-server-discovery.mjs";

const WORKER_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(WORKER_FILE), "..");
const DEFAULT_GENERATION_TIMEOUT_MS = 180_000;
const HEALTH_PORTS_LABEL = "3002/3000/3001/3003/3004/3005";
const MOTION_ID_RE = /^[A-Za-z0-9._-]+$/;

async function main() {
  const jobId = process.argv[2];
  if (!isMotionId(jobId)) {
    console.error("motion worker: invalid jobId");
    process.exitCode = 1;
    return;
  }

  let jobPath;
  let job;
  try {
    const jobsRoot = await motionJobsRoot();
    jobPath = motionIdPath(jobsRoot, jobId, ".json");
    job = await readJob(jobPath);
  } catch (error) {
    console.error(`motion worker: unable to read job ${jobId}: ${errorMessage(error)}`);
    process.exitCode = 1;
    return;
  }

  if (job.status !== "running") {
    return;
  }

  const deadline = Date.parse(job.deadlineIso || "");
  if (!Number.isFinite(deadline) || Date.now() >= deadline) {
    await failJob(jobPath, job, "timeout: job deadline exceeded before generation started");
    return;
  }

  let serverBaseUrl;
  try {
    const { baseUrl } = await findMotionServer();
    serverBaseUrl = baseUrl;
  } catch (error) {
    await failJob(
      jobPath,
      job,
      `server-not-found: no healthy sionbanana server on ports ${HEALTH_PORTS_LABEL}; ${errorMessage(error)}`
    );
    return;
  }

  const remainingMs = deadline - Date.now();
  const timeoutMs = Math.min(generationTimeoutMs(), remainingMs);
  if (timeoutMs <= 0) {
    await failJob(jobPath, job, "timeout: job deadline exceeded before request started");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${serverBaseUrl.replace(/\/+$/, "")}/api/motion/projects`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(job.request),
      signal: controller.signal
    });
    const responseText = await response.text();
    const responseBody = parseResponseJson(responseText);

    if (!response.ok) {
      const detail = responseReason(responseBody) || response.statusText || "motion generation failed";
      await failJob(jobPath, job, `http-${response.status}: ${detail}`);
      return;
    }
    if (!responseBody || responseBody.ok !== true || !responseBody.project) {
      await failJob(
        jobPath,
        job,
        `generation-error: ${responseReason(responseBody) || "response did not include a project"}`
      );
      return;
    }

    const project = responseBody.project;
    if (!isMotionId(project.id)) {
      await failJob(jobPath, job, "generation-error: response project id is invalid");
      return;
    }
    const ready = {
      ...job,
      status: "ready",
      projectId: project.id,
      finishedAtIso: new Date().toISOString(),
      sliceConfidence: project.sliceConfidence,
      project: {
        id: project.id,
        name: typeof project.name === "string" ? project.name : project.id,
        frames: Array.isArray(project.frames) ? project.frames.length : 0,
        canvas: project.canvas ?? null
      }
    };
    await atomicWriteJson(jobPath, ready);
  } catch (error) {
    const timedOut = error?.name === "AbortError" || Date.now() >= deadline;
    await failJob(
      jobPath,
      job,
      timedOut
        ? `timeout: motion generation exceeded ${timeoutMs}ms or the job deadline`
        : `generation-error: ${errorMessage(error)}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function motionJobsRoot() {
  const dataRoot = getDataRoot();
  const jobsRoot = path.resolve(dataRoot, "motion-jobs");
  assertPathInside(dataRoot, jobsRoot, "motion jobs path must stay inside dataRoot");
  await assertDirectoryNotSymlink(dataRoot);
  await assertDirectoryNotSymlink(jobsRoot);
  const realDataRoot = await fs.realpath(dataRoot);
  const realJobsRoot = await fs.realpath(jobsRoot);
  assertPathInside(realDataRoot, realJobsRoot, "motion jobs symlink escapes dataRoot");
  return jobsRoot;
}

async function readJob(jobPath) {
  const stat = await fs.lstat(jobPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("job file must be a regular, non-symbolic-link file");
  }
  const raw = await fs.readFile(jobPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("job file is not valid JSON");
  }
}

async function failJob(jobPath, job, reason) {
  const failed = {
    ...job,
    status: "failed",
    reason,
    finishedAtIso: new Date().toISOString()
  };
  try {
    await atomicWriteJson(jobPath, failed);
  } catch (error) {
    console.error(`motion worker: unable to record failure for ${path.basename(jobPath)}: ${errorMessage(error)}`);
  }
  console.error(`motion worker: ${reason}`);
}

function parseResponseJson(raw) {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function responseReason(body) {
  return body && typeof body.reason === "string" ? body.reason : "";
}

function getDataRoot() {
  const envDir = typeof process.env.SIONBANANA_DATA_DIR === "string"
    ? process.env.SIONBANANA_DATA_DIR.trim()
    : "";
  if (!envDir) {
    return path.join(REPO_ROOT, "data");
  }
  if (envDir.startsWith("~/")) {
    return path.resolve(process.env.HOME || REPO_ROOT, envDir.slice(2));
  }
  return path.resolve(envDir);
}

function generationTimeoutMs() {
  const parsed = Number(process.env.SIONBANANA_GEN_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_GENERATION_TIMEOUT_MS;
}

function motionIdPath(root, id, suffix = "") {
  if (!isMotionId(id)) {
    throw new Error("motion id must contain only letters, numbers, dots, underscores, and hyphens");
  }
  const candidate = path.resolve(root, `${id}${suffix}`);
  if (path.dirname(candidate) !== path.resolve(root)) {
    throw new Error("motion job path must stay inside motion-jobs");
  }
  return candidate;
}

function isMotionId(value) {
  return typeof value === "string" && MOTION_ID_RE.test(value);
}

function assertPathInside(root, candidate, message) {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(message);
  }
}

async function assertDirectoryNotSymlink(directory) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${directory} must be a regular, non-symbolic-link directory`);
  }
}

async function atomicWriteJson(target, value) {
  const directory = path.dirname(target);
  await assertDirectoryNotSymlink(directory);
  const temp = path.join(directory, `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    await fs.rename(temp, target);
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] && path.resolve(process.argv[1]) === WORKER_FILE) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
