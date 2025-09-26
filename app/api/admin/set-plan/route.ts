import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { ADMIN_UID, PLANS } from "@/lib/constants";
import { startOfNextMonthUTC } from "@/lib/entitlements";

type PlanId = keyof typeof PLANS;

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { targetUid, planId } = (await req.json()) as { targetUid: string; planId: PlanId };
    if (!targetUid || !planId || !PLANS[planId]) {
      return NextResponse.json({ error: "invalid params" }, { status: 400 });
    }

    const base = PLANS[planId];
    await getAdminDb()
      .collection("users")
      .doc(targetUid)
      .set(
        {
          plan: {
            id: planId,
            activated: true,
            requestedId: planId,
            requestedAt: FieldValue.serverTimestamp()
          },
          quota: {
            imagesRemaining: base.monthlyImages,
            resetsAt: startOfNextMonthUTC()
          },
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
