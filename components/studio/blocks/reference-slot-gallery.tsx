"use client";

import type { DragEvent, MutableRefObject } from "react";
import NextImage from "next/image";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ReferenceSlotView = {
  id: string;
  imageUrl: string | null;
  handle: string;
};

type ReferenceSlotGalleryProps = {
  slots: ReferenceSlotView[];
  limit: number;
  inputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onAdd?: () => void;
  onUpload?: (slotId: string, file: File) => Promise<void> | void;
  onClear?: (slotId: string) => void;
  onSelect?: (slotId: string) => Promise<void> | void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onCreateDrop: (event: DragEvent<HTMLElement>) => void;
  onSlotDrop: (event: DragEvent<HTMLElement>, slotId: string) => void;
};

export function ReferenceSlotGallery({
  slots,
  limit,
  inputRefs,
  onAdd,
  onUpload,
  onClear,
  onSelect,
  onDragOver,
  onCreateDrop,
  onSlotDrop
}: ReferenceSlotGalleryProps) {
  const filledCount = slots.filter(slot => Boolean(slot.imageUrl)).length;
  const canAddMore = slots.length < limit;
  const showLoadWarning = filledCount >= 5;

  return (
    <div className="space-y-3" onDragOver={onDragOver} onDrop={onCreateDrop}>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-muted-foreground">참조 이미지</p>
          <p className="text-[11px] text-muted-foreground">
            권장 1-4장 · 최대 {limit}장 · 현재 {filledCount}장
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={() => onAdd?.()}
          onDragOver={onDragOver}
          onDrop={onCreateDrop}
          disabled={!canAddMore || !onAdd}
        >
          슬롯 추가
        </Button>
      </div>
      {showLoadWarning ? (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
          참조 이미지가 5장 이상이면 생성 시간이 크게 늘 수 있습니다. 8장은 가능하지만 2분 이상 걸릴 수 있어요.
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {slots.map(slot => (
          <ReferenceSlotCard
            key={slot.id}
            slot={slot}
            inputRefs={inputRefs}
            onUpload={onUpload}
            onClear={onClear}
            onSelect={onSelect}
            onDragOver={onDragOver}
            onDrop={event => onSlotDrop(event, slot.id)}
          />
        ))}
        {canAddMore ? (
          <button
            type="button"
            className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed bg-muted/20 text-muted-foreground transition hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onAdd?.()}
            onDragOver={onDragOver}
            onDrop={onCreateDrop}
            disabled={!onAdd}
            aria-label="참조 슬롯 추가"
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

type ReferenceSlotCardProps = {
  slot: ReferenceSlotView;
  inputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onUpload?: (slotId: string, file: File) => Promise<void> | void;
  onClear?: (slotId: string) => void;
  onSelect?: (slotId: string) => Promise<void> | void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

function ReferenceSlotCard({
  slot,
  inputRefs,
  onUpload,
  onClear,
  onSelect,
  onDragOver,
  onDrop
}: ReferenceSlotCardProps) {
  return (
    <div className="space-y-1">
      <div
        className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/40"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {slot.imageUrl ? (
          <NextImage
            src={slot.imageUrl}
            alt="reference slot"
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <EmptyReferenceSlot label="참조 이미지" />
        )}
        {slot.handle && slot.imageUrl ? (
          <div className="absolute left-2 top-2 rounded-md bg-background/85 px-2 py-1 text-[11px] font-semibold text-foreground shadow-sm">
            @{slot.handle}
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-background/70 opacity-0 transition group-hover:opacity-100">
          <div className="pointer-events-auto flex flex-col gap-1 p-2">
            <Button
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => slot.imageUrl && void onSelect?.(slot.id)}
              disabled={!slot.imageUrl || !onSelect}
            >
              기준으로 사용
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 px-2 text-[11px]"
              onClick={() => onClear?.(slot.id)}
              disabled={!slot.imageUrl || !onClear}
            >
              삭제
            </Button>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 px-2 text-[11px]"
          onClick={() => inputRefs.current[slot.id]?.click()}
          disabled={!onUpload}
        >
          업로드
        </Button>
        {slot.imageUrl ? (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 flex-1 px-2 text-[11px]"
            onClick={() => void onSelect?.(slot.id)}
            disabled={!onSelect}
          >
            사용
          </Button>
        ) : null}
      </div>
      <input
        ref={node => {
          inputRefs.current[slot.id] = node;
        }}
        id={`reference-slot-${slot.id}`}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) {
            void onUpload?.(slot.id, file);
          }
          event.target.value = "";
        }}
      />
    </div>
  );
}

function EmptyReferenceSlot({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/30 px-2 text-center text-muted-foreground">
      <span className="text-[11px] font-semibold text-foreground/80">{label}</span>
    </div>
  );
}
