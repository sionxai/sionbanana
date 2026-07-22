#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { runJobs } from "./agent-generate.mjs";
import { findMotionServer } from "./motion-server-discovery.mjs";

const SERVER_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SERVER_FILE), "..");
const AGENT_GENERATE_SCRIPT = path.join(REPO_ROOT, "scripts", "agent-generate.mjs");
const DEFAULT_HEALTH_PORT = 3002;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MOTION_GENERATION_TIMEOUT_MS = 180_000;
const DEFAULT_MOTION_RETRY_COUNT = 2;
const MOTION_DEADLINE_BUFFER_MS = 30_000;
const MOTION_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const MOTION_UPLOAD_MAX_BASE64_CHARS = 4 * Math.ceil(MOTION_UPLOAD_MAX_BYTES / 3);
const MOTION_EXPORT_BASE64_MAX_BYTES = 12 * 1024 * 1024;
const MOTION_JOB_RETENTION_MS = 24 * 60 * 60 * 1000;
const MOTION_POLL_INTERVAL_MS = 500;
const MOTION_ID_RE = /^[A-Za-z0-9._-]+$/;
const MOCK_MODE = process.env.SIONBANANA_MCP_MOCK === "1";

const optionalText = () => z.string().trim().min(1).optional();
const qualitySchema = z.enum(["low", "medium", "high", "auto"]).optional();
const countSchema = z.union([z.literal(1), z.literal(2), z.literal(4)]).optional();
const batchSchema = z.number().int().min(1).optional();
const concurrencySchema = z.number().int().min(1).optional();
const retrySchema = z.number().int().min(0).optional();
const timeoutSchema = z.number().int().min(100).max(30000).optional();
const stringListSchema = z.union([z.string().trim().min(1), z.array(z.string().trim().min(1))]).optional();
const generateManyJobSchema = z.object({
  slug: optionalText(),
  category: optionalText(),
  prompt: z.string().trim().min(1),
  size: optionalText(),
  quality: qualitySchema,
  count: countSchema,
  reference: optionalText(),
  referenceGallery: stringListSchema,
  referenceSlug: optionalText(),
  referenceGallerySlugs: stringListSchema
});
const motionActionSchema = z.enum(["walk", "run", "idle", "jump", "attack", "custom"]);
const motionUploadSourceSchema = z
  .object({
    type: z.literal("upload"),
    dataUrl: z.string().trim().min(1).optional(),
    imagePath: z.string().trim().min(1).optional()
  })
  .strict();
const motionSourceSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("generate"),
        prompt: z.string().trim().min(1),
        subjectType: z.enum(["character", "object"]).default("character"),
        action: motionActionSchema.optional()
      })
      .strict(),
    z
      .object({
        type: z.literal("reference"),
        prompt: z.string().trim().min(1),
        subjectType: z.enum(["character", "object"]).default("character"),
        referenceImage: z.string().trim().min(1),
        action: motionActionSchema.optional()
      })
      .strict(),
    motionUploadSourceSchema
  ])
  .superRefine((source, issueContext) => {
    if (source.type === "upload" && !source.dataUrl && !source.imagePath) {
      issueContext.addIssue({
        code: z.ZodIssueCode.custom,
        message: "upload source must include dataUrl or imagePath"
      });
    }
  });
const motionMatteSchema = z
  .object({
    mode: z.enum(["none", "keyColor", "edgeFlood"]),
    keyColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    tolerance: z.number().int().min(0).max(100).optional(),
    softness: z.number().int().min(0).max(10).optional(),
    despill: z.boolean().optional(),
    choke: z.number().int().min(0).max(5).optional()
  })
  .strict();
const motionAdvancedSchema = z
  .object({
    sliceMode: z.enum(["auto", "grid"]).optional(),
    normalizeScale: z.enum(["none", "height", "area"]).optional(),
    normalizePivotX: z.enum(["foot", "centroid"]).optional(),
    normalizePivotY: z.enum(["pin", "preserve"]).optional(),
    matte: motionMatteSchema.optional()
  })
  .strict();

const TOOL_NAMES = [
  "health_check",
  "generate",
  "generate_many",
  "upscale_from",
  "build_index",
  "list_runs",
  "read_manifest",
  "list_images",
  "create_motion",
  "get_motion",
  "export_motion",
  "list_motion"
];

