#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_PORT = 3002;
const PORT_SCAN_ORDER = [3002, 3000, 3001, 3003, 3004, 3005];
const VALID_COUNTS = new Set([1, 2, 4]);
const VALID_QUALITIES = new Set(["low", "medium", "high", "auto"]);

async function main() {
  try {
    const cli = parseArgs(process.argv.slice(2));
    if (cli.help) {
      printHelp();
      return;
    }

    const stdinConfig = await readStdinJsonIfAvailable();
    const rawConfig = { ...stdinConfig, ...cli };
    if (rawConfig.buildIndex) {
      await buildCategoryIndex(rawConfig.buildIndex);
      return;
    }

    const config = normalizeConfig(rawConfig);
    const server = await findHealthyServer(config.port, config.portExplicit);
    const idempotencyKey = createIdempotencyKey(config.slug);
    const payload = buildGeneratePayload(config, idempotencyKey);

    const generated = await postJson(`${server.baseUrl}/api/generate`, payload, 180000);
    if (!generated.ok) {
      throw new Error(typeof generated.reason === "string" ? generated.reason : "Generate API returned ok:false");
    }

    const images = extractImages(generated);
    if (images.length === 0) {
      throw new Error("Generate API response did not include image storage paths");
    }

    const createdAt = new Date().toISOString();
    const outputDir = path.join(getDataRoot(), "agent-runs", `${safeTimestamp(createdAt)}-${config.slug}`);
    const outputImagesDir = path.join(outputDir, "images");
    await fs.mkdir(outputImagesDir, { recursive: true });

    const copiedImages = [];
    for (const [index, image] of images.entries()) {
      const sourcePath = resolveStoragePath(image.storagePath);
      const fileName = await uniqueFileName(outputImagesDir, path.basename(sourcePath), index);
      const destinationPath = path.join(outputImagesDir, fileName);
      await fs.copyFile(sourcePath, destinationPath);
      copiedImages.push({
        id: image.id ?? null,
        imageUrl: image.imageUrl ?? null,
        storagePath: image.storagePath,
        sourcePath,
        fileName,
        outputPath: destinationPath,
        relativePath: path.posix.join("images", fileName),
        mimeType: image.mimeType ?? null,
        revisedPrompt: image.revisedPrompt ?? null
      });
    }

    const manifest = {
      schemaVersion: 1,
      createdAt,
      category: config.category,
      slug: config.slug,
      prompt: config.prompt,
      reference: {
        primary: config.reference,
        gallery: config.referenceGallery
      },
      params: {
        count: config.count,
        quality: config.quality,
        imageSize: config.size,
        aspectRatio: config.aspect,
        port: server.port,
        baseUrl: server.baseUrl,
        idempotencyKey
      },
      response: {
        id: generated.id ?? null,
        imageUrl: generated.imageUrl ?? null,
        storagePath: generated.storagePath ?? null,
        model: generated.model ?? null,
        revisedPrompt: generated.revisedPrompt ?? null,
        partial: generated.partial ?? null
      },
      images: copiedImages
    };

    const manifestPath = path.join(outputDir, "manifest.json");
    const reviewHtmlPath = path.join(outputDir, "review.html");
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await fs.writeFile(reviewHtmlPath, renderReviewHtml(manifest), "utf8");

    printJson({
      ok: true,
      outputDir,
      imagePaths: copiedImages.map(image => image.outputPath),
      reviewHtmlPath,
      manifestPath
    });
  } catch (error) {
    printJson({
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const equalIndex = arg.indexOf("=");
    const rawKey = equalIndex === -1 ? arg.slice(2) : arg.slice(2, equalIndex);
    const key = toCamelCase(rawKey);
    const value = equalIndex === -1 ? argv[index + 1] : arg.slice(equalIndex + 1);

    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    if (equalIndex === -1) {
      index += 1;
    }

    result[key] = value;
    if (key === "port") {
      result.portExplicit = true;
    }
  }

  return result;
}

async function readStdinJsonIfAvailable() {
  if (process.stdin.isTTY) {
    return {};
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("stdin JSON must be an object");
  }
  return parsed;
}

function normalizeConfig(raw) {
  const prompt = asTrimmedString(raw.prompt);
  if (!prompt) {
    throw new Error("--prompt is required");
  }

  const rawCount = raw.count === undefined ? 1 : Number(raw.count);
  if (!Number.isInteger(rawCount) || !VALID_COUNTS.has(rawCount)) {
    throw new Error("--count must be one of 1, 2, or 4");
  }

  const quality = asTrimmedString(raw.quality) || "medium";
  if (!VALID_QUALITIES.has(quality)) {
    throw new Error("--quality must be one of low, medium, high, or auto");
  }

  const port = raw.port === undefined ? DEFAULT_PORT : Number(raw.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("--port must be a valid TCP port");
  }

  const referenceGallery = normalizeReferenceGallery(raw.referenceGallery);
  const slug = sanitizeSlug(asTrimmedString(raw.slug) || prompt);

  return {
    prompt,
    reference: asTrimmedString(raw.reference) || null,
    referenceGallery,
    category: asTrimmedString(raw.category) || null,
    slug,
    count: rawCount,
    quality,
    size: asTrimmedString(raw.size) || null,
    aspect: asTrimmedString(raw.aspect) || null,
    port,
    portExplicit: raw.portExplicit === true
  };
}

function normalizeReferenceGallery(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(item => asTrimmedString(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  }
  throw new Error("--reference-gallery must be a comma-separated string or JSON array");
}

async function buildCategoryIndex(rawCategory) {
  const category = asTrimmedString(rawCategory);
  if (!category) {
    throw new Error("--build-index requires a category");
  }

  const runsRoot = path.join(getDataRoot(), "agent-runs");
  const entries = await fs.readdir(runsRoot, { withFileTypes: true });
  const runs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const runDir = path.join(runsRoot, entry.name);
    const manifestPath = path.join(runDir, "manifest.json");
    if (!(await exists(manifestPath))) {
      continue;
    }

    const manifest = await readJsonFile(manifestPath);
    const manifestCategory = asTrimmedString(manifest.category);
    const manifestSlug = asTrimmedString(manifest.slug);
    if (manifestCategory !== category || !entry.name.endsWith(`-${manifestSlug}`)) {
      continue;
    }

    const firstImage = Array.isArray(manifest.images) ? manifest.images[0] : null;
    const imageRelativePath = firstImage && asTrimmedString(firstImage.relativePath);
    runs.push({
      dirName: entry.name,
      manifestPath,
      manifest,
      imageRelativePath: imageRelativePath || null
    });
  }

  runs.sort((left, right) => {
    const leftTime = Date.parse(left.manifest.createdAt);
    const rightTime = Date.parse(right.manifest.createdAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.dirName.localeCompare(right.dirName);
  });

  if (runs.length === 0) {
    throw new Error(`No agent runs found for category: ${category}`);
  }

  const safeCategory = sanitizeSlug(category);
  const outputPath = path.join(runsRoot, `_${safeCategory}-index.html`);
  await fs.writeFile(outputPath, renderIndexHtml(category, runs), "utf8");

  printJson({
    ok: true,
    category,
    count: runs.length,
    indexHtmlPath: outputPath,
    manifestPaths: runs.map(run => run.manifestPath)
  });
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function findHealthyServer(preferredPort, explicit) {
  const ports = explicit
    ? [preferredPort]
    : [preferredPort, ...PORT_SCAN_ORDER.filter(port => port !== preferredPort)];

  const failures = [];
  for (const port of ports) {
    const baseUrl = `http://localhost:${port}`;
    try {
      const health = await getJson(`${baseUrl}/api/health`, 2500);
      if (health.ok === true) {
        return { port, baseUrl, health };
      }
      failures.push(`${port}: health ok was not true`);
    } catch (error) {
      failures.push(`${port}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`No healthy /api/health endpoint found. Tried ${failures.join("; ")}`);
}

function buildGeneratePayload(config, idempotencyKey) {
  const options = {
    idempotencyKey,
    count: config.count,
    quality: config.quality
  };

  if (config.size) {
    options.imageSize = config.size;
  }
  if (config.aspect) {
    options.aspectRatio = config.aspect;
  }
  if (config.reference) {
    options.referenceImageUrl = config.reference;
  }
  if (config.referenceGallery.length > 0) {
    options.referenceGallery = config.referenceGallery;
  }

  return {
    prompt: config.prompt,
    mode: "create",
    options
  };
}

function extractImages(response) {
  const candidates = Array.isArray(response.images) && response.images.length > 0
    ? response.images
    : [response];

  return candidates
    .map(image => {
      if (!image || typeof image !== "object") {
        return null;
      }
      const storagePath = asTrimmedString(image.storagePath);
      if (!storagePath) {
        return null;
      }
      return {
        id: asTrimmedString(image.id),
        imageUrl: asTrimmedString(image.imageUrl),
        storagePath,
        mimeType: asTrimmedString(image.mimeType),
        revisedPrompt: image.revisedPrompt === null ? null : asTrimmedString(image.revisedPrompt)
      };
    })
    .filter(Boolean);
}

function getDataRoot() {
  const envDir = asTrimmedString(process.env.SIONBANANA_DATA_DIR);
  if (envDir) {
    if (envDir.startsWith("~/")) {
      const home = process.env.HOME || process.cwd();
      return path.resolve(home, envDir.slice(2));
    }
    return path.resolve(envDir);
  }
  return path.resolve(process.cwd(), "data");
}

function resolveStoragePath(storagePath) {
  if (path.isAbsolute(storagePath)) {
    return storagePath;
  }

  const normalized = storagePath.replace(/^[/\\]+/, "");
  const dataRoot = getDataRoot();
  if (normalized === "images" || normalized.startsWith(`images${path.sep}`) || normalized.startsWith("images/")) {
    return path.join(dataRoot, normalized);
  }
  return path.join(dataRoot, "images", normalized);
}

async function uniqueFileName(dir, baseName, index) {
  const safeBaseName = sanitizeFileName(baseName || `image-${index + 1}.png`);
  const parsed = path.parse(safeBaseName);
  let candidate = safeBaseName;
  let attempt = 1;

  while (await exists(path.join(dir, candidate))) {
    candidate = `${parsed.name}-${attempt}${parsed.ext || ".png"}`;
    attempt += 1;
  }
  return candidate;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getJson(url, timeoutMs) {
  return requestJson(url, { method: "GET" }, timeoutMs);
}

async function postJson(url, body, timeoutMs) {
  return requestJson(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    timeoutMs
  );
}

async function requestJson(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response from ${url}`);
      }
    }

    if (!response.ok) {
      const reason = data && typeof data.reason === "string" ? data.reason : response.statusText;
      throw new Error(`${response.status} ${reason}`);
    }

    return data;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function renderReviewHtml(manifest) {
  const imageCards = manifest.images
    .map(image => `
      <figure class="thumb">
        <a href="${escapeAttr(image.relativePath)}" target="_blank" rel="noreferrer">
          <img src="${escapeAttr(image.relativePath)}" alt="${escapeAttr(image.fileName)}">
        </a>
        <figcaption>${escapeHtml(image.fileName)}</figcaption>
      </figure>`)
    .join("\n");

  const metadataRows = [
    ["timestamp", manifest.createdAt],
    ["category", manifest.category ?? ""],
    ["slug", manifest.slug],
    ["count", String(manifest.params.count)],
    ["quality", manifest.params.quality],
    ["imageSize", manifest.params.imageSize ?? ""],
    ["aspectRatio", manifest.params.aspectRatio ?? ""],
    ["reference", manifest.reference.primary ?? ""],
    ["referenceGallery", manifest.reference.gallery.join(", ")],
    ["idempotencyKey", manifest.params.idempotencyKey],
    ["baseUrl", manifest.params.baseUrl]
  ]
    .map(([key, value]) => `
        <tr>
          <th>${escapeHtml(key)}</th>
          <td>${escapeHtml(value)}</td>
        </tr>`)
    .join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sion Banana Agent Review - ${escapeHtml(manifest.slug)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f4ef;
      --text: #1d1b16;
      --muted: #666056;
      --line: #d8d2c4;
      --panel: #fffefa;
      --accent: #2f6f5e;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    main {
      width: min(1120px, calc(100% - 32px));
      margin: 32px auto;
    }
    h1, h2 {
      margin: 0 0 12px;
      letter-spacing: 0;
    }
    h1 {
      font-size: 28px;
    }
    h2 {
      font-size: 18px;
      margin-top: 28px;
    }
    .muted {
      color: var(--muted);
      margin: 0 0 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .thumb {
      margin: 0;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .thumb img {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: contain;
      background: #ece7dc;
    }
    .thumb figcaption {
      padding: 10px 12px;
      color: var(--muted);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    pre, table, .notes {
      width: 100%;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    pre {
      padding: 16px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    table {
      border-collapse: collapse;
      overflow: hidden;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    th {
      width: 180px;
      color: var(--accent);
      font-weight: 700;
    }
    tr:last-child th,
    tr:last-child td {
      border-bottom: 0;
    }
    .notes {
      min-height: 220px;
      padding: 16px;
    }
    .rubric {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 10px 14px;
    }
    .rubric div:nth-child(odd) {
      color: var(--accent);
      font-weight: 700;
    }
    @media (max-width: 640px) {
      main {
        width: min(100% - 20px, 1120px);
        margin: 20px auto;
      }
      th {
        width: 120px;
      }
      .rubric {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>Agent Review</h1>
    <p class="muted">${escapeHtml(manifest.createdAt)} · ${escapeHtml(manifest.slug)}</p>

    <section aria-labelledby="images-title">
      <h2 id="images-title">Images</h2>
      <div class="grid">
${imageCards}
      </div>
    </section>

    <section aria-labelledby="prompt-title">
      <h2 id="prompt-title">Prompt</h2>
      <pre>${escapeHtml(manifest.prompt)}</pre>
    </section>

    <section aria-labelledby="metadata-title">
      <h2 id="metadata-title">Metadata</h2>
      <table>
        <tbody>
${metadataRows}
        </tbody>
      </table>
    </section>

    <section aria-labelledby="review-title">
      <h2 id="review-title">Review Notes</h2>
      <div class="notes" data-review-notes>
        <div class="rubric">
          <div>subject</div><div></div>
          <div>background</div><div></div>
          <div>pose</div><div></div>
          <div>style</div><div></div>
          <div>missing</div><div></div>
          <div>notes</div><div></div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>
`;
}

function renderIndexHtml(category, runs) {
  const promptSummary = renderPromptSummary(runs);
  const stats = buildIndexStats(runs);
  const cards = runs
    .map((run, index) => {
      const number = String(index + 1).padStart(2, "0");
      const imageSrc = run.imageRelativePath
        ? `./${toPosixPath(path.join(run.dirName, run.imageRelativePath))}`
        : "";
      const reviewHref = `./${toPosixPath(path.join(run.dirName, "review.html"))}`;
      const timestamp = formatIndexTimestamp(run.manifest.createdAt);
      const imageMarkup = imageSrc
        ? `<img src="${escapeAttr(imageSrc)}" alt="${escapeAttr(number)}" loading="lazy">`
        : `<div class="missing-image">No image</div>`;

      return `<div class="card">
  <label class="select" for="pick-${escapeAttr(number)}">
    <input id="pick-${escapeAttr(number)}" type="checkbox" value="${escapeAttr(number)}">
    <span>선택</span>
  </label>
  ${imageMarkup}
  <div class="meta">
    <div class="num">#${escapeHtml(number)}</div>
    <div class="ts">${escapeHtml(timestamp)}</div>
    <a href="${escapeAttr(reviewHref)}" class="link">상세 →</a>
  </div>
</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(category)} - ${runs.length}장</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0a0a;color:#eee;padding:32px;margin:0}
h1{margin:0 0 8px;font-weight:600}
.subtitle{color:#888;margin:0 0 18px;font-size:14px}
.toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 18px}
button{appearance:none;border:1px solid #444;background:#f5b342;color:#111;border-radius:6px;padding:9px 14px;font-weight:700;cursor:pointer}
button:hover{background:#ffc464}
#copy-status{color:#9ad79f;font-size:13px}
.prompt-box{background:#1a1a1a;padding:16px 20px;border-radius:8px;margin-bottom:32px;font-size:14px;line-height:1.6;border:1px solid #333}
.prompt-box strong{color:#ffa500}
.prompt-box ol{margin:8px 0 0 22px;padding:0}
.prompt-box li{margin:4px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}
.card{position:relative;background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid #333;transition:transform .2s}
.card:hover{transform:translateY(-2px);border-color:#555}
.card img,.missing-image{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;background:#111}
.missing-image{display:grid;place-items:center;color:#777}
.select{position:absolute;top:10px;left:10px;z-index:1;display:flex;align-items:center;gap:7px;background:rgba(0,0,0,.72);border:1px solid #555;border-radius:999px;padding:7px 10px;color:#fff;font-size:12px;cursor:pointer}
.select input{width:16px;height:16px;margin:0;accent-color:#f5b342}
.card .meta{padding:14px 16px}
.card .num{font-size:18px;font-weight:600;color:#fff;margin-bottom:4px}
.card .ts{font-size:11px;color:#888;font-family:monospace}
.card .link{display:inline-block;margin-top:8px;padding:4px 8px;background:#2a2a2a;border-radius:4px;color:#aaa;text-decoration:none;font-size:12px}
.card .link:hover{background:#3a3a3a;color:#fff}
@media(max-width:640px){body{padding:20px}.grid{grid-template-columns:1fr}}
</style></head><body>
<h1>${escapeHtml(category)} — ${runs.length}장 시도</h1>
<p class="subtitle">${escapeHtml(stats)}</p>
<div class="toolbar">
  <button id="copy-selected" type="button">선택 복사</button>
  <span id="copy-status" aria-live="polite"></span>
</div>
<div class="prompt-box">${promptSummary}</div>
<div class="grid">
${cards}
</div>
<script>
document.getElementById('copy-selected').addEventListener('click', () => {
  const nums = [...document.querySelectorAll('.card input[type=checkbox]:checked')]
    .map(el => '#' + el.value).join(', ');
  if (!nums) return alert('선택된 항목이 없습니다');
  const text = '2k로 업스케일: ' + nums;
  navigator.clipboard.writeText(text);
  document.getElementById('copy-status').textContent = '복사됨: ' + text;
});
</script>
</body></html>
`;
}

function renderPromptSummary(runs) {
  const prompts = Array.from(new Set(runs.map(run => asTrimmedString(run.manifest.prompt)).filter(Boolean)));
  if (prompts.length === 0) {
    return "<strong>Prompt:</strong> ";
  }
  if (prompts.length === 1) {
    return `<strong>Prompt:</strong> ${escapeHtml(prompts[0])}`;
  }

  const items = prompts
    .map(prompt => `<li>${escapeHtml(prompt)}</li>`)
    .join("");
  return `<strong>Prompts:</strong> ${prompts.length} unique<ol>${items}</ol>`;
}

function buildIndexStats(runs) {
  const createdDates = runs
    .map(run => Date.parse(run.manifest.createdAt))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const promptCount = new Set(runs.map(run => asTrimmedString(run.manifest.prompt)).filter(Boolean)).size;
  const start = createdDates.length > 0 ? new Date(createdDates[0]).toISOString().slice(0, 19).replace("T", " ") : "";
  const end = createdDates.length > 0 ? new Date(createdDates[createdDates.length - 1]).toISOString().slice(0, 19).replace("T", " ") : "";
  const range = start && end ? ` · ${start} UTC - ${end} UTC` : "";
  return `시온바나나 자동화 · ${runs.length} runs · ${promptCount} prompts${range}`;
}

function formatIndexTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return asTrimmedString(value);
  }
  return `${date.toISOString().slice(11, 19)} UTC`;
}

function createIdempotencyKey(slug) {
  const stamp = safeTimestamp(new Date().toISOString());
  const random = Math.random().toString(36).slice(2, 10);
  return `agent-${stamp}-${slug}-${random}`.slice(0, 128);
}

function safeTimestamp(value) {
  return value.replace(/[:.]/g, "-");
}

function sanitizeSlug(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "agent-run";
}

function sanitizeFileName(value) {
  const parsed = path.parse(value);
  const name = parsed.name.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
  const ext = parsed.ext && /^[.][A-Za-z0-9]+$/.test(parsed.ext) ? parsed.ext.toLowerCase() : ".png";
  return `${name}${ext}`;
}

function toPosixPath(value) {
  return value.replace(/\\/g, "/");
}

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/agent-generate.mjs --prompt "..." --slug cafe-arrival [options]

Options:
  --prompt              Required generation prompt
  --build-index         Build data/agent-runs/_{category}-index.html
  --reference           Optional /api/images/<id> reference URL
  --reference-gallery   Optional comma-separated /api/images/<id> URLs
  --category            Optional classification label
  --slug                Optional output folder slug
  --count               1, 2, or 4. Default: 1
  --quality             low, medium, high, or auto. Default: medium
  --size                Optional imageSize passed to /api/generate
  --aspect              Optional aspectRatio passed to /api/generate
  --port                Preferred localhost port. Default: 3002
`);
}

main();
