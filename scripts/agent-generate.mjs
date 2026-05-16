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
    const config = normalizeConfig({ ...stdinConfig, ...cli });
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
