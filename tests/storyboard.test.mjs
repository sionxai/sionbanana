import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildStoryboardJobs,
  buildStoryboardOrganizePlan,
  resolveStoryboardJobReferences
} from "../scripts/storyboard.mjs";

test("buildStoryboardJobs merges cut options with defaults", () => {
  const jobs = buildStoryboardJobs({
    title: "Demo storyboard",
    outDir: "data/storyboard/demo",
    defaults: {
      size: "1824x1024",
      quality: "high",
      count: 2,
      category: "demo-keyframes"
    },
    scenes: [
      {
        n: 1,
        title: "씬 1",
        cuts: [
          {
            slug: "cut-1-1",
            sec: "4s",
            story: "첫 컷",
            prompt: "first prompt"
          },
          {
            slug: "cut-1-2",
            count: 1,
            quality: "medium",
            prompt: "second prompt"
          }
        ]
      }
    ]
  });

  assert.deepEqual(jobs, [
    {
      slug: "cut-1-1",
      category: "demo-keyframes",
      size: "1824x1024",
      quality: "high",
      count: 2,
      prompt: "first prompt"
    },
    {
      slug: "cut-1-2",
      category: "demo-keyframes",
      size: "1824x1024",
      quality: "medium",
      count: 1,
      prompt: "second prompt"
    }
  ]);
});

test("buildStoryboardJobs keeps reference slug fields before async resolution", () => {
  const jobs = buildStoryboardJobs({
    title: "Reference demo",
    outDir: "data/storyboard/reference-demo",
    defaults: {
      category: "demo-keyframes"
    },
    scenes: [
      {
        n: 1,
        title: "씬 1",
        cuts: [
          {
            slug: "cut-1-1",
            referenceSlug: "hero-sheet",
            referenceGallerySlugs: ["cafe-bg", "logo-card"],
            prompt: "prompt with references"
          }
        ]
      }
    ]
  });

  assert.deepEqual(jobs, [
    {
      slug: "cut-1-1",
      category: "demo-keyframes",
      referenceSlug: "hero-sheet",
      referenceGallerySlugs: ["cafe-bg", "logo-card"],
      prompt: "prompt with references"
    }
  ]);
});

test("resolveStoryboardJobReferences resolves slug fields into image URLs", async () => {
  const jobs = await resolveStoryboardJobReferences(
    [
      {
        slug: "cut-1-1",
        category: "demo-keyframes",
        referenceSlug: "hero-sheet",
        referenceGallery: ["/api/images/direct-bg"],
        referenceGallerySlugs: ["cafe-bg"],
        prompt: "prompt"
      }
    ],
    {
      dataRoot: "/tmp/demo-data",
      async resolveReferenceSlugImpl(slug, options) {
        assert.equal(options.dataRoot, "/tmp/demo-data");
        assert.equal(options.category, "demo-keyframes");
        return `/api/images/${slug}-id`;
      }
    }
  );

  assert.deepEqual(jobs, [
    {
      slug: "cut-1-1",
      category: "demo-keyframes",
      reference: "/api/images/hero-sheet-id",
      referenceGallery: ["/api/images/direct-bg", "/api/images/cafe-bg-id"],
      prompt: "prompt"
    }
  ]);
});

test("buildStoryboardJobs rejects duplicate slugs", () => {
  assert.throws(
    () => buildStoryboardJobs({
      title: "Duplicate demo",
      outDir: "data/storyboard/duplicate-demo",
      scenes: [
        {
          n: 1,
          title: "씬 1",
          cuts: [
            { slug: "cut-1-1", prompt: "first" },
            { slug: "cut-1-1", prompt: "second" }
          ]
        }
      ]
    }),
    /Duplicate storyboard cut slug: cut-1-1/
  );
});

test("buildStoryboardJobs rejects missing prompts", () => {
  assert.throws(
    () => buildStoryboardJobs({
      title: "Missing prompt demo",
      outDir: "data/storyboard/missing-prompt-demo",
      scenes: [
        {
          n: 1,
          title: "씬 1",
          cuts: [
            { slug: "cut-1-1", prompt: "   " }
          ]
        }
      ]
    }),
    /Cut cut-1-1 prompt is required/
  );
});

test("buildStoryboardOrganizePlan maps summary ids to scene variant filenames", () => {
  const plan = buildStoryboardOrganizePlan(
    {
      title: "Organize demo",
      outDir: "data/storyboard/organize-demo",
      scenes: [
        {
          n: 1,
          title: "씬 1",
          cuts: [
            { slug: "cut-1-1", sec: "4s", story: "두 장", dialogue: "해린: \"테스트\"", camera: "와이드 24mm 고정", prompt: "first" },
            { slug: "cut-1-2", sec: "5s", story: "한 장", prompt: "second" }
          ]
        },
        {
          n: 2,
          title: "씬 2",
          cuts: [
            { slug: "cut-2-1", sec: "6s", story: "실패", prompt: "third" }
          ]
        }
      ]
    },
    {
      jobs: [
        { slug: "cut-1-1", ok: true, ids: ["id-a", "id-b"] },
        { slug: "cut-1-2", ok: true, ids: ["id-c"] },
        { slug: "cut-2-1", ok: false, ids: ["id-d"], reason: "generate failed" }
      ]
    }
  );

  assert.deepEqual(
    plan.copies.map(copy => ({
      slug: copy.slug,
      id: copy.id,
      destRelative: copy.destRelative
    })),
    [
      { slug: "cut-1-1", id: "id-a", destRelative: "scene-1/cut-1-1_v1.png" },
      { slug: "cut-1-1", id: "id-b", destRelative: "scene-1/cut-1-1_v2.png" },
      { slug: "cut-1-2", id: "id-c", destRelative: "scene-1/cut-1-2_v1.png" }
    ]
  );
  assert.equal(plan.totalCuts, 3);
  assert.equal(plan.successfulCuts, 2);
  assert.equal(plan.missingCuts, 1);
  // dialogue/camera fields flow through to the organize plan
  assert.equal(plan.scenes[0].cuts[0].dialogue, "해린: \"테스트\"");
  assert.equal(plan.scenes[0].cuts[0].camera, "와이드 24mm 고정");
  assert.equal(plan.scenes[0].cuts[1].dialogue, null);
  assert.deepEqual(plan.scenes[1].cuts[0], {
    slug: "cut-2-1",
    sec: "6s",
    story: "실패",
    dialogue: null,
    camera: null,
    ok: false,
    reason: "generate failed",
    variants: []
  });
});
