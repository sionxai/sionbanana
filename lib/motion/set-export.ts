import "server-only";

import { execFile } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import sharp from "sharp";

import { buildMotionExportReview, type MotionExportReview } from "@/lib/motion/export";
import { MOTION_ACTION_PRESETS } from "@/lib/motion/prompt";
import type { MotionSet, MotionSetMember } from "@/lib/motion/set-types";
import { projectDir, readProject } from "@/lib/motion/storage";
import type { Frame, MotionProject } from "@/lib/motion/types";

const execFileAsync = promisify(execFile);
const ZIP_PATH = "/usr/bin/zip";
const FFMPEG_PATH = "/opt/homebrew/bin/ffmpeg";

type SetExportOptions = {
  includeGif?: boolean;
  gifFps?: number;
  gifScale?: number;
};

type ExportedMember = {
  member: MotionSetMember;
  project: MotionProject;
  frames: Frame[];
  pivotX: number;
  groundY: number;
  offsetX: number;
  offsetY: number;
};

function frameFileName(index: number): string {
  return `f${String(index + 1).padStart(2, "0")}.png`;
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot calculate a median for zero frames.");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
}

function commandFailureMessage(error: unknown): string {
  const failure = error as { message?: unknown; stderr?: unknown };
  const stderr = Buffer.isBuffer(failure?.stderr)
    ? failure.stderr.toString("utf8")
    : typeof failure?.stderr === "string"
      ? failure.stderr
      : "";
  if (stderr.trim()) return stderr.trim();
  return typeof failure?.message === "string" ? failure.message : String(error);
}

function warningSummary(error: unknown): string {
  return commandFailureMessage(error).replace(/\s+/g, " ").slice(0, 180);
}

async function generatePreviewGif(input: {
  framesDirectory: string;
  outputPath: string;
  scratchDirectory: string;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  scale: number;
}): Promise<void> {
  await fs.access(FFMPEG_PATH, fsConstants.X_OK);
  const effectiveScale = Math.min(input.scale, 512 / Math.max(input.frameWidth, input.frameHeight));
  const outputWidth = Math.max(1, Math.round(input.frameWidth * effectiveScale));
  const outputHeight = Math.max(1, Math.round(input.frameHeight * effectiveScale));
  const sequencePattern = path.join(input.framesDirectory, "f%02d.png");
  const palettePath = path.join(input.scratchDirectory, "palette.png");
  const scaleFilter = `scale=${outputWidth}:${outputHeight}:flags=lanczos`;

  await execFileAsync(
    FFMPEG_PATH,
    [
      "-y",
      "-framerate",
      String(input.fps),
      "-start_number",
      "1",
      "-i",
      sequencePattern,
      "-vf",
      `${scaleFilter},palettegen=reserve_transparent=1`,
      "-frames:v",
      "1",
      palettePath
    ],
    { maxBuffer: 4 * 1024 * 1024 }
  );
  await execFileAsync(
    FFMPEG_PATH,
    [
      "-y",
      "-framerate",
      String(input.fps),
      "-start_number",
      "1",
      "-i",
      sequencePattern,
      "-i",
      palettePath,
      "-lavfi",
      `${scaleFilter}[scaled];[scaled][1:v]paletteuse=alpha_threshold=128`,
      "-loop",
      "0",
      input.outputPath
    ],
    { maxBuffer: 4 * 1024 * 1024 }
  );
}

function buildReadme(input: {
  frameWidth: number;
  frameHeight: number;
  actionCount: number;
  frameCount: number;
  gifWarnings: string[];
}): string {
  const lines = [
    "Sion Banana Motion Set Export",
    "Authoritative runtime assets: sprite-sheet.png + animation.json.",
    `Frame size: ${input.frameWidth}x${input.frameHeight}px; actions: ${input.actionCount}; exported frames: ${input.frameCount}.`,
    "Each action occupies one row in sprite-sheet.png; empty cells are transparent.",
    "Frames share a common ground line while preserving their original per-frame vertical motion.",
    "Fractional pivots use outward integer canvas bounds and nearest-pixel placement.",
    "Scale normalization is not applied; see animation.json meta.sizeReport before combining differently sized characters.",
    "Individual aligned transparent PNG frames are available under frames/<action>/.",
    "preview-<action>.gif files are for preview and sharing, not runtime playback."
  ];
  for (const warning of input.gifWarnings) lines.push(`GIF warning: ${warning}`);
  return `${lines.join("\n")}\n`;
}

