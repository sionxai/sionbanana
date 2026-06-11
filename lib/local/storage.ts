import "server-only";

import { Buffer } from "node:buffer";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const DEFAULT_DIR = "./data";
const BUCKET_NAME_RE = /^[A-Za-z0-9_\-]+$/;
const THUMBNAIL_MAX_SIZE = 512;
const THUMBNAIL_QUALITY = 80;

export function getDataDir(): string {
  const fromEnv = process.env.SIONBANANA_DATA_DIR?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.startsWith("~/") ? path.join(homedir(), fromEnv.slice(2)) : fromEnv;
  }
  return DEFAULT_DIR;
}

function imagesDir(): string {
  return path.join(getDataDir(), "images");
}

function videosDir(): string {
  return path.join(getDataDir(), "videos");
}

function monthBucket(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

const FILE_NAME_RE = /^[A-Za-z0-9_\-]+\.(png|jpg|jpeg|webp)$/;
const THUMBNAIL_FILE_NAME_RE = /^[A-Za-z0-9_\-]+\.thumb\.webp$/;
const VIDEO_FILE_NAME_RE = /^[A-Za-z0-9_\-]+\.mp4$/;

function safeImageId(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_\-]/g, "");
  if (!cleaned) {
    throw new Error("Invalid image id");
  }
  return cleaned;
}

function safeFileName(id: string, ext: string = "png"): string {
  const cleaned = safeImageId(id);
  return `${cleaned}.${ext}`;
}

function safeThumbnailFileName(id: string): string {
  const cleaned = safeImageId(id);
  return `${cleaned}.thumb.webp`;
}

function safeBucketName(bucket: string): string {
  if (!BUCKET_NAME_RE.test(bucket)) {
    throw new Error("Invalid image bucket");
  }
  return bucket;
}

function compactMetadataValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map(item => compactMetadataValue(item))
      .filter(item => item !== undefined);
  }
  if (value && typeof value === "object") {
    const compacted: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      const nextValue = compactMetadataValue(nested);
      if (nextValue !== undefined) {
        compacted[key] = nextValue;
      }
    }
    return compacted;
  }
  return value;
}

function compactImageMetadata(metadata: ImageMetadata): ImageMetadata {
  const compacted = compactMetadataValue(metadata);
  return compacted && typeof compacted === "object" && !Array.isArray(compacted)
    ? (compacted as ImageMetadata)
    : {};
}

function compactVideoMetadata(metadata: VideoMetadata): VideoMetadata {
  const compacted = compactMetadataValue(metadata);
  return compacted && typeof compacted === "object" && !Array.isArray(compacted)
    ? (compacted as VideoMetadata)
    : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function metadataString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function metadataNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function metadataIsoString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

type ImageListCacheEntry = {
  signature: string;
  items: DiskImageEntry[];
};

const imageListCache = new Map<string, ImageListCacheEntry>();

function imageListCacheKey(options: ListAllImagesOptions): string {
  return options.includeMetadata ? "metadata" : "plain";
}

function cloneDiskImageEntry(entry: DiskImageEntry): DiskImageEntry {
  return { ...entry };
}

function invalidateImageListCache() {
  imageListCache.clear();
}

async function getImagesBucketSignature(root: string): Promise<{ buckets: string[]; signature: string }> {
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return { buckets: [], signature: "missing" };
  }

  const buckets: string[] = [];
  const parts: string[] = [];
  for (const bucket of entries.sort()) {
    if (!BUCKET_NAME_RE.test(bucket)) continue;
    const bucketDir = path.join(root, bucket);
    try {
      const stat = await fs.stat(bucketDir);
      if (!stat.isDirectory()) continue;
      buckets.push(bucket);
      parts.push(`${bucket}:${stat.mtimeMs}:${stat.size}`);
    } catch {
      // ignore unreadable buckets
    }
  }
  return { buckets, signature: parts.join("|") };
}

