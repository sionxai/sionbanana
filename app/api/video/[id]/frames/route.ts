import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveVideoPath } from "@/lib/local/storage";
import { keyColorForSubject, subjectTypeValues } from "@/lib/motion/matte-color";
import { matteSpecSchema } from "@/lib/motion/types";
import {
  analyzeVideoFrames, buildContactSheet, selectFrameIndices, selectVideoRange, VideoFramesError
} from "@/lib/motion/video-frames";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  mode: z.enum(["loop", "oneshot"]).default("loop"),
  count: z.coerce.number().int().min(2).max(24).default(8),
  subjectType: z.enum(subjectTypeValues).default("character"),
  contact: z.enum(["0", "1"]).default("1")
}).strict();

export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<Response> {
  try {
    const id = z.string().regex(/^[A-Za-z0-9_-]+$/).parse(params.id);
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const videoPath = await resolveVideoPath(id);
    if (!videoPath) throw new VideoFramesError("VIDEO_NOT_FOUND", "Stored video was not found.");
    const matte = matteSpecSchema.parse({ mode: "keyColor", keyColor: keyColorForSubject(query.subjectType).hex });
    const analysis = await analyzeVideoFrames({ videoPath, matte });
    try {
      let suggested = null;
      try {
        const range = selectVideoRange({ ...analysis, mode: query.mode });
        const frameIndices = selectFrameIndices({ frameCount: analysis.probe.frameCount, count: query.count, mode: query.mode, range });
        suggested = {
          mode: query.mode, range, frameIndices,
          derivedFps: Math.max(1, Math.min(60, Math.round(query.count * analysis.probe.fps / (range.end - range.start))))
        };
      } catch (error) {
        if (!(error instanceof VideoFramesError) || error.code !== "NO_MOTION") throw error;
      }
      const contactSheet = query.contact === "1"
        ? `data:image/png;base64,${(await buildContactSheet(analysis.framePaths)).toString("base64")}` : null;
      return NextResponse.json({
        ok: true, video: analysis.probe,
        loop: analysis.loop ? { period: analysis.loop.period, start: analysis.loop.start, closureError: analysis.loop.closureError } : null,
        segment: analysis.segment ? { start: analysis.segment.start, end: analysis.segment.end } : null,
        suggested, contactSheet
      });
    } finally {
      await analysis.cleanup();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, reason: error.issues[0]?.message ?? "Invalid request.", issues: error.issues }, { status: 400 });
    }
    if (error instanceof VideoFramesError) {
      return NextResponse.json({ ok: false, reason: error.message, code: error.code }, { status: error.status });
    }
    console.error("/api/video/[id]/frames GET error", error);
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Unknown video frame error." }, { status: 500 });
  }
}
