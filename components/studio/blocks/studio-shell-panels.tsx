"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DragHandle } from "@/components/studio/drag-handle";

type StudioShellPanelSide = "left" | "right";

type StudioShellSidePanelProps = {
  side: StudioShellPanelSide;
  width: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function StudioShellSidePanel({
  side,
  width,
  collapsed,
  onToggle,
  children
}: StudioShellSidePanelProps) {
  const isLeft = side === "left";
  const widthVariable = isLeft ? "--left-panel-width" : "--right-panel-width";

  return (
    <div
      className={cn(
        isLeft
          ? "relative w-full lg:flex-shrink-0 lg:w-[var(--left-panel-width)]"
          : "relative mt-4 w-full flex-shrink-0 lg:mt-0 lg:w-[var(--right-panel-width)]",
        collapsed && "lg:hidden"
      )}
      style={{
        [widthVariable]: `${width}px`
      } as CSSProperties}
    >
      <button
        onClick={onToggle}
        className={cn(
          "absolute top-4 z-10 hidden h-6 w-6 rounded-full lg:flex",
          isLeft ? "-right-3" : "-left-3",
          "items-center justify-center border border-border bg-background text-xs shadow-sm",
          "transition-colors hover:bg-accent"
        )}
        title="패널 접기"
      >
        {isLeft ? "←" : "→"}
      </button>
      {children}
    </div>
  );
}

type StudioShellCollapsedRailProps = {
  side: StudioShellPanelSide;
  collapsed: boolean;
  onToggle: () => void;
};

export function StudioShellCollapsedRail({
  side,
  collapsed,
  onToggle
}: StudioShellCollapsedRailProps) {
  if (!collapsed) {
    return null;
  }

  const isLeft = side === "left";

  return (
    <div className="hidden lg:flex">
      <button
        onClick={onToggle}
        className={cn(
          "flex h-full w-6 items-center justify-center bg-background text-xs transition-colors hover:bg-accent",
          isLeft ? "border-r border-border" : "border-l border-border"
        )}
        title="패널 펼치기"
      >
        {isLeft ? "→" : "←"}
      </button>
    </div>
  );
}

type StudioShellDragDividerProps = {
  visible: boolean;
  onDrag: (delta: number) => void;
  onReset: () => void;
};

export function StudioShellDragDivider({
  visible,
  onDrag,
  onReset
}: StudioShellDragDividerProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="hidden lg:flex">
      <DragHandle
        orientation="vertical"
        onDrag={onDrag}
        onDragEnd={() => {}}
        onDoubleClick={onReset}
      />
    </div>
  );
}

type StudioShellCenterPanelProps = {
  width: number;
  children: ReactNode;
};

export function StudioShellCenterPanel({ width, children }: StudioShellCenterPanelProps) {
  return (
    <div
      className="w-full min-w-0 flex-1 px-2 lg:w-[var(--center-panel-width)]"
      style={{
        "--center-panel-width": `${width}px`
      } as CSSProperties}
    >
      {children}
    </div>
  );
}
