import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { MissingServiceAccountKeyError, getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { ADMIN_UID, PLANS, type PlanId } from "@/lib/constants";

const requestSchema = z.object({
  targetUid: z.string().min(1),
  planId: z.enum(["guest", "basic", "deluxe", "premium"])
});

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "no token" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);

    // 관리자 권한 확인
    if (decoded.uid !== ADMIN_UID) {
      const adminRef = getAdminDb().collection("users").doc(decoded.uid);
      const adminSnap = await adminRef.get();
      const adminData = adminSnap.data();

      if (!adminData || adminData.role !== "admin") {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }
    }

    const { targetUid, planId } = requestSchema.parse(await req.json());

    // 대상 사용자 확인
    const targetRef = getAdminDb().collection("users").doc(targetUid);
    const targetSnap = await targetRef.get();

    if (!targetSnap.exists) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    const targetData = targetSnap.data()!;
    const plan = PLANS[planId];

    if (!plan && planId !== "guest") {
      return NextResponse.json({ error: "유효하지 않은 플랜입니다." }, { status: 400 });
    }

    // 플랜 직접 변경 (요청 없이)
    const updateData: any = {
      "plan.id": planId,
      "plan.activated": planId !== "guest", // guest plans are not "activated"
      "plan.requestedId": null,
      "plan.requestReason": null,
      "plan.requestUsage": null,
      "plan.changedAt": FieldValue.serverTimestamp(),
      "plan.changedBy": decoded.uid,
      updatedAt: FieldValue.serverTimestamp()
    };

    // Only set quota for non-guest plans
    if (plan) {
      updateData["quota.imagesRemaining"] = plan.monthlyImages;
      updateData["quota.resetsAt"] = FieldValue.serverTimestamp();
      updateData["quota.monthlyImages"] = plan.monthlyImages;
      updateData["quota.monthlyCredits"] = plan.monthlyCredits;
    }

    await targetRef.update(updateData);

    // 변경 로그 저장
    await getAdminDb().collection("planChanges").add({
      userId: targetUid,
      userEmail: targetData.email || null,
      userName: targetData.displayName || null,
      previousPlan: targetData.plan?.id || "guest",
      newPlan: planId,
      changedBy: decoded.uid,
      changedAt: FieldValue.serverTimestamp(),
      type: "direct_change",
      credits: plan?.monthlyCredits || 0
    });

    const planName = plan?.name || "게스트";

    return NextResponse.json({
      ok: true,
      message: `플랜이 ${planName}로 변경되었습니다.`,
      targetUser: {
        uid: targetUid,
        email: targetData.email,
        displayName: targetData.displayName
      },
      newPlan: {
        id: planId,
        name: planName,
        credits: plan?.monthlyCredits || 0
      }
    });

  } catch (error: any) {
    if (error instanceof MissingServiceAccountKeyError) {
      return NextResponse.json({ error: "missing service account" }, { status: 500 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }

    console.error("change plan error", error);
    return NextResponse.json({ error: error.message || "플랜 변경에 실패했습니다." }, { status: 500 });
  }
}