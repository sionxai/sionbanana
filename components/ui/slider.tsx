"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// 임시: Radix slider 무한 루프 우회를 위해 native input[type=range]로 대체.
// 무한 루프 원인이 명확해지면 다시 Radix로 복원하거나 별도 컴포넌트로 분리.
type SliderProps = {
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  disabled?: boolean;
};

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, min, max, step, value, defaultValue, onValueChange, disabled }, ref) => {
    const current = (value ?? defaultValue ?? [min ?? 0])[0] ?? 0;
    return (
      <div className={cn("relative flex w-full items-center", className)}>
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          onChange={event => {
            const next = Number(event.target.value);
            onValueChange?.([next]);
          }}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:opacity-50"
        />
      </div>
    );
  }
);
Slider.displayName = "Slider";

export { Slider };
