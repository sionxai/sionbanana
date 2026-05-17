import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildScanResult,
  collectJsonFileReferences,
  collectManifestReferences,
  listDiskImages,
  mergeReferenceIndexes
} from "../scripts/cleanup-utils.mjs";

test("cleanup scan protects images referenced from agent-run manifests", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "sionbanana-cleanup-"));
  await mkdir(path.join(dataRoot, "images", "2026-05"), { recursive: true });
  await writeFile(path.join(dataRoot, "images", "2026-05", "protected.png"), "png");
  await writeFile(path.join(dataRoot, "images", "2026-05", "unknown.png"), "png");
  await mkdir(path.join(dataRoot, "agent-runs", "run-1"), { recursive: true });
  await writeFile(
    path.join(dataRoot, "agent-runs", "run-1", "manifest.json"),
    JSON.stringify({
      response: { storagePath: "2026-05/protected.png" },
      images: [{ id: "protected", storagePath: "2026-05/protected.png" }]
    })
  );

  const diskImages = await listDiskImages(dataRoot);
  const manifestRefs = await collectManifestReferences(dataRoot);
  const result = buildScanResult({
    dataRoot,
    diskImages,
    referenceIndex: manifestRefs.index,
    manifestSummary: manifestRefs.summary,
    exportSummaries: [],
    warnings: []
  });

  assert.equal(result.counts.disk, 2);
  assert.deepEqual(result.protected.map(image => image.id), ["protected"]);
  assert.deepEqual(result.unknown.map(image => image.id), ["unknown"]);
  assert.equal(result.orphan.length, 0);
});

test("cleanup scan can add protected references from exported JSON", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "sionbanana-cleanup-"));
  await mkdir(path.join(dataRoot, "images", "2026-05"), { recursive: true });
  await writeFile(path.join(dataRoot, "images", "2026-05", "from-export.png"), "png");
  await writeFile(path.join(dataRoot, "images", "2026-05", "other.png"), "png");
  const exportPath = path.join(dataRoot, "history-export.json");
  await writeFile(
    exportPath,
    JSON.stringify([{ imageUrl: "/api/images/from-export", metadata: { storagePath: "2026-05/from-export.png" } }])
  );

  const diskImages = await listDiskImages(dataRoot);
  const exportRefs = await collectJsonFileReferences([exportPath], dataRoot);
  const result = buildScanResult({
    dataRoot,
    diskImages,
    referenceIndex: exportRefs.index,
    manifestSummary: { filesFound: 0, filesParsed: 0, filesFailed: 0 },
    exportSummaries: exportRefs.summaries,
    warnings: []
  });

  assert.deepEqual(result.protected.map(image => image.id), ["from-export"]);
  assert.deepEqual(result.unknown.map(image => image.id), ["other"]);
});

test("cleanup scan can explicitly classify unreferenced files as orphan", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "sionbanana-cleanup-"));
  await mkdir(path.join(dataRoot, "images", "2026-05"), { recursive: true });
  await writeFile(path.join(dataRoot, "images", "2026-05", "orphan.png"), "png");

  const result = buildScanResult({
    dataRoot,
    diskImages: await listDiskImages(dataRoot),
    referenceIndex: mergeReferenceIndexes(),
    manifestSummary: { filesFound: 0, filesParsed: 0, filesFailed: 0 },
    exportSummaries: [],
    warnings: [],
    classificationMode: "orphan"
  });

  assert.equal(result.unknown.length, 0);
  assert.deepEqual(result.orphan.map(image => image.id), ["orphan"]);
});
