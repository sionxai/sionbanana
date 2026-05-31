#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { runJobs } from "./agent-generate.mjs";

const SERVER_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SERVER_FILE), "..");
const AGENT_GENERATE_SCRIPT = path.join(REPO_ROOT, "scripts", "agent-generate.mjs");
const DEFAULT_HEALTH_PORT = 3002;
const DEFAULT_TIMEOUT_MS = 5000;
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

const TOOL_NAMES = [
  "health_check",
  "generate",
  "generate_many",
  "upscale_from",
  "build_index",
  "list_runs",
  "read_manifest",
  "list_images"
];

export function createSionBananaMcpServer(options = {}) {
  const server = new McpServer(
    {
      name: "sionbanana-mcp-beta",
      version: "0.1.0-beta"
    },
    {
      instructions:
        "Experimental beta MCP wrapper for Sion Banana local automation. Tools wrap existing repo-local helpers."
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
