"use client";

import { useState } from "react";
import { PLANS, type PlanId } from "@/lib/constants";
import { firebaseAuth } from "@/lib/firebase/client";

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

interface PlanRequestFormProps {
  currentPlan: PlanId | null;
  onRequestSubmitted: () => void;
}

export default function PlanRequestForm({ currentPlan, onRequestSubmitted }: PlanRequestFormProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("basic");
  const [reason, setReason] = useState("");
  const [usage, setUsage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim() || !usage.trim()) {
      alert("신청 사유와 사용 목적을 모두 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetchWithToken("/api/plan/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlan,
          reason: reason.trim(),
          usage: usage.trim()
        })
      });

      const result = await response.json();

      if (response.ok) {
        alert("플랜 신청이 완료되었습니다. 관리자 검토 후 승인됩니다.");
        setReason("");
        setUsage("");
        onRequestSubmitted();
      } else {
        alert(result.error || "플랜 신청에 실패했습니다.");
      }
    } catch (error) {
      console.error("Plan request error:", error);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border p-6 bg-card">
      <h2 className="text-xl font-semibold mb-4">플랜 신청하기</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 플랜 선택 */}
        <div>
          <label className="block text-sm font-medium mb-2">신청할 플랜</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(["basic", "deluxe", "premium"] as PlanId[]).map(planId => {
              const plan = PLANS[planId];
              const isDisabled = planId === currentPlan;

              return (
                <div
                  key={planId}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedPlan === planId
                      ? "border-primary bg-primary/5"
                      : isDisabled
                        ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60"
                        : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => !isDisabled && setSelectedPlan(planId)}
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={selectedPlan === planId}
                      onChange={() => !isDisabled && setSelectedPlan(planId)}
                      disabled={isDisabled}
                      className="text-primary"
                    />
                    <div>
                      <div className="font-medium">{plan.name}</div>
                      <div className="text-sm text-muted-foreground">
                        월 {plan.monthlyImages.toLocaleString()}장
                      </div>
                      {isDisabled && (
                        <div className="text-xs text-orange-600 font-medium">
                          현재 플랜
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 신청 사유 */}
        <div>
          <label htmlFor="reason" className="block text-sm font-medium mb-2">
            신청 사유 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            rows={3}
            placeholder="플랜 변경이 필요한 이유를 간단히 설명해주세요..."
            maxLength={500}
            required
          />
          <div className="text-xs text-muted-foreground mt-1">
            {reason.length}/500자
          </div>
        </div>

        {/* 사용 목적 */}
        <div>
          <label htmlFor="usage" className="block text-sm font-medium mb-2">
            주요 사용 목적 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="usage"
            value={usage}
            onChange={(e) => setUsage(e.target.value)}
            className="w-full p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            rows={3}
            placeholder="AI 이미지 생성을 어떤 용도로 사용하실지 알려주세요..."
            maxLength={500}
            required
          />
          <div className="text-xs text-muted-foreground mt-1">
            {usage.length}/500자
          </div>
        </div>

        {/* 제출 버튼 */}
        <button
          type="submit"
          disabled={loading || !reason.trim() || !usage.trim()}
          className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "신청 중..." : "플랜 신청하기"}
        </button>
      </form>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <div className="text-sm text-blue-800">
          <strong>📌 신청 안내</strong>
          <ul className="mt-2 space-y-1 text-xs">
            <li>• 관리자 검토 후 1-2일 내 승인/거부가 결정됩니다</li>
            <li>• 승인 시 즉시 새로운 플랜이 적용됩니다</li>
            <li>• 거부 시 사유와 함께 알림을 보내드립니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}