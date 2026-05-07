"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Loader2,
  LogIn,
  PlugZap,
  ShieldCheck,
  TimerReset,
  XCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Phase = "idle" | "starting" | "awaiting" | "success" | "expired" | "denied" | "error";

type DeviceStartResponse =
  | {
      ok: true;
      session: string;
      userCode: string;
      verificationUri: string;
      verificationUriComplete: string;
      expiresIn: number;
      interval: number;
    }
  | { ok: false; reason: string; code?: string };

type DevicePollResponse = {
  ok: true;
  status: "pending" | "success" | "expired" | "denied" | "error";
  nextIntervalMs: number;
  reason?: string;
};

type AuthStatus = {
  authenticated: boolean;
  email?: string | null;
  source?: "web" | "codex-cli";
  expiresAt?: number | null;
};

type DeviceFlow = {
  session: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAt: number;
  intervalMs: number;
};

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function AuthView() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [flow, setFlow] = useState<DeviceFlow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [now, setNow] = useState(Date.now());
  const pollTimerRef = useRef<number | null>(null);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const response = await fetch("/api/auth/status", { cache: "no-store" });
        const body = (await response.json()) as AuthStatus;
        if (!cancelled) {
          setStatus(body);
        }
      } catch {
        if (!cancelled) {
          setStatus({ authenticated: false });
        }
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const remainingMs = useMemo(() => {
    if (!flow) return 0;
    return flow.expiresAt - now;
  }, [flow, now]);

  const startAuth = useCallback(async () => {
    clearPollTimer();
    setPhase("starting");
    setMessage(null);
    setFlow(null);

    try {
      const response = await fetch("/api/auth/device-start", { method: "POST" });
      const body = (await response.json()) as DeviceStartResponse;
      if (!body.ok) {
        setPhase("error");
        setMessage(body.reason ?? "장치 인증을 시작하지 못했습니다.");
        return;
      }

      setFlow({
        session: body.session,
        userCode: body.userCode,
        verificationUri: body.verificationUri,
        verificationUriComplete: body.verificationUriComplete,
        expiresAt: Date.now() + body.expiresIn * 1000,
        intervalMs: Math.max(1, body.interval) * 1000
      });
      setPhase("awaiting");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "장치 인증을 시작하지 못했습니다.");
    }
  }, [clearPollTimer]);

  const cancelAuth = useCallback(() => {
    clearPollTimer();
    setFlow(null);
    setMessage(null);
    setPhase("idle");
  }, [clearPollTimer]);

  const copyCode = useCallback(async () => {
    if (!flow) return;
    try {
      await navigator.clipboard.writeText(flow.userCode);
      toast.success("인증 코드를 복사했습니다.");
    } catch {
      toast.error("코드 복사에 실패했습니다.");
    }
  }, [flow]);

  useEffect(() => {
    if (phase !== "awaiting" || !flow) {
      return;
    }

    const capturedFlow = flow;
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch("/api/auth/device-poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session: capturedFlow.session })
        });
        const body = (await response.json()) as DevicePollResponse;
        if (cancelled) return;

        if (body.status === "success") {
          clearPollTimer();
          setPhase("success");
          setMessage(null);
          toast.success("로그인 성공");
          window.setTimeout(() => router.push("/studio"), 700);
          return;
        }

        if (body.status === "expired" || body.status === "denied" || body.status === "error") {
          clearPollTimer();
          setPhase(body.status);
          setMessage(body.reason ?? null);
          setFlow(null);
          return;
        }

        const nextIntervalMs = body.nextIntervalMs || capturedFlow.intervalMs;
        setFlow(current => current ? { ...current, intervalMs: nextIntervalMs } : current);
        pollTimerRef.current = window.setTimeout(poll, nextIntervalMs);
      } catch (error) {
        if (cancelled) return;
        clearPollTimer();
        setPhase("error");
        setMessage(error instanceof Error ? error.message : "인증 상태 확인에 실패했습니다.");
        setFlow(null);
      }
    }

    pollTimerRef.current = window.setTimeout(poll, capturedFlow.intervalMs);
    return () => {
      cancelled = true;
      clearPollTimer();
    };
  }, [clearPollTimer, flow, phase, router]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 pb-24">
        <header className="flex flex-col gap-4 rounded-lg border border-border/70 bg-card/70 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-md border border-primary/30 bg-primary/10 p-2 text-primary">
              <PlugZap className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold">Codex 계정</h1>
                {status?.authenticated ? (
                  <Badge variant="success">
                    {status.source === "web" ? "Web 로그인" : "Codex CLI 인증"}
                  </Badge>
                ) : (
                  <Badge variant="warning">연결 필요</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">생성 전에 ChatGPT 구독 계정을 연결해 주세요.</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/studio">스튜디오로 돌아가기</Link>
          </Button>
        </header>

        <section className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
          <Card className="rounded-lg">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                사전 조건
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-3">
                <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                  <p className="font-semibold">1. ChatGPT 구독 활성화</p>
                  <p className="mt-1 text-muted-foreground">Plus / Pro / Business / Enterprise 계정을 사용합니다.</p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                  <p className="font-semibold">2. Codex용 장치 코드 인증 활성화</p>
                  <p className="mt-1 text-muted-foreground">
                    ChatGPT 설정 → 보안에서 해당 옵션을 켜야 device code 인증이 승인됩니다.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full">
                <a href="https://chatgpt.com/#settings/Security" target="_blank" rel="noreferrer">
                  ChatGPT 보안 설정 열기
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">로그인</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {status?.authenticated && phase === "idle" ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    이미 연결되어 있습니다.
                  </div>
                  <p className="mt-2 text-emerald-100/80">
                    {status.email ? `${status.email} 계정을 사용 중입니다.` : "현재 인증 토큰을 사용할 수 있습니다."}
                  </p>
                </div>
              ) : null}

              {phase === "awaiting" && flow ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-primary/30 bg-primary/10 p-5 text-center">
                    <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary/80">User code</p>
                    <div className="mt-3 font-mono text-4xl font-semibold tracking-[0.12em] text-primary sm:text-5xl">
                      {flow.userCode}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">이 코드를 ChatGPT 인증 페이지에 입력하거나 자동 입력 링크를 여세요.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button asChild>
                      <a href={flow.verificationUriComplete} target="_blank" rel="noreferrer">
                        인증 페이지 열기
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                    <Button variant="outline" onClick={copyCode}>
                      <Clipboard className="mr-2 h-4 w-4" />
                      코드 복사
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3 rounded-md border border-border/70 bg-muted/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      승인 대기 중...
                    </div>
                    <div className="flex items-center gap-2 font-mono text-sm">
                      <TimerReset className="h-4 w-4 text-muted-foreground" />
                      {formatCountdown(remainingMs)}
                    </div>
                  </div>
                  <Button variant="ghost" className="w-full" onClick={cancelAuth}>
                    취소
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {phase === "success" ? (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        로그인 성공. 스튜디오로 이동합니다.
                      </div>
                    </div>
                  ) : null}
                  {phase === "expired" || phase === "denied" || phase === "error" ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                      <div className="flex items-center gap-2 font-medium">
                        <XCircle className="h-4 w-4" />
                        {phase === "expired" ? "인증 코드 만료" : phase === "denied" ? "인증 거부" : "인증 오류"}
                      </div>
                      {message ? <p className="mt-2 text-destructive/80">{message}</p> : null}
                    </div>
                  ) : null}
                  <Button className="w-full" onClick={startAuth} disabled={phase === "starting" || phase === "success"}>
                    {phase === "starting" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        코드 발급 중...
                      </>
                    ) : (
                      <>
                        <LogIn className="mr-2 h-4 w-4" />
                        연결 시작
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
