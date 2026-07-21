import sharp from "sharp";

import type { FrameRect, GridSpec, MatteSpec, Pivot } from "./types";

// Deterministic analysis thresholds: alpha > 8, component area >= max(4px, 0.05%),
// and the main component's 95th y percentile as the foot baseline.
const ALPHA_THRESHOLD = 8;
const MIN_COMPONENT_AREA_RATIO = 0.0005;
const BASELINE_QUANTILE = 0.95;

type ImageInfo = {
  data: Buffer;
  width: number;
  height: number;
};

export type FrameAnalysis = {
  trim: FrameRect;
  pivot: Pivot;
  centroid: { x: number };
};

export type NormalizeFrameInput = {
  buf: Buffer;
  trim?: FrameRect;
  pivot?: Pivot;
  centroid?: { x: number };
  sourceY?: number;
};

export type NormalizedFrame = FrameAnalysis & {
  buf: Buffer;
  appliedScale: number;
};

export type NormalizeOptions = {
  margin?: number;
  normalizeScale?: "none" | "height" | "area";
  normalizePivotX?: "foot" | "centroid";
  normalizePivotY?: "pin" | "preserve";
  rowSize?: number;
  scaleClamp?: number;
};

export type PackOptions = {
  cols?: number;
  padding?: number;
};

export type DetectFrameRectsOptions = {
  expectedCols?: number;
  expectedRows?: number;
  minGapRatio?: number;
  minAreaRatio?: number;
  padding?: number;
};

export type DetectedFrameRects = {
  rects: FrameRect[];
  rows: number;
  cols: number;
  confidence: number;
};

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be an integer greater than zero.`);
  }
}

function assertNonnegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a nonnegative integer.`);
  }
}

