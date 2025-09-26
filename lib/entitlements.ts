import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { ADMIN_UID, PLANS, type PlanId } from "@/lib/constants";
import { getAdminDb } from "@/lib/firebase/admin";

export function startOfNextMonthUTC(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const next = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0));
  return Timestamp.fromDate(next);
}

export function planBaseline(planId: PlanId) {
  const plan = PLANS[planId];
  return {
    imagesRemaining: plan.monthlyImages,
    resetsAt: startOfNextMonthUTC()
  };
}

/** 문서가 없거나 레거시 스키마일 때 게스트 기준으로 정규화 */
export async function ensureUserDoc(uid: string, email?: string, displayName?: string) {
  const ref = getAdminDb().collection("users").doc(uid);
  const snap = await ref.get();
  const baseline = planBaseline("guest");

  if (!snap.exists) {
    await ref.set(
      {
        email: email ?? null,
        displayName: displayName ?? null,
        role: uid === ADMIN_UID ? "admin" : "user",
        plan: {
          id: "guest",
          activated: true,
          requestedId: "guest",
          requestedAt: FieldValue.serverTimestamp()
        },
        quota: {
          imagesRemaining: baseline.imagesRemaining,
          resetsAt: baseline.resetsAt
        },
        tempPass: { kind: null, expiresAt: null, issuedBy: null },
        usage: { generatedImages: 0, lastGeneratedAt: null },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    return ref;
  }

  const data = snap.data() ?? {};
  const updates: Record<string, unknown> = {};

  if (email && (!data.email || data.email === null)) {
    updates.email = email;
  }

  if (displayName && (!data.displayName || data.displayName === null)) {
    updates.displayName = displayName;
  }

  const plan = data.plan;
  if (!plan || typeof plan !== "object" || typeof plan.id !== "string") {
    const legacyPlanId = typeof data.plan === "string" ? (data.plan === "free" ? "guest" : data.plan) : "guest";
    const normalized = (PLANS[legacyPlanId as PlanId] ? legacyPlanId : "guest") as PlanId;
    updates.plan = {
      id: normalized,
      activated: normalized === "guest",
      requestedId: normalized,
      requestedAt: FieldValue.serverTimestamp()
    };
  } else {
    const normalized = (PLANS[plan.id as PlanId] ? plan.id : "guest") as PlanId;
    if (normalized !== plan.id) {
      updates["plan.id"] = normalized;
    }
    if (typeof plan.activated !== "boolean") {
      updates["plan.activated"] = normalized === "guest";
    }
    if (typeof plan.requestedId !== "string") {
      updates["plan.requestedId"] = normalized;
    }
    if (!plan.requestedAt) {
      updates["plan.requestedAt"] = FieldValue.serverTimestamp();
    }
  }

  const quota = data.quota;
  if (!quota || typeof quota.imagesRemaining !== "number") {
    updates.quota = {
      imagesRemaining: baseline.imagesRemaining,
      resetsAt: baseline.resetsAt
    };
  } else {
    if (quota.imagesRemaining < 0 || Number.isNaN(quota.imagesRemaining)) {
      updates["quota.imagesRemaining"] = baseline.imagesRemaining;
    }
    const resetsAt = quota.resetsAt;
    const isTimestamp = resetsAt instanceof Timestamp;
    const isDate = resetsAt instanceof Date;
    if (!resetsAt) {
      updates["quota.resetsAt"] = baseline.resetsAt;
    } else if (!isTimestamp) {
      updates["quota.resetsAt"] = isDate ? Timestamp.fromDate(resetsAt as Date) : baseline.resetsAt;
    }
  }

  if (!data.tempPass || typeof data.tempPass !== "object") {
    updates.tempPass = { kind: null, expiresAt: null, issuedBy: null };
  } else {
    const tempPass = data.tempPass;
    if (!("kind" in tempPass)) {
      updates["tempPass.kind"] = null;
    }
    if (!tempPass.expiresAt) {
      updates["tempPass.expiresAt"] = null;
    } else if (!(tempPass.expiresAt instanceof Timestamp)) {
      updates["tempPass.expiresAt"] = tempPass.expiresAt instanceof Date
        ? Timestamp.fromDate(tempPass.expiresAt as Date)
        : null;
    }
    if (!("issuedBy" in tempPass)) {
      updates["tempPass.issuedBy"] = null;
    }
  }

  if (!data.usage || typeof data.usage !== "object") {
    updates.usage = { generatedImages: 0, lastGeneratedAt: null };
  } else {
    if (typeof data.usage.generatedImages !== "number" || Number.isNaN(data.usage.generatedImages)) {
      updates["usage.generatedImages"] = 0;
    }
    if (data.usage.lastGeneratedAt && !(data.usage.lastGeneratedAt instanceof Timestamp)) {
      updates["usage.lastGeneratedAt"] = data.usage.lastGeneratedAt instanceof Date
        ? Timestamp.fromDate(data.usage.lastGeneratedAt as Date)
        : null;
    }
  }

  // Ensure admin flag for the configured admin UID
  if (uid === ADMIN_UID && data.role !== "admin") {
    updates.role = "admin";
  } else if (!data.role) {
    updates.role = "user";
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = FieldValue.serverTimestamp();
    await ref.set(updates, { merge: true });
  }

  return ref;
}
