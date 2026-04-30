"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type RateWindow = {
  used_percent: number;
  limit_window_seconds: number;
  reset_after_seconds: number;
  reset_at: number;
};

type RateLimit = {
  allowed: boolean;
  limit_reached: boolean;
  primary_window: RateWindow | null;
  secondary_window: RateWindow | null;
};

type AdditionalRateLimit = {
  limit_name: string;
  metered_feature?: string;
  rate_limit: RateLimit;
};

type Usage = {
  user_id?: string;
  account_id?: string;
  email?: string;
  plan_type?: string;
  rate_limit?: RateLimit;
  additional_rate_limits?: AdditionalRateLimit[];
  credits?: Record<string, unknown>;
};

type ApiResponse =
  | { ok: true; usage: Usage }
  | { ok: false; reason: string; code?: string };

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "지금";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) {
    const days = Math.floor(h / 24);
    const remH = h % 24;
    return remH ? `${days}일 ${remH}시간` : `${days}일`;
  }
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function formatWindowLabel(seconds: number): string {
  if (seconds === 18000) return "5시간 윈도우";
  if (seconds === 604800) return "주간 윈도우";
  if (seconds % 86400 === 0) return `${seconds / 86400}일 윈도우`;
  if (seconds % 3600 === 0) return `${seconds / 3600}시간 윈도우`;
  return `${seconds}초 윈도우`;
}

function formatResetAt(epochSec: number): string {
  if (!epochSec) return "—";
  const d = new Date(epochSec * 1000);
  return d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

function ProgressBar({ percent }: { percent: number }) {
  const safe = Math.max(0, Math.min(100, percent ?? 0));
  const tone =
    safe >= 90 ? "bg-destructive" : safe >= 70 ? "bg-yellow-500" : "bg-primary";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full transition-all ${tone}`}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

function WindowRow({
  label,
  window
}: {
  label: string;
  window: RateWindow | null;
}) {
  if (!window) {
    return (
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        <span>데이터 없음</span>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {label} <span className="text-muted-foreground">({formatWindowLabel(window.limit_window_seconds)})</span>
        </span>
        <span className="tabular-nums">
          <span className="font-semibold">{window.used_percent.toFixed(1)}%</span>
          <span className="ml-2 text-muted-foreground">
            리셋까지 {formatDuration(window.reset_after_seconds)}
          </span>
        </span>
      </div>
      <ProgressBar percent={window.used_percent} />
      <div className="text-[11px] text-muted-foreground">
        리셋 예정: {formatResetAt(window.reset_at)}
      </div>
    </div>
  );
}

export function UsageView() {
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/usage", { cache: "no-store" });
      const body = (await response.json()) as ApiResponse;
      if (!body.ok) {
        setError(body.reason || "사용량을 불러오지 못했습니다.");
        setData(null);
      } else {
        setData(body.usage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 pb-24">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Codex 사용량</h1>
          <p className="text-sm text-muted-foreground">
            ChatGPT 구독 한도 (5시간 / 주간) 및 모델별 추가 한도 현황입니다.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? "불러오는 중..." : "새로고침"}
        </Button>
      </header>

      {error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {error}
            <div className="mt-2 text-xs text-muted-foreground">
              인증이 만료되었거나 Codex CLI에 로그인되지 않았을 수 있습니다. 터미널에서{" "}
              <code className="rounded bg-muted px-1 py-0.5">npx @openai/codex login</code>을 실행한 후
              다시 시도해주세요.
            </div>
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">계정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">이메일</span>
                <span className="font-medium">{data.email ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">플랜</span>
                <Badge variant="secondary" className="capitalize">
                  {data.plan_type ?? "unknown"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">계정 ID</span>
                <span className="font-mono text-xs">{data.account_id ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">기본 한도</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <WindowRow label="5시간" window={data.rate_limit?.primary_window ?? null} />
              <WindowRow label="주간" window={data.rate_limit?.secondary_window ?? null} />
              {data.rate_limit?.limit_reached ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  현재 한도에 도달했습니다. 윈도우 리셋 후 다시 시도해주세요.
                </div>
              ) : null}
            </CardContent>
          </Card>

          {data.additional_rate_limits && data.additional_rate_limits.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">모델별 추가 한도</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {data.additional_rate_limits.map(item => (
                  <div key={item.limit_name + (item.metered_feature ?? "")} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{item.limit_name}</span>
                      {item.metered_feature ? (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {item.metered_feature}
                        </span>
                      ) : null}
                    </div>
                    <WindowRow label="5시간" window={item.rate_limit.primary_window} />
                    <WindowRow label="주간" window={item.rate_limit.secondary_window} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {data.credits ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">크레딧 / 추가 정보</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(data.credits, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      {loading && !data && !error ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">불러오는 중...</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