function splitDimension(total: number, count: number, policy: GridSpec["remainderPolicy"]): number[] {
  const base = Math.floor(total / count);
  if (base < 1) {
    throw new RangeError("Grid cells must be at least one pixel wide and high.");
  }

  if (policy === "crop") {
    return Array.from({ length: count }, () => base);
  }

  const remainder = total - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function computeGrid(
  sheetW: number,
  sheetH: number,
  grid: GridSpec
): FrameRect[] {
  assertPositiveInteger(sheetW, "sheetW");
  assertPositiveInteger(sheetH, "sheetH");
  assertPositiveInteger(grid.cols, "grid.cols");
  assertPositiveInteger(grid.rows, "grid.rows");

  const gutter = grid.gutter ?? 0;
  const policy = grid.remainderPolicy ?? "distribute";
  assertNonnegativeInteger(gutter, "grid.gutter");

  const availableW = sheetW - gutter * (grid.cols - 1);
  const availableH = sheetH - gutter * (grid.rows - 1);
  const widths = splitDimension(availableW, grid.cols, policy);
  const heights = splitDimension(availableH, grid.rows, policy);
  const rects: FrameRect[] = [];

  let y = 0;
  for (const height of heights) {
    let x = 0;
    for (const width of widths) {
      rects.push({ x, y, w: width, h: height });
      x += width + gutter;
    }
    y += height + gutter;
  }

  return rects;
}

function projectionBands(projection: Uint32Array, minimumGap: number): Array<[number, number]> {
  let first = 0;
  while (first < projection.length && projection[first] === 0) first += 1;
  if (first === projection.length) return [];

  const bands: Array<[number, number]> = [];
  let bandStart = first;
  let cursor = first;
  while (cursor < projection.length) {
    if (projection[cursor] > 0) {
      cursor += 1;
      continue;
    }
    const gapStart = cursor;
    while (cursor < projection.length && projection[cursor] === 0) cursor += 1;
    if (cursor < projection.length && cursor - gapStart >= minimumGap) {
      bands.push([bandStart, gapStart - 1]);
      bandStart = cursor;
    }
  }
  bands.push([bandStart, cursor - 1]);
  return bands;
}

export function detectFrameRects(
  rgbaBuf: Buffer,
  meta: { width: number; height: number },
  opts: DetectFrameRectsOptions = {}
): DetectedFrameRects {
  assertPositiveInteger(meta.width, "meta.width");
  assertPositiveInteger(meta.height, "meta.height");
  if (rgbaBuf.length !== meta.width * meta.height * 4) {
    throw new RangeError("rgbaBuf must contain exactly width * height * 4 RGBA bytes.");
  }
  if (opts.expectedCols !== undefined) {
    assertPositiveInteger(opts.expectedCols, "opts.expectedCols");
  }
  if (opts.expectedRows !== undefined) {
    assertPositiveInteger(opts.expectedRows, "opts.expectedRows");
  }

  const minGapRatio = opts.minGapRatio ?? 0.01;
  const minAreaRatio = opts.minAreaRatio ?? 0.0005;
  const padding = opts.padding ?? 2;
  if (!Number.isFinite(minGapRatio) || minGapRatio < 0 || minGapRatio > 1) {
    throw new RangeError("opts.minGapRatio must be between zero and one.");
  }
  if (!Number.isFinite(minAreaRatio) || minAreaRatio < 0 || minAreaRatio > 1) {
    throw new RangeError("opts.minAreaRatio must be between zero and one.");
  }
  assertNonnegativeInteger(padding, "opts.padding");

  const pixelCount = meta.width * meta.height;
  const foreground = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    if (rgbaBuf[index * 4 + 3] > 16) foreground[index] = 1;
  }

  const retained = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const minimumArea = Math.max(1, Math.ceil(pixelCount * minAreaRatio));
  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (!foreground[seed] || visited[seed]) continue;
    let queueStart = 0;
    let queueEnd = 1;
    queue[0] = seed;
    visited[seed] = 1;

    while (queueStart < queueEnd) {
      const index = queue[queueStart];
      queueStart += 1;
      const x = index % meta.width;
      const y = Math.floor(index / meta.width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= meta.width || nextY < 0 || nextY >= meta.height) continue;
          const next = nextY * meta.width + nextX;
          if (!foreground[next] || visited[next]) continue;
          visited[next] = 1;
          queue[queueEnd] = next;
          queueEnd += 1;
        }
      }
    }

    if (queueEnd >= minimumArea) {
      for (let index = 0; index < queueEnd; index += 1) retained[queue[index]] = 1;
    }
  }

  const minimumGap = Math.max(
    1,
    Math.ceil(Math.min(meta.width, meta.height) * minGapRatio)
  );
  const yProjection = new Uint32Array(meta.height);
  for (let index = 0; index < pixelCount; index += 1) {
    if (retained[index]) yProjection[Math.floor(index / meta.width)] += 1;
  }
  const rowBands = projectionBands(yProjection, minimumGap);
  const rects: FrameRect[] = [];
  const columnCounts: number[] = [];

  for (const [rowStart, rowEnd] of rowBands) {
    const xProjection = new Uint32Array(meta.width);
    for (let y = rowStart; y <= rowEnd; y += 1) {
      for (let x = 0; x < meta.width; x += 1) {
        if (retained[y * meta.width + x]) xProjection[x] += 1;
      }
    }
    const columnBands = projectionBands(xProjection, minimumGap);
    columnCounts.push(columnBands.length);

    for (const [columnStart, columnEnd] of columnBands) {
      let minX = meta.width;
      let minY = meta.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = rowStart; y <= rowEnd; y += 1) {
        for (let x = columnStart; x <= columnEnd; x += 1) {
          if (!retained[y * meta.width + x]) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (maxX < 0) continue;
      const x = Math.max(0, minX - padding);
      const y = Math.max(0, minY - padding);
      const right = Math.min(meta.width, maxX + 1 + padding);
      const bottom = Math.min(meta.height, maxY + 1 + padding);
      rects.push({ x, y, w: right - x, h: bottom - y });
    }
  }

  const rows = rowBands.length;
  const cols = columnCounts.length > 0 ? Math.max(...columnCounts) : 0;
  if (rects.length === 0) return { rects, rows: 0, cols: 0, confidence: 0.3 };

  const regular = columnCounts.every(count => count === cols);
  const rowMatches = opts.expectedRows === undefined || rows === opts.expectedRows;
  const columnsMatch =
    opts.expectedCols === undefined || columnCounts.every(count => count === opts.expectedCols);
  let confidence: number;
  if (rowMatches && columnsMatch && regular) {
    confidence = 1;
  } else if (
    opts.expectedRows !== undefined &&
    opts.expectedCols !== undefined &&
    rects.length === opts.expectedRows * opts.expectedCols
  ) {
    confidence = 0.7;
  } else if (opts.expectedRows === undefined && opts.expectedCols === undefined && !regular) {
    confidence = 0.7;
  } else {
    confidence = 0.3;
  }

  return { rects, rows, cols, confidence };
}

