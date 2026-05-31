#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveReferenceSlug,
  runJobs
} from "./agent-generate.mjs";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const HERE = path.dirname(SCRIPT_FILE);
const REPO_ROOT = path.join(HERE, "..");

async function main() {
  try {
    const cli = parseCli(process.argv.slice(2));
    if (cli.help) {
      printHelp();
      return;
    }

    if (cli.command === "jobs") {
      const spec = await readJsonFile(resolveInputPath(cli.positionals[0], "spec.json"));
      printJson(buildStoryboardJobs(spec));
      return;
    }

    if (cli.command === "run") {
      const spec = await readJsonFile(resolveInputPath(cli.positionals[0], "spec.json"));
      const dataRoot = getDataRoot(cli.options.dataRoot, REPO_ROOT);
      const jobs = await resolveStoryboardJobReferences(buildStoryboardJobs(spec), {
        dataRoot
      });
      const normalizedSpec = normalizeStoryboardSpec(spec);
      const results = await runJobs(jobs, {
        concurrency: cli.options.concurrency ?? normalizedSpec.concurrency,
        port: cli.options.port,
        retry: cli.options.retry ?? normalizedSpec.retry,
        retryBaseDelayMs: cli.options.retryBaseDelayMs ?? normalizedSpec.retryBaseDelayMs,
        dataRoot
      });
      const summary = summarizeJobResults(results);
      const organized = await organizeStoryboard(normalizedSpec, summary, {
        dataRoot,
        repoRoot: REPO_ROOT
      });

      printJson({
        ...summary,
        outDir: organized.outDir,
        indexPath: organized.indexPath,
        organized: {
          copied: organized.copied,
          totalCuts: organized.totalCuts,
          successfulCuts: organized.successfulCuts,
          missingCuts: organized.missingCuts,
          missingSourceIds: organized.missingSourceIds
        }
      });
      return;
    }

    if (cli.command === "organize") {
      const spec = await readJsonFile(resolveInputPath(cli.positionals[0], "spec.json"));
      const summary = await readJsonFile(resolveInputPath(cli.positionals[1], "summary.json"));
      const organized = await organizeStoryboard(spec, summary, {
        dataRoot: getDataRoot(cli.options.dataRoot, REPO_ROOT),
        repoRoot: REPO_ROOT
      });

      printJson({
        ok: true,
        outDir: organized.outDir,
        indexPath: organized.indexPath,
        copied: organized.copied,
        totalCuts: organized.totalCuts,
        successfulCuts: organized.successfulCuts,
        missingCuts: organized.missingCuts,
        missingSourceIds: organized.missingSourceIds
      });
      return;
    }

    throw new Error(`Unknown command: ${cli.command}`);
  } catch (error) {
    printJson({
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  }
}

export function normalizeStoryboardSpec(rawSpec) {
  if (!rawSpec || typeof rawSpec !== "object" || Array.isArray(rawSpec)) {
    throw new Error("spec must be a JSON object");
  }

  const title = asTrimmedString(rawSpec.title) || "스토리보드 리뷰";
  const outDir = asTrimmedString(rawSpec.outDir);
  if (!outDir) {
    throw new Error("spec.outDir is required");
  }

  const defaults = normalizeDefaults(rawSpec.defaults);
  const scenes = normalizeScenes(rawSpec.scenes);
  assertUniqueCutSlugs(scenes);
  const concurrency = optionalPositiveInteger(rawSpec.concurrency, "spec.concurrency");
  const retry = optionalNonNegativeInteger(rawSpec.retry, "spec.retry");
  const retryBaseDelayMs = optionalPositiveInteger(rawSpec.retryBaseDelayMs, "spec.retryBaseDelayMs");

  return removeUndefinedValues({
    title,
    outDir,
    defaults,
    concurrency,
    retry,
    retryBaseDelayMs,
    scenes
  });
}

export function buildStoryboardJobs(rawSpec) {
  const spec = normalizeStoryboardSpec(rawSpec);
  const seen = new Set();
  const jobs = [];

  for (const scene of spec.scenes) {
    for (const cut of scene.cuts) {
      if (seen.has(cut.slug)) {
        throw new Error(`Duplicate storyboard cut slug: ${cut.slug}`);
      }
      seen.add(cut.slug);

      const merged = {
        slug: cut.slug,
        category: valueOrDefault(cut.category, spec.defaults.category),
        size: valueOrDefault(cut.size, spec.defaults.size),
        quality: valueOrDefault(cut.quality, spec.defaults.quality),
        count: valueOrDefault(cut.count, spec.defaults.count),
        reference: cut.reference,
        referenceGallery: cut.referenceGallery,
        referenceSlug: cut.referenceSlug,
        referenceGallerySlugs: cut.referenceGallerySlugs,
        prompt: cut.prompt
      };

      jobs.push(removeUndefinedValues(merged));
    }
  }

  return jobs;
}

export async function resolveStoryboardJobReferences(jobs, options = {}) {
  if (!Array.isArray(jobs)) {
    throw new Error("jobs must be an array");
  }

  const resolveReferenceSlugImpl = options.resolveReferenceSlugImpl ?? resolveReferenceSlug;
  const resolved = [];
  for (const job of jobs) {
    if (!job || typeof job !== "object" || Array.isArray(job)) {
      throw new Error("Each job must be an object");
    }

    const next = { ...job };
    const category = asTrimmedString(next.category) || null;
    if (next.referenceSlug) {
      next.reference = next.reference || await resolveReferenceSlugImpl(next.referenceSlug, {
        dataRoot: options.dataRoot,
        category
      });
      delete next.referenceSlug;
    }

    const gallery = Array.isArray(next.referenceGallery) ? [...next.referenceGallery] : [];
    if (Array.isArray(next.referenceGallerySlugs)) {
      for (const slug of next.referenceGallerySlugs) {
        gallery.push(await resolveReferenceSlugImpl(slug, {
          dataRoot: options.dataRoot,
          category
        }));
      }
      delete next.referenceGallerySlugs;
    }

    if (gallery.length > 0) {
      next.referenceGallery = gallery;
    } else {
      delete next.referenceGallery;
    }

    resolved.push(removeUndefinedValues(next));
  }

  return resolved;
}

export function buildStoryboardOrganizePlan(rawSpec, rawSummary) {
  const spec = normalizeStoryboardSpec(rawSpec);
  const summaryJobs = normalizeSummaryJobs(rawSummary);
  const bySlug = new Map();
  for (const job of summaryJobs) {
    if (job?.slug) {
      bySlug.set(job.slug, job);
    }
  }

  const copies = [];
  const scenes = spec.scenes.map(scene => {
    const cuts = scene.cuts.map(cut => {
      const result = bySlug.get(cut.slug);
      const ids = result?.ok === true && Array.isArray(result.ids)
        ? result.ids.map(id => asTrimmedString(id)).filter(Boolean)
        : [];
      const variants = ids.map((id, index) => {
        const variantIndex = index + 1;
        const destName = `${cut.slug}_v${variantIndex}.png`;
        const destRelative = path.posix.join(`scene-${scene.n}`, destName);
        const copy = {
          slug: cut.slug,
          scene: scene.n,
          id,
          variantIndex,
          destName,
          destRelative
        };
        copies.push(copy);
        return copy;
      });

      return {
        slug: cut.slug,
        sec: cut.sec ?? null,
        story: cut.story ?? null,
        ok: variants.length > 0,
        reason: variants.length > 0 ? null : result?.reason ?? null,
        variants
      };
    });

    return {
      n: scene.n,
      title: scene.title,
      cuts
    };
  });

  const totalCuts = scenes.reduce((sum, scene) => sum + scene.cuts.length, 0);
  const successfulCuts = scenes.reduce(
    (sum, scene) => sum + scene.cuts.filter(cut => cut.variants.length > 0).length,
    0
  );

  return {
    title: spec.title,
    outDir: spec.outDir,
    scenes,
    copies,
    totalCuts,
    successfulCuts,
    missingCuts: totalCuts - successfulCuts
  };
}

export async function organizeStoryboard(rawSpec, rawSummary, options = {}) {
  const spec = normalizeStoryboardSpec(rawSpec);
  const plan = buildStoryboardOrganizePlan(spec, rawSummary);
  const dataRoot = getDataRoot(options.dataRoot, options.repoRoot ?? REPO_ROOT);
  const outDir = resolveOutDir(spec.outDir, options.repoRoot ?? REPO_ROOT);
  const copiedByKey = new Map();
  const missingSourceIds = [];

  for (const scene of plan.scenes) {
    await fs.mkdir(path.join(outDir, `scene-${scene.n}`), { recursive: true });
  }

  for (const copy of plan.copies) {
    const source = await findImageAbs(copy.id, { dataRoot });
    if (!source) {
      missingSourceIds.push(copy.id);
      continue;
    }

    const destination = path.join(outDir, copy.destRelative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    copiedByKey.set(copyKey(copy), {
      ...copy,
      rel: copy.destRelative
    });
  }

  const organizedScenes = plan.scenes.map(scene => ({
    ...scene,
    cuts: scene.cuts.map(cut => {
      const variants = cut.variants
        .map(variant => copiedByKey.get(copyKey(variant)))
        .filter(Boolean);
      return {
        ...cut,
        ok: variants.length > 0,
        variants
      };
    })
  }));

  const totalCuts = organizedScenes.reduce((sum, scene) => sum + scene.cuts.length, 0);
  const successfulCuts = organizedScenes.reduce(
    (sum, scene) => sum + scene.cuts.filter(cut => cut.variants.length > 0).length,
    0
  );
  const indexPath = path.join(outDir, "index.html");

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    indexPath,
    renderStoryboardIndex({
      title: spec.title,
      scenes: organizedScenes,
      totalCuts,
      successfulCuts
    }),
    "utf8"
  );

  return {
    ok: true,
    outDir,
    indexPath,
    copied: copiedByKey.size,
    totalCuts,
    successfulCuts,
    missingCuts: totalCuts - successfulCuts,
    missingSourceIds,
    scenes: organizedScenes
  };
}

export async function findImageAbs(id, options = {}) {
  const imageId = asTrimmedString(id);
  if (!imageId) {
    return null;
  }

  const imagesRoot = path.join(getDataRoot(options.dataRoot, options.repoRoot ?? REPO_ROOT), "images");
  const buckets = await fs.readdir(imagesRoot, { withFileTypes: true }).catch(() => []);
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) {
      continue;
    }

    const candidate = path.join(imagesRoot, bucket.name, `${imageId}.png`);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Keep looking in older/newer image buckets.
    }
  }
  return null;
}

