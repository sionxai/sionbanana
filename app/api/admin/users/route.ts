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

    // 검색어 파라미터
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.toLowerCase() || "";

    // 모든 사용자 가져오기
    const usersQuery = await getAdminDb()
      .collection("users")
      .limit(100)
      .get();

    const users = [];

    for (const doc of usersQuery.docs) {
      const data = doc.data();

      // 검색 필터링
      const email = data.email?.toLowerCase() || "";
      const displayName = data.displayName?.toLowerCase() || "";

      if (search && !email.includes(search) && !displayName.includes(search)) {
        continue;
      }

      users.push({
        uid: doc.id,
        email: data.email || null,
        displayName: data.displayName || null,
        role: data.role || "user",
        plan: {
          id: data.plan?.id || "guest",
          activated: data.plan?.activated || false,
          requestedId: data.plan?.requestedId || null,
          requestedAt: data.plan?.requestedAt?.toDate?.()?.toISOString() || null
        },
        quota: {
          imagesRemaining: data.quota?.imagesRemaining || 0,
          resetsAt: data.quota?.resetsAt?.toDate?.()?.toISOString() || null
        },
        usage: {
          generatedImages: data.usage?.generatedImages || 0,
          lastGeneratedAt: data.usage?.lastGeneratedAt?.toDate?.()?.toISOString() || null
        },
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null
      });
    }

    // 이메일 순으로 정렬
    users.sort((a, b) => {
      if (!a.email) return 1;
      if (!b.email) return -1;
      return a.email.localeCompare(b.email);
    });

    return NextResponse.json({
      users,
      total: users.length
    });

  } catch (error: any) {
    if (error instanceof MissingServiceAccountKeyError) {
      return NextResponse.json({ error: "missing service account" }, { status: 500 });
    }

    console.error("users list error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}