export async function sliceFrames(sheetBuf: Buffer, rects: FrameRect[]): Promise<Buffer[]> {
  const metadata = await sharp(sheetBuf).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to determine source-sheet dimensions.");
  }

  return Promise.all(
    rects.map((rect, index) => {
      assertNonnegativeInteger(rect.x, `rects[${index}].x`);
      assertNonnegativeInteger(rect.y, `rects[${index}].y`);
      assertPositiveInteger(rect.w, `rects[${index}].w`);
      assertPositiveInteger(rect.h, `rects[${index}].h`);
      if (rect.x + rect.w > metadata.width! || rect.y + rect.h > metadata.height!) {
        throw new RangeError(`rects[${index}] extends beyond the source sheet.`);
      }
      return sharp(sheetBuf).extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }).png().toBuffer();
    })
  );
}

async function decodeRgba(imageBuf: Buffer): Promise<ImageInfo> {
  const result = await sharp(imageBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data: result.data,
    width: result.info.width,
    height: result.info.height
  };
}

function encodeRgba(image: ImageInfo): Promise<Buffer> {
  return sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: 4 }
  })
    .png()
    .toBuffer();
}

function parseHexColor(value: string): [number, number, number] {
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
    throw new TypeError("matte.keyColor must use #RRGGBB format.");
  }
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16)
  ];
}

function colorDistancePercent(data: Buffer, offset: number, key: [number, number, number]): number {
  const red = data[offset] - key[0];
  const green = data[offset + 1] - key[1];
  const blue = data[offset + 2] - key[2];
  return (Math.sqrt(red * red + green * green + blue * blue) / Math.sqrt(3 * 255 * 255)) * 100;
}

