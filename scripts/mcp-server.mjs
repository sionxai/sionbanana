#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import sharp from "sharp";
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
const MOTION_SET_ID_RE = /^[A-Za-z0-9-]+$/;
const MOTION_CANDIDATE_ID_RE = /^[A-Za-z0-9-]+$/;
const MOTION_CANDIDATE_POLL_INTERVAL_MS = 500;
const MOTION_CANDIDATE_STATUSES = new Set(["pending", "running", "ready", "failed"]);
const DEFAULT_VIDEO_GENERATION_TIMEOUT_MS = 20 * 60 * 1000;
const VIDEO_DEADLINE_BUFFER_MS = 30_000;
const VIDEO_POLL_INTERVAL_MS = 500;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]+$/;
const IMAGE_UPLOAD_THUMBNAIL_MAX_SIZE = 512;
const IMAGE_UPLOAD_THUMBNAIL_QUALITY = 80;
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
// Keep this in sync with lib/motion/prompt.ts: motionActionPresetValues.
const motionActionSchema = z.enum([
  "idle",
  "walk",
  "run",
  "jump",
  "attack",
  "reload",
  "hit",
  "fall",
  "stun",
  "getup",
  "custom"
]);
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
    matte: motionMatteSchema.optional(),
    autoFlipRows: z.boolean().optional(),
    autoExcludeRepeatedRows: z.boolean().optional(),
    fps: z.number().int().min(1).max(60).optional(),
    loop: z.enum(["loop", "pingpong", "once"]).optional()
  })
  .strict();
export const motionCreateInputSchema = z.object({
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
});
const videoImageIdSchema = z.string().trim().min(1).max(160).regex(VIDEO_ID_RE);
const videoDurationSchema = z.union([
  z.number().int().positive().max(30),
  z.string().trim().regex(/^(?:[1-9]|[12][0-9]|30)$/).transform(Number)
]);
const videoSourceSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("imageId"),
        imageId: videoImageIdSchema
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
export const videoCreateInputSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    source: videoSourceSchema,
    prompt: z.string().trim().min(1).max(8000),
    duration: videoDurationSchema.optional(),
    resolution: z.string().trim().min(1).max(32).optional(),
    aspectRatio: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9:_-]+$/).optional(),
    model: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_.:-]+$/).optional(),
    waitMs: z.number().int().min(0).max(30_000).default(0)
  })
  .strict();
export const videoGetInputSchema = z
  .object({
    jobId: z.string().trim().min(1).regex(VIDEO_ID_RE),
    waitMs: z.number().int().min(0).max(30_000).default(0)
  })
  .strict();
const motionSetReferenceSchema = z.union([
  z
    .object({
      type: z.literal("imageId"),
      imageId: videoImageIdSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("upload"),
      dataUrl: z.string().trim().min(1),
      imagePath: z.string().trim().min(1).optional()
    })
    .strict(),
  z
    .object({
      type: z.literal("upload"),
      dataUrl: z.string().trim().min(1).optional(),
      imagePath: z.string().trim().min(1)
    })
    .strict()
]);
const motionSetBaseInputSchema = z
  .object({
    description: z.string().trim().min(1).max(4000),
    style: z.string().trim().max(400).optional(),
    facing: z.enum(["right", "left"]).optional(),
    allowMirror: z.boolean().optional(),
    subjectType: z.enum(["character", "object"]).optional(),
    characterId: z.string().trim().max(200).optional(),
    reference: motionSetReferenceSchema.optional()
  })
  .strict();
const motionSetOverridesInputSchema = z
  .object({
    cols: z.number().int().min(1).max(8).optional(),
    rows: z.number().int().min(1).max(8).optional(),
    fps: z.number().int().min(1).max(60).optional(),
    loop: z.enum(["loop", "pingpong", "once"]).optional()
  })
  .strict();
const motionSetMemberInputSchema = z.union([
  z
    .object({
      action: z.enum([
        "idle",
        "walk",
        "run",
        "jump",
        "attack",
        "reload",
        "hit",
        "fall",
        "stun",
        "getup"
      ]),
      prompt: z.string().trim().max(4000).optional(),
      overrides: motionSetOverridesInputSchema.optional()
    })
    .strict(),
  z
    .object({
      action: z.literal("custom"),
      prompt: z.string().trim().min(1).max(4000),
      overrides: motionSetOverridesInputSchema.optional()
    })
    .strict()
]);
const motionSetCreateObjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    base: motionSetBaseInputSchema,
    common: z
      .object({
        cols: z.number().int().min(1).max(8),
        rows: z.number().int().min(1).max(8),
        fps: z.number().int().min(1).max(60).optional()
      })
      .strict(),
    members: z.array(motionSetMemberInputSchema).min(1),
    start: z.boolean().optional()
  })
  .strict();
export const motionSetCreateInputSchema = motionSetCreateObjectSchema.superRefine((value, issueContext) => {
  const actions = new Set();
  for (const [index, member] of value.members.entries()) {
    if (actions.has(member.action)) {
      issueContext.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["members", index, "action"],
        message: `Duplicate motion action: ${member.action}.`
      });
    }
    actions.add(member.action);
  }
});
export const motionSetGetInputSchema = z
  .object({ setId: z.string().trim().min(1).regex(MOTION_SET_ID_RE) })
  .strict();
export const motionSetListInputSchema = z.object({}).strict();
export const motionSetExportInputSchema = z
  .object({
    setId: z.string().trim().min(1).regex(MOTION_SET_ID_RE),
    destPath: optionalText(),
    asBase64: z.boolean().default(false),
    includeGif: z.boolean().default(true),
    gifFps: z.number().int().min(1).optional()
  })
  .strict();
const motionCandidateFrameInputSchema = z
  .object({
    index: z.number().int().nonnegative(),
    imagePath: z.string().trim().min(1).optional(),
    imageDataUrl: z.string().trim().min(1).optional(),
    maskPath: z.string().trim().min(1).optional(),
    maskDataUrl: z.string().trim().min(1).optional()
  })
  .strict()
  .superRefine((frame, issueContext) => {
    if (frame.imagePath && frame.imageDataUrl) {
      issueContext.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["imagePath"],
        message: "imagePath and imageDataUrl cannot both be provided"
      });
    }
    if (frame.maskPath && frame.maskDataUrl) {
      issueContext.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maskPath"],
        message: "maskPath and maskDataUrl cannot both be provided"
      });
    }
  });
