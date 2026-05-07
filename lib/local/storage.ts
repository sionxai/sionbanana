import "server-only";

import { Buffer } from "node:buffer";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_DIR = "./data";

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

function monthBucket(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

const FILE_NAME_RE = /^[A-Za-z0-9_\-]+\.(png|jpg|jpeg|webp)$/;

function safeFileName(id: string, ext: string = "png"): string {
  const cleaned = id.replace(/[^A-Za-z0-9_\-]/g, "");
  if (!cleaned) {
    throw new Error("Invalid image id");
  }
  return `${cleaned}.${ext}`;
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
  }
  return removed;
}

export type DiskImageEntry = {
  id: string;
  ext: string;
  bucket: string;
  createdAtIso: string;
  size: number;
};

export async function listAllImages(): Promise<DiskImageEntry[]> {
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
        results.push({
          id,
          ext,
          bucket,
          createdAtIso: stat.mtime.toISOString(),
          size: stat.size
        });
      } catch {
        // ignore unreadable entries
      }
    }
  }
  return results;
}