function inferEdgeColor(image: ImageInfo): [number, number, number] {
  const counts = new Map<number, number>();
  const add = (x: number, y: number) => {
    const offset = (y * image.width + x) * 4;
    const key = (image.data[offset] << 16) | (image.data[offset + 1] << 8) | image.data[offset + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  for (let x = 0; x < image.width; x += 1) {
    add(x, 0);
    if (image.height > 1) add(x, image.height - 1);
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    add(0, y);
    if (image.width > 1) add(image.width - 1, y);
  }

  let selected = 0;
  let selectedCount = -1;
  for (const [key, count] of counts) {
    if (count > selectedCount || (count === selectedCount && key < selected)) {
      selected = key;
      selectedCount = count;
    }
  }
  return [(selected >> 16) & 255, (selected >> 8) & 255, selected & 255];
}

function alphaFactor(distance: number, tolerance: number, softness: number): number {
  if (distance <= tolerance) return 0;
  if (softness === 0 || distance >= tolerance + softness) return 1;
  return (distance - tolerance) / softness;
}

function deriveDespillWeights(key: [number, number, number]): [number, number, number] | null {
  const neutral = Math.min(...key);
  const chroma = key.map(channel => channel - neutral) as [number, number, number];
  const peak = Math.max(...chroma);
  if (peak === 0) return null;
  return chroma.map(channel => channel / peak) as [number, number, number];
}

function applyPixelAlpha(
  data: Buffer,
  offset: number,
  factor: number,
  despillWeights: [number, number, number] | null
): void {
  const originalAlpha = data[offset + 3];
  const resultAlpha = Math.round(originalAlpha * factor);
  if (despillWeights && resultAlpha > 0 && resultAlpha < 255) {
    let baseline = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      if (despillWeights[channel] === 0) {
        baseline = Math.max(baseline, data[offset + channel]);
      }
    }

    let spillExcess = Number.POSITIVE_INFINITY;
    for (let channel = 0; channel < 3; channel += 1) {
      const weight = despillWeights[channel];
      if (weight > 0) {
        spillExcess = Math.min(spillExcess, (data[offset + channel] - baseline) / weight);
      }
    }

    const spillStrength = 1 - factor;
    if (spillExcess > 0 && spillStrength > 0) {
      for (let channel = 0; channel < 3; channel += 1) {
        const weight = despillWeights[channel];
        if (weight > 0) {
          data[offset + channel] = Math.max(
            baseline,
            Math.min(255, Math.round(data[offset + channel] - spillExcess * weight * spillStrength))
          );
        }
      }
    }
  }
  data[offset + 3] = resultAlpha;
}

export async function applyMatte(frameBuf: Buffer, matte: MatteSpec): Promise<Buffer> {
  const image = await decodeRgba(frameBuf);
  if (matte.mode === "none") {
    return encodeRgba(image);
  }

  const tolerance = matte.tolerance ?? 12;
  const softness = matte.softness ?? 2;
  const despill = matte.despill ?? false;
  const key = matte.keyColor ? parseHexColor(matte.keyColor) : inferEdgeColor(image);
  const despillWeights = despill ? deriveDespillWeights(key) : null;

  if (matte.mode === "keyColor") {
    if (!matte.keyColor) {
      throw new TypeError("matte.keyColor is required when mode is keyColor.");
    }
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const factor = alphaFactor(colorDistancePercent(image.data, offset, key), tolerance, softness);
      applyPixelAlpha(image.data, offset, factor, despillWeights);
    }
    return encodeRgba(image);
  }

  const visited = new Uint8Array(image.width * image.height);
  const queue = new Int32Array(image.width * image.height);
  let queueStart = 0;
  let queueEnd = 0;
  const maxDistance = tolerance + softness;
  const enqueue = (x: number, y: number) => {
    const index = y * image.width + x;
    if (visited[index]) return;
    const offset = index * 4;
    if (colorDistancePercent(image.data, offset, key) > maxDistance) return;
    visited[index] = 1;
    queue[queueEnd] = index;
    queueEnd += 1;
  };

  for (let x = 0; x < image.width; x += 1) {
    enqueue(x, 0);
    if (image.height > 1) enqueue(x, image.height - 1);
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    enqueue(0, y);
    if (image.width > 1) enqueue(image.width - 1, y);
  }

  while (queueStart < queueEnd) {
    const index = queue[queueStart];
    queueStart += 1;
    const x = index % image.width;
    const y = Math.floor(index / image.width);
    const offset = index * 4;
    const factor = alphaFactor(colorDistancePercent(image.data, offset, key), tolerance, softness);
    applyPixelAlpha(image.data, offset, factor, despillWeights);

    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < image.width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < image.height) enqueue(x, y + 1);
  }

  return encodeRgba(image);
}

