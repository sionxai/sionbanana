import assert from "node:assert/strict";
import { test } from "node:test";

import { runJobs } from "../scripts/agent-generate.mjs";

test("runJobs normalizes each job with shared execution options", async () => {
  const normalizeCalls = [];
  const generatedConfigs = [];
  const indexedCategories = [];

  const results = await runJobs(
    [
      {
        slug: "cut-01",
        category: "storyboard",
        prompt: "first cut",
        quality: "medium"
      },
      {
        slug: "cut-02",
        category: "storyboard",
        prompt: "second cut",
        count: 2
      }
    ],
    {
      concurrency: 2,
      port: 3999,
      retry: 2,
      retryBaseDelayMs: 1500,
      normalizeConfigImpl(raw) {
        normalizeCalls.push(raw);
        return {
          prompt: raw.prompt,
          reference: null,
          referenceGallery: [],
          category: raw.category,
          slug: raw.slug,
          count: raw.count ?? 1,
          quality: raw.quality ?? "medium",
          size: raw.size ?? null,
          aspect: null,
          port: raw.port,
          portExplicit: raw.portExplicit,
          batch: raw.batch,
          concurrency: 4,
          retry: raw.retry,
          retryBaseDelayMs: raw.retryBaseDelayMs,
          dataRoot: raw.dataRoot ?? null
        };
      },
      async runSingleGenerationImpl(config, server) {
        assert.equal(server, null);
        generatedConfigs.push(config);
        return {
          ok: true,
          manifestPath: `/tmp/${config.slug}/manifest.json`,
          imagePaths: [`/tmp/${config.slug}/fallback.png`]
        };
      },
      async readManifestInfoImpl(manifestPath) {
        const slug = manifestPath.split("/").at(-2);
        return {
          ids: [`${slug}-id`],
          imageUrls: [`/api/images/${slug}-id`],
          outputPaths: [`/tmp/${slug}/image.png`]
        };
      },
      async buildCategoryIndexImpl(category) {
        indexedCategories.push(category);
        return { ok: true, indexHtmlPath: `/tmp/${category}.html` };
      },
      async runWithConcurrencyImpl(items, limit, fn) {
        assert.equal(limit, 2);
        return Promise.all(items.map(async (item, index) => ({
          status: "fulfilled",
          value: await fn(item, index)
        })));
      }
    }
  );

  assert.equal(normalizeCalls.length, 2);
  assert.deepEqual(
    normalizeCalls.map(call => ({
      slug: call.slug,
      port: call.port,
      portExplicit: call.portExplicit,
      retry: call.retry,
      retryBaseDelayMs: call.retryBaseDelayMs,
      batch: call.batch
    })),
    [
      {
        slug: "cut-01",
        port: 3999,
        portExplicit: true,
        retry: 2,
        retryBaseDelayMs: 1500,
        batch: 1
      },
      {
        slug: "cut-02",
        port: 3999,
        portExplicit: true,
        retry: 2,
        retryBaseDelayMs: 1500,
        batch: 1
      }
    ]
  );
  assert.deepEqual(generatedConfigs.map(config => config.slug), ["cut-01", "cut-02"]);
  assert.deepEqual(indexedCategories, ["storyboard"]);
  assert.deepEqual(results, [
    {
      slug: "cut-01",
      ok: true,
      ids: ["cut-01-id"],
      imageUrls: ["/api/images/cut-01-id"],
      outputPaths: ["/tmp/cut-01/image.png"],
      manifestPath: "/tmp/cut-01/manifest.json",
      reason: null
    },
    {
      slug: "cut-02",
      ok: true,
      ids: ["cut-02-id"],
      imageUrls: ["/api/images/cut-02-id"],
      outputPaths: ["/tmp/cut-02/image.png"],
      manifestPath: "/tmp/cut-02/manifest.json",
      reason: null
    }
  ]);
});

test("runJobs returns per-job failures without aborting the whole set", async () => {
  const results = await runJobs(
    [
      { slug: "ok", category: "storyboard", prompt: "ok cut" },
      { slug: "bad", category: "storyboard", prompt: "bad cut" }
    ],
    {
      normalizeConfigImpl(raw) {
        return {
          ...raw,
          reference: null,
          referenceGallery: [],
          count: 1,
          quality: "medium",
          size: null,
          aspect: null,
          port: 3002,
          portExplicit: false,
          batch: 1,
          concurrency: 4,
          retry: 0,
          retryBaseDelayMs: 2000,
          dataRoot: null
        };
      },
      async runSingleGenerationImpl(config) {
        if (config.slug === "bad") {
          throw new Error("boom");
        }
        return { ok: true, manifestPath: null, imagePaths: ["/tmp/ok.png"] };
      },
      async buildCategoryIndexImpl() {
        return { ok: true };
      },
      async runWithConcurrencyImpl(items, limit, fn) {
        assert.equal(limit, 3);
        return Promise.all(items.map(async item => {
          try {
            return { status: "fulfilled", value: await fn(item) };
          } catch (reason) {
            return { status: "rejected", reason };
          }
        }));
      }
    }
  );

  assert.deepEqual(results, [
    {
      slug: "ok",
      ok: true,
      ids: [],
      imageUrls: [],
      outputPaths: ["/tmp/ok.png"],
      manifestPath: null,
      reason: null
    },
    {
      slug: "bad",
      ok: false,
      ids: [],
      imageUrls: [],
      outputPaths: [],
      manifestPath: null,
      reason: "boom"
    }
  ]);
});
