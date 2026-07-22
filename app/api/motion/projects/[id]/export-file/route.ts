import { createHash } from "node:crypto";
import { constants as fsConstants, createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { getDataDir } from "@/lib/local/storage";
import { buildExportBundle, sanitizeExportFilename } from "@/lib/motion/export";
import { MotionStorageError, readProject } from "@/lib/motion/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportFileRouteContext = { params: { id: string } };

class InvalidExportQueryError extends Error {}

function parsePositiveInteger(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new InvalidExportQueryError("fps must be a positive integer.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new InvalidExportQueryError("fps must be a safe positive integer.");
  }
  return parsed;
}

function assertPathInside(root: string, candidate: string, message: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(message);
  }
}

async function assertRegularDirectory(directory: string): Promise<void> {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${directory} must be a regular, non-symbolic-link directory`);
  }
}

async function motionExportsRoot(): Promise<string> {
  const dataRoot = path.resolve(getDataDir());
  const exportsRoot = path.resolve(dataRoot, "motion-exports");
  assertPathInside(dataRoot, exportsRoot, "motion export path must stay inside dataRoot");

  await fs.mkdir(dataRoot, { recursive: true });
  await assertRegularDirectory(dataRoot);
  await fs.mkdir(exportsRoot, { recursive: true });
  await assertRegularDirectory(exportsRoot);

  const realDataRoot = await fs.realpath(dataRoot);
  const realExportsRoot = await fs.realpath(exportsRoot);
  assertPathInside(realDataRoot, realExportsRoot, "motion exports symlink escapes dataRoot");
  return realExportsRoot;
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function persistExport(zipPath: string, projectId: string): Promise<{
  zipPath: string;
  bytes: number;
  sha256: string;
}> {
  const exportsRoot = await motionExportsRoot();
  const safeProjectId = sanitizeExportFilename(projectId, "project");
  const destination = path.resolve(exportsRoot, `${safeProjectId}-${Date.now()}.zip`);
  if (path.dirname(destination) !== exportsRoot) {
    throw new Error("motion export file must stay inside motion-exports");
  }

  let copied = false;
  try {
    await fs.copyFile(zipPath, destination, fsConstants.COPYFILE_EXCL);
    copied = true;
    const stat = await fs.lstat(destination);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("persisted motion export must be a regular, non-symbolic-link file");
    }
    return {
      zipPath: destination,
      bytes: stat.size,
      sha256: await sha256File(destination)
    };
  } catch (error) {
    if (copied) await fs.unlink(destination).catch(() => undefined);
    throw error;
  }
}

export async function GET(
  request: NextRequest,
  { params }: ExportFileRouteContext
): Promise<Response> {
  try {
    const gifQuery = request.nextUrl.searchParams.get("gif");
    if (gifQuery !== null && gifQuery !== "0" && gifQuery !== "1") {
      throw new InvalidExportQueryError("gif must be either 0 or 1.");
    }
    const gifFps = parsePositiveInteger(request.nextUrl.searchParams.get("fps"));
    const includeGif = gifQuery !== "0";
    const project = await readProject(params.id);
    const bundle = await buildExportBundle(project, {
      includeGif,
      ...(gifFps === undefined ? {} : { gifFps })
    });

    try {
      const persisted = await persistExport(bundle.zipPath, project.id);
      return NextResponse.json({
        ok: true,
        ...persisted,
        gifIncluded: includeGif
      });
    } finally {
      await bundle.cleanup();
    }
  } catch (error) {
    if (error instanceof InvalidExportQueryError) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
    }
    if (error instanceof MotionStorageError) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: error.status });
    }
    console.error("/api/motion/projects/[id]/export-file GET error", error);
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Unable to export motion assets." },
      { status: 500 }
    );
  }
}
