#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CLEANUP_SCHEMA_VERSION,
  DEFAULT_QUARANTINE_DIR,
  getDataRoot,
  getQuarantineRoot,
  isInside,
  parseArgs,
  printJson,
  readJsonFile,
  writeJsonFile
} from "./cleanup-utils.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_OLDER_THAN_DAYS = 7;

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      return;
    }

    const dataRoot = args.dataRoot ? path.resolve(String(args.dataRoot)) : getDataRoot(process.cwd());
    const quarantineRoot = args.quarantineRoot
      ? path.resolve(String(args.quarantineRoot))
      : getQuarantineRoot(dataRoot);
    const olderThanDays = parseOlderThanDays(args.olderThanDays);
    const confirm = args.confirm === true;
    const cutoff = Date.now() - olderThanDays * DAY_MS;
    const manifests = await findBatchManifests(quarantineRoot);
    const candidates = await findDeleteCandidates(manifests, quarantineRoot, cutoff);

    if (!confirm) {
      printJson({
        ok: true,
        dryRun: true,
        confirmRequired: true,
        quarantineRoot,
        olderThanDays,
        candidates: candidates.length,
        files: candidates.map(candidate => candidate.destinationAbsolutePath)
      });
      return;
    }

    const deleted = [];
    const skipped = [];
    const manifestsToUpdate = new Map();

    for (const candidate of candidates) {
      try {
        await fs.unlink(candidate.destinationAbsolutePath);
        deleted.push(candidate.destinationAbsolutePath);
        candidate.move.deletedAt = new Date().toISOString();
        candidate.move.deleteStatus = "deleted";
        manifestsToUpdate.set(candidate.manifestPath, candidate.manifest);
      } catch (error) {
        skipped.push({
          path: candidate.destinationAbsolutePath,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    for (const [manifestPath, manifest] of manifestsToUpdate.entries()) {
      manifest.updatedAt = new Date().toISOString();
      await writeJsonFile(manifestPath, manifest);
    }

    printJson({
      ok: true,
      dryRun: false,
      quarantineRoot,
      olderThanDays,
      deleted: deleted.length,
      skipped: skipped.length,
      files: deleted,
      skippedFiles: skipped
    });
  } catch (error) {
    printJson({
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  }
}

async function findDeleteCandidates(manifestRecords, quarantineRoot, cutoff) {
  const candidates = [];

  for (const record of manifestRecords) {
    const moves = Array.isArray(record.manifest.moves) ? record.manifest.moves : [];
    for (const move of moves) {
      if (move.status !== "moved" || move.deletedAt) {
        continue;
      }

      const destinationAbsolutePath = move.destinationAbsolutePath
        ? path.resolve(move.destinationAbsolutePath)
        : path.join(quarantineRoot, move.quarantineRelativePath ?? "");
      if (!isInside(quarantineRoot, destinationAbsolutePath)) {
        continue;
      }

      let stat;
      try {
        stat = await fs.stat(destinationAbsolutePath);
      } catch {
        continue;
      }
      if (!stat.isFile()) {
        continue;
      }

      const quarantinedAtMs = Date.parse(move.quarantinedAt ?? record.manifest.quarantinedAt ?? "");
      const ageSourceMs = Number.isFinite(quarantinedAtMs) ? quarantinedAtMs : stat.mtimeMs;
      if (ageSourceMs > cutoff) {
        continue;
      }

      candidates.push({
        manifestPath: record.manifestPath,
        manifest: record.manifest,
        move,
        destinationAbsolutePath
      });
    }
  }

  return candidates;
}

async function findBatchManifests(quarantineRoot) {
  const files = await walkFiles(quarantineRoot);
  const manifests = [];

  for (const filePath of files) {
    if (path.basename(filePath) !== "manifest.json") {
      continue;
    }

    try {
      const manifest = await readJsonFile(filePath);
      if (manifest?.kind === "sionbanana-cleanup-quarantine") {
        manifests.push({ manifestPath: filePath, manifest });
      }
    } catch {
      // Ignore unreadable quarantine manifests.
    }
  }

  return manifests;
}

async function walkFiles(root) {
  const results = [];

  async function visit(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        results.push(absolutePath);
      }
    }
  }

  await visit(root);
  return results;
}

function parseOlderThanDays(value) {
  if (value === undefined || value === true) {
    return DEFAULT_OLDER_THAN_DAYS;
  }
  const days = Number(value);
  if (!Number.isInteger(days) || days < 0) {
    throw new Error("--older-than-days must be an integer >= 0");
  }
  return days;
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/cleanup-delete.mjs --older-than-days 7 --confirm

Options:
  --data-root          Optional data root. Defaults to SIONBANANA_DATA_DIR or ./data
  --quarantine-root   Quarantine root. Default: ${DEFAULT_QUARANTINE_DIR}
  --older-than-days   Minimum quarantine age. Default: ${DEFAULT_OLDER_THAN_DAYS}
  --confirm           Required to unlink files. Without it, dry-run only.

Notes:
  - Only files listed in cleanup quarantine batch manifests are candidates.
  - This is the only cleanup script that calls fs.unlink, and only when --confirm is present.
  - Manifest files are retained as an audit trail.
  - schemaVersion: ${CLEANUP_SCHEMA_VERSION}
`);
}

main();