export function createSionBananaMcpServer(options = {}) {
  const server = new McpServer(
    {
      name: "sionbanana-mcp-beta",
      version: "0.1.0-beta"
    },
    {
      instructions:
        "Experimental beta MCP wrapper for Sion Banana local automation. Tools wrap existing repo-local helpers. create_motion/get_motion build sprite-sheet motion assets (async job then poll); export_motion packages a ready project as a retrievable ZIP. For characters with skin pass subjectType 'character' (default) so the chroma background is green and the face is not keyed out."
    }
  );

  const context = {
    mock: options.mock ?? MOCK_MODE,
    fetchImpl: options.fetchImpl ?? fetch,
    repoRoot: options.repoRoot ?? REPO_ROOT,
    dataRoot: options.dataRoot ?? getDataRoot()
  };

  registerJsonTool(
    server,
    "health_check",
    {
      title: "Health Check",
      description: "Experimental beta tool. GET /api/health from the local Sion Banana app.",
      inputSchema: {
        baseUrl: z.string().url().optional().describe("Override base URL, for example http://localhost:3002."),
        port: z.number().int().min(1).max(65535).optional().describe("Local port used when baseUrl is omitted."),
        timeoutMs: timeoutSchema.describe("Request timeout in milliseconds.")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    input => healthCheck(input, context)
  );

  registerJsonTool(
    server,
    "generate",
    {
      title: "Generate",
      description:
        "Experimental beta tool. Wraps scripts/agent-generate.mjs for local image generation runs.",
      inputSchema: {
        prompt: z.string().trim().min(1).describe("Prompt passed as --prompt."),
        reference: optionalText().describe("Optional --reference image URL or path."),
        referenceGallery: stringListSchema.describe("Optional --reference-gallery image URLs."),
        referenceSlug: optionalText().describe("Optional --reference-slug for latest run lookup."),
        referenceGallerySlugs: stringListSchema.describe("Optional --reference-gallery-slugs latest run lookups."),
        category: optionalText().describe("Optional --category label for the run manifest."),
        slug: optionalText().describe("Optional --slug for the run directory."),
        count: countSchema.describe("Optional --count. Must be 1, 2, or 4."),
        quality: qualitySchema.describe("Optional --quality. low, medium, high, or auto."),
        size: optionalText().describe("Optional --size image size."),
        batch: batchSchema.describe("Optional --batch. Number of same-prompt runs. Default: 1."),
        concurrency: concurrencySchema.describe("Optional --concurrency. Concurrent batch workers. Default: 4."),
        retry: retrySchema.describe("Optional --retry transient failures. Default: 0."),
        retryBaseDelayMs: z.number().int().min(1).optional().describe("Optional --retry-base-delay in ms.")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    input => runAgentGenerate(buildGenerateArgs(input), "generate", context)
  );

  registerJsonTool(
    server,
    "generate_many",
    {
      title: "Generate Many",
      description:
        "Experimental beta tool. Runs different-prompt image generation jobs in-process with a concurrency gate.",
      inputSchema: {
        jobs: z.array(generateManyJobSchema).min(1).describe("Different-prompt generation jobs."),
        concurrency: concurrencySchema.describe("Optional concurrent workers. Default: 3."),
        port: z.number().int().min(1).max(65535).optional().describe("Preferred local app port."),
        retry: retrySchema.describe("Optional transient failure retries per job. Default: 0.")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    input => generateMany(input, context)
  );

  registerJsonTool(
    server,
    "upscale_from",
    {
      title: "Upscale From",
      description:
        "Experimental beta tool. Wraps scripts/agent-generate.mjs --upscale-from for an existing run.",
      inputSchema: {
        upscaleFrom: z.string().trim().min(1).describe("Run directory passed as --upscale-from."),
        slug: optionalText().describe("Optional --slug override."),
        quality: qualitySchema.describe("Optional --quality. low, medium, high, or auto."),
        size: optionalText().describe("Optional --size image size.")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    input => runAgentGenerate(buildUpscaleArgs(input), "upscale_from", context)
  );

  registerJsonTool(
    server,
    "build_index",
    {
      title: "Build Index",
      description:
        "Experimental beta tool. Wraps scripts/agent-generate.mjs --build-index for a category.",
      inputSchema: {
        category: z.string().trim().min(1).describe("Category passed as --build-index.")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    input => runAgentGenerate(["--build-index", input.category], "build_index", context)
  );

  registerJsonTool(
    server,
    "list_runs",
    {
      title: "List Runs",
      description: "Experimental beta tool. Lists data/agent-runs grouped by manifest category.",
      inputSchema: {
        category: optionalText().describe("Optional category filter.")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    input => listRuns(input, context)
  );

  registerJsonTool(
    server,
    "read_manifest",
    {
      title: "Read Manifest",
      description: "Experimental beta tool. Reads manifest.json for a specific agent run.",
      inputSchema: {
        run: z.string().trim().min(1).describe("Run directory name under data/agent-runs.")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    input => readManifest(input, context)
  );

  registerJsonTool(
    server,
    "list_images",
    {
      title: "List Images",
      description: "Experimental beta tool. Lists files in a specific run's images directory.",
      inputSchema: {
        run: z.string().trim().min(1).describe("Run directory name under data/agent-runs.")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    input => listImages(input, context)
  );

  registerJsonTool(
    server,
    "create_motion",
    {
      title: "Create Motion",
      description:
        "Starts motion-project generation in a detached worker and immediately returns a pollable job id.",
      inputSchema: {
        name: z.string().trim().min(1),
        grid: z
          .object({
            cols: z.number().int().min(1).max(12),
            rows: z.number().int().min(1).max(12)
          })
          .strict(),
        source: motionSourceSchema,
        advanced: motionAdvancedSchema.optional(),
        waitMs: z.number().int().min(0).max(30_000).default(0)
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    input => createMotion(input, context)
  );

  registerJsonTool(
    server,
    "get_motion",
    {
      title: "Get Motion",
      description: "Polls a motion job and returns generated project paths when it is ready.",
      inputSchema: {
        jobId: z.string().min(1),
        waitMs: z.number().int().min(0).max(30_000).default(0)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    input => getMotion(input, context)
  );

  registerJsonTool(
    server,
    "export_motion",
    {
      title: "Export Motion",
      description: "Packages a ready motion project as a persistent ZIP file.",
      inputSchema: {
        projectId: z.string().min(1).regex(MOTION_ID_RE),
        includeGif: z.boolean().default(true),
        fps: z.number().int().min(1).optional(),
        asBase64: z.boolean().default(false),
        destPath: optionalText()
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    input => exportMotion(input, context)
  );

  registerJsonTool(
    server,
    "list_motion",
    {
      title: "List Motion",
      description: "Lists recent motion jobs and locally stored motion projects.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20),
        status: z.enum(["running", "ready", "failed"]).optional()
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    input => listMotion(input, context)
  );

  return server;
}

export { TOOL_NAMES };

async function startServer() {
  const server = createSionBananaMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function registerJsonTool(server, name, config, handler) {
  server.registerTool(name, config, async input => {
    const result = await handler(input ?? {});
    return jsonResult(result);
  });
}

function jsonResult(result) {
  return {
    content: [
      {
        type: "text",
        text: `${JSON.stringify(result, null, 2)}\n`
      }
    ],
    structuredContent: result
  };
}

async function healthCheck(input, context) {
  const baseUrl = input.baseUrl || `http://localhost:${input.port || DEFAULT_HEALTH_PORT}`;
  const url = `${baseUrl.replace(/\/+$/, "")}/api/health`;
  const timeoutMs = input.timeoutMs || DEFAULT_TIMEOUT_MS;

  if (context.mock) {
    return {
      ok: true,
      mocked: true,
      url
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await context.fetchImpl(url, {
      method: "GET",
      signal: controller.signal
    });
    const text = await response.text();
    const body = text ? parseJson(text, `Invalid JSON response from ${url}`) : {};

    return {
      ok: response.ok,
      status: response.status,
      url,
      body
    };
  } catch (error) {
    return {
      ok: false,
      url,
      reason: error?.name === "AbortError" ? `Request timed out after ${timeoutMs}ms` : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildGenerateArgs(input) {
  const args = ["--prompt", input.prompt];
  pushOptionalArg(args, "--reference", input.reference);
  pushOptionalArg(args, "--reference-gallery", input.referenceGallery);
  pushOptionalArg(args, "--reference-slug", input.referenceSlug);
  pushOptionalArg(args, "--reference-gallery-slugs", input.referenceGallerySlugs);
  pushOptionalArg(args, "--category", input.category);
  pushOptionalArg(args, "--slug", input.slug);
  pushOptionalArg(args, "--count", input.count);
  pushOptionalArg(args, "--quality", input.quality);
  pushOptionalArg(args, "--size", input.size);
  pushOptionalArg(args, "--batch", input.batch);
  pushOptionalArg(args, "--concurrency", input.concurrency);
  pushOptionalArg(args, "--retry", input.retry);
  pushOptionalArg(args, "--retry-base-delay", input.retryBaseDelayMs);
  return args;
}

function buildUpscaleArgs(input) {
  const args = ["--upscale-from", input.upscaleFrom];
  pushOptionalArg(args, "--slug", input.slug);
  pushOptionalArg(args, "--quality", input.quality);
  pushOptionalArg(args, "--size", input.size);
  return args;
}

function pushOptionalArg(args, flag, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  args.push(flag, Array.isArray(value) ? value.join(",") : String(value));
}

async function runAgentGenerate(args, tool, context) {
  if (context.mock) {
    return {
      ok: true,
      mocked: true,
      tool,
      command: process.execPath,
      args: [AGENT_GENERATE_SCRIPT, ...args]
    };
  }

  const execution = await execNodeScript(AGENT_GENERATE_SCRIPT, args, context.repoRoot);
  const parsed = execution.stdout.trim()
    ? parseJson(execution.stdout, "agent-generate.mjs did not return valid JSON")
    : {};

  return {
    ...parsed,
    exitCode: execution.exitCode,
    stderr: execution.stderr.trim() || undefined
  };
}

async function generateMany(input, context) {
  if (context.mock) {
    return {
      ok: true,
      mocked: true,
      tool: "generate_many",
      total: input.jobs.length,
      jobs: input.jobs.map(job => ({
        slug: asString(job.slug) || null,
        prompt: job.prompt
      }))
    };
  }

  const jobs = await runJobs(input.jobs, {
    concurrency: input.concurrency,
    port: input.port,
    retry: input.retry,
    dataRoot: context.dataRoot
  });
  const succeeded = jobs.filter(job => job.ok).length;

  return {
    ok: succeeded === jobs.length,
    total: jobs.length,
    succeeded,
    failed: jobs.length - succeeded,
    jobs
  };
}

function execNodeScript(scriptPath, args, cwd) {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [scriptPath, ...args],
      {
        cwd,
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        resolve({
          exitCode: typeof error?.code === "number" ? error.code : 0,
          stdout: String(stdout || ""),
          stderr: String(stderr || "")
        });
      }
    );
  });
}

async function listRuns(input, context) {
  const runsRoot = getRunsRoot(context);

  if (!(await exists(runsRoot))) {
    return {
      ok: true,
      runsRoot,
      total: 0,
      categories: {}
    };
  }

  const entries = await fs.readdir(runsRoot, { withFileTypes: true });
  const categories = {};
  let total = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const runDir = path.join(runsRoot, entry.name);
    const manifestPath = path.join(runDir, "manifest.json");
    if (!(await exists(manifestPath))) {
      continue;
    }

    const manifest = await readJsonFile(manifestPath);
    const category = asString(manifest.category) || "uncategorized";
    if (input.category && category !== input.category) {
      continue;
    }

    const images = Array.isArray(manifest.images) ? manifest.images : [];
    const run = {
      run: entry.name,
      category,
      slug: asString(manifest.slug) || null,
      createdAt: asString(manifest.createdAt) || null,
      imageCount: images.length,
      manifestPath
    };

    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(run);
    total += 1;
  }

  for (const runs of Object.values(categories)) {
    runs.sort((left, right) => compareCreatedAtDesc(left, right));
  }

  return {
    ok: true,
    runsRoot,
    total,
    categories
  };
}

async function readManifest(input, context) {
  const runDir = resolveRunDir(input.run, context);
  const manifestPath = path.join(runDir, "manifest.json");
  const manifest = await readJsonFile(manifestPath);

  return {
    ok: true,
    run: path.basename(runDir),
    manifestPath,
    manifest
  };
}

async function listImages(input, context) {
  const runDir = resolveRunDir(input.run, context);
  const imagesDir = path.join(runDir, "images");

  if (!(await exists(imagesDir))) {
    return {
      ok: true,
      run: path.basename(runDir),
      imagesDir,
      images: []
    };
  }

  const entries = await fs.readdir(imagesDir, { withFileTypes: true });
  const images = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(imagesDir, entry.name);
    const stat = await fs.stat(filePath);
    images.push({
      fileName: entry.name,
      relativePath: path.posix.join("images", entry.name),
      path: filePath,
      sizeBytes: stat.size
    });
  }

  images.sort((left, right) => left.fileName.localeCompare(right.fileName));

  return {
    ok: true,
    run: path.basename(runDir),
    imagesDir,
    images
  };
}

export async function createMotion(input, context) {
  const jobId = `motion-job-${Date.now()}-${randomUUID()}`;
  if (context.mock) {
    return {
      ok: true,
      jobId,
      status: "running",
      mocked: true
    };
  }

  let jobPath;
  let job;
  try {
    const source = await normalizeMotionSource(input.source, context);
    const createdAt = Date.now();
    const createdAtIso = new Date(createdAt).toISOString();
    const deadlineIso = new Date(
      createdAt +
        motionGenerationTimeoutMs() * (DEFAULT_MOTION_RETRY_COUNT + 1) +
        MOTION_DEADLINE_BUFFER_MS
    ).toISOString();
    const request = {
      name: input.name,
      grid: input.grid,
      source,
      ...(input.advanced ?? {})
    };
    const jobsRoot = await motionDirectory(context, "motion-jobs", true);
    jobPath = motionIdPath(jobsRoot, jobId, ".json");
    job = {
      status: "running",
      createdAtIso,
      deadlineIso,
      request
    };
    await atomicWriteJson(jobPath, job);

    try {
      const workerScript = path.join(context.repoRoot, "scripts", "motion-worker.mjs");
      const worker = spawn(process.execPath, [workerScript, jobId], {
        cwd: context.repoRoot,
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          SIONBANANA_DATA_DIR: path.resolve(context.dataRoot)
        }
      });
      worker.once("error", error => {
        const failed = {
          ...job,
          status: "failed",
          reason: `generation-error: unable to start motion worker: ${error.message}`,
          finishedAtIso: new Date().toISOString()
        };
        atomicWriteJson(jobPath, failed).catch(() => {});
      });
      worker.unref();
    } catch (error) {
      job = {
        ...job,
        status: "failed",
        reason: `generation-error: unable to start motion worker: ${errorMessage(error)}`,
        finishedAtIso: new Date().toISOString()
      };
      await atomicWriteJson(jobPath, job).catch(() => {});
    }

    if ((input.waitMs ?? 0) > 0 && job.status === "running") {
      const polled = await getMotion({ jobId, waitMs: input.waitMs }, context);
      return {
        ok: polled.ok,
        jobId,
        ...(typeof polled.status === "string" ? { status: polled.status } : {}),
        ...(isMotionId(polled.projectId) ? { projectId: polled.projectId } : {}),
        ...(typeof polled.reason === "string" ? { reason: polled.reason } : {})
      };
    }
    return motionJobResult(jobId, job);
  } catch (error) {
    return {
      ok: false,
      reason: errorMessage(error)
    };
  }
}

export async function getMotion(input, context) {
  if (!isMotionId(input.jobId)) {
    return {
      ok: false,
      reason: "invalid jobId"
    };
  }

  try {
    const waitUntil = Date.now() + (input.waitMs ?? 0);
    let record = await readMotionJob(input.jobId, context);
    if (!record) {
      return {
        ok: false,
        reason: "unknown jobId"
      };
    }
    record.job = await applyMotionDeadline(record.job, record.path);

    while (record.job.status === "running" && Date.now() < waitUntil) {
      const deadline = Date.parse(record.job.deadlineIso || "");
      const now = Date.now();
      const untilDeadline = Number.isFinite(deadline) ? Math.max(1, deadline - now + 1) : Infinity;
      const sleepMs = Math.min(MOTION_POLL_INTERVAL_MS, waitUntil - now, untilDeadline);
      if (sleepMs <= 0) {
        break;
      }
      await delay(sleepMs);

      record = await readMotionJob(input.jobId, context);
      if (!record) {
        return {
          ok: false,
          reason: "unknown jobId"
        };
      }
      record.job = await applyMotionDeadline(record.job, record.path);
    }

    if (record.job.status !== "ready") {
      return motionJobResult(input.jobId, record.job);
    }
    return await readyMotionResult(input.jobId, record.job, context);
  } catch (error) {
    return {
      ok: false,
      reason: errorMessage(error)
    };
  }
}

export async function exportMotion(input, context) {
  if (!isMotionId(input.projectId)) {
    return {
      ok: false,
      reason: "invalid projectId"
    };
  }
  if (context.mock) {
    return {
      ok: true,
      mocked: true,
      projectId: input.projectId
    };
  }

  let baseUrl;
  try {
    ({ baseUrl } = await findMotionServer(context.fetchImpl));
  } catch (error) {
    return {
      ok: false,
      reason: errorMessage(error)
    };
  }

  const includeGif = input.includeGif ?? true;
  const searchParams = new URLSearchParams({ gif: includeGif ? "1" : "0" });
  if (input.fps !== undefined) {
    searchParams.set("fps", String(input.fps));
  }
  const url = `${baseUrl}/api/motion/projects/${encodeURIComponent(input.projectId)}/export-file?${searchParams}`;

  let body;
  let response;
  try {
    response = await context.fetchImpl(url, { method: "GET" });
    const text = await response.text();
    body = text ? parseJson(text, `Invalid JSON response from ${url}`) : {};
  } catch (error) {
    return {
      ok: false,
      reason: errorMessage(error)
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: typeof body?.reason === "string"
        ? body.reason
        : `${response.status} ${response.statusText || "motion export failed"}`
    };
  }
  if (
    body?.ok !== true ||
    typeof body.zipPath !== "string" ||
    typeof body.bytes !== "number" ||
    typeof body.sha256 !== "string" ||
    typeof body.gifIncluded !== "boolean"
  ) {
    return {
      ok: false,
      reason: "motion export response was incomplete"
    };
  }

  try {
    const { handle } = await openRegularMotionExport(body.zipPath);
    await handle.close();
  } catch (error) {
    return {
      ok: false,
      reason: errorMessage(error)
    };
  }

  const result = {
    ok: true,
    projectId: input.projectId,
    zipPath: body.zipPath,
    bytes: body.bytes,
    sha256: body.sha256,
    gifIncluded: body.gifIncluded
  };

  if (input.asBase64) {
    try {
      const encoded = await readMotionExportBase64(body.zipPath);
      if (encoded.base64) result.base64 = encoded.base64;
      else result.base64Skipped = encoded.base64Skipped;
    } catch (error) {
      result.base64Skipped = errorMessage(error);
    }
  }

  if (input.destPath) {
    try {
      result.copiedTo = await copyMotionExport(body.zipPath, input.destPath, context);
    } catch (error) {
      result.destPathRejected = errorMessage(error);
    }
  }

  return result;
}

async function openRegularMotionExport(zipPath) {
  if (!path.isAbsolute(zipPath)) {
    throw new Error("export zipPath must be absolute");
  }
  let handle;
  try {
    handle = await fs.open(zipPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error("export zipPath must be a regular, non-symbolic-link file");
    }
    return { handle, stat };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error?.code === "ELOOP") {
      throw new Error("export zipPath must be a regular, non-symbolic-link file");
    }
    throw error;
  }
}

async function readMotionExportBase64(zipPath) {
  const { handle, stat } = await openRegularMotionExport(zipPath);
  try {
    if (stat.size > MOTION_EXPORT_BASE64_MAX_BYTES) {
      return { base64Skipped: "too large" };
    }
    const buffer = await handle.readFile();
    if (buffer.byteLength > MOTION_EXPORT_BASE64_MAX_BYTES) {
      return { base64Skipped: "too large" };
    }
    return { base64: buffer.toString("base64") };
  } finally {
    await handle.close();
  }
}

async function copyMotionExport(zipPath, requestedPath, context) {
  if (requestedPath.replaceAll("\\", "/").split("/").includes("..")) {
    throw new Error("destPath must not contain '..' path segments");
  }
  const destination = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(context.repoRoot, requestedPath);
  await assertNoSymlinkDirectories(path.dirname(destination));

  try {
    const destinationStat = await fs.lstat(destination);
    if (destinationStat.isSymbolicLink()) {
      throw new Error("destPath must not be a symbolic link");
    }
    throw new Error("destPath already exists");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const { handle: sourceHandle } = await openRegularMotionExport(zipPath);
  let destinationHandle;
  let created = false;
  try {
    destinationHandle = await fs.open(
      destination,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_NOFOLLOW,
      0o600
    );
    created = true;
    await pipeline(
      sourceHandle.createReadStream({ autoClose: true }),
      destinationHandle.createWriteStream({ autoClose: true })
    );
    return destination;
  } catch (error) {
    if (created) await fs.unlink(destination).catch(() => {});
    throw error;
  } finally {
    await sourceHandle.close().catch(() => {});
    await destinationHandle?.close().catch(() => {});
  }
}

async function assertNoSymlinkDirectories(directory) {
  const parsed = path.parse(directory);
  const relativeSegments = directory.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const segment of relativeSegments) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error("destPath parent directory does not exist");
      }
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("destPath parent must contain only regular, non-symbolic-link directories");
    }
  }
}

export async function listMotion(input, context) {
  try {
    const jobs = [];
    const jobsRoot = await motionDirectory(context, "motion-jobs", false);
    if (jobsRoot) {
      const entries = await fs.readdir(jobsRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) {
          continue;
        }
        const jobId = entry.name.slice(0, -".json".length);
        if (!isMotionId(jobId)) {
          continue;
        }
        const jobPath = motionIdPath(jobsRoot, jobId, ".json");
        try {
          const stat = await fs.lstat(jobPath);
          if (!stat.isFile() || stat.isSymbolicLink()) {
            continue;
          }
          let job = await readJsonFile(jobPath);
          job = await applyMotionDeadline(job, jobPath);
          const createdAt = Date.parse(job.createdAtIso || "");
          const terminal = job.status === "ready" || job.status === "failed";
          if (terminal && Number.isFinite(createdAt) && Date.now() - createdAt > MOTION_JOB_RETENTION_MS) {
            await fs.unlink(jobPath).catch(() => {});
            continue;
          }
          if (input.status && job.status !== input.status) {
            continue;
          }
          jobs.push({
            jobId,
            status: job.status,
            ...(isMotionId(job.projectId) ? { projectId: job.projectId } : {}),
            createdAtIso: asString(job.createdAtIso) || null
          });
        } catch {
          // A malformed or concurrently replaced job must not prevent listing other jobs.
        }
      }
    }

    jobs.sort((left, right) => compareIsoDesc(left.createdAtIso, right.createdAtIso));
    const projects = await listMotionProjects(context);
    return {
      ok: true,
      jobs: jobs.slice(0, input.limit ?? 20),
      projects
    };
  } catch (error) {
    return {
      ok: false,
      reason: errorMessage(error)
    };
  }
}

async function normalizeMotionSource(source, context) {
  if (!source || source.type !== "upload") {
    return source;
  }
  if (source.dataUrl) {
    assertMotionDataUrlSize(source.dataUrl);
    return { type: "upload", dataUrl: source.dataUrl };
  }

  const imagePath = await resolveMotionUploadPath(source.imagePath, context);
  const stat = await fs.lstat(imagePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("source.imagePath must be a regular, non-symbolic-link file");
  }
  if (stat.size > MOTION_UPLOAD_MAX_BYTES) {
    throw new Error("source.imagePath exceeds the 8MB limit");
  }
  const buffer = await fs.readFile(imagePath);
  if (buffer.byteLength > MOTION_UPLOAD_MAX_BYTES) {
    throw new Error("source.imagePath exceeds the 8MB limit");
  }
  const mimeType = detectMotionImageMime(buffer);
  if (!mimeType) {
    throw new Error("source.imagePath must contain a PNG or JPEG image");
  }
  return {
    type: "upload",
    dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`
  };
}

async function resolveMotionUploadPath(imagePath, context) {
  if (!asString(imagePath)) {
    throw new Error("upload source must include dataUrl or imagePath");
  }
  const candidate = path.isAbsolute(imagePath)
    ? path.resolve(imagePath)
    : path.resolve(context.repoRoot, imagePath);
  const candidateStat = await fs.lstat(candidate);
  if (!candidateStat.isFile() || candidateStat.isSymbolicLink()) {
    throw new Error("source.imagePath must be a regular, non-symbolic-link file");
  }
  const realPath = await fs.realpath(candidate);
  if (!path.isAbsolute(imagePath)) {
    const realRepoRoot = await fs.realpath(context.repoRoot);
    assertPathInside(realRepoRoot, realPath, "source.imagePath must stay inside repoRoot");
  }
  return realPath;
}

function assertMotionDataUrlSize(dataUrl) {
  if (dataUrl.length > MOTION_UPLOAD_MAX_BASE64_CHARS + 32) {
    throw new Error("source.dataUrl exceeds the 8MB limit");
  }
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match || !match[2] || match[2].length % 4 !== 0) {
    throw new Error("source.dataUrl must be a base64 PNG or JPEG data URL");
  }
  const decoded = Buffer.from(match[2], "base64");
  if (decoded.byteLength > MOTION_UPLOAD_MAX_BYTES) {
    throw new Error("source.dataUrl exceeds the 8MB limit");
  }
}

function detectMotionImageMime(buffer) {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

async function readMotionJob(jobId, context) {
  const jobsRoot = await motionDirectory(context, "motion-jobs", false);
  if (!jobsRoot) {
    return null;
  }
  const jobPath = motionIdPath(jobsRoot, jobId, ".json");
  let stat;
  try {
    stat = await fs.lstat(jobPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("motion job file must be a regular, non-symbolic-link file");
  }
  return {
    path: jobPath,
    job: await readJsonFile(jobPath)
  };
}

async function applyMotionDeadline(job, jobPath) {
  const deadline = Date.parse(job?.deadlineIso || "");
  if (job?.status !== "running") {
    return job;
  }
  if (!Number.isFinite(deadline)) {
    return await failMotionJobDeadline(
      job,
      jobPath,
      "timed out (invalid or missing deadlineIso); refusing to leave job running"
    );
  }
  if (Date.now() <= deadline) {
    return job;
  }
  return await failMotionJobDeadline(
    job,
    jobPath,
    "timed out (deadline exceeded); worker may have died — retry create_motion"
  );
}

async function failMotionJobDeadline(job, jobPath, reason) {
  const failed = {
    ...job,
    status: "failed",
    reason,
    finishedAtIso: new Date().toISOString()
  };
  await atomicWriteJson(jobPath, failed).catch(() => {});
  return failed;
}

function motionJobResult(jobId, job) {
  return {
    ok: true,
    jobId,
    status: job.status,
    ...(isMotionId(job.projectId) ? { projectId: job.projectId } : {}),
    ...(typeof job.reason === "string" ? { reason: job.reason } : {})
  };
}

async function readyMotionResult(jobId, job, context) {
  if (!isMotionId(job.projectId)) {
    throw new Error("ready motion job has an invalid projectId");
  }
  const assetsRoot = await motionDirectory(context, "motion-assets", false);
  if (!assetsRoot) {
    throw new Error("motion-assets directory does not exist");
  }
  const directory = motionIdPath(assetsRoot, job.projectId);
  const directoryStat = await fs.lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error("motion project directory must be a regular, non-symbolic-link directory");
  }
  const projectPath = path.join(directory, "project.json");
  const projectStat = await fs.lstat(projectPath);
  if (!projectStat.isFile() || projectStat.isSymbolicLink()) {
    throw new Error("motion project file must be a regular, non-symbolic-link file");
  }
  const project = await readJsonFile(projectPath);
  if (project.id !== job.projectId) {
    throw new Error("motion project id does not match its directory");
  }
  const frameCount = Array.isArray(project.frames) ? project.frames.length : 0;
  const frames = Array.from({ length: frameCount }, (_, index) =>
    path.join(directory, "derived", "frames", `f${String(index + 1).padStart(2, "0")}.png`)
  );
  return {
    ok: true,
    jobId,
    status: "ready",
    projectId: job.projectId,
    project,
    paths: {
      dir: directory,
      sheet: path.join(directory, "derived", "sheet.png"),
      frames,
      project: projectPath
    },
    ...(typeof job.sliceConfidence === "number"
      ? { sliceConfidence: job.sliceConfidence }
      : typeof project.sliceConfidence === "number"
        ? { sliceConfidence: project.sliceConfidence }
        : {})
  };
}

async function listMotionProjects(context) {
  const assetsRoot = await motionDirectory(context, "motion-assets", false);
  if (!assetsRoot) {
    return [];
  }
  const entries = await fs.readdir(assetsRoot, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !isMotionId(entry.name)) {
      continue;
    }
    try {
      const directory = motionIdPath(assetsRoot, entry.name);
      const directoryStat = await fs.lstat(directory);
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
        continue;
      }
      const projectPath = path.join(directory, "project.json");
      const projectStat = await fs.lstat(projectPath);
      if (!projectStat.isFile() || projectStat.isSymbolicLink()) {
        continue;
      }
      const project = await readJsonFile(projectPath);
      if (project.id !== entry.name) {
        continue;
      }
      projects.push({
        id: project.id,
        name: asString(project.name) || project.id,
        createdAtIso: asString(project.createdAtIso) || null,
        dir: directory
      });
    } catch {
      // A malformed project must not prevent listing other projects.
    }
  }
  return projects.sort((left, right) => compareIsoDesc(left.createdAtIso, right.createdAtIso));
}

async function motionDirectory(context, name, create) {
  const dataRoot = path.resolve(context.dataRoot);
  const directory = path.resolve(dataRoot, name);
  assertPathInside(dataRoot, directory, "motion data path must stay inside dataRoot");
  if (create) {
    await fs.mkdir(dataRoot, { recursive: true });
    await assertDirectoryNotSymlink(dataRoot);
    await fs.mkdir(directory, { recursive: true });
  } else {
    try {
      await fs.access(directory);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }
  await assertDirectoryNotSymlink(dataRoot);
  await assertDirectoryNotSymlink(directory);
  const realDataRoot = await fs.realpath(dataRoot);
  const realDirectory = await fs.realpath(directory);
  assertPathInside(realDataRoot, realDirectory, "motion data symlink escapes dataRoot");
  return directory;
}

async function assertDirectoryNotSymlink(directory) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${directory} must be a regular, non-symbolic-link directory`);
  }
}

function motionIdPath(root, id, suffix = "") {
  if (!isMotionId(id)) {
    throw new Error("motion id must contain only letters, numbers, dots, underscores, and hyphens");
  }
  const candidate = path.resolve(root, `${id}${suffix}`);
  if (path.dirname(candidate) !== path.resolve(root)) {
    throw new Error("motion path must stay inside its storage directory");
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

function motionGenerationTimeoutMs() {
  const parsed = Number(process.env.SIONBANANA_GEN_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MOTION_GENERATION_TIMEOUT_MS;
}

function compareIsoDesc(left, right) {
  const leftTime = Date.parse(left || "");
  const rightTime = Date.parse(right || "");
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return String(left || "").localeCompare(String(right || ""));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function getDataRoot() {
  const envDir = asString(process.env.SIONBANANA_DATA_DIR);
  if (!envDir) {
    return path.join(REPO_ROOT, "data");
  }
  if (envDir.startsWith("~/")) {
    return path.resolve(process.env.HOME || REPO_ROOT, envDir.slice(2));
  }
  return path.resolve(envDir);
}

function getRunsRoot(context) {
  return path.join(context.dataRoot, "agent-runs");
}

function resolveRunDir(run, context) {
  const runsRoot = getRunsRoot(context);
  const resolved = path.isAbsolute(run) ? path.resolve(run) : path.resolve(runsRoot, run);
  const relative = path.relative(runsRoot, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Run must be inside ${runsRoot}`);
  }

  return resolved;
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return parseJson(raw, `Invalid JSON file: ${filePath}`);
}

function parseJson(raw, message) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(message);
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compareCreatedAtDesc(left, right) {
  const leftTime = Date.parse(left.createdAt || "");
  const rightTime = Date.parse(right.createdAt || "");
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return left.run.localeCompare(right.run);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SERVER_FILE) {
  startServer().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
