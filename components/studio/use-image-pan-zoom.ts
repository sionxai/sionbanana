"use client";

import { useCallback, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";

export type ImagePanZoomTransform = {
  scale: number;
  panX: number;
  panY: number;
};

export type ImagePanZoomBind = {
  ref: (node: HTMLDivElement | null) => void;
  onWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
};

export const MIN_IMAGE_ZOOM = 0.25;
export const MAX_IMAGE_ZOOM = 8;

const DEFAULT_TRANSFORM: ImagePanZoomTransform = { scale: 1, panX: 0, panY: 0 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isIgnoredPanTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(target.closest("[data-diff-handle], input, button, a, textarea, select"))
    : false;
}

export function useImagePanZoom(opts: { min?: number; max?: number; wheelRequiresModifier?: boolean } = {}) {
  const min = opts.min ?? MIN_IMAGE_ZOOM;
  const max = opts.max ?? MAX_IMAGE_ZOOM;
  const wheelRequiresModifier = opts.wheelRequiresModifier ?? true;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const [transform, setTransform] = useState<ImagePanZoomTransform>(DEFAULT_TRANSFORM);
  const [isPanning, setIsPanning] = useState(false);

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      containerRef.current = node;
    }
  }, []);

  const zoomTo = useCallback((nextScaleInput: number, anchor?: { x: number; y: number }) => {
    setTransform(current => {
      const nextScale = clamp(nextScaleInput, min, max);
      if (nextScale === current.scale) {
        return current;
      }
      const container = containerRef.current;
      const resolvedAnchor = anchor ?? (container
        ? { x: container.clientWidth / 2, y: container.clientHeight / 2 }
        : null);

      if (!resolvedAnchor) {
        return { ...current, scale: nextScale };
      }

      const k = nextScale / current.scale;
      return {
        scale: nextScale,
        panX: resolvedAnchor.x - k * (resolvedAnchor.x - current.panX),
        panY: resolvedAnchor.y - k * (resolvedAnchor.y - current.panY)
      };
    });
  }, [max, min]);

  const zoomBy = useCallback((factor: number, anchor?: { x: number; y: number }) => {
    setTransform(current => {
      const nextScale = clamp(current.scale * factor, min, max);
      if (nextScale === current.scale) {
        return current;
      }
      const container = containerRef.current;
      const resolvedAnchor = anchor ?? (container
        ? { x: container.clientWidth / 2, y: container.clientHeight / 2 }
        : null);

      if (!resolvedAnchor) {
        return { ...current, scale: nextScale };
      }

      const k = nextScale / current.scale;
      return {
        scale: nextScale,
        panX: resolvedAnchor.x - k * (resolvedAnchor.x - current.panX),
        panY: resolvedAnchor.y - k * (resolvedAnchor.y - current.panY)
      };
    });
  }, [max, min]);

  const reset = useCallback(() => {
    setTransform(DEFAULT_TRANSFORM);
  }, []);

  const zoomIn = useCallback(() => {
    zoomBy(1.25);
  }, [zoomBy]);

  const zoomOut = useCallback(() => {
    zoomBy(1 / 1.25);
  }, [zoomBy]);

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    containerRef.current = event.currentTarget;
    if (wheelRequiresModifier && !(event.ctrlKey || event.metaKey)) {
      return;
    }
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomBy(factor, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });
  }, [wheelRequiresModifier, zoomBy]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    containerRef.current = event.currentTarget;
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    if (isIgnoredPanTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: transform.panX,
      startPanY: transform.panY
    };
    setIsPanning(true);
  }, [transform.panX, transform.panY]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    setTransform(current => ({
      ...current,
      panX: drag.startPanX + event.clientX - drag.startX,
      panY: drag.startPanY + event.clientY - drag.startY
    }));
  }, []);

  const endPointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setIsPanning(false);
  }, []);

  const bind = useMemo<ImagePanZoomBind>(() => ({
    ref: setContainerRef,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
    onDoubleClick: reset
  }), [endPointer, onPointerDown, onPointerMove, onWheel, reset, setContainerRef]);

  return {
    transform,
    scale: transform.scale,
    isPanning,
    bind,
    containerRef,
    setTransform,
    zoomIn,
    zoomOut,
    zoomTo,
    reset,
    min,
    max
  };
}
