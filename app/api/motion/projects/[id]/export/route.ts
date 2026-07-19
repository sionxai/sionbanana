import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";

import { buildExportBundle, sanitizeExportFilename } from "@/lib/motion/export";
import { MotionStorageError, readProject } from "@/lib/motion/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportRouteContext = { params: { id: string } };

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

export async function GET(
  request: NextRequest,
  { params }: ExportRouteContext
): Promise<Response> {
  let cleanupOnce = async (): Promise<void> => undefined;
  try {
    const gifQuery = request.nextUrl.searchParams.get("gif");
    if (gifQuery !== null && gifQuery !== "0" && gifQuery !== "1") {
      throw new InvalidExportQueryError("gif must be either 0 or 1.");
    }
    const gifFps = parsePositiveInteger(request.nextUrl.searchParams.get("fps"));
    const project = await readProject(params.id);
    const bundle = await buildExportBundle(project, {
      includeGif: gifQuery !== "0",
      ...(gifFps === undefined ? {} : { gifFps })
    });
    let cleanupTask: Promise<void> | null = null;
    cleanupOnce = () => {
      if (!cleanupTask) cleanupTask = bundle.cleanup();
      return cleanupTask;
    };

    const zipStat = await fs.stat(bundle.zipPath);
    const source = createReadStream(bundle.zipPath);
    const scheduleCleanup = () => {
      void cleanupOnce().catch(error => {
        console.error("Motion export cleanup error", error);
      });
    };
    source.once("close", scheduleCleanup);
    source.once("error", scheduleCleanup);

    try {
      const stream = Readable.toWeb(source) as ReadableStream;
      const safeName = sanitizeExportFilename(project.name, project.id);
      return new Response(stream, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": String(zipStat.size),
          "Content-Disposition": `attachment; filename="${safeName}-motion.zip"`,
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      source.destroy();
      throw error;
    }
  } catch (error) {
    await cleanupOnce().catch(cleanupError => {
      console.error("Motion export cleanup error", cleanupError);
    });
    if (error instanceof InvalidExportQueryError) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
    }
    if (error instanceof MotionStorageError) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: error.status });
    }
    console.error("/api/motion/projects/[id]/export GET error", error);
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Unable to export motion assets." },
      { status: 500 }
    );
  }
}
