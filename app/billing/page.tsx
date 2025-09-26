"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/auth/auth-gate";
import PlanCards from "@/components/billing/PlanCards";
import PlanRequestForm from "@/components/billing/PlanRequestForm";
import Link from "next/link";
import { firebaseAuth } from "@/lib/firebase/client";
import { type PlanId } from "@/lib/constants";

async function fetchWithToken(path: string, init?: RequestInit) {
  const auth = firebaseAuth();
  const user = auth?.currentUser;
  const token = user ? await user.getIdToken() : "";

  const headers = new Headers(init?.headers ?? {});
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return fetch(path, {
    ...(init ?? {}),
    headers
  });
}

type Status = {
  plan: { id: PlanId; activated: boolean; requestedId?: PlanId | null } | null;
  quota: { imagesRemaining: number; resetsAt: string | null } | null;
  usage: { generatedImages: number; lastGeneratedAt: string | null } | null;
  unlimited?: boolean;
  role?: string | null;
};

export default function BillingPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const response = await fetchWithToken("/api/user/status");
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error("Failed to load status:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const auth = firebaseAuth();
    if (auth) {
      const unsubscribe = auth.onAuthStateChanged(user => {
        if (user) {
          loadStatus();
        } else {
          setStatus(null);
          setLoading(false);
        }
      });

      return () => unsubscribe();
    }
  }, []);

  const isAdmin = status?.unlimited || status?.role === "admin";

  return (
    <AuthGate>
      <div className="p-6 space-y-6">
        <div>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            ← 스튜디오로 돌아가기
          </Link>
        </div>

        <div className="space-y-6">
          <h1 className="text-2xl font-bold">플랜 관리</h1>

          {loading ? (
            <div className="text-center py-8">로딩 중...</div>
          ) : (
            <>
              {/* 현재 상태 */}
              <PlanCards />

              {/* 관리자가 아닌 경우에만 플랜 신청 폼 표시 */}
              {!isAdmin && status && (
                <>
                  <div className="border-t pt-6">
                    <PlanRequestForm
                      currentPlan={status.plan?.id || null}
                      onRequestSubmitted={loadStatus}
                    />
                  </div>

                  {/* 대기 중인 요청 표시 */}
                  {status.plan?.requestedId &&
                   status.plan?.requestedId !== status.plan?.id &&
                   !status.plan?.activated && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                        <div className="font-medium text-yellow-800">
                          플랜 신청 대기 중
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-yellow-700">
                        <strong>{status.plan.requestedId}</strong> 플랜 신청이 관리자 검토 중입니다.
                        <br />
                        승인 후 자동으로 플랜이 변경됩니다.
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* 관리자인 경우 안내 메시지 */}
              {isAdmin && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="font-medium text-blue-800">
                    👑 관리자 권한
                  </div>
                  <div className="mt-2 text-sm text-blue-700">
                    관리자는 무제한 이미지 생성이 가능합니다.
                    <br />
                    플랜 신청 관리는 <Link href="/admin" className="underline">관리자 페이지</Link>에서 확인하세요.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AuthGate>
  );
}
