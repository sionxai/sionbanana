"use client";

import { useEffect, useState } from "react";

type HealthResponse = {
  ok: boolean;
  codex?: {
    authenticated: boolean;
    error?: { code: string; message: string } | null;
  };
};

const POLL_INTERVAL_MS = 30_000;

export function AuthStatusBanner() {
  const [status, setStatus] = useState<"loading" | "ok" | "missing">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const body = (await res.json()) as HealthResponse;
        if (cancelled) return;
        if (body.codex?.authenticated) {
          setStatus("ok");
          setMessage(null);
        } else {
          setStatus("missing");
          setMessage(body.codex?.error?.message ?? "Codex 인증 정보를 찾지 못했습니다.");
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

  if (status !== "missing") {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 border-b border-yellow-300/60 bg-yellow-50 text-yellow-950 dark:border-yellow-300/40 dark:bg-yellow-950/40 dark:text-yellow-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-2 text-sm sm:flex-row sm:items-center sm:gap-3">
        <span className="font-semibold">⚠ Codex 인증 필요</span>
        <span className="flex-1">
          {message} 터미널에서 다음 명령을 실행한 뒤 페이지를 새로고침해주세요.
        </span>
        <code className="self-start rounded bg-yellow-100 px-2 py-1 font-mono text-xs text-yellow-900 sm:self-auto dark:bg-yellow-900/60 dark:text-yellow-50">
          npx @openai/codex login
        </code>
      </div>
    </div>
  );
}
