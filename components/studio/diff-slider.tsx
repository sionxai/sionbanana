"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { ImagePanZoomBind, ImagePanZoomTransform } from "@/components/studio/use-image-pan-zoom";

interface DiffSliderProps {
  beforeSrc?: string;
  afterSrc?: string;
  labelBefore?: string;
  labelAfter?: string;
  priority?: boolean;
  transform: ImagePanZoomTransform;
  panZoomBind: ImagePanZoomBind;
  isPanning?: boolean;
}

export function DiffSlider({
  beforeSrc,
  afterSrc,
  labelBefore = "Before",
  labelAfter = "After",
  priority = false,
  transform,
  panZoomBind,
  isPanning = false
}: DiffSliderProps) {
  const [position, setPosition] = useState(0);
  const [isDraggingHandle, setIsDraggingHandle] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panZoomHandlers = {
    onWheel: panZoomBind.onWheel,
    onPointerDown: panZoomBind.onPointerDown,
    onPointerMove: panZoomBind.onPointerMove,
    onPointerUp: panZoomBind.onPointerUp,
    onPointerCancel: panZoomBind.onPointerCancel,
    onDoubleClick: panZoomBind.onDoubleClick
  };

  const setRootRef = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    panZoomBind.ref(node);
  }, [panZoomBind]);

  useEffect(() => {
    setPosition(beforeSrc && afterSrc ? 50 : 0);
  }, [beforeSrc, afterSrc]);

  const setPositionFromPointer = useCallback((clientX: number) => {
    const root = rootRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    const contentX = (clientX - rect.left - transform.panX) / transform.scale;
    const nextPosition = Math.min(100, Math.max(0, (contentX / Math.max(rect.width, 1)) * 100));
    setPosition(nextPosition);
  }, [transform.panX, transform.scale]);

  const handleDiffPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingHandle(true);
    setPositionFromPointer(event.clientX);
  }, [setPositionFromPointer]);

  const handleDiffPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingHandle) return;
    event.stopPropagation();
    event.preventDefault();
    setPositionFromPointer(event.clientX);
  }, [isDraggingHandle, setPositionFromPointer]);

  const handleDiffPointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDraggingHandle(false);
  }, []);

  return (
    <div
      {...panZoomHandlers}
      ref={setRootRef}
      className={cn(
        "relative aspect-[4/3] w-full select-none overflow-hidden rounded-2xl border bg-black/90 shadow",
        isPanning ? "cursor-grabbing" : "cursor-grab"
      )}
    >
      <div
        className="absolute inset-0 bg-black will-change-transform"
        style={{
          transform: `translate3d(${transform.panX}px, ${transform.panY}px, 0) scale(${transform.scale})`,
          transformOrigin: "0 0"
        }}
      >
        {afterSrc ? (
          <Image
            key={`after-${afterSrc}`}
            src={afterSrc}
            alt="after"
            fill
            className="object-contain"
            draggable={false}
            priority={priority}
            unoptimized={afterSrc.startsWith('data:')}
          />
        ) : (
          <Placeholder label="생성 결과 미리보기" />
        )}
        {beforeSrc ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          >
            <Image
              key={`before-${beforeSrc}`}
              src={beforeSrc}
              alt="before"
              fill
              className="object-contain"
              draggable={false}
              priority={priority}
              unoptimized={beforeSrc.startsWith('data:')}
            />
          </div>
        ) : null}
        {beforeSrc ? (
          <div
            data-diff-handle
            className="absolute inset-y-0 z-20 w-16 -translate-x-1/2 cursor-ew-resize touch-none"
            style={{ left: `${position}%` }}
            onPointerDown={handleDiffPointerDown}
            onPointerMove={handleDiffPointerMove}
            onPointerUp={handleDiffPointerEnd}
            onPointerCancel={handleDiffPointerEnd}
          >
            <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/80 shadow-[0_0_12px_rgba(0,0,0,0.55)]" />
            <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-black/60 text-[10px] font-semibold text-white shadow-lg backdrop-blur">
              ↔
            </div>
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
          data-diff-handle
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/30"
          type="range"
          min={0}
          max={100}
          value={position}
          onPointerDown={event => event.stopPropagation()}
          onChange={event => setPosition(Number(event.target.value))}
          disabled={!beforeSrc}
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
