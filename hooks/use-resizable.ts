"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// Throttle utility function
function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}

interface ResizableConfig {
  initialLeftWidth?: number;
  initialRightWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  minRightWidth?: number;
  maxRightWidth?: number;
  containerRef: React.RefObject<HTMLElement>;
  storageKey?: string;
}

interface ResizableState {
  leftWidth: number;
  rightWidth: number;
  centerWidth: number;
  isDragging: boolean;
  isCollapsed: {
    left: boolean;
    right: boolean;
  };
}

interface ResizableActions {
  handleLeftDrag: (delta: number) => void;
  handleRightDrag: (delta: number) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  resetToDefault: () => void;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
}

const DEFAULT_LEFT_WIDTH = 320;
const DEFAULT_RIGHT_WIDTH = 360;
const MIN_PANEL_WIDTH = 200;
const MAX_PANEL_WIDTH = 600;

export function useResizable(config: ResizableConfig): ResizableState & ResizableActions {
  const {
    initialLeftWidth = DEFAULT_LEFT_WIDTH,
    initialRightWidth = DEFAULT_RIGHT_WIDTH,
    minLeftWidth = MIN_PANEL_WIDTH,
    maxLeftWidth = MAX_PANEL_WIDTH,
    minRightWidth = MIN_PANEL_WIDTH,
    maxRightWidth = MAX_PANEL_WIDTH,
    containerRef,
    storageKey
  } = config;

  // Load saved sizes from localStorage
  const loadSavedSizes = useCallback(() => {
    if (!storageKey || typeof window === "undefined") {
      return { leftWidth: initialLeftWidth, rightWidth: initialRightWidth };
    }

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          leftWidth: Math.max(minLeftWidth, Math.min(maxLeftWidth, parsed.leftWidth || initialLeftWidth)),
          rightWidth: Math.max(minRightWidth, Math.min(maxRightWidth, parsed.rightWidth || initialRightWidth))
        };
      }
    } catch (error) {
      console.warn("Failed to load saved panel sizes:", error);
    }

    return { leftWidth: initialLeftWidth, rightWidth: initialRightWidth };
  }, [storageKey, initialLeftWidth, initialRightWidth, minLeftWidth, maxLeftWidth, minRightWidth, maxRightWidth]);

  const [leftWidth, setLeftWidthState] = useState(loadSavedSizes().leftWidth);
  const [rightWidth, setRightWidthState] = useState(loadSavedSizes().rightWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState({
    left: false,
    right: false
  });

  // Calculate center width based on container size
  const [centerWidth, setCenterWidth] = useState(0);

  const updateCenterWidth = useCallback(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const padding = 32; // Account for gaps and padding
      const newCenterWidth = containerWidth - leftWidth - rightWidth - padding;
      setCenterWidth(Math.max(200, newCenterWidth)); // Minimum center width
    }
  }, [leftWidth, rightWidth, containerRef]);

  useEffect(() => {
    updateCenterWidth();

    const handleResize = () => updateCenterWidth();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, [updateCenterWidth]);

  // Save sizes to localStorage
  const saveSizes = useCallback((newLeftWidth: number, newRightWidth: number) => {
    if (!storageKey || typeof window === "undefined") return;

    try {
      localStorage.setItem(storageKey, JSON.stringify({
        leftWidth: newLeftWidth,
        rightWidth: newRightWidth
      }));
    } catch (error) {
      console.warn("Failed to save panel sizes:", error);
    }
  }, [storageKey]);

  const setLeftWidth = useCallback((width: number) => {
    if (!containerRef.current) return;

    const clampedWidth = Math.max(minLeftWidth, Math.min(maxLeftWidth, width));
    setLeftWidthState(clampedWidth);
    saveSizes(clampedWidth, rightWidth);
  }, [minLeftWidth, maxLeftWidth, rightWidth, saveSizes, containerRef]);

  const setRightWidth = useCallback((width: number) => {
    if (!containerRef.current) return;

    const clampedWidth = Math.max(minRightWidth, Math.min(maxRightWidth, width));
    setRightWidthState(clampedWidth);
    saveSizes(leftWidth, clampedWidth);
  }, [minRightWidth, maxRightWidth, leftWidth, saveSizes, containerRef]);

  // Throttled resize handlers for better performance
  const throttledSetLeftWidth = useCallback(
    throttle((width: number) => setLeftWidth(width), 16), // ~60fps
    [setLeftWidth]
  );

  const throttledSetRightWidth = useCallback(
    throttle((width: number) => setRightWidth(width), 16), // ~60fps
    [setRightWidth]
  );

  const handleLeftDrag = useCallback((delta: number) => {
    setIsDragging(true);
    const newWidth = leftWidth + delta;
    throttledSetLeftWidth(newWidth);
  }, [leftWidth, throttledSetLeftWidth]);

  const handleRightDrag = useCallback((delta: number) => {
    setIsDragging(true);
    const newWidth = rightWidth - delta; // Negative delta for right panel
    throttledSetRightWidth(newWidth);
  }, [rightWidth, throttledSetRightWidth]);

  const toggleLeftPanel = useCallback(() => {
    setIsCollapsed(prev => ({
      ...prev,
      left: !prev.left
    }));
  }, []);

  const toggleRightPanel = useCallback(() => {
    setIsCollapsed(prev => ({
      ...prev,
      right: !prev.right
    }));
  }, []);

  const resetToDefault = useCallback(() => {
    setLeftWidthState(initialLeftWidth);
    setRightWidthState(initialRightWidth);
    saveSizes(initialLeftWidth, initialRightWidth);
    setIsCollapsed({ left: false, right: false });
  }, [initialLeftWidth, initialRightWidth, saveSizes]);

  return {
    // State
    leftWidth: isCollapsed.left ? 0 : leftWidth,
    rightWidth: isCollapsed.right ? 0 : rightWidth,
    centerWidth,
    isDragging,
    isCollapsed,

    // Actions
    handleLeftDrag,
    handleRightDrag,
    toggleLeftPanel,
    toggleRightPanel,
    resetToDefault,
    setLeftWidth,
    setRightWidth
  };
}