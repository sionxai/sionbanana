"use client";

import { Loader2 } from "lucide-react";

type GenerationProgressIndicatorProps = {
  inflightCount: number;
};

export function GenerationProgressIndicator({ inflightCount }: GenerationProgressIndicatorProps) {
  if (inflightCount <= 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 right-6 z-40 flex items-center gap-3 rounded-full border border-primary/40 bg-background/95 px-4 py-2 shadow-lg backdrop-blur sm:bottom-28">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <span className="text-sm font-medium">
        이미지 생성 중 <span className="text-primary">{inflightCount}</span>개
      </span>
      <span className="text-[11px] text-muted-foreground">평균 60~90초</span>
    </div>
  );
}
