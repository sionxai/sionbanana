import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { MissingServiceAccountKeyError, getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { PLANS, type PlanId } from "@/lib/constants";

const requestSchema = z.object({
  planId: z.enum(["basic", "deluxe", "premium"]),
  reason: z.string().min(1, "신청 사유를 입력해주세요.").max(500),
  usage: z.string().min(1, "사용 목적을 입력해주세요.").max(500)
});

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "no token" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);
    const { planId, reason, usage } = requestSchema.parse(await req.json());

    // 현재 사용자 정보 확인
    const userRef = getAdminDb().collection("users").doc(decoded.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    const userData = userSnap.data()!;
    const currentPlanId = userData.plan?.id;

    // 이미 신청한 플랜인지 확인
    if (currentPlanId === planId) {
      return NextResponse.json({ error: "이미 해당 플랜을 사용 중입니다." }, { status: 400 });
    }

    // 이미 대기 중인 요청이 있는지 확인
    if (userData.plan?.requestedId && userData.plan?.requestedId !== userData.plan?.id && !userData.plan?.activated) {
      return NextResponse.json({ error: "이미 대기 중인 플랜 신청이 있습니다." }, { status: 400 });
    }

    // 플랜 요청 업데이트
    await userRef.update({
      "plan.requestedId": planId,
      "plan.requestedAt": FieldValue.serverTimestamp(),
      "plan.requestReason": reason,
      "plan.requestUsage": usage,
      "plan.activated": false,
      updatedAt: FieldValue.serverTimestamp()
    });

    // 플랜 요청 로그 저장
    await getAdminDb().collection("planRequests").add({
      userId: decoded.uid,
      userEmail: userData.email || decoded.email,
      userName: userData.displayName || decoded.name,
      currentPlan: currentPlanId || "guest",
      requestedPlan: planId,
      reason,
      usage,
      status: "pending",
      requestedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({
      ok: true,
      message: "플랜 신청이 완료되었습니다.",
      requestedPlan: PLANS[planId].name
    });

  } catch (error: any) {
    if (error instanceof MissingServiceAccountKeyError) {
      return NextResponse.json({ error: "missing service account" }, { status: 500 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }

    console.error("plan request error", error);
    return NextResponse.json({ error: error.message || "플랜 신청에 실패했습니다." }, { status: 500 });
  }
}