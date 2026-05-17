#!/usr/bin/env node

import path from "node:path";
import {
  DEFAULT_SCAN_OUTPUT,
  buildScanResult,
  collectJsonFileReferences,
  collectManifestReferences,
  getDataRoot,
  listDiskImages,
  mergeReferenceIndexes,
  normalizePathList,
  parseArgs,
  printJson,
  writeJsonFile
} from "./cleanup-utils.mjs";

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      return;
    }

    const cwd = process.cwd();
    const dataRoot = args.dataRoot ? path.resolve(String(args.dataRoot)) : getDataRoot(cwd);
    const outPath = path.resolve(String(args.out ?? DEFAULT_SCAN_OUTPUT));
    const protectJsonPaths = normalizePathList(args.protectJson);
    const classificationMode = args.classifyUnreferenced === "orphan" ? "orphan" : "conservative";

    const diskImages = await listDiskImages(dataRoot);
    const manifestRefs = await collectManifestReferences(dataRoot);
    const exportRefs = await collectJsonFileReferences(protectJsonPaths, dataRoot, "protect-json");
    const referenceIndex = mergeReferenceIndexes(manifestRefs.index, exportRefs.index);
    const warnings = [...manifestRefs.warnings, ...exportRefs.warnings];

    const result = buildScanResult({
      dataRoot,
      diskImages,
      referenceIndex,
      manifestSummary: manifestRefs.summary,
      exportSummaries: exportRefs.summaries,
      warnings,
      classificationMode
    });

    await writeJsonFile(outPath, result);
    printJson({
      ok: true,
      outPath,
      mode: result.mode,
      counts: result.counts,
      warnings: result.warnings.length
    });
  } catch (error) {
    printJson({
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  }
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/cleanup-scan.mjs [options]

Options:
  --data-root                 Optional data root. Defaults to SIONBANANA_DATA_DIR or ./data
  --out                       Scan JSON output path. Default: ${DEFAULT_SCAN_OUTPUT}
  --protect-json              Optional JSON export file(s) to add protected references. Repeat or comma-separate.
  --classify-unreferenced     conservative | orphan. Default: conservative

Notes:
  - Only data/images/**/*.png files are scanned.
  - Default conservative mode marks unreferenced disk images as unknown because browser localStorage is not readable here.
`);
}

main();
