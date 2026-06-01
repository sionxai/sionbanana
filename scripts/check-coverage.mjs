#!/usr/bin/env node
// Storyboard reference-coverage linter (generation 전 정적 검증, 토큰 0).
//
// 각 컷의 prompt+story 텍스트에서 "등장 요소"(인물/소품)를 키워드로 감지하고,
// 그 요소의 레퍼런스 시트가 해당 컷의 reference/referenceGallery에 걸렸는지 대조한다.
// 걸려야 하는데 빠진 컷을 누락(MISS)으로 리포트한다.
//
// 규칙 파일(rules.json)은 spec마다 다르므로 인자로 받는다:
//   {
//     "rules": [
//       { "slug": "pa-obj-bag", "any": ["handbag","가방","beaded bag"], "label": "가방" },
//       { "slug": "pa-char-a",  "any": ["A씨","yoon","haerin"], "label": "A씨" }
//     ]
//   }
// 각 rule: 텍스트에 any 키워드 중 하나라도 있으면 그 컷은 slug 시트를 reference로 가져야 한다.
//
// Usage:
//   node scripts/check-coverage.mjs <spec.json> <rules.json>

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { normalizeStoryboardSpec } = await import(path.join(HERE, "storyboard.mjs"));

function refSlugs(cut) {
  const urls = [cut.reference, ...(cut.referenceGallery || [])].filter(Boolean);
  // /api/images/<id> 또는 raw id 둘 다 지원
  return urls.map(u => String(u).split("/").pop().replace(/\.png$/, ""));
}

async function main() {
  const [specPath, rulesPath] = process.argv.slice(2);
  if (!specPath || !rulesPath) {
    throw new Error("usage: check-coverage.mjs <spec.json> <rules.json>");
  }
  const spec = normalizeStoryboardSpec(JSON.parse(await fs.readFile(path.resolve(specPath), "utf8")));
  const { rules } = JSON.parse(await fs.readFile(path.resolve(rulesPath), "utf8"));
  if (!Array.isArray(rules)) throw new Error("rules.json must have a rules array");

  const misses = [];
  let cutCount = 0;
  for (const scene of spec.scenes) {
    for (const cut of scene.cuts) {
      cutCount += 1;
      const text = `${cut.prompt || ""} ${cut.story || ""}`.toLowerCase();
      const have = new Set(refSlugs(cut));
      for (const rule of rules) {
        const hit = (rule.any || []).some(kw => text.includes(String(kw).toLowerCase()));
        if (hit && !have.has(rule.slug)) {
          misses.push({ slug: cut.slug, missing: rule.slug, label: rule.label || rule.slug });
        }
      }
    }
  }

  if (misses.length === 0) {
    console.log(JSON.stringify({ ok: true, cuts: cutCount, misses: [] }, null, 2));
    return;
  }
  console.log(
    JSON.stringify(
      {
        ok: false,
        cuts: cutCount,
        misses: misses.map(m => `${m.slug}: '${m.label}'(${m.missing}) 등장하나 reference에 없음`)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
