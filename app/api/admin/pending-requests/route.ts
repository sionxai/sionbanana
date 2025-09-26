import { NextRequest, NextResponse } from "next/server";
import { MissingServiceAccountKeyError, getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { ADMIN_UID } from "@/lib/constants";

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "no token" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(token);

    // 관리자 권한 확인
    if (decoded.uid !== ADMIN_UID) {
      const userRef = getAdminDb().collection("users").doc(decoded.uid);
      const userSnap = await userRef.get();
      const userData = userSnap.data();

      if (!userData || userData.role !== "admin") {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }
    }

    // 전체 사용자 가져와서 필터링 (인덱스 문제 회피)
    const usersQuery = await getAdminDb()
      .collection("users")
      .limit(100)
      .get();

    const pendingRequests = [];

    for (const doc of usersQuery.docs) {
      const data = doc.data();

      // 대기 중인 플랜 요청 조건:
      // 1. requestedId가 있고
      // 2. requestedId가 현재 플랜 id와 다르고
      // 3. activated가 false인 경우
      if (data.plan?.requestedId &&
          data.plan?.requestedId !== data.plan?.id &&
          data.plan?.activated === false) {
        pendingRequests.push({
          uid: doc.id,
          email: data.email || null,
          displayName: data.displayName || null,
          currentPlan: data.plan?.id || "guest",
          requestedPlan: data.plan?.requestedId,
          requestReason: data.plan?.requestReason || null,
          requestUsage: data.plan?.requestUsage || null,
          requestedAt: data.plan?.requestedAt?.toDate?.()?.toISOString() || null,
          usage: {
            generatedImages: data.usage?.generatedImages || 0
          },
          quota: {
            imagesRemaining: data.quota?.imagesRemaining || 0
          }
        });
      }
    }

    // 신청일 기준으로 정렬 (최신순)
    pendingRequests.sort((a, b) => {
      if (!a.requestedAt) return 1;
      if (!b.requestedAt) return -1;
      return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
    });

    return NextResponse.json({
      requests: pendingRequests,
      total: pendingRequests.length
    });

  } catch (error: any) {
    if (error instanceof MissingServiceAccountKeyError) {
      return NextResponse.json({ error: "missing service account" }, { status: 500 });
    }

    console.error("pending requests error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}