import "server-only";

import { execFile } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { packSheet } from "@/lib/motion/engine";
import { projectDir } from "@/lib/motion/storage";
import type { MotionProject } from "@/lib/motion/types";

const execFileAsync = promisify(execFile);
const ZIP_PATH = "/usr/bin/zip";
const FFMPEG_PATH = "/opt/homebrew/bin/ffmpeg";

type ExportOptions = {
  includeGif?: boolean;
  gifFps?: number;
  gifScale?: number;
};

type ExportAnimation = {
  name: string;
  frames: number[];
  fps: number;
  loop: "loop" | "pingpong" | "once";
};

type ExportJson = {
  name: string;
  image: "sprite-sheet.png";
  frameWidth: number;
  frameHeight: number;
  frames: Array<{
    index: number;
    x: number;
    y: number;
    w: number;
    h: number;
    pivot: { x: number; y: number };
    durationMs: number | null;
  }>;
  animations: ExportAnimation[];
  meta: {
    generator: "sionbanana-motion";
    createdAtIso: string;
    sourceProjectId: string;
  };
};

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .match(/[A-Za-z0-9]+/g)
    ?.join("-")
    .toLowerCase() ?? "";
}

export function sanitizeExportFilename(value: string, fallback: string): string {
  return (slug(value) || slug(fallback) || "motion-export").slice(0, 80);
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
}