export function getDataRoot(override = null, repoRoot = REPO_ROOT) {
  const explicit = asTrimmedString(override);
  if (explicit) {
    return resolveMaybeHome(explicit);
  }

  const envDir = asTrimmedString(process.env.SIONBANANA_DATA_DIR);
  if (envDir) {
    return resolveMaybeHome(envDir);
  }

  return path.resolve(repoRoot, "data");
}

function normalizeDefaults(rawDefaults) {
  if (rawDefaults === undefined || rawDefaults === null) {
    return {};
  }
  if (!rawDefaults || typeof rawDefaults !== "object" || Array.isArray(rawDefaults)) {
    throw new Error("spec.defaults must be an object");
  }

  return removeUndefinedValues({
    size: optionalString(rawDefaults.size),
    quality: optionalString(rawDefaults.quality),
    count: optionalPositiveInteger(rawDefaults.count, "spec.defaults.count"),
    category: optionalString(rawDefaults.category)
  });
}

function normalizeScenes(rawScenes) {
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
    throw new Error("spec.scenes must be a non-empty array");
  }

  return rawScenes.map((scene, sceneIndex) => {
    if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
      throw new Error(`spec.scenes[${sceneIndex}] must be an object`);
    }

    const n = optionalPositiveInteger(scene.n, `spec.scenes[${sceneIndex}].n`);
    if (n === undefined) {
      throw new Error(`spec.scenes[${sceneIndex}].n is required`);
    }
    const title = asTrimmedString(scene.title) || `씬 ${n}`;
    if (!Array.isArray(scene.cuts) || scene.cuts.length === 0) {
      throw new Error(`spec.scenes[${sceneIndex}].cuts must be a non-empty array`);
    }

    return {
      n,
      title,
      cuts: scene.cuts.map((cut, cutIndex) => normalizeCut(cut, { sceneIndex, cutIndex }))
    };
  });
}

