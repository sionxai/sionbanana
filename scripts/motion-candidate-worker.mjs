#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { findMotionServer } from "./motion-server-discovery.mjs";

const WORKER_FILE = fileURLToPath(import.meta.url);
const ID_RE = /^[A-Za-z0-9-]+$/;
const DEFAULT_GENERATION_TIMEOUT_MS = 180_000;
const REQUEST_GRACE_MS = 60_000;

function generationTimeoutMs() {
  const parsed = Number(process.env.SIONBANANA_GEN_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_GENERATION_TIMEOUT_MS;
}

function requestTimeoutMs(value) {
  if (Number.isFinite(value) && value > 0) return Math.floor(value);
  return generationTimeoutMs() * 3 + REQUEST_GRACE_MS;
}

function isId(value) {
  return typeof value === "string" && ID_RE.test(value);
}

function responseReason(raw, status) {
  if (!raw) return `HTTP ${status}`;
  try {
    const body = JSON.parse(raw);
    if (body && typeof body.reason === "string" && body.reason) return body.reason;
  } catch {
    // Keep the HTTP status when an upstream response is not JSON.
  }
  return `HTTP ${status}`;
}

export async function runCandidateWorker({
  projectId,
  candidateId,
  baseUrl,
  fetchImpl = fetch,
  timeoutMs
}) {
  if (!isId(projectId)) throw new TypeError("motion candidate worker: invalid projectId");
  if (!isId(candidateId)) throw new TypeError("motion candidate worker: invalid candidateId");
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new TypeError("motion candidate worker: baseUrl is required");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs(timeoutMs));
  const url = `${baseUrl.replace(/\/+$/, "")}/api/motion/projects/${encodeURIComponent(projectId)}/candidates/${encodeURIComponent(candidateId)}/run`;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, reason: responseReason(raw, response.status) };
    }
    try {
      const body = JSON.parse(raw);
      if (body && body.ok === true) return { ok: true, status: response.status };
      return { ok: false, status: response.status, reason: responseReason(raw, response.status) };
    } catch {
      return { ok: false, status: response.status, reason: "Invalid JSON response" };
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      reason: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function main() {
  const projectId = process.argv[2];
  const candidateId = process.argv[3];
  if (!isId(projectId) || !isId(candidateId)) {
    console.error("motion candidate worker: invalid projectId or candidateId");
    process.exitCode = 1;
    return;
  }

  let baseUrl = process.argv[4];
  if (!baseUrl) {
    try {
      ({ baseUrl } = await findMotionServer());
    } catch (error) {
      console.error(
        `motion candidate worker: unable to find a healthy sionbanana server: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      process.exitCode = 1;
      return;
    }
  }

  try {
    const result = await runCandidateWorker({ projectId, candidateId, baseUrl });
    if (!result.ok) {
      console.error(
        `motion candidate worker: run request failed (${result.status}): ${result.reason ?? "unknown error"}`
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`motion candidate worker: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === WORKER_FILE) {
  main();
}