const motionCandidateIdSchema = z.string().trim().min(1).regex(MOTION_CANDIDATE_ID_RE);
export const motionCandidateCreateInputSchema = z
  .object({
    projectId: motionCandidateIdSchema,
    mode: z.enum(["mask", "strip", "upload"]),
    frames: z.array(motionCandidateFrameInputSchema).min(1),
    instruction: z.string().trim().max(4000).optional(),
    protect: z.array(z.string().trim().min(1).max(200)).optional(),
    waitMs: z.number().int().min(0).max(30_000).default(0)
  })
  .strict();
export const motionCandidateGetInputSchema = z
  .object({
    projectId: motionCandidateIdSchema,
    candidateId: motionCandidateIdSchema,
    waitMs: z.number().int().min(0).max(30_000).default(0)
  })
  .strict();
export const motionCandidateApplyInputSchema = z
  .object({
    projectId: motionCandidateIdSchema,
    candidateId: motionCandidateIdSchema,
    frames: z.array(z.number().int().nonnegative()).min(1).optional(),
    force: z.boolean().optional(),
    allowContentLoss: z.boolean().optional(),
    intentionalEmptyFrames: z.array(z.number().int().nonnegative()).optional(),
    maxLostPixels: z.number().int().nonnegative().optional()
  })
  .strict();
export const motionCandidateRevertInputSchema = z
  .object({
    projectId: motionCandidateIdSchema,
    frames: z.array(z.number().int().nonnegative()).min(1).optional()
  })
  .strict();
const MOTION_SET_TOOL_DESCRIPTION =
  "세트 = 한 캐릭터의 여러 동작을 순차 생성. 순환 프리셋은 반복 행 자동 제외(실효 4장 정상).";
const MOTION_CANDIDATE_TOOL_DESCRIPTION =
  "구간 수정 — mask는 셀 크기 마스크(알파 0=편집, 좁을수록 원본 보존), strip은 연속 구간을 이웃 앵커로 재생성. 적용 시 원본 셀 크기로 스케일·발 기준 정렬되며 원본 시트는 바뀌지 않는다. 고정 격자 폴백이나 낮은 배치 신뢰도로 만들어진 후보는 requiresReview: true로 표시된다(적용은 막지 않는다).";
const MOTION_CANDIDATE_APPLY_TOOL_DESCRIPTION =
  MOTION_CANDIDATE_TOOL_DESCRIPTION +
  " 후보 생성 이후 해당 프레임이 바뀌었으면 409로 거부한다. force: true로 덮어쓴다. 셀에 맞추면 내용이 잘리는 후보는 409(CONTENT_LOSS)로 거부한다. 잘림을 감수하려면 allowContentLoss: true. 의도한 소멸(빈) 프레임은 intentionalEmptyFrames에 0-based 인덱스로 지정한다. force는 기준선 충돌 전용이며 잘림을 허용하지 않는다.";
