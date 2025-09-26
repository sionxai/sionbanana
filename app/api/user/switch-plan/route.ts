import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { PLANS } from "@/lib/constants";
import { startOfNextMonthUTC } from "@/lib/entitlements";

export async function POST(req: NextRequest) {
  try {
    const { planId } = await req.json();
    if (!planId || !PLANS[planId as keyof typeof PLANS]) {
      return NextResponse.json({ error: "invalid planId" }, { status: 400 });
    }

    const authorization = req.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "no token" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const ref = getAdminDb().collection("users").doc(decoded.uid);

    const selectedPlanId = planId as keyof typeof PLANS;
    const isFree = selectedPlanId === "guest";
    const updates: Record<string, unknown> = {
      "plan.requestedId": selectedPlanId,
      "plan.requestedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    if (isFree) {
      updates["plan.id"] = "guest";
      updates["plan.activated"] = true;
      updates["quota.imagesRemaining"] = PLANS.guest.monthlyImages;
      updates["quota.resetsAt"] = startOfNextMonthUTC();
    } else {
      updates["plan.activated"] = false;
    }

    await ref.set(updates, { merge: true });
    return NextResponse.json({
      ok: true,
      message: isFree ? "게스트로 활성화" : "플랜 변경 요청 완료(관리자 승인 대기)"
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