function readyMembers(set: MotionSet): Array<MotionSetMember & { projectId: string }> {
  return set.members.filter(
    (member): member is MotionSetMember & { projectId: string } =>
      member.status === "ready" && typeof member.projectId === "string" && member.projectId.length > 0
  );
}

async function readExportedMembers(set: MotionSet): Promise<ExportedMember[]> {
  const members = readyMembers(set);
  if (members.length === 0) {
    throw new Error("Motion set export requires at least one ready member.");
  }
  return Promise.all(
    members.map(async member => {
      const project = await readProject(member.projectId);
      const frames = project.frames.filter(frame => !frame.excluded);
      if (frames.length === 0) {
        throw new Error(`Motion set export requires at least one non-excluded frame for ${member.action}.`);
      }
      return {
        member,
        project,
        frames,
        pivotX: frames[0].pivot.x,
        groundY: median(frames.map(frame => frame.pivot.y)),
        offsetX: 0,
        offsetY: 0
      };
    })
  );
}

export async function buildSetExportBundle(
  set: MotionSet,
  opts: SetExportOptions = {}
): Promise<{ zipPath: string; cleanup: () => Promise<void> }> {
  const includeGif = opts.includeGif ?? true;
  const gifScale = opts.gifScale ?? 1;
  if (includeGif && (!Number.isFinite(gifScale) || gifScale <= 0)) {
    throw new RangeError("gifScale must be greater than zero.");
  }

  const exportedMembers = await readExportedMembers(set);
  const left = Math.ceil(Math.max(...exportedMembers.map(member => member.pivotX)));
  const right = Math.ceil(
    Math.max(...exportedMembers.map(member => member.project.canvas.w - member.pivotX))
  );
  const top = Math.ceil(Math.max(...exportedMembers.map(member => member.groundY)));
  const bottom = Math.ceil(
    Math.max(...exportedMembers.map(member => member.project.canvas.h - member.groundY))
  );
  const frameWidth = left + right;
  const frameHeight = top + bottom;
  if (frameWidth < 1 || frameHeight < 1) {
    throw new Error("Motion set export calculated an invalid shared canvas.");
  }
  for (const member of exportedMembers) {
    // Sharp requires integer placement. Ceil extents plus nearest offsets keep every source canvas in bounds.
    member.offsetX = Math.round(left - member.pivotX);
    member.offsetY = Math.round(top - member.groundY);
  }

  const safeSetId = set.id.replace(/[^A-Za-z0-9-]/g, "-").slice(0, 80) || "motion-set";
  const tempRoot = await fs.mkdtemp(path.join(tmpdir(), `sionbanana-motion-set-${safeSetId}-`));
  let cleanupPromise: Promise<void> | null = null;
  const cleanup = (): Promise<void> => {
    if (!cleanupPromise) cleanupPromise = fs.rm(tempRoot, { recursive: true, force: true });
    return cleanupPromise;
  };

  try {
    const bundleDirectory = path.join(tempRoot, "bundle");
    const framesRoot = path.join(bundleDirectory, "frames");
    await fs.mkdir(framesRoot, { recursive: true });

    const aligned = await Promise.all(
      exportedMembers.map(async member => {
        const actionFramesDirectory = path.join(framesRoot, member.member.action);
        await fs.mkdir(actionFramesDirectory, { recursive: true });
        const sourceDirectory = path.join(projectDir(member.project.id), "derived", "frames");
        const buffers = await Promise.all(
          member.frames.map(async (frame, index) => {
            const input = await fs.readFile(path.join(sourceDirectory, frameFileName(frame.index)));
            const buffer = await sharp({
              create: {
                width: frameWidth,
                height: frameHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
              }
            })
              .composite([{ input, left: member.offsetX, top: member.offsetY }])
              .png()
              .toBuffer();
            await fs.writeFile(path.join(actionFramesDirectory, frameFileName(index)), buffer, { flag: "wx" });
            return buffer;
          })
        );
        return { member, buffers, actionFramesDirectory };
      })
    );

    const sheetColumns = Math.max(...aligned.map(action => action.buffers.length));
    const composites = aligned.flatMap((action, row) =>
      action.buffers.map((input, column) => ({
        input,
        left: column * frameWidth,
        top: row * frameHeight
      }))
    );
    const sheetBuffer = await sharp({
      create: {
        width: sheetColumns * frameWidth,
        height: aligned.length * frameHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite(composites)
      .png()
      .toBuffer();
    await fs.writeFile(path.join(bundleDirectory, "sprite-sheet.png"), sheetBuffer, { flag: "wx" });

    let nextIndex = 0;
    const sourceProjectIds: Record<string, string> = {};
    const sizeReport: Record<string, { frameHeightMedian: number }> = {};
    const review: Record<string, MotionExportReview> = {};
    const frames: Array<{
      index: number;
      x: number;
      y: number;
      w: number;
      h: number;
      pivot: { x: number; y: number };
      action: MotionSetMember["action"];
      durationMs: number | null;
    }> = [];
    const animations = aligned.map((action, row) => {
      const indices: number[] = [];
      const firstFrameIndex = nextIndex;
      for (const [column, frame] of action.member.frames.entries()) {
        const index = nextIndex++;
        indices.push(index);
        frames.push({
          index,
          x: column * frameWidth,
          y: row * frameHeight,
          w: frameWidth,
          h: frameHeight,
          pivot: { x: left, y: top },
          action: action.member.member.action,
          durationMs: frame.durationMs
        });
      }
      const preset = MOTION_ACTION_PRESETS[action.member.member.action];
      const animation = action.member.project.animations[0];
      sourceProjectIds[action.member.member.action] = action.member.project.id;
      sizeReport[action.member.member.action] = {
        frameHeightMedian: median(action.member.frames.map(frame => frame.trim.h))
      };
      review[action.member.member.action] = buildMotionExportReview(
        action.member.project,
        action.member.frames,
        firstFrameIndex
      );
      return {
        name: action.member.member.action,
        label: preset.label,
        frames: indices,
        fps: animation?.fps ?? set.common.fps,
        loop: animation?.loop ?? preset.defaultLoop
      };
    });
    await fs.writeFile(
      path.join(bundleDirectory, "animation.json"),
      `${JSON.stringify(
        {
          name: set.name,
          image: "sprite-sheet.png",
          frameWidth,
          frameHeight,
          frames,
          animations,
          meta: {
            generator: "sionbanana-motion-set",
            createdAtIso: new Date().toISOString(),
            sourceSetId: set.id,
            sourceProjectIds,
            sizeReport,
            review,
            requiresReview: Object.values(review).some(value => value.requiresReview)
          }
        },
        null,
        2
      )}\n`,
      { encoding: "utf8", flag: "wx" }
    );

    const gifWarnings: string[] = [];
    const previewEntries: string[] = [];
    if (includeGif) {
      for (const action of aligned) {
        const fps = opts.gifFps ?? action.member.project.animations[0]?.fps ?? set.common.fps;
        assertPositiveInteger(fps, "gifFps");
        const fileName = `preview-${action.member.member.action}.gif`;
        const scratchDirectory = path.join(tempRoot, `gif-${action.member.member.action}`);
        await fs.mkdir(scratchDirectory, { recursive: true });
        try {
          await generatePreviewGif({
            framesDirectory: action.actionFramesDirectory,
            outputPath: path.join(bundleDirectory, fileName),
            scratchDirectory,
            frameWidth,
            frameHeight,
            fps,
            scale: gifScale
          });
          previewEntries.push(fileName);
        } catch (error) {
          gifWarnings.push(
            `${action.member.member.action} preview was omitted because ffmpeg was unavailable or failed: ${warningSummary(error)}`
          );
          await fs.rm(path.join(bundleDirectory, fileName), { force: true });
        } finally {
          await fs.rm(scratchDirectory, { recursive: true, force: true });
        }
      }
    }

    await fs.writeFile(
      path.join(bundleDirectory, "README.txt"),
      buildReadme({
        frameWidth,
        frameHeight,
        actionCount: aligned.length,
        frameCount: frames.length,
        gifWarnings
      }),
      { encoding: "utf8", flag: "wx" }
    );

    const zipPath = path.join(tempRoot, `${safeSetId}-motion-set.zip`);
    try {
      await execFileAsync(
        ZIP_PATH,
        ["-q", "-0", "-r", zipPath, "sprite-sheet.png", "animation.json", "frames", "README.txt", ...previewEntries],
        { cwd: bundleDirectory, maxBuffer: 4 * 1024 * 1024 }
      );
    } catch (error) {
      throw new Error(`Unable to create motion set export ZIP: ${commandFailureMessage(error)}`);
    }
    return { zipPath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