export async function analyzeFrame(rgbaBuf: Buffer): Promise<FrameAnalysis> {
  const image = await decodeRgba(rgbaBuf);
  const foreground = new Uint8Array(image.width * image.height);
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < foreground.length; index += 1) {
    if (image.data[index * 4 + 3] <= ALPHA_THRESHOLD) continue;
    foreground[index] = 1;
    const x = index % image.width;
    const y = Math.floor(index / image.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (maxX < 0) {
    return {
      trim: { x: 0, y: 0, w: 0, h: 0 },
      pivot: { x: 0, y: 0 },
      centroid: { x: 0 }
    };
  }

  const visited = new Uint8Array(foreground.length);
  const queue = new Int32Array(foreground.length);
  const minimumArea = Math.max(4, Math.ceil(image.width * image.height * MIN_COMPONENT_AREA_RATIO));
  let largest: number[] = [];
  let largestEligible: number[] = [];

  for (let seed = 0; seed < foreground.length; seed += 1) {
    if (!foreground[seed] || visited[seed]) continue;
    let queueStart = 0;
    let queueEnd = 1;
    queue[0] = seed;
    visited[seed] = 1;
    const component: number[] = [];

    while (queueStart < queueEnd) {
      const index = queue[queueStart];
      queueStart += 1;
      component.push(index);
      const x = index % image.width;
      const y = Math.floor(index / image.width);

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= image.width || nextY < 0 || nextY >= image.height) continue;
          const next = nextY * image.width + nextX;
          if (!foreground[next] || visited[next]) continue;
          visited[next] = 1;
          queue[queueEnd] = next;
          queueEnd += 1;
        }
      }
    }

    if (component.length > largest.length) largest = component;
    if (component.length >= minimumArea && component.length > largestEligible.length) {
      largestEligible = component;
    }
  }

  if (largestEligible.length > 0) largest = largestEligible;

  const centroidX = Math.round(
    largest.reduce((sum, index) => sum + (index % image.width), 0) / largest.length
  );
  const sortedY = largest.map(index => Math.floor(index / image.width)).sort((a, b) => a - b);
  const baseline = sortedY[Math.floor((sortedY.length - 1) * BASELINE_QUANTILE)];
  const baselinePixels = largest.filter(index => Math.floor(index / image.width) >= baseline);
  const pivotX = Math.round(
    baselinePixels.reduce((sum, index) => sum + (index % image.width), 0) / baselinePixels.length
  );

  return {
    trim: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    pivot: { x: pivotX, y: baseline },
    centroid: { x: centroidX }
  };
}

