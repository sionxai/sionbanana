import "server-only";

import { Buffer } from "node:buffer";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_DIR = "./data";
const BUCKET_NAME_RE = /^[A-Za-z0-9_\-]+$/;

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

export async function saveImageBuffer(
  id: string,
  buffer: Buffer,
  mimeType: string = "image/png"
): Promise<{ relativePath: string; absolutePath: string; mimeType: string; bytes: number }> {
  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const fileName = safeFileName(id, ext);
  const bucket = monthBucket();
  const dir = path.join(imagesDir(), bucket);
  await fs.mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, fileName);
  await fs.writeFile(absolutePath, buffer);
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
  let buckets: string[];
  try {
    buckets = await fs.readdir(root);
  } catch {
    return [];
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
        const imageEntry: DiskImageEntry = {
          id,
          ext,
          bucket,
          createdAtIso: stat.mtime.toISOString(),
          size: stat.size
        };
        if (options.includeMetadata) {
          imageEntry.metadata = await readImageMetadataFromBucket(id, bucket);
        }
        results.push(imageEntry);
      } catch {
        // ignore unreadable entries
      }
    }
  }
  return results;
}
