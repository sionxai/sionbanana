import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { MissingServiceAccountKeyError, getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { ADMIN_UID, type PlanId } from "@/lib/constants";

const requestSchema = z.object({
  targetUid: z.string().min(1),
  planId: z.enum(["basic", "deluxe", "premium"]),
  reason: z.string().optional()
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

    const { targetUid, planId, reason } = requestSchema.parse(await req.json());

    // 대상 사용자 확인
    const targetRef = getAdminDb().collection("users").doc(targetUid);
    const targetSnap = await targetRef.get();

    if (!targetSnap.exists) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    const targetData = targetSnap.data()!;

    // 플랜 요청이 있는지 확인
    if (!targetData.plan?.requestedId || targetData.plan?.requestedId !== planId) {
      return NextResponse.json({ error: "해당 플랜 요청이 존재하지 않습니다." }, { status: 400 });
    }

    // 요청 거부 처리 - requestedId를 제거하고 activated를 true로 설정 (현재 플랜 유지)
    await targetRef.update({
      "plan.requestedId": null,
      "plan.requestReason": null,
      "plan.requestUsage": null,
      "plan.activated": true,
      "plan.rejectedAt": FieldValue.serverTimestamp(),
      "plan.rejectedBy": decoded.uid,
      "plan.rejectionReason": reason || "관리자에 의해 거부됨",
      updatedAt: FieldValue.serverTimestamp()
    });

    // 거부 로그 저장
    await getAdminDb().collection("planRequests").add({
      userId: targetUid,
      userEmail: targetData.email || null,
      userName: targetData.displayName || null,
      currentPlan: targetData.plan?.id || "guest",
      requestedPlan: planId,
      reason: targetData.plan?.requestReason || null,
      usage: targetData.plan?.requestUsage || null,
      status: "rejected",
      processedBy: decoded.uid,
      processedAt: FieldValue.serverTimestamp(),
      rejectionReason: reason || "관리자에 의해 거부됨",
      createdAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({
      ok: true,
      message: "플랜 신청이 거부되었습니다.",
      targetUser: {
        uid: targetUid,
        email: targetData.email,
        displayName: targetData.displayName
      }
    });

  } catch (error: any) {
    if (error instanceof MissingServiceAccountKeyError) {
      return NextResponse.json({ error: "missing service account" }, { status: 500 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }

    console.error("reject plan error", error);
    return NextResponse.json({ error: error.message || "플랜 거부에 실패했습니다." }, { status: 500 });
  }
}