const MOTION_CANDIDATE_REVERT_TOOL_DESCRIPTION =
  MOTION_CANDIDATE_TOOL_DESCRIPTION +
  " 오버라이드를 제거해 최초 원본으로 되돌린다(직전 후보로 돌아가지 않는다).";

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
  "create_video",
  "get_video",
  "export_motion",
  "list_motion",
  "create_motion_candidate",
  "get_motion_candidate",
  "apply_motion_candidate",
  "revert_motion_frames",
  "create_motion_set",
  "get_motion_set",
  "list_motion_sets",
  "export_motion_set"
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
        "Starts motion-project generation in a detached worker and immediately returns a pollable job id. Presets: idle, walk, run, jump, attack, reload, hit, fall, stun, getup, custom; movement presets loop and one-shot presets play once by default.",
      inputSchema: motionCreateInputSchema.shape,
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
    "create_video",
    {
      title: "Create Video",
      description: "Starts image-to-video generation in a detached worker and returns a pollable job id.",
      inputSchema: {
        name: z.string().trim().min(1).optional(),
        source: videoSourceSchema,
        prompt: z.string().trim().min(1).max(8000),
        duration: videoDurationSchema.optional(),
        resolution: z.string().trim().min(1).max(32).optional(),
        aspectRatio: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9:_-]+$/).optional(),
        model: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_.:-]+$/).optional(),
        waitMs: z.number().int().min(0).max(30_000).default(0)
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    input => createVideo(input, context)
  );

  registerJsonTool(
    server,
    "get_video",
    {
      title: "Get Video",
      description: "Polls a video job and returns a verified local video path when it is ready.",
      inputSchema: {
        jobId: z.string().trim().min(1).regex(VIDEO_ID_RE),
        waitMs: z.number().int().min(0).max(30_000).default(0)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    input => getVideo(input, context)
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

  registerJsonTool(
    server,
    "create_motion_candidate",
    {
      title: "Create Motion Candidate",
      description: MOTION_CANDIDATE_TOOL_DESCRIPTION,
      inputSchema: motionCandidateCreateInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    input => createMotionCandidate(input, context)
  );

  registerJsonTool(
    server,
    "get_motion_candidate",
    {
      title: "Get Motion Candidate",
      description: MOTION_CANDIDATE_TOOL_DESCRIPTION,
      inputSchema: motionCandidateGetInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    input => getMotionCandidate(input, context)
  );

  registerJsonTool(
    server,
    "apply_motion_candidate",
    {
      title: "Apply Motion Candidate",
      description: MOTION_CANDIDATE_APPLY_TOOL_DESCRIPTION,
      inputSchema: motionCandidateApplyInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    input => applyMotionCandidate(input, context)
  );

  registerJsonTool(
    server,
    "revert_motion_frames",
    {
      title: "Revert Motion Frames",
      description: MOTION_CANDIDATE_REVERT_TOOL_DESCRIPTION,
      inputSchema: motionCandidateRevertInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    input => revertMotionFrames(input, context)
  );

  registerJsonTool(
    server,
    "create_motion_set",
    {
      title: "Create Motion Set",
      description: MOTION_SET_TOOL_DESCRIPTION,
      inputSchema: motionSetCreateObjectSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    input => createMotionSet(input, context)
  );

  registerJsonTool(
    server,
    "get_motion_set",
    {
      title: "Get Motion Set",
      description: MOTION_SET_TOOL_DESCRIPTION,
      inputSchema: motionSetGetInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    input => getMotionSet(input, context)
  );

  registerJsonTool(
    server,
    "list_motion_sets",
    {
      title: "List Motion Sets",
      description: MOTION_SET_TOOL_DESCRIPTION,
      inputSchema: motionSetListInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      }
    },
    input => listMotionSets(input, context)
  );

  registerJsonTool(
    server,
    "export_motion_set",
    {
      title: "Export Motion Set",
      description: MOTION_SET_TOOL_DESCRIPTION,
      inputSchema: motionSetExportInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true
      }
    },
    input => exportMotionSet(input, context)
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
  let parsedInput;
  try {
    parsedInput = motionCreateInputSchema.parse(input);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  const jobId = `motion-job-${Date.now()}-${randomUUID()}`;
  if (context.mock) {
    return {
      ok: true,
      jobId,
      status: "running",
      layoutValidated: false,
      mocked: true
    };
  }

  let jobPath;
  let job;
  try {
    const source = await normalizeMotionSource(parsedInput.source, context);
    const createdAt = Date.now();
    const createdAtIso = new Date(createdAt).toISOString();
    const deadlineIso = new Date(
      createdAt +
        motionGenerationTimeoutMs() * (DEFAULT_MOTION_RETRY_COUNT + 1) +
        MOTION_DEADLINE_BUFFER_MS
    ).toISOString();
    const request = {
      name: parsedInput.name,
      grid: parsedInput.grid,
      source,
      ...(parsedInput.advanced ?? {})
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
      const worker = (context.spawnImpl ?? spawn)(process.execPath, [workerScript, jobId], {
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

    if (parsedInput.waitMs > 0 && job.status === "running") {
      const polled = await getMotion({ jobId, waitMs: parsedInput.waitMs }, context);
      return {
        ok: polled.ok,
        jobId,
        ...(typeof polled.status === "string" ? { status: polled.status } : {}),
        ...(isMotionId(polled.projectId) ? { projectId: polled.projectId } : {}),
        ...(typeof polled.layoutValidated === "boolean"
          ? { layoutValidated: polled.layoutValidated }
          : {}),
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

export async function createVideo(input, context) {
  let parsedInput;
  try {
    parsedInput = videoCreateInputSchema.parse(input);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }

  let sourceImageId;
  try {
    sourceImageId = await resolveVideoSourceImageId(parsedInput.source, parsedInput.name, context);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }

  const jobId = `video-job-${Date.now()}-${randomUUID()}`;
  if (context.mock) {
    return {
      ok: true,
      jobId,
      status: "running",
      sourceImageId,
      mocked: true
    };
  }

  let jobPath;
  let job;
  try {
    const createdAt = Date.now();
    const jobsRoot = await videoDirectory(context, "video-jobs", true);
    jobPath = videoIdPath(jobsRoot, jobId, ".json");
    job = {
      status: "running",
      createdAtIso: new Date(createdAt).toISOString(),
      deadlineIso: new Date(createdAt + videoGenerationTimeoutMs() + VIDEO_DEADLINE_BUFFER_MS).toISOString(),
      ...(parsedInput.name ? { name: parsedInput.name } : {}),
      request: {
        sourceImageId,
        prompt: parsedInput.prompt,
        ...(parsedInput.duration !== undefined ? { duration: parsedInput.duration } : {}),
        ...(parsedInput.resolution ? { resolution: parsedInput.resolution } : {}),
        ...(parsedInput.aspectRatio ? { aspectRatio: parsedInput.aspectRatio } : {}),
        ...(parsedInput.model ? { model: parsedInput.model } : {})
      }
    };
    await atomicWriteJson(jobPath, job);

    try {
      const workerScript = path.join(context.repoRoot, "scripts", "video-worker.mjs");
      const worker = (context.spawnImpl ?? spawn)(process.execPath, [workerScript, jobId], {
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
          reason: `generation-error: unable to start video worker: ${error.message}`,
          finishedAtIso: new Date().toISOString()
        };
        atomicWriteJson(jobPath, failed).catch(() => {});
      });
      worker.unref();
    } catch (error) {
      job = {
        ...job,
        status: "failed",
        reason: `generation-error: unable to start video worker: ${errorMessage(error)}`,
        finishedAtIso: new Date().toISOString()
      };
      await atomicWriteJson(jobPath, job).catch(() => {});
    }

    if (parsedInput.waitMs > 0 && job.status === "running") {
      return {
        ...(await getVideo({ jobId, waitMs: parsedInput.waitMs }, context)),
        sourceImageId
      };
    }
    return { ...videoJobResult(jobId, job), sourceImageId };
  } catch (error) {
    return {
      ok: false,
      reason: errorMessage(error)
    };
  }
}

export async function getVideo(input, context) {
  let parsedInput;
  try {
    parsedInput = videoGetInputSchema.parse(input);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }

  try {
    const waitUntil = Date.now() + parsedInput.waitMs;
    let record = await readVideoJob(parsedInput.jobId, context);
    if (!record) {
      return { ok: false, reason: "unknown jobId" };
    }
    record.job = await applyVideoDeadline(record.job, record.path);

    while (record.job.status === "running" && Date.now() < waitUntil) {
      const deadline = Date.parse(record.job.deadlineIso || "");
      const now = Date.now();
      const untilDeadline = Number.isFinite(deadline) ? Math.max(1, deadline - now + 1) : Infinity;
      const sleepMs = Math.min(VIDEO_POLL_INTERVAL_MS, waitUntil - now, untilDeadline);
      if (sleepMs <= 0) {
        break;
      }
      await delay(sleepMs);
      record = await readVideoJob(parsedInput.jobId, context);
      if (!record) {
        return { ok: false, reason: "unknown jobId" };
      }
      record.job = await applyVideoDeadline(record.job, record.path);
    }

    if (record.job.status !== "ready") {
      return videoJobResult(parsedInput.jobId, record.job);
    }
    return await readyVideoResult(parsedInput.jobId, record.job, record.path, context);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
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

export async function createMotionCandidate(input, context) {
  let parsedInput;
  try {
    parsedInput = motionCandidateCreateInputSchema.parse(input);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  if (context.mock) {
    return {
      ok: true,
      candidateId: "cand-mock",
      status: parsedInput.mode === "upload" ? "ready" : "pending",
      mocked: true
    };
  }

  let frames;
  let baseUrl;
  try {
    frames = await Promise.all(
      parsedInput.frames.map(frame => normalizeMotionCandidateFrame(frame, context))
    );
    ({ baseUrl } = await findMotionServer(context.fetchImpl));
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }

  const url = `${baseUrl}/api/motion/projects/${encodeURIComponent(parsedInput.projectId)}/candidates`;
  let candidate;
  try {
    const body = await fetchMotionCandidateJson(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: parsedInput.mode,
          frames,
          ...(parsedInput.instruction !== undefined ? { instruction: parsedInput.instruction } : {}),
          ...(parsedInput.protect !== undefined ? { protect: parsedInput.protect } : {})
        })
      },
      context
    );
    candidate = readMotionCandidateResponse(body, parsedInput.projectId);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }

  if (parsedInput.waitMs > 0 && isMotionCandidatePolling(candidate.status)) {
    const polled = await getMotionCandidateAtBaseUrl(
      parsedInput.projectId,
      candidate.id,
      parsedInput.waitMs,
      baseUrl,
      context
    );
    return {
      ok: polled.ok,
      candidateId: candidate.id,
      ...(typeof polled.status === "string" ? { status: polled.status } : {}),
      ...(typeof polled.reason === "string" ? { reason: polled.reason } : {})
    };
  }
  return { ok: true, candidateId: candidate.id, status: candidate.status };
}

export async function getMotionCandidate(input, context) {
  let parsedInput;
  try {
    parsedInput = motionCandidateGetInputSchema.parse(input);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  if (context.mock) {
    return {
      ok: true,
      status: "pending",
      reason: null,
      frames: [],
      metrics: null,
      requiresReview: false,
      reviewReasons: [],
      mocked: true
    };
  }

  let baseUrl;
  try {
    ({ baseUrl } = await findMotionServer(context.fetchImpl));
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  return await getMotionCandidateAtBaseUrl(
    parsedInput.projectId,
    parsedInput.candidateId,
    parsedInput.waitMs,
    baseUrl,
    context
  );
}

export async function applyMotionCandidate(input, context) {
  let parsedInput;
  try {
    parsedInput = motionCandidateApplyInputSchema.parse(input);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  if (context.mock) {
    return {
      ok: true,
      projectId: parsedInput.projectId,
      overriddenFrames: parsedInput.frames ?? [],
      paths: motionCandidateProjectPaths(parsedInput.projectId, parsedInput.frames ?? [], context),
      mocked: true
    };
  }

  try {
    const { baseUrl } = await findMotionServer(context.fetchImpl);
    const url = `${baseUrl}/api/motion/projects/${encodeURIComponent(parsedInput.projectId)}/candidates/${encodeURIComponent(parsedInput.candidateId)}/apply`;
    const body = await fetchMotionCandidateJson(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(parsedInput.frames === undefined ? {} : { frames: parsedInput.frames }),
          ...(parsedInput.force === undefined ? {} : { force: parsedInput.force }),
          ...(parsedInput.allowContentLoss === undefined
            ? {}
            : { allowContentLoss: parsedInput.allowContentLoss }),
          ...(parsedInput.intentionalEmptyFrames === undefined
            ? {}
            : { intentionalEmptyFrames: parsedInput.intentionalEmptyFrames }),
          ...(parsedInput.maxLostPixels === undefined
            ? {}
            : { maxLostPixels: parsedInput.maxLostPixels })
        })
      },
      context
    );
    return motionCandidateProjectResult(body, parsedInput.projectId, "overriddenFrames", context);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
}

export async function revertMotionFrames(input, context) {
  let parsedInput;
  try {
    parsedInput = motionCandidateRevertInputSchema.parse(input);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  if (context.mock) {
    return {
      ok: true,
      projectId: parsedInput.projectId,
      remainingOverrides: [],
      mocked: true
    };
  }

  try {
    const { baseUrl } = await findMotionServer(context.fetchImpl);
    const url = `${baseUrl}/api/motion/projects/${encodeURIComponent(parsedInput.projectId)}/revert`;
    const body = await fetchMotionCandidateJson(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsedInput.frames === undefined ? {} : { frames: parsedInput.frames })
      },
      context
    );
    return motionCandidateProjectResult(body, parsedInput.projectId, "remainingOverrides", context);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
}

async function normalizeMotionCandidateFrame(frame, context) {
  const [image, mask] = await Promise.all([
    normalizeMotionCandidateSource(frame.imageDataUrl, frame.imagePath, "imagePath", context),
    normalizeMotionCandidateSource(frame.maskDataUrl, frame.maskPath, "maskPath", context)
  ]);
  return {
    index: frame.index,
    ...(image ? { image: image.dataUrl } : {}),
    ...(mask ? { mask: mask.dataUrl } : {})
  };
}

async function normalizeMotionCandidateSource(dataUrl, imagePath, fieldName, context) {
  if (dataUrl) {
    return await normalizeMotionSource({ type: "upload", dataUrl }, context);
  }
  if (!imagePath) return null;

  const resolvedPath = await resolveMotionUploadPath(imagePath, context);
  const realRepoRoot = await fs.realpath(context.repoRoot);
  assertPathInside(realRepoRoot, resolvedPath, `${fieldName} must stay inside repoRoot`);
  return await normalizeMotionSource({ type: "upload", imagePath: resolvedPath }, context);
}

async function getMotionCandidateAtBaseUrl(projectId, candidateId, waitMs, baseUrl, context) {
  const url = `${baseUrl}/api/motion/projects/${encodeURIComponent(projectId)}/candidates/${encodeURIComponent(candidateId)}`;
  try {
    const readCandidate = async () => {
      const body = await fetchMotionCandidateJson(url, { method: "GET" }, context);
      return readMotionCandidateResponse(body, projectId, candidateId);
    };
    const waitUntil = Date.now() + waitMs;
    let candidate = await readCandidate();
    while (isMotionCandidatePolling(candidate.status) && Date.now() < waitUntil) {
      const sleepMs = Math.min(MOTION_CANDIDATE_POLL_INTERVAL_MS, waitUntil - Date.now());
      if (sleepMs <= 0) break;
      await delay(sleepMs);
      candidate = await readCandidate();
    }
    return await motionCandidateLookupResult(candidate, projectId, context);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
}

async function fetchMotionCandidateJson(url, options, context) {
  const response = await context.fetchImpl(url, options);
  const text = await response.text();
  const body = text ? parseJson(text, `Invalid JSON response from ${url}`) : {};
  if (!response.ok) {
    throw new Error(
      typeof body?.reason === "string"
        ? body.reason
        : `${response.status} ${response.statusText || "motion candidate request failed"}`
    );
  }
  return body;
}

function readMotionCandidateResponse(body, projectId, expectedCandidateId) {
  const candidate = body?.candidate;
  if (
    body?.ok !== true ||
    !candidate ||
    !isMotionCandidateId(candidate.id) ||
    candidate.projectId !== projectId ||
    (expectedCandidateId !== undefined && candidate.id !== expectedCandidateId) ||
    !MOTION_CANDIDATE_STATUSES.has(candidate.status) ||
    !Array.isArray(candidate.frames)
  ) {
    throw new Error("motion candidate response was incomplete");
  }
  return candidate;
}

function isMotionCandidatePolling(status) {
  return status === "pending" || status === "running";
}

async function motionCandidateLookupResult(candidate, projectId, context) {
  const frameIndices = candidate.frames.map(frame => {
    if (!Number.isInteger(frame?.index) || frame.index < 0) {
      throw new Error("motion candidate response included an invalid frame index");
    }
    return frame.index;
  });
  const result = {
    ok: true,
    status: candidate.status,
    reason: typeof candidate.reason === "string" ? candidate.reason : null,
    frames: frameIndices.map(index => ({ index })),
    metrics: candidate.metrics ?? null,
    requiresReview: candidate.requiresReview === true,
    reviewReasons: Array.isArray(candidate.reviewReasons) ? candidate.reviewReasons : []
  };
  if (candidate.status !== "ready") return result;

  result.frames = await Promise.all(
    frameIndices.map(async index => {
      return {
        index,
        path: await resolveMotionCandidateFramePath(projectId, candidate.id, index, context)
      };
    })
  );
  return result;
}

async function resolveMotionCandidateFramePath(projectId, candidateId, index, context) {
  const assetsRoot = await motionDirectory(context, "motion-assets", false);
  if (!assetsRoot) throw new Error("motion-assets directory does not exist");
  const projectDirectory = await realMotionCandidateChildDirectory(
    assetsRoot,
    projectId,
    "motion project directory must stay inside motion-assets"
  );
  const candidatesDirectory = await realMotionCandidateChildDirectory(
    projectDirectory,
    "candidates",
    "motion candidates directory must stay inside its project"
  );
  const candidateDirectory = await realMotionCandidateChildDirectory(
    candidatesDirectory,
    candidateId,
    "motion candidate directory must stay inside candidates"
  );
  const framesDirectory = await realMotionCandidateChildDirectory(
    candidateDirectory,
    "frames",
    "motion candidate frames directory must stay inside its candidate"
  );
  const fileName = `f${String(index + 1).padStart(2, "0")}.png`;
  const candidatePath = path.resolve(framesDirectory, fileName);
  if (path.dirname(candidatePath) !== framesDirectory) {
    throw new Error("motion candidate frame path must stay inside candidate frames");
  }
  const stat = await fs.lstat(candidatePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("motion candidate frame must be a regular, non-symbolic-link file");
  }
  const realPath = await fs.realpath(candidatePath);
  if (path.dirname(realPath) !== framesDirectory) {
    throw new Error("motion candidate frame symlink escapes candidate frames");
  }
  return realPath;
}

async function realMotionCandidateChildDirectory(parent, name, message) {
  const directory = path.resolve(parent, name);
  if (path.dirname(directory) !== path.resolve(parent)) throw new Error(message);
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(message);
  const [realParent, realDirectory] = await Promise.all([fs.realpath(parent), fs.realpath(directory)]);
  if (path.dirname(realDirectory) !== realParent) throw new Error(message);
  return realDirectory;
}

function motionCandidateProjectPaths(projectId, frameIndices, context) {
  const assetsRoot = path.resolve(context.dataRoot, "motion-assets");
  const projectDirectory = path.resolve(assetsRoot, projectId);
  assertPathInside(assetsRoot, projectDirectory, "motion project path must stay inside motion-assets");
  return {
    sheet: path.join(projectDirectory, "derived", "sheet.png"),
    frames: frameIndices.map(index =>
      path.join(projectDirectory, "derived", "frames", `f${String(index + 1).padStart(2, "0")}.png`)
    )
  };
}

function motionCandidateProjectResult(body, projectId, key, context) {
  if (
    body?.ok !== true ||
    !body?.project ||
    body.project.id !== projectId ||
    !Array.isArray(body.project.frames)
  ) {
    throw new Error("motion candidate project response was incomplete");
  }
  const frameIndices = [];
  const projectFrameIndices = [];
  for (const frame of body.project.frames) {
    if (!Number.isInteger(frame?.index) || frame.index < 0) {
      throw new Error("motion candidate project response included an invalid frame index");
    }
    projectFrameIndices.push(frame.index);
    if (frame.override) frameIndices.push(frame.index);
  }
  return {
    ok: true,
    projectId,
    [key]: frameIndices,
    ...(key === "overriddenFrames"
      ? { paths: motionCandidateProjectPaths(projectId, projectFrameIndices, context) }
      : {})
  };
}

function isMotionCandidateId(value) {
  return typeof value === "string" && MOTION_CANDIDATE_ID_RE.test(value);
}

export async function createMotionSet(input, context) {
  let parsedInput;
  try {
    parsedInput = motionSetCreateInputSchema.parse(input);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }

  let referenceImage;
  try {
    referenceImage = parsedInput.base.reference
      ? await normalizeMotionSetReference(parsedInput.base.reference, context)
      : null;
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }

  if (context.mock) {
    return {
      ok: true,
      setId: "motion-set-mock",
      status: parsedInput.start === false ? "pending" : "running",
      members: parsedInput.members.map(member => ({ action: member.action, status: "pending" })),
      mocked: true
    };
  }

  let baseUrl;
  try {
    ({ baseUrl } = await findMotionServer(context.fetchImpl));
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }

  const { reference: _reference, ...base } = parsedInput.base;
  const requestBody = {
    name: parsedInput.name,
    base: {
      ...base,
      ...(referenceImage ? { referenceImage: referenceImage.dataUrl } : {})
    },
    common: parsedInput.common,
    members: parsedInput.members,
    ...(parsedInput.start === undefined ? {} : { start: parsedInput.start })
  };
  const url = `${baseUrl}/api/motion/sets`;
  let body;
  let response;
  try {
    response = await context.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    const text = await response.text();
    body = text ? parseJson(text, `Invalid JSON response from ${url}`) : {};
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason:
        typeof body?.reason === "string"
          ? body.reason
          : `${response.status} ${response.statusText || "motion set creation failed"}`
    };
  }
  const set = body?.set;
  if (
    body?.ok !== true ||
    !set ||
    typeof set.id !== "string" ||
    typeof set.status !== "string" ||
    !Array.isArray(set.members)
  ) {
    return { ok: false, reason: "motion set response was incomplete" };
  }
  const members = set.members.map(member => ({
    action: member?.action,
    status: member?.status
  }));
  if (members.some(member => typeof member.action !== "string" || typeof member.status !== "string")) {
    return { ok: false, reason: "motion set response was incomplete" };
  }
  return { ok: true, setId: set.id, status: set.status, members };
}

export async function getMotionSet(input, context) {
  let parsedInput;
  try {
    parsedInput = motionSetGetInputSchema.parse(input);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  if (context.mock) {
    return { ok: true, setId: parsedInput.setId, status: "pending", members: [], mocked: true };
  }

  let baseUrl;
  try {
    ({ baseUrl } = await findMotionServer(context.fetchImpl));
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  const url = `${baseUrl}/api/motion/sets/${encodeURIComponent(parsedInput.setId)}`;
  let body;
  let response;
  try {
    response = await context.fetchImpl(url, { method: "GET" });
    const text = await response.text();
    body = text ? parseJson(text, `Invalid JSON response from ${url}`) : {};
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason:
        typeof body?.reason === "string"
          ? body.reason
          : `${response.status} ${response.statusText || "motion set lookup failed"}`
    };
  }
  const set = body?.set;
  if (
    body?.ok !== true ||
    !set ||
    typeof set.id !== "string" ||
    typeof set.status !== "string" ||
    !Array.isArray(set.members)
  ) {
    return { ok: false, reason: "motion set response was incomplete" };
  }

  try {
    const members = await Promise.all(
      set.members.map(async member => {
        if (!member || typeof member.action !== "string" || typeof member.status !== "string") {
          throw new Error("motion set response was incomplete");
        }
        const projectId = typeof member.projectId === "string" ? member.projectId : null;
        const result = {
          action: member.action,
          status: member.status,
          projectId,
          reason: typeof member.reason === "string" ? member.reason : null
        };
        if (member.status === "ready" && projectId) {
          return { ...result, ...(await readMotionSetProjectMetrics(projectId, context)) };
        }
        return result;
      })
    );
    return { ok: true, setId: set.id, status: set.status, members };
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
}

export async function listMotionSets(input, context) {
  try {
    motionSetListInputSchema.parse(input ?? {});
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  if (context.mock) return { ok: true, sets: [], mocked: true };

  let baseUrl;
  try {
    ({ baseUrl } = await findMotionServer(context.fetchImpl));
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  const url = `${baseUrl}/api/motion/sets`;
  let body;
  let response;
  try {
    response = await context.fetchImpl(url, { method: "GET" });
    const text = await response.text();
    body = text ? parseJson(text, `Invalid JSON response from ${url}`) : {};
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason:
        typeof body?.reason === "string"
          ? body.reason
          : `${response.status} ${response.statusText || "motion set list failed"}`
    };
  }
  if (body?.ok !== true || !Array.isArray(body.sets)) {
    return { ok: false, reason: "motion set list response was incomplete" };
  }
  return body;
}

export async function exportMotionSet(input, context) {
  let parsedInput;
  try {
    parsedInput = motionSetExportInputSchema.parse(input);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  if (context.mock) {
    return { ok: true, mocked: true, setId: parsedInput.setId };
  }

  let baseUrl;
  try {
    ({ baseUrl } = await findMotionServer(context.fetchImpl));
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  const searchParams = new URLSearchParams({ gif: parsedInput.includeGif ? "1" : "0" });
  if (parsedInput.gifFps !== undefined) searchParams.set("fps", String(parsedInput.gifFps));
  const url = `${baseUrl}/api/motion/sets/${encodeURIComponent(parsedInput.setId)}/export-file?${searchParams}`;
  let response;
  try {
    response = await context.fetchImpl(url, { method: "GET" });
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  if (!response.ok) {
    let body = null;
    try {
      const text = await response.text();
      body = text ? parseJson(text, `Invalid JSON response from ${url}`) : {};
    } catch (error) {
      return { ok: false, reason: errorMessage(error) };
    }
    return {
      ok: false,
      reason:
        typeof body?.reason === "string"
          ? body.reason
          : `${response.status} ${response.statusText || "motion set export failed"}`
    };
  }

  let persisted;
  try {
    persisted = await persistMotionSetExport(response, parsedInput.setId, context);
  } catch (error) {
    return { ok: false, reason: errorMessage(error) };
  }
  const result = {
    ok: true,
    setId: parsedInput.setId,
    zipPath: persisted.zipPath,
    bytes: persisted.bytes,
    sha256: persisted.sha256,
    gifIncluded: parsedInput.includeGif
  };
  if (parsedInput.asBase64) {
    try {
      const encoded = await readMotionExportBase64(persisted.zipPath);
      if (encoded.base64) result.base64 = encoded.base64;
      else result.base64Skipped = encoded.base64Skipped;
    } catch (error) {
      result.base64Skipped = errorMessage(error);
    }
  }
  if (parsedInput.destPath) {
    try {
      result.copiedTo = await copyMotionExport(persisted.zipPath, parsedInput.destPath, context);
    } catch (error) {
      result.destPathRejected = errorMessage(error);
    }
  }
  return result;
}

async function normalizeMotionSetReference(reference, context) {
  if (reference.type === "upload") {
    return await normalizeMotionSource(reference, context);
  }
  const imagePath = await resolveMotionSetImageIdPath(reference.imageId, context);
  const buffer = await readMotionSetImageIdBuffer(imagePath);
  const mimeType = detectMotionImageMime(buffer);
  if (mimeType) {
    const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    assertMotionDataUrlSize(dataUrl);
    return { type: "upload", dataUrl };
  }
  const normalizedPng = await sharp(buffer).png().toBuffer();
  const dataUrl = `data:image/png;base64,${normalizedPng.toString("base64")}`;
  assertMotionDataUrlSize(dataUrl);
  return { type: "upload", dataUrl };
}

async function readMotionSetImageIdBuffer(imagePath) {
  let handle;
  try {
    handle = await fs.open(imagePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error("imageId source must be a regular, non-symbolic-link file");
    }
    if (stat.size > MOTION_UPLOAD_MAX_BYTES) {
      throw new Error("imageId source exceeds the 8MB limit");
    }
    const buffer = await handle.readFile();
    if (buffer.byteLength > MOTION_UPLOAD_MAX_BYTES) {
      throw new Error("imageId source exceeds the 8MB limit");
    }
    return buffer;
  } catch (error) {
    if (error?.code === "ELOOP") {
      throw new Error("imageId source must be a regular, non-symbolic-link file");
    }
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function resolveMotionSetImageIdPath(imageId, context) {
  const imagesRoot = path.resolve(context.dataRoot, "images");
  assertPathInside(path.resolve(context.dataRoot), imagesRoot, "image lookup must stay inside dataRoot");
  try {
    await assertDirectoryNotSymlink(imagesRoot);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`imageId was not found: ${imageId}`);
    throw error;
  }
  const realImagesRoot = await fs.realpath(imagesRoot);
  const buckets = await fs.readdir(imagesRoot, { withFileTypes: true });
  for (const bucket of buckets) {
    if (!bucket.isDirectory() || bucket.isSymbolicLink()) continue;
    const bucketDirectory = path.resolve(imagesRoot, bucket.name);
    await assertDirectoryNotSymlink(bucketDirectory);
    const realBucketDirectory = await fs.realpath(bucketDirectory);
    assertPathInside(realImagesRoot, realBucketDirectory, "image bucket symlink escapes dataRoot");
    for (const extension of ["png", "jpg", "jpeg", "webp"]) {
      const candidate = path.resolve(bucketDirectory, `${imageId}.${extension}`);
      if (path.dirname(candidate) !== bucketDirectory) continue;
      try {
        const stat = await fs.lstat(candidate);
        if (!stat.isFile() || stat.isSymbolicLink()) continue;
        const realCandidate = await fs.realpath(candidate);
        if (path.dirname(realCandidate) !== realBucketDirectory) continue;
        return realCandidate;
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
    }
  }
  throw new Error(`imageId was not found: ${imageId}`);
}

async function readMotionSetProjectMetrics(projectId, context) {
  if (!isMotionId(projectId)) throw new Error("ready motion set member has an invalid projectId");
  const assetsRoot = await motionDirectory(context, "motion-assets", false);
  if (!assetsRoot) throw new Error("motion-assets directory does not exist");
  const directory = motionIdPath(assetsRoot, projectId);
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
  if (project.id !== projectId) throw new Error("motion project id does not match its directory");
  const repeatedRows = Array.isArray(project.duplicateDetection?.rows)
    ? project.duplicateDetection.rows.flatMap((row, index) => (row?.repeated === true ? [index] : []))
    : [];
  const mirroredRows = Array.isArray(project.mirrorDetection?.rows)
    ? project.mirrorDetection.rows.flatMap((row, index) => (row?.mirrored === true ? [index] : []))
    : [];
  const effectiveFrames = Array.isArray(project.frames)
    ? project.frames.filter(frame => frame?.excluded !== true).length
    : 0;
  return { effectiveFrames, repeatedRows, mirroredRows };
}

async function persistMotionSetExport(response, setId, context) {
  if (!response.body) throw new Error("motion set export response did not include ZIP data");
  const exportsRoot = await motionDirectory(context, "motion-exports", true);
  const fileId = `${setId}-${Date.now()}-${randomUUID()}`;
  const zipPath = motionIdPath(exportsRoot, fileId, ".zip");
  let handle;
  let created = false;
  try {
    handle = await fs.open(
      zipPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600
    );
    created = true;
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of Readable.fromWeb(response.body)) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      let offset = 0;
      while (offset < buffer.byteLength) {
        const { bytesWritten } = await handle.write(buffer, offset, buffer.byteLength - offset);
        if (bytesWritten < 1) throw new Error("motion set export write made no progress");
        offset += bytesWritten;
      }
      bytes += buffer.byteLength;
      hash.update(buffer);
    }
    if (bytes < 1) throw new Error("motion set export response contained an empty ZIP");
    return { zipPath, bytes, sha256: hash.digest("hex") };
  } catch (error) {
    if (created) await fs.unlink(zipPath).catch(() => {});
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
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

async function resolveVideoSourceImageId(source, name, context) {
  if (source.type === "imageId") {
    return source.imageId;
  }
  const upload = await readVideoUploadSource(source, context);
  return await registerVideoUploadImage(upload, name, context);
}

async function readVideoUploadSource(source, context) {
  if (source.dataUrl) {
    assertMotionDataUrlSize(source.dataUrl);
    const encoded = source.dataUrl.slice(source.dataUrl.indexOf(",") + 1);
    const buffer = Buffer.from(encoded, "base64");
    if (!detectMotionImageMime(buffer)) {
      throw new Error("source.dataUrl must contain a PNG or JPEG image");
    }
    return { buffer, originalFileName: "upload.png" };
  }

  const imagePath = await resolveMotionUploadPath(source.imagePath, context);
  const realRepoRoot = await fs.realpath(context.repoRoot);
  assertPathInside(realRepoRoot, imagePath, "source.imagePath must stay inside repoRoot");
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
  if (!detectMotionImageMime(buffer)) {
    throw new Error("source.imagePath must contain a PNG or JPEG image");
  }
  return { buffer, originalFileName: path.basename(imagePath) };
}

async function registerVideoUploadImage(upload, name, context) {
  const normalizedPng = await sharp(upload.buffer).png().toBuffer();
  const metadata = await sharp(normalizedPng).metadata();
  if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) {
    throw new Error("uploaded image dimensions could not be determined");
  }
  const thumbnail = await sharp(normalizedPng)
    .resize({
      width: IMAGE_UPLOAD_THUMBNAIL_MAX_SIZE,
      height: IMAGE_UPLOAD_THUMBNAIL_MAX_SIZE,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: IMAGE_UPLOAD_THUMBNAIL_QUALITY })
    .toBuffer();
  const imagesRoot = await videoDirectory(context, "images", true);
  const bucket = monthBucket(new Date());
  const bucketDirectory = await imageUploadBucketDirectory(imagesRoot, bucket);
  const id = createImageUploadId();
  const imagePath = videoIdPath(bucketDirectory, id, ".png");
  const metadataPath = videoIdPath(bucketDirectory, id, ".json");
  const thumbnailPath = videoIdPath(bucketDirectory, id, ".thumb.webp");
  const sidecar = {
    mode: "upload",
    source: "mcp-video-upload",
    rawPrompt: name || "video source upload",
    createdAtIso: new Date().toISOString(),
    width: metadata.width,
    height: metadata.height,
    originalFileName: path.basename(upload.originalFileName)
  };

  await atomicWriteFile(imagePath, normalizedPng);
  await atomicWriteFile(metadataPath, `${JSON.stringify(sidecar, null, 2)}\n`);
  await atomicWriteFile(thumbnailPath, thumbnail);
  return id;
}

async function imageUploadBucketDirectory(imagesRoot, bucket) {
  const directory = path.resolve(imagesRoot, bucket);
  assertPathInside(imagesRoot, directory, "image upload bucket must stay inside data/images");
  await fs.mkdir(directory, { recursive: true });
  await assertDirectoryNotSymlink(directory);
  const realImagesRoot = await fs.realpath(imagesRoot);
  const realDirectory = await fs.realpath(directory);
  assertPathInside(realImagesRoot, realDirectory, "image upload bucket symlink escapes data/images");
  return directory;
}

function createImageUploadId() {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(0, 19);
}

function monthBucket(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
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
    layoutValidated: false,
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
  const layoutValidated =
    typeof project.layoutValidated === "boolean"
      ? project.layoutValidated
      : project.sliceMode === "auto";
  const projectWithLayoutValidated = { ...project, layoutValidated };
  const { sliceConfidence: projectSliceConfidence, ...projectWithoutSliceConfidence } =
    projectWithLayoutValidated;
  const responseProject = layoutValidated ? projectWithLayoutValidated : projectWithoutSliceConfidence;
  const mirroredRows = Array.isArray(project.mirrorDetection?.rows)
    ? project.mirrorDetection.rows.flatMap((row, index) => (row?.mirrored === true ? [index] : []))
    : [];
  const repeatedRows = Array.isArray(project.duplicateDetection?.rows)
    ? project.duplicateDetection.rows.flatMap((row, index) => (row?.repeated === true ? [index] : []))
    : [];
  const excludedFrames = Array.isArray(project.duplicateDetection?.excludedFrames)
    ? project.duplicateDetection.excludedFrames.filter(index => Number.isInteger(index) && index >= 0)
    : [];
  const frameCount = Array.isArray(project.frames) ? project.frames.length : 0;
  const frames = Array.from({ length: frameCount }, (_, index) =>
    path.join(directory, "derived", "frames", `f${String(index + 1).padStart(2, "0")}.png`)
  );
  return {
    ok: true,
    jobId,
    status: "ready",
    projectId: job.projectId,
    project: responseProject,
    layoutValidated,
    mirrorDetection: { mirroredRows },
    duplicateDetection: { repeatedRows, excludedFrames },
    paths: {
      dir: directory,
      sheet: path.join(directory, "derived", "sheet.png"),
      frames,
      project: projectPath
    },
    ...(layoutValidated && typeof job.sliceConfidence === "number"
      ? { sliceConfidence: job.sliceConfidence }
      : layoutValidated && typeof projectSliceConfidence === "number"
        ? { sliceConfidence: projectSliceConfidence }
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
  await atomicWriteFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function atomicWriteFile(target, contents) {
  const directory = path.dirname(target);
  await assertDirectoryNotSymlink(directory);
  const temp = path.join(directory, `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, contents, { flag: "wx" });
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

async function videoDirectory(context, name, create) {
  const dataRoot = path.resolve(context.dataRoot);
  const directory = path.resolve(dataRoot, name);
  assertPathInside(dataRoot, directory, "video data path must stay inside dataRoot");
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
  assertPathInside(realDataRoot, realDirectory, "video data symlink escapes dataRoot");
  return directory;
}

function videoIdPath(root, id, suffix = "") {
  if (!isVideoId(id)) {
    throw new Error("video id must contain only letters, numbers, underscores, and hyphens");
  }
  const candidate = path.resolve(root, `${id}${suffix}`);
  if (path.dirname(candidate) !== path.resolve(root)) {
    throw new Error("video path must stay inside its storage directory");
  }
  return candidate;
}

function isVideoId(value) {
  return typeof value === "string" && VIDEO_ID_RE.test(value);
}

async function readVideoJob(jobId, context) {
  const jobsRoot = await videoDirectory(context, "video-jobs", false);
  if (!jobsRoot) {
    return null;
  }
  const jobPath = videoIdPath(jobsRoot, jobId, ".json");
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
    throw new Error("video job file must be a regular, non-symbolic-link file");
  }
  return {
    path: jobPath,
    job: await readJsonFile(jobPath)
  };
}

async function applyVideoDeadline(job, jobPath) {
  const deadline = Date.parse(job?.deadlineIso || "");
  if (job?.status !== "running") {
    return job;
  }
  if (!Number.isFinite(deadline)) {
    return await failVideoJob(
      jobPath,
      job,
      "timed out (invalid or missing deadlineIso); refusing to leave job running"
    );
  }
  if (Date.now() <= deadline) {
    return job;
  }
  return await failVideoJob(
    jobPath,
    job,
    "timed out (deadline exceeded); worker may have died — retry create_video"
  );
}

async function failVideoJob(jobPath, job, reason, extra = {}) {
  const failed = {
    ...job,
    status: "failed",
    reason,
    ...extra,
    finishedAtIso: new Date().toISOString()
  };
  await atomicWriteJson(jobPath, failed).catch(() => {});
  return failed;
}

function videoJobResult(jobId, job) {
  const status = job?.status === "running" || job?.status === "ready" || job?.status === "failed"
    ? job.status
    : "failed";
  return {
    ok: true,
    jobId,
    status,
    ...(typeof job?.reason === "string"
      ? { reason: job.reason }
      : status === "failed" && job?.status !== "failed"
        ? { reason: "invalid video job status" }
        : {})
  };
}

async function readyVideoResult(jobId, job, jobPath, context) {
  try {
    const video = await inspectReadyVideo(job, context);
    if (typeof job.bytes === "number" && job.bytes !== video.bytes) {
      throw new Error("video file size does not match the completed job record");
    }
    if (typeof job.sha256 === "string" && job.sha256 !== video.sha256) {
      throw new Error("video file sha256 does not match the completed job record");
    }
    return {
      ok: true,
      jobId,
      status: "ready",
      videoPath: video.videoPath,
      bytes: video.bytes,
      contentType: typeof job.contentType === "string" && job.contentType.trim()
        ? job.contentType
        : "video/mp4",
      sha256: video.sha256
    };
  } catch (error) {
    const failed = await failVideoJob(
      jobPath,
      job,
      `result-validation-error: ${errorMessage(error)}`
    );
    return videoJobResult(jobId, failed);
  }
}

async function inspectReadyVideo(job, context) {
  if (typeof job?.videoPath !== "string" || !path.isAbsolute(job.videoPath)) {
    throw new Error("ready video job has no absolute videoPath");
  }
  const videosRoot = await videoDirectory(context, "videos", false);
  if (!videosRoot) {
    throw new Error("videos directory does not exist");
  }
  const videoPath = path.resolve(job.videoPath);
  assertPathInside(videosRoot, videoPath, "videoPath must stay inside data/videos");
  // dataRoot 상위의 OS 심링크(/var 등)는 정당하므로 전체 조상 검사 대신
  // videos 루트 실경로 기준 봉쇄만 확인한다. 최종 파일은 O_NOFOLLOW가 막는다.
  const realVideosRoot = await fs.realpath(videosRoot);
  const realVideoDir = await fs.realpath(path.dirname(videoPath));
  assertPathInside(realVideosRoot, realVideoDir, "videoPath symlink escapes data/videos");
  let handle;
  try {
    handle = await fs.open(videoPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error("videoPath must be a non-empty regular, non-symbolic-link file");
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
      throw new Error("videoPath changed while it was being verified");
    }
    return { videoPath, bytes, sha256: hash.digest("hex") };
  } catch (error) {
    if (error?.code === "ELOOP") {
      throw new Error("videoPath must be a regular, non-symbolic-link file");
    }
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function videoGenerationTimeoutMs() {
  const parsed = Number(process.env.SIONBANANA_VIDEO_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_VIDEO_GENERATION_TIMEOUT_MS;
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
