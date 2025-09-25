"use client";

import { useEffect, useMemo, useState } from "react";
import { firebaseAuth } from "@/lib/firebase/client";
import { PLANS, type PlanId } from "@/lib/constants";

async function fetchWithToken(path: string, init?: RequestInit) {
  const auth = firebaseAuth();
  const user = auth.currentUser;
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
  tempPass: { kind: string | null; expiresAt?: string | null } | null;
  usage: { generatedImages: number; lastGeneratedAt: string | null } | null;
  email?: string | null;
  displayName?: string | null;
  role?: string | null;
  unlimited?: boolean;
};

export default function UserMenu() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const authInstance = firebaseAuth();
    const unsubscribe = authInstance.onAuthStateChanged(async user => {
      setAuthReady(true);
      if (!user) {
        setStatus(null);
        setLoading(false);
        setErrorMessage(null);
        return;
      }
      setLoading(true);
      setErrorMessage(null);

      try {
        const bootstrapRes = await fetchWithToken("/api/user/bootstrap", { method: "POST" });
        if (!bootstrapRes.ok) {
          const bootstrapText = await bootstrapRes.text();
          console.error("bootstrap failed", bootstrapRes.status, bootstrapText);
          setErrorMessage(`bootstrap ${bootstrapRes.status}: ${bootstrapText}`);
          setLoading(false);
          return;
        }

        const statusRes = await fetchWithToken("/api/user/status");
        const contentType = statusRes.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const json = await statusRes.json();
          if (statusRes.ok) {
            setStatus(json);
          } else {
            console.error("status fetch failed", statusRes.status, json);
            setErrorMessage(json?.error || `status ${statusRes.status}`);
          }
        } else {
          const text = await statusRes.text();
          console.error("status fetch returned non-json", statusRes.status, text);
          setErrorMessage(`status ${statusRes.status}: ${text.slice(0, 140)}`);
        }
      } catch (error) {
        console.error("status fetch crashed", error);
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!status?.tempPass?.expiresAt) {
      return;
    }

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status?.tempPass?.expiresAt]);

  const passCountdown = useMemo(() => {
    if (!status?.tempPass?.expiresAt) {
      return null;
    }
    const diff = new Date(status.tempPass.expiresAt).getTime() - now;
    if (diff <= 0) {
      return null;
    }
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }, [status?.tempPass?.expiresAt, now]);

  const resetCountdown = useMemo(() => {
    if (!status?.quota?.resetsAt) {
      return null;
    }
    const diff = new Date(status.quota.resetsAt).getTime() - now;
    if (Number.isNaN(diff) || diff <= 0) {
      return "곧 초기화";
    }
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return `${days}d ${hours}h 후 리셋`;
  }, [status?.quota?.resetsAt, now]);

  const onSwitchPlan = async (planId: PlanId) => {
    setLoading(true);
    const response = await fetchWithToken("/api/user/switch-plan", {
      method: "POST",
      body: JSON.stringify({ planId }),
      headers: { "content-type": "application/json" }
    });
    const json = await response.json();
    if (!response.ok) {
      alert(json.error || "플랜 변경에 실패했습니다.");
    }
    const statusResponse = await fetchWithToken("/api/user/status");
    const statusJson = await statusResponse.json();
    if (statusResponse.ok) {
      setStatus(statusJson);
    }
    setLoading(false);
  };

  if (!authReady) {
    return null;
  }

  if (!status) {
    return (
      <div className="text-sm text-muted-foreground">
        로그인 필요
        {errorMessage ? <div className="text-xs text-destructive">{errorMessage}</div> : null}
      </div>
    );
  }

  const activePlanId = status.plan?.id;
  const requestedId = status.plan?.requestedId;
  const isAdmin = status.unlimited || status.role === "admin";

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm">
        <div className="font-medium leading-tight">{status.displayName || status.email}</div>
        <div className="text-xs text-muted-foreground flex flex-col gap-0.5">
          {isAdmin ? (
            <>
              <span>권한: 관리자 · 무제한</span>
              <span>이번 달 생성 {status.usage?.generatedImages ?? 0}장</span>
            </>
          ) : (
            <>
              <span>
                플랜: {PLANS[activePlanId as PlanId]?.name || "게스트"}
                {status.plan?.activated ? "" : " (대기중)"}
                {resetCountdown ? ` · ${resetCountdown}` : ""}
              </span>
              <span>
                이번 달 생성 {status.usage?.generatedImages ?? 0}장 · 남은 {status.quota?.imagesRemaining ?? 0}장
              </span>
              {status.tempPass?.expiresAt ? (
                <span>
                  패스 {status.tempPass.kind} 남은 {passCountdown ?? "만료"}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>
      {!isAdmin && (
      <div className="flex gap-1">
        {(["guest", "basic", "deluxe", "premium"] as PlanId[]).map(pid => (
          <button
            key={pid}
            type="button"
            onClick={() => onSwitchPlan(pid)}
            disabled={loading}
            className={`px-2 py-1 text-xs rounded border ${
              requestedId === pid || activePlanId === pid ? "bg-primary text-primary-foreground" : ""
            }`}
          >
            {PLANS[pid].name}
          </button>
        ))}
      </div>
      )}
    </div>
  );
}
