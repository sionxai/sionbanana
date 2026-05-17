"use client";

import { Button } from "@/components/ui/button";
import { MAX_IMAGE_ZOOM, MIN_IMAGE_ZOOM, type ImagePanZoomBind, type ImagePanZoomTransform } from "@/components/studio/use-image-pan-zoom";
import { cn } from "@/lib/utils";
import { getAspectRatioLabel } from "@/lib/aspect";
import type { GeneratedImageDocument } from "@/lib/types";

type ImagePreviewModalProps = {
  record: GeneratedImageDocument;
  imageUrl: string;
  promptText: string;
  zoomPercent: number;
  zoomScale: number;
  zoomTransform: ImagePanZoomTransform;
  zoomBind: ImagePanZoomBind;
  isPanning: boolean;
  onClose: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onRegenerate: () => void;
  onCopyPrompt: () => void | Promise<void>;
  onSetAsReference: () => void | Promise<void>;
  onRegisterAsCharacter: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
};

export function ImagePreviewModal({
  record,
  imageUrl,
  promptText,
  zoomPercent,
  zoomScale,
  zoomTransform,
  zoomBind,
  isPanning,
  onClose,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onRegenerate,
  onCopyPrompt,
  onSetAsReference,
  onRegisterAsCharacter,
  onDelete
}: ImagePreviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 lg:p-6"
      onClick={onClose}
    >
      <div
        className="relative grid h-full max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-xl border border-white/20 bg-background shadow-2xl lg:grid-cols-[minmax(0,1fr)_360px]"
        onClick={event => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-4 top-4 z-30 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur transition hover:bg-black/70"
          onClick={event => {
            event.stopPropagation();
            onClose();
          }}
        >
          닫기
        </button>
        <div className="flex min-h-0 flex-col bg-black">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="text-sm font-semibold">원본 이미지</p>
              <p className="truncate text-xs text-white/60">
                {record.model} · {new Date(record.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="mr-14 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={onZoomOut}
                disabled={zoomScale <= MIN_IMAGE_ZOOM}
              >
                축소
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={onZoomReset}
                disabled={zoomScale === 1}
              >
                {zoomPercent}%
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={onZoomIn}
                disabled={zoomScale >= MAX_IMAGE_ZOOM}
              >
                확대
              </Button>
            </div>
          </div>
          <div
            {...zoomBind}
            className={cn(
              "relative flex min-h-[50vh] flex-1 touch-none select-none items-center justify-center overflow-hidden bg-black",
              isPanning ? "cursor-grabbing" : "cursor-grab"
            )}
            title="마우스 휠로 확대/축소, 드래그로 이동, 더블클릭으로 원래대로"
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={promptText || "preview"}
                className="max-h-full max-w-full object-contain will-change-transform"
                draggable={false}
                style={{
                  transform: `translate(${zoomTransform.panX}px, ${zoomTransform.panY}px) scale(${zoomTransform.scale})`,
                  transformOrigin: "center center"
                }}
              />
            ) : (
              <div className="text-sm text-white/70">이미지를 불러올 수 없습니다.</div>
            )}
          </div>
        </div>
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-border bg-card p-4 lg:border-l lg:border-t-0">
          <div className="space-y-1 pr-10 lg:pr-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">생성 기록</p>
            <h2 className="text-base font-semibold text-foreground">프롬프트와 액션</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onRegenerate} disabled={!promptText}>
              재생성
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onCopyPrompt()} disabled={!promptText}>
              프롬프트 복사
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onSetAsReference()} disabled={!imageUrl}>
              기준이미지 등록
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onRegisterAsCharacter()} disabled={!imageUrl}>
              캐릭터로 등록
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void onDelete()}>
              삭제
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">생성 프롬프트</p>
            <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
              {promptText || "저장된 프롬프트가 없습니다."}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="rounded-lg border bg-background/60 p-2">
              <p className="font-medium text-foreground">모드</p>
              <p className="uppercase">{record.mode}</p>
            </div>
            <div className="rounded-lg border bg-background/60 p-2">
              <p className="font-medium text-foreground">모델</p>
              <p>{record.model}</p>
            </div>
            {record.promptMeta?.aspectRatio ? (
              <div className="rounded-lg border bg-background/60 p-2">
                <p className="font-medium text-foreground">비율</p>
                <p>{getAspectRatioLabel(record.promptMeta.aspectRatio)}</p>
              </div>
            ) : null}
            <div className="rounded-lg border bg-background/60 p-2">
              <p className="font-medium text-foreground">파일</p>
              <p>{imageUrl.startsWith("/api/images/") ? "로컬 원본" : "이미지 URL"}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
