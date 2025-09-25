"use client";

import { useState, useEffect } from "react";
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

interface User {
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
}

interface UserSearchSelectProps {
  onUserSelected: (user: User | null) => void;
  selectedUser: User | null;
}

export default function UserSearchSelect({ onUserSelected, selectedUser }: UserSearchSelectProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [mounted, setMounted] = useState(false);

  const loadUsers = async (searchQuery = "") => {
    setLoading(true);
    try {
      const response = await call(`/api/admin/users${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ""}`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      } else {
        console.error("Failed to load users");
        setUsers([]);
      }
    } catch (error) {
      console.error("Failed to load users:", error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadUsers();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (search.length >= 2 || search.length === 0) {
        loadUsers(search);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search]);

  const handleUserSelect = (user: User) => {
    onUserSelected(user);
    setSearch(user.email || user.displayName || user.uid);
    setShowDropdown(false);
  };

  const handleClear = () => {
    onUserSelected(null);
    setSearch("");
    setShowDropdown(false);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("ko-KR");
  };

  const getPlanStatusBadge = (plan: User['plan']) => {
    if (plan.requestedId && plan.requestedId !== plan.id && !plan.activated) {
      return (
        <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
          {PLANS[plan.requestedId].name} 신청중
        </span>
      );
    }

    return (
      <span className={`px-2 py-1 text-xs rounded ${
        plan.activated
          ? "bg-green-100 text-green-800"
          : "bg-gray-100 text-gray-800"
      }`}>
        {PLANS[plan.id].name}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <label className="block text-sm font-medium mb-2">사용자 검색 및 선택</label>
        <div className="relative">
          <input
            type="text"
            placeholder="이메일 또는 이름으로 검색..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            className="w-full p-3 border rounded-lg pr-20"
          />

          {selectedUser && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            >
              지우기
            </button>
          )}

          {mounted && showDropdown && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-muted-foreground">검색 중...</div>
              ) : users.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {search ? "검색 결과가 없습니다." : "사용자를 불러오는 중..."}
                </div>
              ) : (
                <div className="py-2">
                  {users.map(user => (
                    <button
                      key={user.uid}
                      onClick={() => handleUserSelect(user)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium">
                            {user.displayName || "이름 없음"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {user.email}
                          </div>
                          <div className="flex items-center space-x-2 mt-1">
                            {getPlanStatusBadge(user.plan)}
                            <span className="text-xs text-muted-foreground">
                              생성: {user.usage.generatedImages}장
                            </span>
                            <span className="text-xs text-muted-foreground">
                              남은: {user.quota.imagesRemaining}장
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground ml-4">
                          가입: {formatDate(user.createdAt)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedUser && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="font-medium mb-2">선택된 사용자</div>
          <div className="space-y-1 text-sm">
            <div><strong>이름:</strong> {selectedUser.displayName || "이름 없음"}</div>
            <div><strong>이메일:</strong> {selectedUser.email}</div>
            <div><strong>UID:</strong> <code className="bg-white px-1 py-0.5 rounded text-xs">{selectedUser.uid}</code></div>
            <div><strong>현재 플랜:</strong> {PLANS[selectedUser.plan.id].name} {selectedUser.plan.activated ? "(활성)" : "(비활성)"}</div>
            {selectedUser.plan.requestedId && selectedUser.plan.requestedId !== selectedUser.plan.id && (
              <div><strong>신청 플랜:</strong> {PLANS[selectedUser.plan.requestedId].name}</div>
            )}
            <div><strong>사용량:</strong> {selectedUser.usage.generatedImages}장 생성 · {selectedUser.quota.imagesRemaining}장 남음</div>
            <div><strong>권한:</strong> {selectedUser.role === "admin" ? "관리자" : "일반 사용자"}</div>
          </div>
        </div>
      )}
    </div>
  );
}