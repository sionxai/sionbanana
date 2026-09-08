import sharp from "sharp";

import type { FrameAnalysis } from "./engine";
import type { FrameRect, Pivot } from "./types";

/**
 * 불투명 판정 임계값. engine.ts의 detectFrameRects와 같은 값이다.
 * analyzeFrame의 ALPHA_THRESHOLD(8)보다 높게 잡아, 리샘플 과정에서 생기는
 * 옅은 프린지가 경계를 넘었다는 이유로 적용을 막지 않도록 한다
 * (사용자 요구: 실제 내용 손실만 차단, 단순 경계 접촉은 검토 대상).
 */
const OPAQUE_ALPHA = 16;

export type CellSpec = { width: number; height: number; trim: FrameRect; pivot: Pivot };

export type CellPlacement = {
  sourceLeft: number;
  sourceTop: number;
  destinationLeft: number;
  destinationTop: number;
  copyWidth: number;
  copyHeight: number;
};

export function computeCellScale(cell: CellSpec, analysis: FrameAnalysis): number {
  return Math.min(4, Math.max(0.25, cell.trim.h / analysis.trim.h));
}

export function computeCellPlacement(
  cell: CellSpec,
  analysis: FrameAnalysis,
  crop: { width: number; height: number }
): CellPlacement {
  const scale = computeCellScale(cell, analysis);
  let sourceLeft = 0;
  let sourceTop = 0;
  let destinationLeft = Math.round(cell.pivot.x - (analysis.pivot.x - analysis.trim.x) * scale);
  let destinationTop = Math.round(cell.pivot.y - (analysis.pivot.y - analysis.trim.y) * scale);
  if (destinationLeft < 0) {
    sourceLeft = -destinationLeft;
    destinationLeft = 0;
  }
  if (destinationTop < 0) {
    sourceTop = -destinationTop;
    destinationTop = 0;
  }
  return {
    sourceLeft,
    sourceTop,
    destinationLeft,
    destinationTop,
    copyWidth: Math.min(crop.width - sourceLeft, cell.width - destinationLeft),
    copyHeight: Math.min(crop.height - sourceTop, cell.height - destinationTop)
  };
}

export type CellFitReport = {
  scale: number;
  contentSize: { width: number; height: number };
  cellSize: { width: number; height: number };
  overflow: { width: number; height: number };
  sourceEmpty: boolean;
  placementEmpty: boolean;
  lostPixels: number;
  lostByEdge: { left: number; right: number; top: number; bottom: number };
  touchesEdge: Array<"left" | "right" | "top" | "bottom">;
};

export async function inspectCellFit(
  candidate: Buffer,
  cell: CellSpec,
  analysis: FrameAnalysis
): Promise<CellFitReport> {
  const cellSize = { width: cell.width, height: cell.height };
  if (analysis.trim.w < 1 || analysis.trim.h < 1) {
    return {
      scale: 0,
      contentSize: { width: 0, height: 0 },
      cellSize,
      overflow: { width: 0, height: 0 },
      sourceEmpty: true,
      placementEmpty: false,
      lostPixels: 0,
      lostByEdge: { left: 0, right: 0, top: 0, bottom: 0 },
      touchesEdge: []
    };
  }

  const scale = computeCellScale(cell, analysis);
  const crop = await sharp(candidate)
    .extract({
      left: analysis.trim.x,
      top: analysis.trim.y,
      width: analysis.trim.w,
      height: analysis.trim.h
    })
    .resize({
      width: Math.max(1, Math.round(analysis.trim.w * scale)),
      height: Math.max(1, Math.round(analysis.trim.h * scale)),
      kernel: sharp.kernel.lanczos3
    })
    .png()
    .toBuffer();
  const resized = await sharp(crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const contentSize = { width: resized.info.width, height: resized.info.height };
  const placement = computeCellPlacement(cell, analysis, contentSize);
  const lostByEdge = { left: 0, right: 0, top: 0, bottom: 0 };
  let lostPixels = 0;
  let insideMinX = cell.width;
  let insideMinY = cell.height;
  let insideMaxX = -1;
  let insideMaxY = -1;

  for (let y = 0; y < contentSize.height; y += 1) {
    for (let x = 0; x < contentSize.width; x += 1) {
      if (resized.data[(y * contentSize.width + x) * resized.info.channels + 3] <= OPAQUE_ALPHA) continue;
      const destinationX = placement.destinationLeft - placement.sourceLeft + x;
      const destinationY = placement.destinationTop - placement.sourceTop + y;
      const outsideLeft = destinationX < 0;
      const outsideRight = destinationX >= cell.width;
      const outsideTop = destinationY < 0;
      const outsideBottom = destinationY >= cell.height;
      if (outsideLeft || outsideRight || outsideTop || outsideBottom) {
        lostPixels += 1;
        if (outsideLeft) lostByEdge.left += 1;
        if (outsideRight) lostByEdge.right += 1;
        if (outsideTop) lostByEdge.top += 1;
        if (outsideBottom) lostByEdge.bottom += 1;
        continue;
      }
      insideMinX = Math.min(insideMinX, destinationX);
      insideMinY = Math.min(insideMinY, destinationY);
      insideMaxX = Math.max(insideMaxX, destinationX);
      insideMaxY = Math.max(insideMaxY, destinationY);
    }
  }

  const touchesEdge: CellFitReport["touchesEdge"] = [];
  if (insideMaxX >= 0) {
    if (insideMinX === 0) touchesEdge.push("left");
    if (insideMaxX === cell.width - 1) touchesEdge.push("right");
    if (insideMinY === 0) touchesEdge.push("top");
    if (insideMaxY === cell.height - 1) touchesEdge.push("bottom");
  }

  return {
    scale,
    contentSize,
    cellSize,
    overflow: {
      width: Math.max(0, contentSize.width - cell.width),
      height: Math.max(0, contentSize.height - cell.height)
    },
    sourceEmpty: false,
    // 셀 안에 남는 불투명 픽셀이 없으면 복사 영역이 있어도 결과는 빈 프레임이다.
    placementEmpty: placement.copyWidth < 1 || placement.copyHeight < 1 || insideMaxX < 0,
    lostPixels,
    lostByEdge,
    touchesEdge
  };
}

export type CellFitVerdict =
  | { verdict: "ok" }
  | { verdict: "review"; reasons: string[] }
  | { verdict: "blocked"; reasons: string[] };

export function classifyCellFit(
  report: CellFitReport,
  opts: { maxLostPixels?: number } = {}
): CellFitVerdict {
  if (report.sourceEmpty) return { verdict: "blocked", reasons: ["empty-source"] };
  if (report.placementEmpty) return { verdict: "blocked", reasons: ["placement-empty"] };
  if (report.lostPixels > (opts.maxLostPixels ?? 0)) {
    return { verdict: "blocked", reasons: ["content-loss"] };
  }
  if (report.touchesEdge.length > 0) return { verdict: "review", reasons: ["boundary-touch"] };
  return { verdict: "ok" };
}
