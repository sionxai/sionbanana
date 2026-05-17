#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CLEANUP_SCHEMA_VERSION,
  DEFAULT_QUARANTINE_DIR,
  DEFAULT_SCAN_OUTPUT,
  getDataRoot,
  getImagesRoot,
  isInside,
  normalizePathList,
  parseArgs,
  printJson,
  readJsonFile,
  safeTimestamp,
  toPosixPath,
  writeJsonFile
} from "./cleanup-utils.mjs";

const DEFAULT_CATEGORIES = ["orphan", "unknown"];

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      return;
    }

    const scanPath = path.resolve(String(args.scan ?? DEFAULT_SCAN_OUTPUT));
    const scan = await readJsonFile(scanPath);
    const dataRoot = scan.dataRoot ? path.resolve(scan.dataRoot) : getDataRoot(process.cwd());
    const imagesRoot = getImagesRoot(dataRoot);
    const quarantineRoot = args.quarantineRoot
      ? path.resolve(String(args.quarantineRoot))
      : path.resolve(dataRoot, ".quarantine");
    const categories = normalizeCategories(args.categories);
    const apply = args.apply === true;
    const batchId = safeTimestamp(new Date().toISOString());
    const batchRoot = path.join(quarantineRoot, batchId);
    const moves = buildMovePlan(scan, {
      scanPath,
      dataRoot,
      imagesRoot,
      quarantineRoot,
      batchRoot,
      batchId,
      categories
    });

    if (!apply) {
      printJson({
        ok: true,
        dryRun: true,
        scanPath,
        quarantineRoot,
        batchId,
        categories,
        planned: moves.length,
        moves
      });
      return;
    }

    await fs.mkdir(batchRoot, { recursive: true });
    const completed = [];
    for (const move of moves) {
      const result = await executeMove(move);
      completed.push(result);
    }

    const manifest = {
      schemaVersion: CLEANUP_SCHEMA_VERSION,
      kind: "sionbanana-cleanup-quarantine",
      batchId,
      quarantinedAt: new Date().toISOString(),
      scanPath,
      dataRoot,
      quarantineRoot,
      categories,
      moves: completed
    };
    const manifestPath = path.join(batchRoot, "manifest.json");
    await writeJsonFile(manifestPath, manifest);
    await updateQuarantineIndex(quarantineRoot, {
      batchId,
      quarantinedAt: manifest.quarantinedAt,
      manifestPath,
      scanPath,
      categories,
      moved: completed.filter(move => move.status === "moved").length,
      skipped: completed.filter(move => move.status !== "moved").length
    });

    printJson({
      ok: true,
      dryRun: false,
      scanPath,
      quarantineRoot,
      batchId,
      manifestPath,
      moved: completed.filter(move => move.status === "moved").length,
      skipped: completed.filter(move => move.status !== "moved").length
    });
  } catch (error) {
    printJson({
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  }
}

function buildMovePlan(scan, context) {
  return context.categories.flatMap(category => {
    const images = Array.isArray(scan[category]) ? scan[category] : [];
    return images.map(image => buildMoveRecord(image, category, context));
  });
}

function buildMoveRecord(image, category, context) {
  const sourceAbsolutePath = image.absolutePath
    ? path.resolve(image.absolutePath)
    : path.join(context.imagesRoot, image.relativePath ?? "");
  const sourceRelativePath = toPosixPath(path.relative(context.imagesRoot, sourceAbsolutePath));
  const destinationAbsolutePath = path.join(context.batchRoot, "images", sourceRelativePath);
  const quarantineRelativePath = toPosixPath(path.relative(context.quarantineRoot, destinationAbsolutePath));
  const reasons = Array.isArray(image.reasons) ? image.reasons : [];

  return {
    id: image.id ?? path.basename(sourceAbsolutePath, path.extname(sourceAbsolutePath)),
    classification: category,
    imagesRoot: context.imagesRoot,
    quarantineRoot: context.quarantineRoot,
    sourceRelativePath,
    sourceAbsolutePath,
    destinationAbsolutePath,
    quarantineRelativePath,
    size: image.size ?? null,
    mtime: image.mtime ?? null,
    reasons,
    status: "planned"
  };
}

async function executeMove(move) {
  if (!isInside(move.imagesRoot, move.sourceAbsolutePath)) {
    return { ...move, status: "skipped", reason: "source path failed safety check" };
  }

  if (move.sourceRelativePath.startsWith("../") || move.sourceRelativePath.includes("/../")) {
    return { ...move, status: "skipped", reason: "source relative path is outside images root" };
  }

  if (!isInside(move.quarantineRoot, move.destinationAbsolutePath)) {
    return { ...move, status: "skipped", reason: "destination path is outside quarantine root" };
  }

  try {
    const sourceStat = await fs.stat(move.sourceAbsolutePath);
    if (!sourceStat.isFile()) {
      return { ...move, status: "skipped", reason: "source is not a file" };
    }
  } catch {
    return { ...move, status: "skipped", reason: "source file is missing" };
  }

  try {
    await fs.access(move.destinationAbsolutePath);
    return { ...move, status: "skipped", reason: "destination already exists" };
  } catch {
    // destination is available
  }

  try {
    await fs.mkdir(path.dirname(move.destinationAbsolutePath), { recursive: true });
    await fs.rename(move.sourceAbsolutePath, move.destinationAbsolutePath);
    return {
      ...move,
      status: "moved",
      quarantinedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ...move,
      status: "skipped",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function updateQuarantineIndex(quarantineRoot, entry) {
  const indexPath = path.join(quarantineRoot, "quarantine-manifest.json");
  let index = {
    schemaVersion: CLEANUP_SCHEMA_VERSION,
    kind: "sionbanana-cleanup-quarantine-index",
    batches: []
  };

  try {
    index = await readJsonFile(indexPath);
    if (!Array.isArray(index.batches)) {
      index.batches = [];
    }
  } catch {
    // create a fresh index
  }

  index.updatedAt = new Date().toISOString();
  index.batches = [...index.batches.filter(batch => batch.batchId !== entry.batchId), entry];
  await writeJsonFile(indexPath, index);
}

function normalizeCategories(value) {
  const raw = normalizePathList(value).length ? normalizePathList(value) : DEFAULT_CATEGORIES;
  const categories = raw.map(item => item.toLowerCase()).filter(Boolean);
  const invalid = categories.filter(category => !["orphan", "unknown"].includes(category));
  if (invalid.length > 0) {
    throw new Error(`Only orphan and unknown can be quarantined by this script: ${invalid.join(", ")}`);
  }
  return Array.from(new Set(categories));
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/cleanup-quarantine.mjs --scan data/cleanup-scan.json --apply

Options:
  --scan              Scan JSON path. Default: ${DEFAULT_SCAN_OUTPUT}
  --categories        Comma-separated categories to quarantine. Default: orphan,unknown
  --quarantine-root   Destination root. Default: ${DEFAULT_QUARANTINE_DIR}
  --apply             Actually rename files into quarantine. Without this flag, dry-run only.

Notes:
  - Protected images cannot be quarantined by this script.
  - The script uses fs.rename and writes a batch manifest under data/.quarantine/<batch>/manifest.json.
`);
}

main();
