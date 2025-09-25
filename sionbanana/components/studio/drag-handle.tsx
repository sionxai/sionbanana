"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface DragHandleProps {
  orientation?: "vertical" | "horizontal";
  onDrag?: (delta: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDoubleClick?: () => void;
  className?: string;
}

export function DragHandle({
  orientation = "vertical",
  onDrag,
  onDragStart,
  onDragEnd,
  onDoubleClick,
  className
}: DragHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart(orientation === "vertical" ? e.clientX : e.clientY);
    onDragStart?.();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentPos = orientation === "vertical" ? moveEvent.clientX : moveEvent.clientY;
      const delta = currentPos - dragStart;
      onDrag?.(delta);
      setDragStart(currentPos);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onDragEnd?.();
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={orientation}
      aria-label={`패널 크기 조절 ${orientation === "vertical" ? "세로" : "가로"} 구분선`}
      className={cn(
        "group relative flex items-center justify-center bg-transparent hover:bg-border/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
        orientation === "vertical"
          ? "w-2 h-full cursor-col-resize"
          : "h-2 w-full cursor-row-resize",
        isDragging && "bg-border",
        className
      )}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDoubleClick?.();
        }
      }}
      title={onDoubleClick ? "더블클릭하여 기본 크기로 복원 (또는 Enter/Space 키)" : "드래그하여 패널 크기 조절"}
    >
      {/* Visual indicator */}
      <div
        className={cn(
          "bg-border rounded-full transition-all group-hover:bg-foreground/60",
          orientation === "vertical"
            ? "w-1 h-8"
            : "h-1 w-8",
          isDragging && "bg-foreground/80"
        )}
      />

      {/* Invisible drag area for better UX */}
      <div
        className={cn(
          "absolute",
          orientation === "vertical"
            ? "w-4 h-full -left-1"
            : "h-4 w-full -top-1"
        )}
      />
    </div>
  );
}