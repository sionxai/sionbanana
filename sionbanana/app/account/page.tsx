"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/auth/auth-gate";
import { firebaseAuth } from "@/lib/firebase/client";

type Status = {
  email?: string | null;
  displayName?: string | null;
  role?: string;
  plan?: { id?: string; activated?: boolean; requestedId?: string | null } | null;
  quota?: { imagesRemaining?: number; resetsAt?: string | null } | null;
  usage?: { generatedImages?: number; lastGeneratedAt?: string | null } | null;
};

async function call(path: string) {
  const user = firebaseAuth().currentUser;
  const token = user ? await user.getIdToken() : "";
  return fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : undefined });
}

export default function AccountPage() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    (async () => {
      const res = await call("/api/user/status");
      if (res.ok) setStatus(await res.json());
    })();
  }, []);

  return (
    <AuthGate>
      <div className="p-6 space-y-4">
        <div>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            ← 스튜디오로 돌아가기
          </Link>
        </div>
        <h1 className="text-xl font-semibold">회원정보</h1>
        <div className="rounded border p-4 text-sm">
          <div>이메일: {status?.email ?? "-"}</div>
          <div>이름: {status?.displayName ?? "-"}</div>
          <div>권한: {status?.role ?? "user"}</div>
          <div>플랜: {status?.plan?.id ?? "-"} {status?.plan?.activated ? "(활성)" : "(대기)"}</div>
          <div>이번 달 생성: {status?.usage?.generatedImages ?? 0}장</div>
          <div>남은 이미지: {status?.quota?.imagesRemaining ?? 0}장</div>
        </div>
      </div>
    </AuthGate>
  );
}