function normalizeCut(rawCut, { sceneIndex, cutIndex }) {
  if (!rawCut || typeof rawCut !== "object" || Array.isArray(rawCut)) {
    throw new Error(`spec.scenes[${sceneIndex}].cuts[${cutIndex}] must be an object`);
  }

  const slug = asTrimmedString(rawCut.slug);
  if (!slug) {
    throw new Error(`spec.scenes[${sceneIndex}].cuts[${cutIndex}].slug is required`);
  }
  assertSafeSlug(slug);

  const prompt = asTrimmedString(rawCut.prompt);
  if (!prompt) {
    throw new Error(`Cut ${slug} prompt is required`);
  }

  return removeUndefinedValues({
    slug,
    sec: optionalString(rawCut.sec),
    story: optionalString(rawCut.story),
    size: optionalString(rawCut.size),
    quality: optionalString(rawCut.quality),
    count: optionalPositiveInteger(rawCut.count, `cut ${slug}.count`),
    category: optionalString(rawCut.category),
    reference: optionalString(rawCut.reference),
    referenceGallery: normalizeOptionalStringArray(rawCut.referenceGallery, `cut ${slug}.referenceGallery`),
    referenceSlug: optionalString(rawCut.referenceSlug),
    referenceGallerySlugs: normalizeOptionalStringArray(rawCut.referenceGallerySlugs, `cut ${slug}.referenceGallerySlugs`),
    prompt
  });
}

