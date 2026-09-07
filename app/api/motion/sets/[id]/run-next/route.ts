import { NextRequest, NextResponse } from "next/server";

import { POST as createMotionProject } from "@/app/api/motion/projects/route";
import {
  MotionSetStorageError,
  runNextMember
} from "@/lib/motion/set-storage";
import { rebuildProject } from "@/lib/motion/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown): Response {
  if (error instanceof MotionSetStorageError) {
    return NextResponse.json({ ok: false, reason: error.message }, { status: error.status });
  }
  console.error("/api/motion/sets/[id]/run-next POST error", error);
  return NextResponse.json(
    { ok: false, reason: error instanceof Error ? error.message : "Unknown motion set error." },
    { status: 500 }
  );
}

async function createProjectInProcess(
  request: NextRequest,
  body: object
): Promise<{ status: number; body: unknown }> {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const projectRequest = new NextRequest(new URL("/api/motion/projects", request.nextUrl.origin), {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const response = await createMotionProject(projectRequest);
  let result: unknown = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }
  return { status: response.status, body: result };
}

export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
): Promise<Response> {
  try {
    const result = await runNextMember(context.params.id, {
      createProject: body => createProjectInProcess(request, body),
      rebuildProject
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
