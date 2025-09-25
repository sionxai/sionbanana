"use client";

import { useEffect, useState } from "react";
import { PLANS, type PlanId } from "@/lib/constants";
import { firebaseAuth } from "@/lib/firebase/client";

async function call(path: string, method = "GET", body?: unknown) {
  const auth = firebaseAuth();
  const user = auth.currentUser;
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

interface PendingRequest {
  uid: string;
  email: string | null;
  displayName: string | null;
  currentPlan: PlanId;
  requestedPlan: PlanId;
  requestReason: string | null;
  requestUsage: string | null;
  requestedAt: string | null;
  usage: { generatedImages: number };
  quota: { imagesRemaining: number };
}

interface PendingRequestsListProps {
  onRequestProcessed: () => void;
}

export default function PendingRequestsList({ onRequestProcessed }: PendingRequestsListProps) {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const response = await call("/api/admin/pending-requests");
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests);
      } else {
        const error = await response.json();
        console.error("Failed to load pending requests:", error);
      }
    } catch (error) {
      console.error("Failed to load pending requests:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadRequests();
  }, []);

  const processRequest = async (uid: string, planId: PlanId, approve: boolean) => {
    setProcessingIds(prev => new Set(prev).add(uid));

    try {
      const endpoint = approve ? "/api/admin/set-plan" : "/api/admin/reject-plan";
      const response = await call(endpoint, "POST", { targetUid: uid, planId });

      if (response.ok) {
        await loadRequests();
        onRequestProcessed();
      } else {
        const error = await response.json();
        alert(error.error || `플랜 ${approve ? '승인' : '거부'}에 실패했습니다.`);
      }
    } catch (error) {
      console.error("Failed to process request:", error);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(uid);
        return newSet;
      });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("ko-KR");
  };

  if (!mounted || loading) {
    return (
      <div className="rounded-lg border p-6">
        <h2 className="text-xl font-semibold mb-4">대기 중인 플랜 신청</h2>
        <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">대기 중인 플랜 신청</h2>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">
            총 {requests.length}건
          </span>
          <button
            onClick={loadRequests}
            className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
          >
            새로고침
          </button>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          대기 중인 플랜 신청이 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(request => {
            const isProcessing = processingIds.has(request.uid);

            return (
              <div
                key={request.uid}
                className="p-4 border rounded-lg bg-card"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    {/* 사용자 정보 */}
                    <div className="flex items-center space-x-2">
                      <div className="font-medium">
                        {request.displayName || "이름 없음"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        ({request.email})
                      </div>
                    </div>

                    {/* 플랜 정보 */}
                    <div className="flex items-center space-x-4 text-sm">
                      <span>
                        <span className="text-muted-foreground">현재:</span>{" "}
                        <span className="font-medium">{PLANS[request.currentPlan].name}</span>
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span>
                        <span className="text-muted-foreground">신청:</span>{" "}
                        <span className="font-medium text-primary">
                          {PLANS[request.requestedPlan].name}
                        </span>
                      </span>
                    </div>

                    {/* 사용량 정보 */}
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>생성: {request.usage.generatedImages}장</span>
                      <span>남은 수량: {request.quota.imagesRemaining}장</span>
                      <span>신청일: {formatDate(request.requestedAt)}</span>
                    </div>

                    {/* 신청 사유 & 용도 */}
                    {(request.requestReason || request.requestUsage) && (
                      <div className="space-y-1 text-sm">
                        {request.requestReason && (
                          <div>
                            <span className="text-muted-foreground">사유:</span>{" "}
                            {request.requestReason}
                          </div>
                        )}
                        {request.requestUsage && (
                          <div>
                            <span className="text-muted-foreground">용도:</span>{" "}
                            {request.requestUsage}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => processRequest(request.uid, request.requestedPlan, true)}
                      disabled={isProcessing}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                    >
                      {isProcessing ? "처리중..." : "승인"}
                    </button>
                    <button
                      onClick={() => processRequest(request.uid, request.requestedPlan, false)}
                      disabled={isProcessing}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                    >
                      {isProcessing ? "처리중..." : "거부"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}