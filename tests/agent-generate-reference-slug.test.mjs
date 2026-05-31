import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  normalizeConfig,
  resolveReferenceSlug
} from "../scripts/agent-generate.mjs";

test("normalizeConfig accepts reference slug fields", () => {
  const config = normalizeConfig({
    prompt: "storyboard cut",
    referenceSlug: "Foundation Shot",
    referenceGallerySlugs: "cut-01, Cut 02"
  });

  assert.equal(config.referenceSlug, "foundation-shot");
  assert.deepEqual(config.referenceGallerySlugs, ["cut-01", "cut-02"]);
});

test("resolveReferenceSlug returns the newest matching run imageUrl", async () => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sionbanana-agent-runs-"));
  const runsRoot = path.join(dataRoot, "agent-runs");
  await fs.mkdir(runsRoot, { recursive: true });

  await writeManifest(runsRoot, "2026-05-01T00-00-00-000Z-foundation", {
    createdAt: "2026-05-01T00:00:00.000Z",
    category: "storyboard",
    slug: "foundation",
    images: [{ imageUrl: "/api/images/old-id" }]
  });
  await writeManifest(runsRoot, "2026-05-02T00-00-00-000Z-foundation", {
    createdAt: "2026-05-02T00:00:00.000Z",
    category: "storyboard",
    slug: "foundation",
    images: [{ imageUrl: "/api/images/new-id" }]
  });
  await writeManifest(runsRoot, "2026-05-03T00-00-00-000Z-foundation-extra", {
    createdAt: "2026-05-03T00:00:00.000Z",
    category: "storyboard",
    slug: "foundation",
    images: [{ imageUrl: "/api/images/wrong-dir-id" }]
  });

  assert.equal(
    await resolveReferenceSlug("foundation", { dataRoot }),
    "/api/images/new-id"
  );
});

test("resolveReferenceSlug can scope lookup to a manifest category", async () => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sionbanana-category-runs-"));
  const runsRoot = path.join(dataRoot, "agent-runs");
  await fs.mkdir(runsRoot, { recursive: true });

  await writeManifest(runsRoot, "2026-05-01T00-00-00-000Z-foundation", {
    createdAt: "2026-05-01T00:00:00.000Z",
    category: "storyboard-a",
    slug: "foundation",
    images: [{ imageUrl: "/api/images/category-a-id" }]
  });
  await writeManifest(runsRoot, "2026-05-02T00-00-00-000Z-foundation", {
    createdAt: "2026-05-02T00:00:00.000Z",
    category: "storyboard-b",
    slug: "foundation",
    images: [{ imageUrl: "/api/images/category-b-id" }]
  });

  assert.equal(
    await resolveReferenceSlug("foundation", { dataRoot, category: "storyboard-a" }),
    "/api/images/category-a-id"
  );
});

test("resolveReferenceSlug fails clearly when no matching run exists", async () => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sionbanana-empty-runs-"));
  await fs.mkdir(path.join(dataRoot, "agent-runs"), { recursive: true });

  await assert.rejects(
    () => resolveReferenceSlug("missing", { dataRoot }),
    /No agent run found for reference slug: missing/
  );
});

async function writeManifest(runsRoot, dirName, manifest) {
  const runDir = path.join(runsRoot, dirName);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}
