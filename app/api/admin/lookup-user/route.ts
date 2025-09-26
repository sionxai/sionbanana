import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { ADMIN_UID } from "@/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { targetUid } = (await req.json()) as { targetUid?: string };
    if (!targetUid) {
      return NextResponse.json({ error: "missing targetUid" }, { status: 400 });
    }

    const snap = await getAdminDb().collection("users").doc(targetUid).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ uid: targetUid, ...snap.data() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