export async function normalizeFrames(
  frames: Array<Buffer | NormalizeFrameInput>,
  opts: NormalizeOptions = {}
): Promise<{ canvas: { w: number; h: number }; frames: NormalizedFrame[] }> {
  if (frames.length === 0) {
    throw new RangeError("normalizeFrames requires at least one frame.");
  }
  const margin = opts.margin ?? 2;
  assertNonnegativeInteger(margin, "opts.margin");
  const normalizeScale = opts.normalizeScale ?? "height";
  if (normalizeScale !== "none" && normalizeScale !== "height" && normalizeScale !== "area") {
    throw new RangeError('opts.normalizeScale must be "none", "height", or "area".');
  }
  const normalizePivotX = opts.normalizePivotX ?? "foot";
  if (normalizePivotX !== "foot" && normalizePivotX !== "centroid") {
    throw new RangeError('opts.normalizePivotX must be "foot" or "centroid".');
  }
  const normalizePivotY = opts.normalizePivotY ?? "pin";
  if (normalizePivotY !== "pin" && normalizePivotY !== "preserve") {
    throw new RangeError('opts.normalizePivotY must be "pin" or "preserve".');
  }
  if (opts.rowSize !== undefined && !Number.isInteger(opts.rowSize)) {
    throw new RangeError("opts.rowSize must be an integer.");
  }
  const rowSize =
    opts.rowSize !== undefined && opts.rowSize > 0 && opts.rowSize <= frames.length
      ? opts.rowSize
      : frames.length;
  const scaleClamp = opts.scaleClamp ?? 0.25;
  if (!Number.isFinite(scaleClamp) || scaleClamp < 0 || scaleClamp >= 1) {
    throw new RangeError("opts.scaleClamp must be between 0 (inclusive) and 1 (exclusive).");
  }

  const analyzed = await Promise.all(
    frames.map(async frame => {
      const input = Buffer.isBuffer(frame) ? { buf: frame } : frame;
      const analysis =
        input.trim && input.pivot
          ? {
              trim: input.trim,
              pivot: input.pivot,
              // Legacy pre-analyzed inputs may omit centroid; centroid mode safely retains foot alignment.
              centroid:
                input.centroid ??
                (normalizePivotX === "centroid" ? { x: input.pivot.x } : undefined)
            }
          : await analyzeFrame(input.buf);
      return {
        buf: input.buf,
        trim: analysis.trim,
        pivot: { x: Math.round(analysis.pivot.x), y: Math.round(analysis.pivot.y) },
        centroid: analysis.centroid,
        sourceY: input.sourceY ?? 0
      };
    })
  );

  const lifts = Array.from({ length: analyzed.length }, () => 0);
  if (normalizePivotY === "preserve") {
    for (let rowStart = 0; rowStart < analyzed.length; rowStart += rowSize) {
      const row = analyzed.slice(rowStart, rowStart + rowSize);
      const nonempty = row.filter(frame => frame.trim.w > 0 && frame.trim.h > 0);
      if (nonempty.length === 0) continue;
      const rowMean =
        nonempty.reduce((sum, frame) => sum + frame.sourceY + frame.pivot.y, 0) /
        nonempty.length;
      for (let offset = 0; offset < row.length; offset += 1) {
        const frame = row[offset];
        if (frame.trim.w === 0 || frame.trim.h === 0) continue;
        lifts[rowStart + offset] = rowMean - (frame.sourceY + frame.pivot.y);
      }
    }
  }

  const metrics = await Promise.all(
    analyzed.map(async frame => {
      if (frame.trim.w === 0 || frame.trim.h === 0) return 0;
      if (normalizeScale === "none") return 1;
      if (normalizeScale === "height") return frame.trim.h;

      const decoded = await sharp(frame.buf)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let area = 0;
      for (let offset = 3; offset < decoded.data.length; offset += decoded.info.channels) {
        if (decoded.data[offset] > ALPHA_THRESHOLD) area += 1;
      }
      return Math.sqrt(area);
    })
  );
  const positiveMetrics = metrics.filter(metric => metric > 0).sort((a, b) => a - b);
  const middle = Math.floor(positiveMetrics.length / 2);
  const referenceMetric =
    positiveMetrics.length === 0
      ? 0
      : positiveMetrics.length % 2 === 0
        ? (positiveMetrics[middle - 1] + positiveMetrics[middle]) / 2
        : positiveMetrics[middle];
  const scaled = analyzed.map((frame, index) => {
    const metric = metrics[index];
    const requestedScale =
      normalizeScale === "none" || metric <= 0 || referenceMetric <= 0
        ? 1
        : referenceMetric / metric;
    const appliedScale = Math.min(1 + scaleClamp, Math.max(1 - scaleClamp, requestedScale));
    const width =
      frame.trim.w === 0 ? 0 : Math.max(1, Math.round(frame.trim.w * appliedScale));
    const height =
      frame.trim.h === 0 ? 0 : Math.max(1, Math.round(frame.trim.h * appliedScale));
    const anchorX =
      normalizePivotX === "centroid" && frame.centroid
        ? frame.centroid.x
        : frame.pivot.x;
    return {
      ...frame,
      appliedScale,
      width,
      height,
      liftScaled: Math.round(lifts[index] * appliedScale),
      pivotOffset: {
        x: Math.round((anchorX - frame.trim.x) * appliedScale),
        y: Math.round((frame.pivot.y - frame.trim.y) * appliedScale)
      }
    };
  });

  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;
  for (const frame of scaled) {
    if (frame.trim.w === 0 || frame.trim.h === 0) continue;
    minLeft = Math.min(minLeft, -frame.pivotOffset.x);
    minTop = Math.min(minTop, -frame.pivotOffset.y - frame.liftScaled);
    maxRight = Math.max(maxRight, frame.width - frame.pivotOffset.x);
    maxBottom = Math.max(
      maxBottom,
      frame.height - frame.pivotOffset.y - frame.liftScaled
    );
  }

  if (!Number.isFinite(minLeft)) {
    minLeft = minTop = maxRight = maxBottom = 0;
  }
  const canvas = {
    w: Math.max(1, Math.ceil(maxRight - minLeft + margin * 2)),
    h: Math.max(1, Math.ceil(maxBottom - minTop + margin * 2))
  };
  const sharedPivot = { x: margin - minLeft, y: margin - minTop };

  const normalized = await Promise.all(
    scaled.map(async frame => {
      const trim = {
        x: sharedPivot.x - frame.pivotOffset.x,
        y: sharedPivot.y - frame.pivotOffset.y - frame.liftScaled,
        w: frame.width,
        h: frame.height
      };
      const base = sharp({
        create: {
          width: canvas.w,
          height: canvas.h,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      });

      let buf: Buffer;
      if (frame.trim.w === 0 || frame.trim.h === 0) {
        buf = await base.png().toBuffer();
      } else {
        let croppedImage = sharp(frame.buf).extract({
          left: frame.trim.x,
          top: frame.trim.y,
          width: frame.trim.w,
          height: frame.trim.h
        });
        if (frame.appliedScale !== 1) {
          croppedImage = croppedImage.resize({
            width: frame.width,
            height: frame.height,
            fit: "fill",
            kernel: sharp.kernel.lanczos3
          });
        }
        const cropped = await croppedImage
          .png()
          .toBuffer();
        buf = await base.composite([{ input: cropped, left: trim.x, top: trim.y }]).png().toBuffer();
      }

      return {
        buf,
        trim,
        pivot: { x: sharedPivot.x, y: sharedPivot.y - frame.liftScaled },
        centroid: {
          x:
            trim.x +
            Math.round(
              ((frame.centroid?.x ?? frame.pivot.x) - frame.trim.x) * frame.appliedScale
            )
        },
        appliedScale: frame.appliedScale
      };
    })
  );

  return { canvas, frames: normalized };
}

export async function packSheet(
  normFrames: Array<Buffer | NormalizedFrame>,
  opts: PackOptions = {}
): Promise<{ buf: Buffer; rects: FrameRect[] }> {
  if (normFrames.length === 0) {
    throw new RangeError("packSheet requires at least one frame.");
  }
  const padding = opts.padding ?? 2;
  assertNonnegativeInteger(padding, "opts.padding");
  const cols = opts.cols ?? Math.ceil(Math.sqrt(normFrames.length));
  assertPositiveInteger(cols, "opts.cols");

  const buffers = normFrames.map(frame => (Buffer.isBuffer(frame) ? frame : frame.buf));
  const metadata = await Promise.all(buffers.map(buf => sharp(buf).metadata()));
  const cellW = Math.max(...metadata.map(info => info.width ?? 0));
  const cellH = Math.max(...metadata.map(info => info.height ?? 0));
  if (cellW < 1 || cellH < 1) {
    throw new Error("Unable to determine normalized-frame dimensions.");
  }
  const rows = Math.ceil(buffers.length / cols);
  const sheetW = cols * cellW + (cols - 1) * padding;
  const sheetH = rows * cellH + (rows - 1) * padding;
  const rects: FrameRect[] = buffers.map((_, index) => ({
    x: (index % cols) * (cellW + padding),
    y: Math.floor(index / cols) * (cellH + padding),
    w: cellW,
    h: cellH
  }));
  const composites = buffers.map((input, index) => ({
    input,
    left: rects[index].x,
    top: rects[index].y
  }));
  const buf = await sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toBuffer();

  return { buf, rects };
}
