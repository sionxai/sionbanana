import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { ADMIN_UID } from "@/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { targetUid, deltaImages } = (await req.json()) as { targetUid: string; deltaImages: number };
    if (!targetUid || typeof deltaImages !== "number" || Number.isNaN(deltaImages)) {
      return NextResponse.json({ error: "invalid params" }, { status: 400 });
    }

    const ref = getAdminDb().collection("users").doc(targetUid);
    await getAdminDb().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new Error("user doc missing");
      }
      const current = snap.data() as { quota?: { imagesRemaining?: number } };
      const remain = current.quota?.imagesRemaining ?? 0;
      const next = Math.max(0, remain + deltaImages);
      tx.update(ref, {
        "quota.imagesRemaining": next,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