async function writeImageThumbnail(id: string, dir: string, buffer: Buffer): Promise<void> {
  const thumbnailPath = path.join(dir, safeThumbnailFileName(id));
  const tempPath = `${thumbnailPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await sharp(buffer)
      .resize({
        width: THUMBNAIL_MAX_SIZE,
        height: THUMBNAIL_MAX_SIZE,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: THUMBNAIL_QUALITY })
      .toFile(tempPath);
    await fs.rename(tempPath, thumbnailPath);
  } catch (error) {
    try {
      await fs.unlink(tempPath);
    } catch {
      // ignore missing temp file
    }
    console.warn(
      "[local-storage] image thumbnail generation failed",
      id,
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function readImageMetadataFromBucket(id: string, bucket: string): Promise<ImageMetadata | null> {
  const cleaned = safeImageId(id);
  const safeBucket = safeBucketName(bucket);
  const candidate = path.join(imagesDir(), safeBucket, `${cleaned}.json`);
  try {
    const raw = await fs.readFile(candidate, "utf8");
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? (parsed as ImageMetadata) : null;
  } catch {
    return null;
  }
}

async function readVideoMetadataFromBucket(id: string, bucket: string): Promise<VideoMetadata | null> {
  const cleaned = safeImageId(id);
  const safeBucket = safeBucketName(bucket);
  const candidate = path.join(videosDir(), safeBucket, `${cleaned}.json`);
  try {
    const raw = await fs.readFile(candidate, "utf8");
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? (parsed as VideoMetadata) : null;
  } catch {
    return null;
  }
}

export async function saveImageBuffer(
  id: string,
  buffer: Buffer,
  mimeType: string = "image/png"
): Promise<{ relativePath: string; absolutePath: string; mimeType: string; bytes: number }> {
  const cleaned = safeImageId(id);
  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const fileName = safeFileName(cleaned, ext);
  const bucket = monthBucket();
  const dir = path.join(imagesDir(), bucket);
  await fs.mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, fileName);
  await fs.writeFile(absolutePath, buffer);
  invalidateImageListCache();
  await writeImageThumbnail(cleaned, dir, buffer);
  return {
    relativePath: path.join(bucket, fileName),
    absolutePath,
    mimeType,
    bytes: buffer.byteLength
  };
}

export type ImageMetadata = {
  rawPrompt?: string;
  refinedPrompt?: string;
  model?: string;
  mode?: string;
  createdAtIso?: string;
  [key: string]: unknown;
};

export async function saveImageMetadata(
  id: string,
  bucket: string,
  metadata: ImageMetadata
): Promise<{ relativePath: string; absolutePath: string }> {
  const cleaned = safeImageId(id);
  const safeBucket = safeBucketName(bucket);
  const dir = path.join(imagesDir(), safeBucket);
  await fs.mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, `${cleaned}.json`);
  const payload = compactImageMetadata(metadata);
  await fs.writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  invalidateImageListCache();
  return {
    relativePath: path.join(safeBucket, `${cleaned}.json`),
    absolutePath
  };
}

export async function readImageMetadata(id: string): Promise<ImageMetadata | null> {
  let cleaned: string;
  try {
    cleaned = safeImageId(id);
  } catch {
    return null;
  }

  const root = imagesDir();
  let buckets: string[];
  try {
    buckets = await fs.readdir(root);
  } catch {
    return null;
  }

  for (const bucket of buckets) {
    if (!BUCKET_NAME_RE.test(bucket)) continue;
    const metadata = await readImageMetadataFromBucket(cleaned, bucket);
    if (metadata) return metadata;
  }
  return null;
}

export async function readImageById(
  id: string
): Promise<{ stream: ReturnType<typeof createReadStream>; mimeType: string; bytes: number } | null> {
  const cleaned = id.replace(/[^A-Za-z0-9_\-]/g, "");
  if (!cleaned) return null;

  const root = imagesDir();
  let buckets: string[];
  try {
    buckets = await fs.readdir(root);
  } catch {
    return null;
  }

  for (const bucket of buckets) {
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      const candidate = path.join(root, bucket, `${cleaned}.${ext}`);
      try {
        const stat = await fs.stat(candidate);
        if (FILE_NAME_RE.test(`${cleaned}.${ext}`)) {
          const stream = createReadStream(candidate);
          const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
          return { stream, mimeType, bytes: stat.size };
        }
      } catch {
        // try next
      }
    }
  }
  return null;
}

export async function readImageThumbnailById(
  id: string
): Promise<{ stream: ReturnType<typeof createReadStream>; mimeType: string; bytes: number } | null> {
  const cleaned = id.replace(/[^A-Za-z0-9_\-]/g, "");
  if (!cleaned) return null;

  const root = imagesDir();
  let buckets: string[];
  try {
    buckets = await fs.readdir(root);
  } catch {
    return null;
  }

  const fileName = safeThumbnailFileName(cleaned);
  for (const bucket of buckets) {
    const candidate = path.join(root, bucket, fileName);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile() && THUMBNAIL_FILE_NAME_RE.test(fileName)) {
        return {
          stream: createReadStream(candidate),
          mimeType: "image/webp",
          bytes: stat.size
        };
      }
    } catch {
      // try next
    }
  }
  return null;
}

export async function saveVideoBuffer(
  id: string,
  buffer: Buffer
): Promise<{ relativePath: string; absolutePath: string; mimeType: string; bytes: number }> {
  const fileName = safeFileName(id, "mp4");
  const bucket = monthBucket();
  const dir = path.join(videosDir(), bucket);
  await fs.mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, fileName);
  await fs.writeFile(absolutePath, buffer);
  return {
    relativePath: path.join(bucket, fileName),
    absolutePath,
    mimeType: "video/mp4",
    bytes: buffer.byteLength
  };
}

export type VideoMetadata = {
  sourceImageId?: string;
  prompt?: string;
  model?: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string | null;
  requestId?: string;
  createdAtIso?: string;
  bytes?: number;
  [key: string]: unknown;
};

export async function saveVideoMetadata(
  id: string,
  metadata: VideoMetadata,
  bucket: string = monthBucket()
): Promise<{ relativePath: string; absolutePath: string }> {
  const cleaned = safeImageId(id);
  const safeBucket = safeBucketName(bucket);
  const dir = path.join(videosDir(), safeBucket);
  await fs.mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, `${cleaned}.json`);
  const payload = compactVideoMetadata(metadata);
  await fs.writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return {
    relativePath: path.join(safeBucket, `${cleaned}.json`),
    absolutePath
  };
}

export async function readVideoById(
  id: string
): Promise<{ stream: ReturnType<typeof createReadStream>; mimeType: string; bytes: number } | null> {
  const cleaned = id.replace(/[^A-Za-z0-9_\-]/g, "");
  if (!cleaned) return null;

  const root = videosDir();
  let buckets: string[];
  try {
    buckets = await fs.readdir(root);
  } catch {
    return null;
  }

  for (const bucket of buckets) {
    const candidate = path.join(root, bucket, `${cleaned}.mp4`);
    try {
      const stat = await fs.stat(candidate);
      if (VIDEO_FILE_NAME_RE.test(`${cleaned}.mp4`)) {
        return {
          stream: createReadStream(candidate),
          mimeType: "video/mp4",
          bytes: stat.size
        };
      }
    } catch {
      // try next
    }
  }
  return null;
}

export type DiskVideoEntry = {
  id: string;
  bucket: string;
  videoUrl: string;
  createdAtIso: string;
  sourceImageId?: string;
  prompt?: string;
  model?: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  requestId?: string;
  bytes: number;
};

export async function listVideos(): Promise<DiskVideoEntry[]> {
  const root = videosDir();
  let buckets: string[];
  try {
    buckets = await fs.readdir(root);
  } catch {
    return [];
  }

  const results: DiskVideoEntry[] = [];
  for (const bucket of buckets) {
    if (!BUCKET_NAME_RE.test(bucket)) continue;

    const bucketDir = path.join(root, bucket);
    let entries: string[];
    try {
      entries = await fs.readdir(bucketDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const match = entry.match(/^([A-Za-z0-9_\-]+)\.mp4$/);
      if (!match) continue;

      const [, id] = match;
      const absolutePath = path.join(bucketDir, entry);
      try {
        const stat = await fs.stat(absolutePath);
        if (!stat.isFile()) continue;

        const metadata = await readVideoMetadataFromBucket(id, bucket);
        const createdAtIso = metadataIsoString(metadata?.createdAtIso) ?? stat.mtime.toISOString();
        results.push({
          id,
          bucket,
          videoUrl: `/api/videos/${id}`,
          createdAtIso,
          sourceImageId: metadataString(metadata?.sourceImageId),
          prompt: metadataString(metadata?.prompt),
          model: metadataString(metadata?.model),
          duration: metadataNumber(metadata?.duration),
          resolution: metadataString(metadata?.resolution),
          aspectRatio: metadataString(metadata?.aspectRatio),
          requestId: metadataString(metadata?.requestId),
          bytes: metadataNumber(metadata?.bytes) ?? stat.size
        });
      } catch {
        // ignore unreadable entries
      }
    }
  }

  return results.sort((a, b) => {
    const aTime = Date.parse(a.createdAtIso);
    const bTime = Date.parse(b.createdAtIso);
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
}

export async function deleteImageById(id: string): Promise<boolean> {
  const cleaned = id.replace(/[^A-Za-z0-9_\-]/g, "");
  if (!cleaned) return false;

  const root = imagesDir();
  let buckets: string[];
  try {
    buckets = await fs.readdir(root);
  } catch {
    return false;
  }

  let removed = false;
  for (const bucket of buckets) {
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      const candidate = path.join(root, bucket, `${cleaned}.${ext}`);
      try {
        await fs.unlink(candidate);
        removed = true;
      } catch {
        // ignore missing
      }
    }
    try {
      await fs.unlink(path.join(root, bucket, `${cleaned}.json`));
      removed = true;
    } catch {
      // ignore missing metadata
    }
    try {
      await fs.unlink(path.join(root, bucket, safeThumbnailFileName(cleaned)));
      removed = true;
    } catch {
      // ignore missing thumbnail
    }
  }
  if (removed) {
    invalidateImageListCache();
  }
  return removed;
}

export type DiskImageEntry = {
  id: string;
  ext: string;
  bucket: string;
  createdAtIso: string;
  size: number;
  metadata?: ImageMetadata | null;
};

export type ListAllImagesOptions = {
  includeMetadata?: boolean;
};

export async function listAllImages(options: ListAllImagesOptions = {}): Promise<DiskImageEntry[]> {
  const root = imagesDir();
  const { buckets, signature } = await getImagesBucketSignature(root);
  if (!buckets.length && signature === "missing") {
    return [];
  }

  const cacheKey = imageListCacheKey(options);
  const cached = imageListCache.get(cacheKey);
  if (cached?.signature === signature) {
    return cached.items.map(cloneDiskImageEntry);
  }

  const results: DiskImageEntry[] = [];
  for (const bucket of buckets) {
    const bucketDir = path.join(root, bucket);
    let entries: string[];
    try {
      entries = await fs.readdir(bucketDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const match = entry.match(/^([A-Za-z0-9_\-]+)\.(png|jpg|jpeg|webp)$/);
      if (!match) continue;
      const [, id, ext] = match;
      try {
        const stat = await fs.stat(path.join(bucketDir, entry));
        if (!stat.isFile()) continue;
        const metadata = options.includeMetadata ? await readImageMetadataFromBucket(id, bucket) : undefined;
        const imageEntry: DiskImageEntry = {
          id,
          ext,
          bucket,
          createdAtIso: metadataIsoString(metadata?.createdAtIso) ?? stat.mtime.toISOString(),
          size: stat.size
        };
        if (options.includeMetadata) {
          imageEntry.metadata = metadata ?? null;
        }
        results.push(imageEntry);
      } catch {
        // ignore unreadable entries
      }
    }
  }
  imageListCache.set(cacheKey, {
    signature,
    items: results.map(cloneDiskImageEntry)
  });
  return results;
}
