import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
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
    const ref = getAdminDb().collection("users").doc(decoded.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "no user doc" }, { status: 404 });
    }

    const data = snap.data()!;
    const toIsoString = (value: unknown) => {
      if (!value) {
        return null;
      }
      if (value instanceof Timestamp) {
        return value.toDate().toISOString();
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === "string") {
        return value;
      }
      if (typeof (value as { toDate?: () => Date }).toDate === "function") {
        try {
          return (value as { toDate: () => Date }).toDate().toISOString();
        } catch (error) {
          console.warn("Failed to convert timestamp", error);
        }
      }
      return null;
    };

    const quota = data.quota
      ? {
          imagesRemaining: data.quota.imagesRemaining ?? 0,
          resetsAt: toIsoString(data.quota.resetsAt)
        }
      : null;
    const tempPass = data.tempPass
      ? {
          kind: data.tempPass.kind ?? null,
          expiresAt: toIsoString(data.tempPass.expiresAt),
          issuedBy: data.tempPass.issuedBy ?? null
        }
      : null;
    const usage = data.usage
      ? {
          generatedImages: data.usage.generatedImages ?? 0,
          lastGeneratedAt: toIsoString(data.usage.lastGeneratedAt)
        }
      : null;

    const isAdmin = decoded.uid === ADMIN_UID || (data.role ?? "user") === "admin";

    return NextResponse.json({
      uid: decoded.uid,
      email: data.email ?? null,
      displayName: data.displayName ?? null,
      role: data.role ?? "user",
      unlimited: isAdmin,
      plan: data.plan ?? null,
      quota,
      tempPass,
      usage,
      now: Timestamp.now().toDate().toISOString()
    });
  } catch (error: any) {
    console.error("status error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
