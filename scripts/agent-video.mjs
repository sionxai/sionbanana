#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 3002;
const PORT_SCAN_ORDER = [3002, 3000, 3001, 3003, 3004, 3005];
const VIDEO_REQUEST_TIMEOUT_MS = 20 * 60 * 1000;
const SCRIPT_FILE = fileURLToPath(import.meta.url);

async function main() {
  try {
    const config = normalizeConfig(parseArgs(process.argv.slice(2)));
    if (config.help) {
      printHelp();
      return;
    }
    if (config.proxy) {
      process.stderr.write(
        "[agent-video] --proxy는 실행 중인 Next 서버 환경을 바꾸지 않습니다. 서버를 SIONBANANA_GROK_PROXY 값과 함께 실행했는지 확인하세요.\n"
      );
    }
    const result = await runVideoGeneration(config);
    printJson(result);
    if (result.ok === false) {
      process.exitCode = 1;
    }
  } catch (error) {
    printJson({
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  }
}

export async function runVideoGeneration(config) {
  const server = await findHealthyServer(config.port, config.portExplicit);
  const payload = buildVideoPayload(config);
  const response = await postJson(`${server.baseUrl}/api/video`, payload, VIDEO_REQUEST_TIMEOUT_MS);
  if (response.status >= 200 && response.status < 300) {
    return response.body;
  }
  return {
    ok: false,
    httpStatus: response.status,
    ...(response.body && typeof response.body === "object" ? response.body : {})
  };
}

function buildVideoPayload(config) {
  const payload = {
    sourceImageId: config.sourceId,
    prompt: config.prompt
  };
  if (config.duration !== null) payload.duration = config.duration;
  if (config.resolution) payload.resolution = config.resolution;
  if (config.aspect) payload.aspectRatio = config.aspect;
  if (config.model) payload.model = config.model;
  return payload;
}

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const equalIndex = arg.indexOf("=");
    const rawKey = equalIndex === -1 ? arg.slice(2) : arg.slice(2, equalIndex);
    const key = toCamelCase(rawKey);
    const value = equalIndex === -1 ? argv[index + 1] : arg.slice(equalIndex + 1);

    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    if (equalIndex === -1) {
      index += 1;
    }

    result[key] = value;
    if (key === "port") {
      result.portExplicit = true;
    }
  }

  return result;
}

function normalizeConfig(raw) {
  if (raw.help) {
    return { help: true };
  }

  const sourceId = asTrimmedString(raw.sourceId);
  if (!sourceId) {
    throw new Error("--source-id is required");
  }
  if (!/^[A-Za-z0-9_\-]+$/.test(sourceId)) {
    throw new Error("--source-id contains invalid characters");
  }

  const prompt = asTrimmedString(raw.prompt);
  if (!prompt) {
    throw new Error("--prompt is required");
  }

  const duration = raw.duration === undefined || raw.duration === ""
    ? null
    : parsePositiveInteger(raw.duration, "--duration");
  const port = raw.port === undefined ? DEFAULT_PORT : parsePositiveInteger(raw.port, "--port");
  if (port > 65535) {
    throw new Error("--port must be a valid TCP port");
  }

  return {
    sourceId,
    prompt,
    duration,
    resolution: asTrimmedString(raw.resolution) || null,
    aspect: asTrimmedString(raw.aspect) || null,
    model: asTrimmedString(raw.model) || null,
    proxy: asTrimmedString(raw.proxy) || null,
    port,
    portExplicit: raw.portExplicit === true
  };
}

async function findHealthyServer(preferredPort, explicit) {
  const ports = explicit
    ? [preferredPort]
    : [preferredPort, ...PORT_SCAN_ORDER.filter(port => port !== preferredPort)];

  const failures = [];
  for (const port of ports) {
    const baseUrl = `http://localhost:${port}`;
    try {
      const response = await getJson(`${baseUrl}/api/health`, 2500);
      if (response.status >= 200 && response.status < 300 && response.body?.ok === true) {
        return { port, baseUrl, health: response.body };
      }
      failures.push(`${port}: health ok was not true`);
    } catch (error) {
      failures.push(`${port}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`No healthy /api/health endpoint found. Tried ${failures.join("; ")}`);
}

async function getJson(url, timeoutMs) {
  return requestJson(url, { method: "GET" }, timeoutMs);
}

async function postJson(url, body, timeoutMs) {
  return requestJson(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    timeoutMs
  );
}

async function requestJson(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { ok: false, reason: `Invalid JSON response from ${url}` };
      }
    }
    return { status: response.status, body };
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/agent-video.mjs --source-id <image-id> --prompt "..." [options]

Options:
  --source-id           Required local image id from /api/images/<id>
  --prompt              Required video prompt
  --duration            Optional duration. Default: API default
  --resolution          Optional resolution. Default: 720p
  --aspect              Optional aspect ratio passed as aspectRatio
  --model               Optional Grok video model. Default: grok-imagine-video
  --proxy               Optional reminder value; set SIONBANANA_GROK_PROXY on the running server
  --port                Preferred localhost port. Default: 3002
`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_FILE) {
  main();
}
