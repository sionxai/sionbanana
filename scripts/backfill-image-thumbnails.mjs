#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const DEFAULT_DIR = "./data";
const BUCKET_NAME_RE = /^[A-Za-z0-9_-]+$/;
const IMAGE_FILE_RE = /^([A-Za-z0-9_-]+)\.(png|jpg|jpeg|webp)$/;
const THUMBNAIL_MAX_SIZE = 512;
const THUMBNAIL_QUALITY = 80;
const CONCURRENCY = 3;

async function main() {
  try {
    const config = normalizeConfig(parseArgs(process.argv.slice(2)));
    if (config.help) {
      printHelp();
      return;
    }

    const scan = await collectMissingThumbnails(config.dataRoot);
    const selected = config.limit === null ? scan.candidates : scan.candidates.slice(0, config.limit);

    if (config.dryRun) {
      printJson({
        ok: true,
        dryRun: true,
        dataRoot: config.dataRoot,
        scannedImages: scan.scannedImages,
        missing: scan.candidates.length,
        selected: selected.length,
        items: selected.map(candidate => candidate.relativePath)
      });
      return;
    }

    const results = await runWithConcurrency(selected, CONCURRENCY, createThumbnail);
    const created = results.filter(result => result.ok).map(result => result.relativePath);
    const failures = results.filter(result => !result.ok);

    printJson({
      ok: failures.length === 0,
      dryRun: false,
      dataRoot: config.dataRoot,
      scannedImages: scan.scannedImages,
      missing: scan.candidates.length,
      selected: selected.length,
      created,
      failures
    });

    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    printJson({
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const result = {
    dryRun: false,
    help: false,
    limit: undefined,
    dataRoot: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg === "--limit" || arg.startsWith("--limit=")) {
      const value = readOptionValue(argv, index, arg, "--limit");
      result.limit = value.value;
      index = value.nextIndex;
      continue;
    }
    if (arg === "--data-root" || arg.startsWith("--data-root=")) {
      const value = readOptionValue(argv, index, arg, "--data-root");
      result.dataRoot = value.value;
      index = value.nextIndex;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  return result;
}

function readOptionValue(argv, index, arg, optionName) {
  const equalPrefix = `${optionName}=`;
  if (arg.startsWith(equalPrefix)) {
    return { value: arg.slice(equalPrefix.length), nextIndex: index };
  }

  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}`);
  }
  return { value, nextIndex: index + 1 };
}

function normalizeConfig(raw) {
  if (raw.help) {
    return { help: true };
  }

  return {
    help: false,
    dryRun: raw.dryRun,
    limit: raw.limit === undefined ? null : parsePositiveInteger(raw.limit, "--limit"),
    dataRoot: path.resolve(resolveHome(raw.dataRoot ?? process.env.SIONBANANA_DATA_DIR ?? DEFAULT_DIR))
  };
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function resolveHome(value) {
  if (value.startsWith("~/")) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}

async function collectMissingThumbnails(dataRoot) {
  const imagesRoot = path.join(dataRoot, "images");
  const candidates = [];
  let scannedImages = 0;

  let buckets;
  try {
    buckets = await fs.readdir(imagesRoot);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { scannedImages, candidates };
    }
    throw error;
  }

  const seenThumbnails = new Set();
  for (const bucket of buckets.sort().reverse()) {
    if (!BUCKET_NAME_RE.test(bucket)) {
      continue;
    }
    const bucketDir = path.join(imagesRoot, bucket);
    const bucketStat = await statOrNull(bucketDir);
    if (!bucketStat?.isDirectory()) {
      continue;
    }

    let entries;
    try {
      entries = await fs.readdir(bucketDir);
    } catch {
      continue;
    }

    const imageEntries = [];
    for (const entry of entries) {
      const match = entry.match(IMAGE_FILE_RE);
      if (!match) {
        continue;
      }
      const absolutePath = path.join(bucketDir, entry);
      const stat = await statOrNull(absolutePath);
      if (!stat?.isFile()) {
        continue;
      }
      scannedImages += 1;
      imageEntries.push({ entry, id: match[1], absolutePath, mtimeMs: stat.mtimeMs });
    }

    imageEntries.sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const image of imageEntries) {
      const thumbnailName = `${image.id}.thumb.webp`;
      const thumbnailPath = path.join(bucketDir, thumbnailName);
      if (seenThumbnails.has(thumbnailPath)) {
        continue;
      }
      seenThumbnails.add(thumbnailPath);
      const thumbnailStat = await statOrNull(thumbnailPath);
      if (thumbnailStat?.isFile()) {
        continue;
      }
      candidates.push({
        sourcePath: image.absolutePath,
        thumbnailPath,
        relativePath: path.join("images", bucket, thumbnailName),
        sourceRelativePath: path.join("images", bucket, image.entry)
      });
    }
  }

  return { scannedImages, candidates };
}

async function statOrNull(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function createThumbnail(candidate) {
  const tempPath = `${candidate.thumbnailPath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;
  try {
    await sharp(candidate.sourcePath)
      .resize({
        width: THUMBNAIL_MAX_SIZE,
        height: THUMBNAIL_MAX_SIZE,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: THUMBNAIL_QUALITY })
      .toFile(tempPath);
    await fs.rename(tempPath, candidate.thumbnailPath);
    return {
      ok: true,
      relativePath: candidate.relativePath,
      sourceRelativePath: candidate.sourceRelativePath
    };
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    return {
      ok: false,
      relativePath: candidate.relativePath,
      sourceRelativePath: candidate.sourceRelativePath,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/backfill-image-thumbnails.mjs [options]

Options:
  --dry-run                  Scan and report missing thumbnails without writing files.
  --limit <n>                Process at most n missing thumbnails.
  --data-root <path>         Data root. Defaults to SIONBANANA_DATA_DIR or ./data.

Notes:
  - Scans data/images/<bucket> for png, jpg, jpeg, and webp originals.
  - Creates missing <id>.thumb.webp files with max dimension 512px and quality 80.
  - Writes to a temporary file in the same bucket, then renames it into place.
`);
}

main();
