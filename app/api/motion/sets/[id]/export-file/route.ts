import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";

import { sanitizeExportFilename } from "@/lib/motion/export";
import { buildSetExportBundle } from "@/lib/motion/set-export";
import { MotionSetStorageError, readSet } from "@/lib/motion/set-storage";

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

function parsePositiveScale(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (!/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/.test(value)) {
    throw new InvalidExportQueryError("scale must be a positive number.");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidExportQueryError("scale must be greater than zero.");
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
    const gifScale = parsePositiveScale(request.nextUrl.searchParams.get("scale"));
    const motionSet = await readSet(params.id);
    if (!motionSet.members.some(member => member.status === "ready" && member.projectId)) {
      return NextResponse.json(
        { ok: false, reason: "Motion set export requires at least one ready member." },
        { status: 409 }
      );
    }
    const bundle = await buildSetExportBundle(motionSet, {
      includeGif: gifQuery !== "0",
      ...(gifFps === undefined ? {} : { gifFps }),
      ...(gifScale === undefined ? {} : { gifScale })
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
        console.error("Motion set export cleanup error", error);
      });
    };
    source.once("close", scheduleCleanup);
    source.once("error", scheduleCleanup);

    try {
      const stream = Readable.toWeb(source) as ReadableStream;
      const safeName = sanitizeExportFilename(motionSet.name, motionSet.id);
      return new Response(stream, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": String(zipStat.size),
          "Content-Disposition": `attachment; filename="${safeName}-motion-set.zip"`,
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      source.destroy();
      throw error;
    }
  } catch (error) {
    await cleanupOnce().catch(cleanupError => {
      console.error("Motion set export cleanup error", cleanupError);
    });
    if (error instanceof InvalidExportQueryError) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
    }
    if (error instanceof MotionSetStorageError) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: error.status });
    }
    console.error("/api/motion/sets/[id]/export-file GET error", error);
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Unable to export motion set assets." },
      { status: 500 }
    );
  }
}
