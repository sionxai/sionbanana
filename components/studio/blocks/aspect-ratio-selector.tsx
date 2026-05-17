"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ASPECT_RATIO_PRESETS, DEFAULT_ASPECT_RATIO } from "@/lib/aspect";
import type { AspectRatioPreset } from "@/lib/types";

type AspectRatioSelectorProps = {
  value: AspectRatioPreset;
  onChange: (value: AspectRatioPreset) => void;
};

export function AspectRatioSelector({ value, onChange }: AspectRatioSelectorProps) {
  const defaultLabel = ASPECT_RATIO_PRESETS.find(item => item.value === DEFAULT_ASPECT_RATIO)?.label ?? "원본 그대로";

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">비율 프리셋</Label>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={nextValue => nextValue && onChange(nextValue as AspectRatioPreset)}
        className="flex flex-wrap gap-2"
      >
        {ASPECT_RATIO_PRESETS.map(preset => (
          <ToggleGroupItem key={preset.value} value={preset.value}>
            {preset.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="border-dashed px-2 py-1 text-[11px]"
          onClick={() => onChange(DEFAULT_ASPECT_RATIO)}
          disabled={value === DEFAULT_ASPECT_RATIO}
        >
          기본값 {defaultLabel}
        </Button>
      </div>
    </div>
  );
}
