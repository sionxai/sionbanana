import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { ADMIN_UID } from "@/lib/constants";

const DURATIONS = { "10m": 10 * 60 * 1000, "1h": 60 * 60 * 1000, "2h": 2 * 60 * 60 * 1000 } as const;

type PassKind = keyof typeof DURATIONS;

export async function POST(req: NextRequest) {
  try {
    const { targetUid, kind } = (await req.json()) as { targetUid: string; kind: PassKind };
    if (!targetUid || !kind || !DURATIONS[kind]) {
      return NextResponse.json({ error: "invalid params" }, { status: 400 });
    }

    const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const expiresAt = new Date(Date.now() + DURATIONS[kind]);
    await getAdminDb()
      .collection("users")
      .doc(targetUid)
      .set(
        {
          tempPass: { kind, expiresAt: Timestamp.fromDate(expiresAt), issuedBy: decoded.uid },
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUid = searchParams.get("uid");
    if (!targetUid) {
      return NextResponse.json({ error: "missing uid" }, { status: 400 });
    }

    const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    await getAdminDb()
      .collection("users")
      .doc(targetUid)
      .set(
        {
          tempPass: { kind: null, expiresAt: null, issuedBy: decoded.uid }
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
