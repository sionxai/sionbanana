"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type GenerationOptionsValue = {
  quality: "low" | "medium" | "high";
  size: string;
  format: "png" | "jpeg" | "webp";
  moderation: "low" | "auto";
  count: 1 | 2 | 4;
};

export const DEFAULT_GENERATION_OPTIONS: GenerationOptionsValue = {
  quality: "high",
  size: "2048x1152",
  format: "png",
  moderation: "low",
  count: 1
};

const QUALITY_OPTIONS: Array<{ v: GenerationOptionsValue["quality"]; label: string; note: string }> = [
  { v: "low", label: "Low", note: "fast" },
  { v: "medium", label: "Medium", note: "balanced" },
  { v: "high", label: "High", note: "best" }
];

const SIZE_OPTIONS: Array<{ v: string; label: string; note: string }> = [
  { v: "1024x1024", label: "1024²", note: "1:1" },
  { v: "1536x1024", label: "1536×1024", note: "3:2" },
  { v: "1024x1536", label: "1024×1536", note: "2:3" },
  { v: "1360x1024", label: "1360×1024", note: "4:3" },
  { v: "1024x1360", label: "1024×1360", note: "3:4" },
  { v: "1824x1024", label: "1824×1024", note: "16:9" },
  { v: "1024x1824", label: "1024×1824", note: "9:16" },
  { v: "2048x2048", label: "2048²", note: "2K 1:1" },
  { v: "2048x1152", label: "2048×1152", note: "2K 16:9" },
  { v: "1152x2048", label: "1152×2048", note: "2K 9:16" },
  { v: "3824x2160", label: "3824×2160", note: "4K 16:9" },
  { v: "2160x3824", label: "2160×3824", note: "4K 9:16" },
  { v: "auto", label: "auto", note: "" }
];

const FORMAT_OPTIONS: Array<{ v: GenerationOptionsValue["format"]; label: string }> = [
  { v: "png", label: "PNG" },
  { v: "jpeg", label: "JPEG" },
  { v: "webp", label: "WebP" }
];

const MODERATION_OPTIONS: Array<{ v: GenerationOptionsValue["moderation"]; label: string; note: string }> = [
  { v: "low", label: "Low", note: "less restrictive" },
  { v: "auto", label: "Auto", note: "standard" }
];

const COUNT_OPTIONS: Array<GenerationOptionsValue["count"]> = [1, 2, 4];

function estimateCost(opts: GenerationOptionsValue): { label: string; tone: "muted" | "primary" } {
  // ChatGPT 구독으로 호출 시 추가 과금 없음. API key 직접 호출 시의 대략적 추정.
  const baseByQuality = { low: 0.02, medium: 0.04, high: 0.2 }[opts.quality];
  const sizeMul =
    opts.size === "auto"
      ? 1
      : opts.size.startsWith("3824") || opts.size.startsWith("2160")
        ? 4
        : opts.size.startsWith("2048") || opts.size.startsWith("1152")
          ? 2
          : 1;
  const cost = baseByQuality * sizeMul * opts.count;
  return { label: `≈ $${cost.toFixed(2)} · ChatGPT 구독 사용 시 무과금`, tone: "muted" };
}

type Props = {
  value: GenerationOptionsValue;
  onChange: (next: GenerationOptionsValue) => void;
};

export function GenerationOptionsPanel({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const cost = estimateCost(value);

  return (
    <div ref={containerRef} className="fixed bottom-24 left-4 right-4 z-40 sm:bottom-28 sm:left-6 sm:right-auto">
      {open ? (
        <div className="mb-2 max-h-[70vh] w-full overflow-y-auto rounded-2xl border border-border/60 bg-background/95 p-4 shadow-xl backdrop-blur sm:w-[360px]">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold">생성 옵션</h4>
            <button
              type="button"
              onClick={() => onChange(DEFAULT_GENERATION_OPTIONS)}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              기본값
            </button>
          </div>

          <Section label="Quality">
            <Row>
              {QUALITY_OPTIONS.map(opt => (
                <Chip
                  key={opt.v}
                  selected={value.quality === opt.v}
                  onClick={() => onChange({ ...value, quality: opt.v })}
                >
                  <span className="font-medium">{opt.label}</span>
                  <span className="ml-1 text-[10px] text-muted-foreground">{opt.note}</span>
                </Chip>
              ))}
            </Row>
          </Section>

          <Section label="Size">
            <div className="grid grid-cols-3 gap-1.5">
              {SIZE_OPTIONS.map(opt => (
                <Chip
                  key={opt.v}
                  selected={value.size === opt.v}
                  onClick={() => onChange({ ...value, size: opt.v })}
                  className="flex flex-col items-start py-1.5"
                >
                  <span className="text-[11px] font-medium">{opt.label}</span>
                  {opt.note ? <span className="text-[9px] text-muted-foreground">{opt.note}</span> : null}
                </Chip>
              ))}
            </div>
          </Section>

          <Section label="Model">
            <Chip selected className="cursor-default">
              <span className="font-medium">Custom</span>
              <span className="ml-1 text-[10px] text-muted-foreground">free (Codex OAuth)</span>
            </Chip>
          </Section>

          <Section label="Format">
            <Row>
              {FORMAT_OPTIONS.map(opt => (
                <Chip
                  key={opt.v}
                  selected={value.format === opt.v}
                  onClick={() => onChange({ ...value, format: opt.v })}
                >
                  {opt.label}
                </Chip>
              ))}
            </Row>
          </Section>

          <Section label="Moderation">
            <Row>
              {MODERATION_OPTIONS.map(opt => (
                <Chip
                  key={opt.v}
                  selected={value.moderation === opt.v}
                  onClick={() => onChange({ ...value, moderation: opt.v })}
                >
                  <span className="font-medium">{opt.label}</span>
                  <span className="ml-1 text-[10px] text-muted-foreground">{opt.note}</span>
                </Chip>
              ))}
            </Row>
          </Section>

          <Section label="Count">
            <Row>
              {COUNT_OPTIONS.map(n => (
                <Chip
                  key={n}
                  selected={value.count === n}
                  onClick={() => onChange({ ...value, count: n })}
                  className="min-w-[3rem] justify-center"
                >
                  {n}
                </Chip>
              ))}
            </Row>
          </Section>

          <div className="mt-4 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">Est. cost</span> {cost.label}
          </div>
        </div>
      ) : null}
      <Button
        variant="outline"
        className="rounded-full bg-background/90 shadow-md backdrop-blur"
        onClick={() => setOpen(prev => !prev)}
      >
        <span className="text-sm font-medium">생성 옵션</span>
        <ChevronDown className={cn("ml-2 h-4 w-4 transition-transform", open ? "rotate-0" : "rotate-180")} />
        <span className="ml-3 hidden text-[11px] text-muted-foreground sm:inline">
          {value.quality} · {value.size} · {value.count}장
        </span>
      </Button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function Chip({
  selected,
  onClick,
  children,
  className
}: {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] transition",
        selected
          ? "border-primary/70 bg-primary/10 text-foreground"
          : "border-border/60 bg-background hover:border-primary/40 hover:bg-muted/40",
        className
      )}
    >
      {children}
    </button>
  );
}
