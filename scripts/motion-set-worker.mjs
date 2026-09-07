#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { findMotionServer } from "./motion-server-discovery.mjs";

const WORKER_FILE = fileURLToPath(import.meta.url);
const SET_ID_RE = /^[A-Za-z0-9-]+$/;
const DEFAULT_GENERATION_TIMEOUT_MS = 180_000;
const REQUEST_GRACE_MS = 60_000;

function generationTimeoutMs() {
  const parsed = Number(process.env.SIONBANANA_GEN_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_GENERATION_TIMEOUT_MS;
}

function parseResponseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isSetId(value) {
  return typeof value === "string" && SET_ID_RE.test(value);
}

function positiveTimeout(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : generationTimeoutMs() + REQUEST_GRACE_MS;
}

export async function runSetWorker({
  setId,
  baseUrl,
  fetchImpl = fetch,
  timeoutMs = generationTimeoutMs() + REQUEST_GRACE_MS,
  maxMembers = 64
}) {
  if (!isSetId(setId)) throw new TypeError("motion set worker: invalid setId");
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new TypeError("motion set worker: baseUrl is required");
  }
  if (!Number.isInteger(maxMembers) || maxMembers < 1) {
    throw new TypeError("motion set worker: maxMembers must be a positive integer");
  }

  const requestTimeoutMs = positiveTimeout(timeoutMs);
  const url = `${baseUrl.replace(/\/+$/, "")}/api/motion/sets/${encodeURIComponent(setId)}/run-next`;
  let processed = 0;
  while (processed < maxMembers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal
      });
      const body = parseResponseJson(await response.text());
      if (!response.ok || !body || body.ok !== true) {
        return { processed, stoppedBecause: "error" };
      }
      if (body.busy === true) {
        return { processed, stoppedBecause: "busy" };
      }
      if (body.done === true) {
        return { processed, stoppedBecause: "done" };
      }
      if (!body.member || typeof body.member !== "object") {
        return { processed, stoppedBecause: "error" };
      }
      processed += 1;
    } catch {
      return { processed, stoppedBecause: "error" };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { processed, stoppedBecause: "limit" };
}

export async function main() {
  const setId = process.argv[2];
  if (!isSetId(setId)) {
    console.error("motion set worker: invalid setId");
    process.exitCode = 1;
    return;
  }

  let baseUrl = process.argv[3];
  if (!baseUrl) {
    try {
      ({ baseUrl } = await findMotionServer());
    } catch (error) {
      console.error(
        `motion set worker: unable to find a healthy sionbanana server: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      process.exitCode = 1;
      return;
    }
  }

  try {
    const result = await runSetWorker({ setId, baseUrl });
    if (result.stoppedBecause === "error") {
      console.error("motion set worker: run-next request failed or returned an invalid response");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      `motion set worker: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === WORKER_FILE) {
  main();
}
