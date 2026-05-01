"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type AuthStatusResponse = {
  authenticated: boolean;
  error?: { code: string; message: string } | null;
};

const POLL_INTERVAL_MS = 30_000;

export function AuthStatusBanner() {
  const pathname = usePathname();
  const [status, setStatus] = useState<"loading" | "ok" | "missing">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        const body = (await res.json()) as AuthStatusResponse;
        if (cancelled) return;
        if (body.authenticated) {
          setStatus("ok");
          setMessage(null);
        } else {
          setStatus("missing");
          setMessage(body.error?.message ?? "Codex 인증 정보를 찾지 못했습니다.");
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("missing");
        setMessage(err instanceof Error ? err.message : "Codex 인증 상태를 확인할 수 없습니다.");
      }
    };

    void tick();
    const interval = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (status !== "missing" || pathname === "/auth") {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 border-b border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2 text-sm sm:flex-row sm:items-center sm:gap-3">
        <span className="font-semibold">Codex 인증 필요</span>
        <span className="flex-1">
          {message} 브라우저에서 ChatGPT 계정을 연결하면 바로 생성 기능을 사용할 수 있습니다.
        </span>
        <Button asChild size="sm" variant="outline" className="self-start border-amber-500/40 bg-background/40 sm:self-auto">
          <Link href="/auth">로그인 페이지로 이동</Link>
        </Button>
      </div>
    </div>
  );
}
