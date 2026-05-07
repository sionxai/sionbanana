"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

type GenerationProgressIndicatorProps = {
  inflightCount: number;
  referenceCount?: number;
  size?: string;
};

export function GenerationProgressIndicator({ inflightCount, referenceCount = 0, size }: GenerationProgressIndicatorProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (inflightCount <= 0) {
      setElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [inflightCount]);

  const phaseLabel = useMemo(() => {
    if (elapsedSeconds < 10) return "요청 전송 중";
    if (elapsedSeconds < 35) return "프롬프트와 참조 이미지 준비 중";
    if (elapsedSeconds < 120) return "Codex 이미지 생성 중";
    return "긴 생성 작업 진행 중";
  }, [elapsedSeconds]);

  const longJobHint = referenceCount >= 5 || size?.includes("3824") || size?.includes("2160");

  if (inflightCount <= 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-40 max-w-[calc(100vw-2rem)] rounded-2xl border border-primary/40 bg-background/95 px-4 py-3 shadow-lg backdrop-blur sm:bottom-28 sm:right-6">
      <div className="flex items-center gap-3">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm font-medium">
          이미지 생성 중 <span className="text-primary">{inflightCount}</span>개
        </span>
        <span className="text-[11px] text-muted-foreground">{elapsedSeconds}s</span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {phaseLabel}
        {longJobHint ? " · 고해상도/다중 참조는 2분 이상 걸릴 수 있습니다." : " · 평균 60-90초"}
      </div>
    </div>
  );
}
