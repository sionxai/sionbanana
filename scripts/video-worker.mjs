#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findMotionServer } from "./motion-server-discovery.mjs";

const WORKER_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(WORKER_FILE), "..");
const DEFAULT_VIDEO_TIMEOUT_MS = 20 * 60 * 1000;
const HEALTH_PORTS_LABEL = "3002/3000/3001/3003/3004/3005";
const VIDEO_ID_RE = /^[A-Za-z0-9_-]+$/;

async function main() {
  const jobId = process.argv[2];
  if (!isVideoId(jobId)) {
    console.error("video worker: invalid jobId");
    process.exitCode = 1;
    return;
  }

  let jobPath;
  let job;
  try {
    const jobsRoot = await videoJobsRoot();
    jobPath = videoIdPath(jobsRoot, jobId, ".json");
    job = await readJob(jobPath);
  } catch (error) {
    console.error(`video worker: unable to read job ${jobId}: ${errorMessage(error)}`);
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
    ({ baseUrl: serverBaseUrl } = await findMotionServer());
  } catch (error) {
    await failJob(
      jobPath,
      job,
      `server-not-found: no healthy sionbanana server on ports ${HEALTH_PORTS_LABEL}; ${errorMessage(error)}`
    );
    return;
  }

  const remainingMs = deadline - Date.now();
  const timeoutMs = Math.min(videoTimeoutMs(), remainingMs);
  if (timeoutMs <= 0) {
    await failJob(jobPath, job, "timeout: job deadline exceeded before request started");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${serverBaseUrl.replace(/\/+$/, "")}/api/video`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(job.request),
      signal: controller.signal
    });
    const responseText = await response.text();
    const responseBody = parseResponseJson(responseText);

    if (!response.ok) {
      const detail = responseDetail(responseBody) || response.statusText || "video generation failed";
      await failJob(jobPath, job, `http-${response.status}: ${detail}`, responseErrorMetadata(responseBody));
      return;
    }
    if (!responseBody || responseBody.ok !== true) {
      await failJob(
        jobPath,
        job,
        `generation-error: ${responseDetail(responseBody) || "response did not confirm success"}`,
        responseErrorMetadata(responseBody)
      );
      return;
    }
    if (Date.now() >= deadline) {
      await failJob(jobPath, job, "timeout: job deadline exceeded before result validation");
      return;
    }

    const video = await inspectResponseVideo(responseBody);
    if (typeof responseBody.bytes === "number" && responseBody.bytes !== video.bytes) {
      await failJob(jobPath, job, "generation-error: response bytes do not match the saved video file");
      return;
    }
    const ready = {
      ...job,
      status: "ready",
      finishedAtIso: new Date().toISOString(),
      videoPath: video.videoPath,
      storagePath: responseBody.storagePath,
      bytes: video.bytes,
      contentType: typeof responseBody.contentType === "string" && responseBody.contentType.trim()
        ? responseBody.contentType
        : "video/mp4",
      sha256: video.sha256,
      ...(typeof responseBody.id === "string" ? { videoId: responseBody.id } : {})
    };
    await atomicWriteJson(jobPath, ready);
  } catch (error) {
    const timedOut = error?.name === "AbortError" || Date.now() >= deadline;
    await failJob(
      jobPath,
      job,
      timedOut
        ? `timeout: video generation exceeded ${timeoutMs}ms or the job deadline`
        : `generation-error: ${errorMessage(error)}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function videoJobsRoot() {
  const dataRoot = getDataRoot();
  const jobsRoot = path.resolve(dataRoot, "video-jobs");
  assertPathInside(dataRoot, jobsRoot, "video jobs path must stay inside dataRoot");
  await assertDirectoryNotSymlink(dataRoot);
  await assertDirectoryNotSymlink(jobsRoot);
  const realDataRoot = await fs.realpath(dataRoot);
  const realJobsRoot = await fs.realpath(jobsRoot);
  assertPathInside(realDataRoot, realJobsRoot, "video jobs symlink escapes dataRoot");
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

async function inspectResponseVideo(response) {
  if (typeof response.storagePath !== "string" || !response.storagePath.trim()) {
    throw new Error("response did not include storagePath");
  }
  const dataRoot = getDataRoot();
  const videosRoot = path.resolve(dataRoot, "videos");
  assertPathInside(dataRoot, videosRoot, "videos path must stay inside dataRoot");
  await assertDirectoryNotSymlink(dataRoot);
  await assertDirectoryNotSymlink(videosRoot);
  const realDataRoot = await fs.realpath(dataRoot);
  const realVideosRoot = await fs.realpath(videosRoot);
  assertPathInside(realDataRoot, realVideosRoot, "videos symlink escapes dataRoot");

  const videoPath = path.resolve(videosRoot, response.storagePath);
  assertPathInside(realVideosRoot, videoPath, "response storagePath must stay inside data/videos");
  await assertRegularDirectories(realVideosRoot, path.dirname(videoPath));

  let handle;
  try {
    handle = await fs.open(videoPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error("response storagePath must identify a non-empty regular file");
    }
    const hash = createHash("sha256");
    let bytes = 0;
    const stream = handle.createReadStream({ autoClose: false });
    await new Promise((resolve, reject) => {
      stream.on("data", chunk => {
        bytes += chunk.byteLength;
        hash.update(chunk);
      });
      stream.once("end", resolve);
      stream.once("error", reject);
    });
    if (bytes !== stat.size) {
      throw new Error("video file changed while it was being verified");
    }
    return { videoPath, bytes, sha256: hash.digest("hex") };
  } catch (error) {
    if (error?.code === "ELOOP") {
      throw new Error("response storagePath must identify a non-symbolic-link file");
    }
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function assertRegularDirectories(root, directory) {
  const relative = path.relative(root, directory);
  assertPathInside(root, directory, "video parent path must stay inside data/videos");
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    await assertDirectoryNotSymlink(current);
  }
}

async function failJob(jobPath, job, reason, extra = {}) {
  const failed = {
    ...job,
    status: "failed",
    reason,
    ...extra,
    finishedAtIso: new Date().toISOString()
  };
  try {
    await atomicWriteJson(jobPath, failed);
  } catch (error) {
    console.error(`video worker: unable to record failure for ${path.basename(jobPath)}: ${errorMessage(error)}`);
  }
  console.error(`video worker: ${reason}`);
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

function responseDetail(body) {
  if (!body || typeof body !== "object") {
    return "";
  }
  const code = typeof body.code === "string" && body.code.trim() ? body.code.trim() : "";
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "";
  return code && reason ? `${code}: ${reason}` : code || reason;
}

function responseErrorMetadata(body) {
  if (!body || typeof body !== "object") {
    return {};
  }
  return {
    ...(typeof body.code === "string" ? { errorCode: body.code } : {}),
    ...(typeof body.reason === "string" ? { errorReason: body.reason } : {})
  };
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

function videoTimeoutMs() {
  const parsed = Number(process.env.SIONBANANA_VIDEO_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_VIDEO_TIMEOUT_MS;
}

function videoIdPath(root, id, suffix = "") {
  if (!isVideoId(id)) {
    throw new Error("video id must contain only letters, numbers, underscores, and hyphens");
  }
  const candidate = path.resolve(root, `${id}${suffix}`);
  if (path.dirname(candidate) !== path.resolve(root)) {
    throw new Error("video job path must stay inside video-jobs");
  }
  return candidate;
}

function isVideoId(value) {
  return typeof value === "string" && VIDEO_ID_RE.test(value);
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
