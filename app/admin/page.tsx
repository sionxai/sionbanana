"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/auth/auth-gate";
import PendingRequestsList from "@/components/admin/PendingRequestsList";
import UserSearchSelect from "@/components/admin/UserSearchSelect";
import ChatManagement from "@/components/admin/ChatManagement";
import { firebaseAuth } from "@/lib/firebase/client";
import { ADMIN_UID, PLANS, type PlanId } from "@/lib/constants";

type UserStatus = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  plan: { id: PlanId; activated: boolean; requestedId?: PlanId | null } | null;
  quota: { imagesRemaining: number; resetsAt: string } | null;
  tempPass: { kind: string | null; expiresAt?: string | null } | null;
  usage?: { generatedImages?: number } | null;
};

type User = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
  plan: {
    id: PlanId;
    activated: boolean;
    requestedId: PlanId | null;
    requestedAt: string | null;
  };
  quota: {
    imagesRemaining: number;
    resetsAt: string | null;
  };
  usage: {
    generatedImages: number;
    lastGeneratedAt: string | null;
  };
  createdAt: string | null;
  updatedAt: string | null;
};

async function call(path: string, method = "GET", body?: unknown) {
  const auth = firebaseAuth();
  const user = auth?.currentUser;
  const token = user ? await user.getIdToken() : "";

  return fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

export default function AdminPage() {
  const [me, setMe] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [delta, setDelta] = useState(10);
  const [planId, setPlanId] = useState<PlanId>("basic");
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const auth = firebaseAuth();
    if (auth) {
      const unsubscribe = auth.onAuthStateChanged(user => {
        setMe(user?.uid ?? null);
      });
      return () => unsubscribe();
    }
  }, []);

  const load = async () => {
    if (!target) {
      return;
    }
    setLoading(true);
    const response = await call("/api/admin/lookup-user", "POST", { targetUid: target });
    const json = await response.json();
    setStatus(response.ok ? (json as UserStatus) : null);
    if (!response.ok) {
      alert(json.error || "사용자 조회 실패");
    }
    setLoading(false);
  };

  const grant = async (kind: "10m" | "1h" | "2h") => {
    if (!target) {
      return;
    }
    setLoading(true);
    const res = await call("/api/admin/grant-pass", "POST", { targetUid: target, kind });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error || "사용권 부여 실패");
    }
    await load();
    setLoading(false);
  };

  const revoke = async () => {
    if (!target) {
      return;
    }
    setLoading(true);
    const res = await call(`/api/admin/grant-pass?uid=${encodeURIComponent(target)}`, "DELETE");
    if (!res.ok) {
      const json = await res.json();
      alert(json.error || "사용권 종료 실패");
    }
    await load();
    setLoading(false);
  };

  const approvePlan = async () => {
    if (!target) {
      return;
    }
    setLoading(true);
    const res = await call("/api/admin/set-plan", "POST", { targetUid: target, planId });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error || "플랜 승인 실패");
    }
    await load();
    setLoading(false);
  };

  const changePlan = async () => {
    if (!target || !selectedUser) {
      return;
    }
    setLoading(true);
    const res = await call("/api/admin/change-plan", "POST", { targetUid: target, planId });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error || "플랜 변경 실패");
    } else {
      setStatus(prev => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          plan: {
            id: planId,
            activated: true,
            requestedId: null
          }
        };
      });
    }
    setLoading(false);
  };

  const addCredits = async () => {
    if (!target) {
      return;
    }
    setLoading(true);
    const res = await call("/api/admin/add-credits", "POST", { targetUid: target, deltaImages: delta });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error || "이미지 수량 조정 실패");
    }
    await load();
    setLoading(false);
  };

  if (!me) {
    return <div className="p-6">로그인 필요</div>;
  }

  if (me !== ADMIN_UID) {
    return <div className="p-6">권한 없음</div>;
  }

  return (
    <AuthGate>
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">관리자 콘솔</h1>

        {/* 대기 중인 플랜 신청 목록 */}
        <PendingRequestsList onRequestProcessed={load} />

        {/* 1:1 상담 관리 */}
        <ChatManagement />

        {/* 사용자 개별 관리 */}
        <div className="rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">사용자 개별 관리</h2>

          <UserSearchSelect
            onUserSelected={(user) => {
              setSelectedUser(user);
              setTarget(user?.uid || "");
              if (user) {
                const userStatus: UserStatus = {
                  uid: user.uid,
                  email: user.email,
                  displayName: user.displayName,
                  plan: {
                    id: user.plan.id,
                    activated: user.plan.activated,
                    requestedId: user.plan.requestedId
                  },
                  quota: {
                    imagesRemaining: user.quota.imagesRemaining,
                    resetsAt: user.quota.resetsAt || ""
                  },
                  tempPass: { kind: null },
                  usage: {
                    generatedImages: user.usage.generatedImages
                  }
                };
                setStatus(userStatus);
              } else {
                setStatus(null);
              }
            }}
            selectedUser={selectedUser}
          />

          {mounted && status && (
            <div className="space-y-3 rounded border p-4 bg-gray-50">
              <div className="font-medium">
                {status.displayName} ({status.email})
              </div>
              <div className="text-sm">
                플랜: {status.plan?.id ?? "-"} {status.plan?.activated ? "(활성)" : "(대기)"} / 요청: {status.plan?.requestedId ?? "-"} · 남은 {status.quota?.imagesRemaining ?? 0}장
                {status.tempPass?.expiresAt ? ` · 패스 ${status.tempPass.kind} ~ ${status.tempPass.expiresAt}` : ""}
              </div>

            <div className="flex flex-wrap gap-2">
              <button className="rounded border px-3 py-1" onClick={() => grant("10m")} disabled={loading}>
                10분 사용권
              </button>
              <button className="rounded border px-3 py-1" onClick={() => grant("1h")} disabled={loading}>
                1시간 사용권
              </button>
              <button className="rounded border px-3 py-1" onClick={() => grant("2h")} disabled={loading}>
                2시간 사용권
              </button>
              <button className="rounded border px-3 py-1" onClick={revoke} disabled={loading}>
                패스 종료
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                className="rounded border px-2 py-1"
                value={planId}
                onChange={event => setPlanId(event.target.value as PlanId)}
              >
                {Object.values(PLANS).map(plan => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
              {status.plan?.requestedId && status.plan?.requestedId !== status.plan?.id ? (
                <button className="rounded border px-3 py-1 bg-green-50 text-green-700" onClick={approvePlan} disabled={loading}>
                  플랜 승인 & 초기화
                </button>
              ) : (
                <button className="rounded border px-3 py-1 bg-blue-50 text-blue-700" onClick={changePlan} disabled={loading}>
                  플랜 변경
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-24 rounded border px-2 py-1"
                value={delta}
                onChange={event => setDelta(parseInt(event.target.value || "0", 10))}
              />
              <button className="rounded border px-3 py-1" onClick={addCredits} disabled={loading}>
                이미지 수량 증감
              </button>
            </div>
            </div>
          )}
        </div>
      </div>
    </AuthGate>
  );
}
