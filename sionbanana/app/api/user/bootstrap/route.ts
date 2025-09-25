import { NextRequest, NextResponse } from "next/server";
import { MissingServiceAccountKeyError, getAdminAuth } from "@/lib/firebase/admin";
import { ensureUserDoc } from "@/lib/entitlements";

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "no token" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const user = await getAdminAuth().getUser(decoded.uid);
    await ensureUserDoc(decoded.uid, user.email ?? undefined, user.displayName ?? undefined);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof MissingServiceAccountKeyError) {
      return NextResponse.json({ error: "missing service account" }, { status: 500 });
    }

    console.error("bootstrap error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