function frameFileName(index: number): string {
  return `f${String(index + 1).padStart(2, "0")}.png`;
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

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildCss(input: {
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  sheetWidth: number;
  sheetHeight: number;
  fps: number;
  loop: ExportAnimation["loop"];
}): string {
  const seconds = Number((input.frameCount / input.fps).toFixed(4));
  const iteration =
    input.loop === "once" ? "1 forwards" : input.loop === "pingpong" ? "infinite alternate" : "infinite";
  return `/* Add class="motion-sprite" to an empty element; keep sprite-sheet.png beside this file. */
.motion-sprite {
  width: ${input.frameWidth}px;
  height: ${input.frameHeight}px;
  background-image: url("./sprite-sheet.png");
  background-repeat: no-repeat;
  background-size: ${input.sheetWidth}px ${input.sheetHeight}px;
  animation: motion-sprite ${seconds}s steps(${input.frameCount}) ${iteration};
}

@keyframes motion-sprite {
  from { background-position: 0 0; }
  to { background-position: -${input.sheetWidth}px 0; }
}
`;
}

function buildJavaScript(fallbackFps: number): string {
  return `// Add <canvas id="motion-canvas"></canvas>, then load this file from the exported folder.
(async () => {
  const canvas = document.querySelector("#motion-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const data = await fetch("./animation.json").then(response => {
    if (!response.ok) throw new Error("Unable to load animation.json");
    return response.json();
  });
  const image = new Image();
  image.src = data.image;
  await image.decode();
  const fallback = {
    frames: data.frames.map(frame => frame.index),
    fps: ${fallbackFps},
    loop: "loop"
  };
  const requestedName = canvas.dataset.animation;
  const animation =
    data.animations.find(candidate => candidate.name === requestedName) ??
    data.animations[0] ??
    fallback;
  if (animation.frames.length === 0) return;
  canvas.width = data.frameWidth;
  canvas.height = data.frameHeight;
  const context = canvas.getContext("2d");
  if (!context) return;
  const startedAt = performance.now();
  const sequenceIndex = elapsedFrames => {
    const count = animation.frames.length;
    if (animation.loop === "once") return Math.min(elapsedFrames, count - 1);
    if (animation.loop === "pingpong" && count > 1) {
      const span = count * 2 - 2;
      const position = elapsedFrames % span;
      return position < count ? position : span - position;
    }
    return elapsedFrames % count;
  };
  const draw = now => {
    const elapsedFrames = Math.floor((now - startedAt) / (1000 / animation.fps));
    const frame = data.frames[animation.frames[sequenceIndex(elapsedFrames)]];
    if (!frame) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    if (animation.loop !== "once" || elapsedFrames < animation.frames.length - 1) {
      requestAnimationFrame(draw);
    }
  };
  requestAnimationFrame(draw);
})().catch(error => console.error("Motion playback failed:", error));
`;
}

function buildReadme(input: {
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  animationName: string;
  gifWarning?: string;
}): string {
  const lines = [
    "Sion Banana Motion Export",
    "Authoritative runtime assets: sprite-sheet.png + animation.json.",
    "preview.gif is only for preview and sharing, not runtime playback.",
    `Frame size: ${input.frameWidth}x${input.frameHeight}px; exported frames: ${input.frameCount}.`,
    `Primary animation: ${singleLine(input.animationName)}; default FPS: ${input.fps}.`,
    "CSS: load snippet.css and add class=\"motion-sprite\" to an empty element.",
    "JavaScript: add canvas id=\"motion-canvas\" and load snippet.js from this folder.",
    "Individual normalized transparent PNG frames are available under frames/."
  ];
  if (input.gifWarning) lines.push(`GIF warning: ${input.gifWarning}`);
  return `${lines.join("\n")}\n`;
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
  const effectiveScale = Math.min(
    input.scale,
    512 / Math.max(input.frameWidth, input.frameHeight)
  );
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

export async function buildExportBundle(
  project: MotionProject,
  opts: ExportOptions
): Promise<{ zipPath: string; cleanup: () => Promise<void> }> {
  const includeGif = opts.includeGif ?? true;
  const playbackFps = project.animations[0]?.fps ?? 12;
  const gifFps = opts.gifFps ?? playbackFps;
  const gifScale = opts.gifScale ?? 1;
  if (includeGif) {
    assertPositiveInteger(gifFps, "gifFps");
    if (!Number.isFinite(gifScale) || gifScale <= 0) {
      throw new RangeError("gifScale must be greater than zero.");
    }
  }

  const safeProjectId = sanitizeExportFilename(project.id, "project");
  const tempRoot = await fs.mkdtemp(
    path.join(tmpdir(), `sionbanana-motion-${safeProjectId.slice(0, 48)}-`)
  );
  let cleanupPromise: Promise<void> | null = null;
  const cleanup = (): Promise<void> => {
    if (!cleanupPromise) cleanupPromise = fs.rm(tempRoot, { recursive: true, force: true });
    return cleanupPromise;
  };

  try {
    const includedFrames = project.frames.filter(frame => !frame.excluded);
    if (includedFrames.length === 0) {
      throw new Error("Motion export requires at least one non-excluded frame.");
    }

    const bundleDirectory = path.join(tempRoot, "bundle");
    const framesDirectory = path.join(bundleDirectory, "frames");
    const gifScratchDirectory = path.join(tempRoot, "gif-work");
    await fs.mkdir(framesDirectory, { recursive: true });

    const sourceDirectory = path.join(projectDir(project.id), "derived", "frames");
    const frameBuffers = await Promise.all(
      includedFrames.map(frame =>
        fs.readFile(path.join(sourceDirectory, frameFileName(frame.index)))
      )
    );
    await Promise.all(
      frameBuffers.map((buffer, index) =>
        fs.writeFile(path.join(framesDirectory, frameFileName(index)), buffer, { flag: "wx" })
      )
    );

    const packed = await packSheet(frameBuffers, { cols: frameBuffers.length, padding: 0 });
    const frameWidth = packed.rects[0].w;
    const frameHeight = packed.rects[0].h;
    const sheetWidth = frameWidth * frameBuffers.length;
    const sheetHeight = frameHeight;
    await fs.writeFile(path.join(bundleDirectory, "sprite-sheet.png"), packed.buf, { flag: "wx" });

    const remappedIndices = new Map(
      includedFrames.map((frame, index) => [frame.index, index] as const)
    );
    const animations: ExportAnimation[] = project.animations.map(animation => ({
      name: animation.name,
      frames: animation.frameIndices.flatMap(index => {
        const remapped = remappedIndices.get(index);
        return remapped === undefined ? [] : [remapped];
      }),
      fps: animation.fps,
      loop: animation.loop
    }));
    const exportJson: ExportJson = {
      name: project.name,
      image: "sprite-sheet.png",
      frameWidth,
      frameHeight,
      frames: includedFrames.map((frame, index) => ({
        index,
        ...packed.rects[index],
        pivot: { x: Math.round(frame.pivot.x), y: Math.round(frame.pivot.y) },
        durationMs: frame.durationMs
      })),
      animations,
      meta: {
        generator: "sionbanana-motion",
        createdAtIso: new Date().toISOString(),
        sourceProjectId: project.id
      }
    };
    await fs.writeFile(
      path.join(bundleDirectory, "animation.json"),
      `${JSON.stringify(exportJson, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" }
    );

    const primaryAnimation = animations[0];
    await Promise.all([
      fs.writeFile(
        path.join(bundleDirectory, "snippet.css"),
        buildCss({
          frameWidth,
          frameHeight,
          frameCount: includedFrames.length,
          sheetWidth,
          sheetHeight,
          fps: playbackFps,
          loop: primaryAnimation?.loop ?? "loop"
        }),
        { encoding: "utf8", flag: "wx" }
      ),
      fs.writeFile(path.join(bundleDirectory, "snippet.js"), buildJavaScript(playbackFps), {
        encoding: "utf8",
        flag: "wx"
      })
    ]);

    let gifWarning: string | undefined;
    if (includeGif) {
      await fs.mkdir(gifScratchDirectory, { recursive: true });
      try {
        await generatePreviewGif({
          framesDirectory,
          outputPath: path.join(bundleDirectory, "preview.gif"),
          scratchDirectory: gifScratchDirectory,
          frameWidth,
          frameHeight,
          fps: gifFps,
          scale: gifScale
        });
      } catch (error) {
        gifWarning = `preview.gif was omitted because ffmpeg was unavailable or failed: ${warningSummary(error)}`;
        await fs.rm(path.join(bundleDirectory, "preview.gif"), { force: true });
      } finally {
        await fs.rm(gifScratchDirectory, { recursive: true, force: true });
      }
    }

    await fs.writeFile(
      path.join(bundleDirectory, "README.txt"),
      buildReadme({
        frameWidth,
        frameHeight,
        frameCount: includedFrames.length,
        fps: playbackFps,
        animationName: primaryAnimation?.name ?? project.name,
        gifWarning
      }),
      { encoding: "utf8", flag: "wx" }
    );

    const entries = [
      "sprite-sheet.png",
      "animation.json",
      "frames",
      "snippet.css",
      "snippet.js",
      "README.txt",
      ...(includeGif && !gifWarning ? ["preview.gif"] : [])
    ];
    const zipPath = path.join(tempRoot, `${safeProjectId}-motion.zip`);
    try {
      await execFileAsync(ZIP_PATH, ["-q", "-0", "-r", zipPath, ...entries], {
        cwd: bundleDirectory,
        maxBuffer: 4 * 1024 * 1024
      });
    } catch (error) {
      throw new Error(`Unable to create motion export ZIP: ${commandFailureMessage(error)}`);
    }

    return { zipPath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
