"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface DiffSliderProps {
  beforeSrc?: string;
  afterSrc?: string;
  labelBefore?: string;
  labelAfter?: string;
  priority?: boolean;
  zoomLevel?: number;
  onZoomChange?: (level: number) => void;
}

export function DiffSlider({
  beforeSrc,
  afterSrc,
  labelBefore = "Before",
  labelAfter = "After",
  priority = false,
  zoomLevel = 1.0,
  onZoomChange
}: DiffSliderProps) {
  const [position, setPosition] = useState(0);

  useEffect(() => {
    setPosition(afterSrc ? 0 : 50);
  }, [beforeSrc, afterSrc]);


  return (
    <div className="relative w-full overflow-auto rounded-2xl border bg-black/90 shadow">
      <div
        className="relative bg-black transition-all duration-200"
        style={{
          width: `${zoomLevel * 100}%`,
          aspectRatio: '4/3',
          minWidth: '100%',
        }}
      >
        {afterSrc ? (
          <img
            key={`after-${afterSrc}`}
            src={afterSrc}
            alt="after"
            className="absolute inset-0 h-full w-full object-contain"
            loading={priority ? "eager" : "lazy"}
          />
        ) : (
          <Placeholder label="생성 결과 미리보기" />
        )}
        {beforeSrc ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          >
            <img
              key={`before-${beforeSrc}`}
              src={beforeSrc}
              alt="before"
              className="absolute inset-0 h-full w-full object-contain"
              loading={priority ? "eager" : "lazy"}
            />
            <div
              className="absolute inset-y-0 w-0.5 bg-white/70"
              style={{ right: `calc(100% - ${position}%)` }}
            />
          </div>
        ) : null}
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <BadgeTag>{labelBefore}</BadgeTag>
        <BadgeTag>{labelAfter}</BadgeTag>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-6 py-4">
        <span className="text-xs text-muted-foreground">슬라이드를 드래그해 비교하기</span>
        <input
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/30"
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={event => setPosition(Number(event.target.value))}
        />
      </div>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-800 to-slate-900 text-center text-slate-200">
      <span className="text-sm font-medium">{label}</span>
      <p className="max-w-[280px] text-xs text-slate-400">
        생성된 이미지와 기존 이미지를 슬라이더로 비교할 수 있습니다. 아직 업로드된 이미지가 없습니다.
      </p>
    </div>
  );
}

function BadgeTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full border border-white/40 bg-black/50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white",
        "backdrop-blur"
      )}
    >
      {children}
    </span>
  );
}