function normalizeSummaryJobs(rawSummary) {
  if (Array.isArray(rawSummary)) {
    if (rawSummary.every(item => item && typeof item === "object" && Array.isArray(item.jobs))) {
      return rawSummary.flatMap(item => item.jobs);
    }
    return rawSummary;
  }
  if (rawSummary && typeof rawSummary === "object" && Array.isArray(rawSummary.jobs)) {
    return rawSummary.jobs;
  }
  throw new Error("summary must be an object with jobs array or a jobs array");
}

function renderStoryboardIndex({ title, scenes, totalCuts, successfulCuts }) {
  const body = scenes.map(scene => renderScene(scene)).join("\n");
  const sceneCount = scenes.length;

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0d0f12; color:#e8e8ea; font:14px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif; }
  header { padding:20px 24px; border-bottom:1px solid #23262d; position:sticky; top:0; background:#0d0f12ee; backdrop-filter:blur(6px); z-index:10; }
  header h1 { margin:0 0 4px; font-size:18px; letter-spacing:0; }
  header .meta { color:#9aa0a8; font-size:12px; }
  main { padding:8px 24px 64px; }
  h2 { margin:32px 0 12px; font-size:15px; color:#c8ccd2; border-left:3px solid #3ec47a; padding-left:10px; letter-spacing:0; }
  .grid { display:grid; grid-template-columns:1fr; gap:14px; }
  .card { background:#15181d; border:1px solid #23262d; border-radius:8px; padding:12px; }
  .card.missing { opacity:.55; }
  .cap { font-size:13px; color:#dfe3e8; margin-bottom:8px; font-weight:600; overflow-wrap:anywhere; }
  .variants { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; }
  figure { margin:0; min-width:0; }
  figure img { width:100%; height:auto; border-radius:6px; display:block; background:#000; }
  figcaption { font-size:11px; color:#7d838b; margin-top:4px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap:anywhere; }
  .ph { color:#91b36d; padding:24px; text-align:center; border:1px dashed #3a3f47; border-radius:6px; }
  @media (min-width:1100px){ .grid{ grid-template-columns:1fr 1fr; } }
</style></head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${sceneCount}씬 ${totalCuts}컷 · 생성 성공 ${successfulCuts}/${totalCuts}</div>
</header>
<main>
${body}
</main>
</body></html>
`;
}

function renderScene(scene) {
  const cuts = scene.cuts.map(cut => renderCut(cut)).join("\n");
  return `<h2>${escapeHtml(scene.title)}</h2>\n<div class="grid">\n${cuts}\n</div>`;
}

function renderCut(cut) {
  const label = formatCutLabel(cut);
  if (!cut.variants.length) {
    return `<div class="card missing"><div class="cap">${escapeHtml(label)}</div><div class="ph">미생성/실패</div></div>`;
  }

  const images = cut.variants
    .map(variant => (
      `<figure><img loading="lazy" src="${escapeAttr(variant.rel)}" alt="${escapeAttr(`${cut.slug}-v${variant.variantIndex}`)}"><figcaption>v${variant.variantIndex} · ${escapeHtml(variant.id)}</figcaption></figure>`
    ))
    .join("\n");

  return `<div class="card"><div class="cap">${escapeHtml(label)}</div><div class="variants">${images}</div></div>`;
}

function formatCutLabel(cut) {
  const sec = cut.sec ? ` (${cut.sec})` : "";
  const story = cut.story ? ` · ${cut.story}` : "";
  return `${cut.slug}${sec}${story}`;
}

function summarizeJobResults(jobs) {
  const succeeded = jobs.filter(job => job.ok).length;
  return {
    ok: succeeded === jobs.length,
    total: jobs.length,
    succeeded,
    failed: jobs.length - succeeded,
    jobs
  };
}

function resolveOutDir(outDir, repoRoot) {
  if (path.isAbsolute(outDir)) {
    return outDir;
  }
  return path.resolve(repoRoot, outDir);
}

function resolveInputPath(value, label) {
  const inputPath = asTrimmedString(value);
  if (!inputPath) {
    throw new Error(`${label} path is required`);
  }
  return path.resolve(inputPath);
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    return { help: true, command: null, positionals: [], options: {} };
  }

  const { positionals, options } = parseArgs(rest);
  assertCliShape(command, positionals);

  return {
    help: false,
    command,
    positionals,
    options: normalizeCliOptions(options)
  };
}

function parseArgs(args) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const equalIndex = arg.indexOf("=");
    const rawKey = equalIndex === -1 ? arg.slice(2) : arg.slice(2, equalIndex);
    const key = toCamelCase(rawKey);
    const value = equalIndex === -1 ? args[index + 1] : arg.slice(equalIndex + 1);
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }
    if (equalIndex === -1) {
      index += 1;
    }
    options[key] = value;
  }

  return { positionals, options };
}

function assertCliShape(command, positionals) {
  if (command === "jobs" && positionals.length === 1) {
    return;
  }
  if (command === "run" && positionals.length === 1) {
    return;
  }
  if (command === "organize" && positionals.length === 2) {
    return;
  }
  throw new Error(`Usage error for command "${command}". Run with --help for usage.`);
}

function normalizeCliOptions(options) {
  return removeUndefinedValues({
    port: optionalPositiveInteger(options.port, "--port"),
    concurrency: optionalPositiveInteger(options.concurrency, "--concurrency"),
    retry: optionalNonNegativeInteger(options.retry, "--retry"),
    retryBaseDelayMs: optionalPositiveInteger(
      options.retryBaseDelayMs ?? options.retryBaseDelay,
      "--retry-base-delay-ms"
    ),
    dataRoot: optionalString(options.dataRoot)
  });
}

function optionalString(value) {
  const text = asTrimmedString(value);
  return text || undefined;
}

function normalizeOptionalStringArray(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  const items = value.map(item => asTrimmedString(item)).filter(Boolean);
  return items.length ? items : undefined;
}

function optionalPositiveInteger(value, label) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return number;
}

function optionalNonNegativeInteger(value, label) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return number;
}

function valueOrDefault(value, defaultValue) {
  return value === undefined ? defaultValue : value;
}

function removeUndefinedValues(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );
}

function assertSafeSlug(slug) {
  if (slug === "." || slug === ".." || slug.includes("/") || slug.includes("\\")) {
    throw new Error(`Cut slug is not a safe file name: ${slug}`);
  }
}

function assertUniqueCutSlugs(scenes) {
  const seen = new Set();
  for (const scene of scenes) {
    for (const cut of scene.cuts) {
      if (seen.has(cut.slug)) {
        throw new Error(`Duplicate storyboard cut slug: ${cut.slug}`);
      }
      seen.add(cut.slug);
    }
  }
}

function copyKey(copy) {
  return `${copy.slug}\u0000${copy.variantIndex}`;
}

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveMaybeHome(value) {
  if (value.startsWith("~/")) {
    const home = process.env.HOME || process.cwd();
    return path.resolve(home, value.slice(2));
  }
  return path.resolve(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/storyboard.mjs jobs <spec.json>
  node scripts/storyboard.mjs run <spec.json> [--port 3002]
  node scripts/storyboard.mjs organize <spec.json> <summary.json>

Options:
  --port                 Preferred localhost port for run. Default: agent-generate default.
  --concurrency          Override spec.concurrency for run.
  --retry                Override spec.retry for run.
  --retry-base-delay-ms  Override spec.retryBaseDelayMs for run.
  --data-root            Override SIONBANANA_DATA_DIR / data root.
`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_FILE) {
  main();
}
