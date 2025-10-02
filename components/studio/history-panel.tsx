"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import NextImage from "next/image";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GeneratedImageDocument } from "@/lib/types";
import { getAspectRatioLabel } from "@/lib/aspect";

const RECENT_RECORD_LIMIT = 3;

interface ReferenceSlotView {
  id: string;
  imageUrl: string | null;
}

interface HistoryPanelProps {
  records: GeneratedImageDocument[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  referenceImageUrl?: string | null;
  referenceImageKey?: number;
  onUploadReference?: (file: File) => Promise<void> | void;
  onRemoveReference?: () => void;
  hasReference?: boolean;
  onSetReference?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDeleteAll?: () => void;
  comparisonId?: string | null;
  onCompare?: (id: string) => void;
  onClearComparison?: () => void;
  view?: "all" | "favorite";
  onChangeView?: (view: "all" | "favorite") => void;
  onPreview?: (record: GeneratedImageDocument) => void;
  referenceSlots?: ReferenceSlotView[];
  onReferenceSlotUpload?: (slotId: string, file: File) => Promise<void> | void;
  onReferenceSlotClear?: (slotId: string) => void;
  onReferenceSlotSelect?: (slotId: string) => Promise<void> | void;
  onReferenceSlotAdd?: () => void;
  referenceSlotsLimit?: number;
  emptyStateMessage?: string;
  emptyStateFavoriteMessage?: string;
}

export function HistoryPanel({
  records,
  selectedId,
  onSelect,
  referenceImageUrl,
  referenceImageKey = 0,
  onUploadReference,
  onRemoveReference,
  hasReference,
  onSetReference,
  onToggleFavorite,
  onDownload,
  onDelete,
  onDeleteAll,
  comparisonId,
  onCompare,
  onClearComparison,
  view = "all",
  onChangeView,
  onPreview,
  referenceSlots,
  onReferenceSlotUpload,
  onReferenceSlotClear,
  onReferenceSlotSelect,
  onReferenceSlotAdd,
  referenceSlotsLimit = 9,
  emptyStateMessage,
  emptyStateFavoriteMessage
}: HistoryPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const displayReferenceImage = useMemo(() => {
    // Only show explicitly set reference images to prevent automatic changes
    if (referenceImageUrl) {
      return referenceImageUrl;
    }
    // No automatic fallback to prevent unexpected reference image changes
    return null;
  }, [referenceImageUrl]);

  const cacheBustedReferenceImage = useMemo(() => {
    if (!displayReferenceImage) {
      return null;
    }
    if (displayReferenceImage.startsWith("data:")) {
      return displayReferenceImage;
    }
    if (!referenceImageKey) {
      return displayReferenceImage;
    }
    try {
      const url = new URL(displayReferenceImage);
      url.searchParams.set("_cb", referenceImageKey.toString());
      return url.toString();
    } catch {
      return `${displayReferenceImage}${displayReferenceImage.includes("?") ? "&" : "?"}_cb=${referenceImageKey}`;
    }
  }, [displayReferenceImage, referenceImageKey]);
  const [isDragOver, setIsDragOver] = useState(false);
  const referenceSlotInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onUploadReference) {
      await onUploadReference(file);
    }
    if (event.target.value) {
      event.target.value = "";
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!onSetReference) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    const recordId = event.dataTransfer.getData("application/x-yesgem-record-id");
    if (recordId) {
      onSetReference(recordId);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!onSetReference) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
    event.dataTransfer.dropEffect = "move";
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDragStart = (event: DragEvent<HTMLElement>, recordId: string) => {
    if (!onSetReference) {
      return;
    }
    event.dataTransfer.setData("application/x-yesgem-record-id", recordId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setIsDragOver(false);
  };

  const handleQuickSetReference = () => {
    if (!onSetReference || records.length === 0) {
      return;
    }
    onSetReference(records[0].id);
  };

  const isFavoriteView = view === "favorite";
  const recentRecords = records.slice(0, RECENT_RECORD_LIMIT);
  const olderRecords = records.slice(RECENT_RECORD_LIMIT);
  const slots = referenceSlots ?? [];
  const canAddMoreReferenceSlots = slots.length < referenceSlotsLimit;
  const emptyMessageAll = emptyStateMessage ?? "생성된 이미지가 아직 없습니다.";
  const emptyMessageFavorite = emptyStateFavoriteMessage ?? "즐겨찾기에 추가한 이미지가 없습니다.";

  const renderRecordCard = (record: GeneratedImageDocument) => {
    const handleActivate = () => {
      onSelect(record.id);
      if (onPreview) {
        onPreview(record);
      }
    };

    const isComparison = comparisonId === record.id;
    const isCurrentReference = Boolean(
      referenceImageUrl &&
        (record.imageUrl === referenceImageUrl || record.originalImageUrl === referenceImageUrl)
    );

    return (
      <div
        key={record.id}
        role="button"
        tabIndex={0}
        className={cn(
          "group flex w-full cursor-pointer items-center gap-3 rounded-xl border bg-card/80 p-3 text-left shadow-sm transition",
          selectedId === record.id
            ? "border-primary/70 ring-2 ring-primary/40"
            : "border-border/60 hover:border-primary/40 hover:bg-accent/20",
          isComparison && "border-amber-400 ring-amber-300"
        )}
        onClick={handleActivate}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleActivate();
          }
        }}
        draggable={Boolean(onSetReference)}
        onDragStart={event => handleDragStart(event, record.id)}
        onDragEnd={handleDragEnd}
      >
        <div
          className="relative h-20 w-20 overflow-hidden rounded-lg bg-muted"
          onClick={event => {
            event.stopPropagation();
            handleActivate();
          }}
        >
          {record.thumbnailUrl ? (
            <NextImage
              src={record.thumbnailUrl}
              alt={record.promptMeta?.rawPrompt ?? "thumbnail"}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover"
            />
          ) : record.imageUrl ? (
            <NextImage
              src={record.imageUrl}
              alt={record.promptMeta?.rawPrompt ?? "thumbnail"}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover"
            />
          ) : (
            <EmptyState label="미리보기" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{new Date(record.createdAt).toLocaleString()}</span>
          <div className="flex items-center gap-1">
            {record.metadata?.favorite ? <Badge variant="secondary">★</Badge> : null}
            {isComparison ? <Badge variant="outline">비교중</Badge> : null}
            <Badge variant="outline" className="uppercase tracking-wide">
              {record.mode}
            </Badge>
          </div>
        </div>
          <p className="line-clamp-2 text-sm text-foreground group-hover:text-primary">
            {record.promptMeta?.refinedPrompt ?? record.promptMeta?.rawPrompt}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>{record.model}</span>
            <span>•</span>
            <span>{record.costCredits ?? "-"} credits</span>
            {record.promptMeta?.aspectRatio ? (
              <>
                <span>•</span>
                <span>{getAspectRatioLabel(record.promptMeta.aspectRatio)}</span>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={record.metadata?.favorite ? "secondary" : "outline"}
              onClick={event => {
                event.stopPropagation();
                onToggleFavorite?.(record.id);
              }}
            >
              {record.metadata?.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
            </Button>
            {onSetReference && !isCurrentReference ? (
              <Button
                size="sm"
                variant="outline"
                onClick={event => {
                  event.stopPropagation();
                  onSetReference?.(record.id);
                }}
              >
                기준이미지 등록
              </Button>
            ) : null}
          {onCompare ? (
            <Button
              size="sm"
              variant={isComparison ? "secondary" : "outline"}
              onClick={event => {
                event.stopPropagation();
                if (isComparison) {
                  onClearComparison?.();
                } else {
                  onCompare(record.id);
                }
              }}
            >
              {isComparison ? "비교 해제" : "비교"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={event => {
              event.stopPropagation();
                onDownload?.(record.id);
              }}
            >
              다운로드
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={event => {
                event.stopPropagation();
                onDelete?.(record.id);
              }}
            >
              삭제
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">기준 이미지</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3">
            <div
              className={cn(
                "relative aspect-square w-full overflow-hidden rounded-xl border bg-muted/50 transition",
                onSetReference && isDragOver && "ring-2 ring-offset-2 ring-primary/60"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {cacheBustedReferenceImage ? (
                <Image
                  key={`${cacheBustedReferenceImage}`}
                  src={cacheBustedReferenceImage}
                  alt="reference"
                  fill
                  className="object-cover"
                  unoptimized={cacheBustedReferenceImage.startsWith('data:')}
                />
              ) : (
                <EmptyState
                  label={
                    onSetReference
                      ? "이미지를 업로드하거나 목록에서 드래그하세요"
                      : "참조 이미지를 업로드하세요"
                  }
                />
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={handleQuickSetReference}
                disabled={!onSetReference || records.length === 0}
              >
                불러오기
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                추가
              </Button>
              <Button variant="destructive" size="sm" onClick={onRemoveReference} disabled={!hasReference}>
                삭제
              </Button>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">참조 이미지</p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => onReferenceSlotAdd?.()}
              disabled={!canAddMoreReferenceSlots || !onReferenceSlotAdd}
            >
              슬롯 추가
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {slots.map(slot => (
              <div key={slot.id} className="space-y-1">
                <div className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/40">
                  {slot.imageUrl ? (
                    <NextImage src={slot.imageUrl} alt="reference slot" fill sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" className="object-cover" unoptimized />
                  ) : (
                    <EmptyState label="참조 이미지" />
                  )}
                  <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-background/70 opacity-0 transition group-hover:opacity-100">
                    <div className="pointer-events-auto flex flex-col gap-1 p-2">
                      <Button
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => slot.imageUrl && void onReferenceSlotSelect?.(slot.id)}
                        disabled={!slot.imageUrl || !onReferenceSlotSelect}
                      >
                        기준으로 사용
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => onReferenceSlotClear?.(slot.id)}
                        disabled={!slot.imageUrl || !onReferenceSlotClear}
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
                    className="flex-1 h-7 px-2 text-[11px]"
                    onClick={() => referenceSlotInputs.current[slot.id]?.click()}
                    disabled={!onReferenceSlotUpload}
                  >
                    업로드
                  </Button>
                  {slot.imageUrl ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1 h-7 px-2 text-[11px]"
                      onClick={() => void onReferenceSlotSelect?.(slot.id)}
                      disabled={!onReferenceSlotSelect}
                    >
                      사용
                    </Button>
                  ) : null}
                </div>
                <input
                  ref={node => {
                    referenceSlotInputs.current[slot.id] = node;
                  }}
                  id={`reference-slot-${slot.id}`}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void onReferenceSlotUpload?.(slot.id, file);
                    }
                    event.target.value = "";
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        <Button variant="outline" className="w-full" size="sm">
          모든 이미지 다운로드
        </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </CardContent>
      </Card>

      <Card className="flex h-full flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">생성 기록</CardTitle>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center overflow-hidden rounded-md border bg-card text-xs">
                <button
                  type="button"
                  className={cn(
                    "px-3 py-1 transition",
                    view === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => onChangeView?.("all")}
                >
                  전체
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-3 py-1 transition",
                    view === "favorite"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => onChangeView?.("favorite")}
                >
                  즐겨찾기
                </button>
              </div>
              {onDeleteAll && records.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={onDeleteAll}
                >
                  모두 삭제
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex h-full flex-col p-0">
          {records.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-4 py-16 text-sm text-muted-foreground">
              {isFavoriteView ? emptyMessageFavorite : emptyMessageAll}
            </div>
          ) : (
            <>
              <div className="space-y-3 px-4 pb-2 pt-4">
                <p className="px-1 text-xs font-semibold text-muted-foreground">최근 생성 기록</p>
                {recentRecords.map(renderRecordCard)}
              </div>
              {olderRecords.length > 0 ? (
                <div className="flex-1 space-y-2 px-4 pb-4">
                  <p className="px-1 text-xs font-semibold text-muted-foreground">과거 생성 기록</p>
                  <ScrollArea className="h-full max-h-[360px] overflow-hidden rounded-lg border bg-card/40">
                    <div className="space-y-3 px-2 py-3 pr-3">
                      {olderRecords.map(renderRecordCard)}
                    </div>
                  </ScrollArea>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/30 text-[11px] text-muted-foreground">
      {label}
    </div>
  );
}
