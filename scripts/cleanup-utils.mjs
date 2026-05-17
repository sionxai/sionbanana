import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const CLEANUP_SCHEMA_VERSION = 1;
export const DEFAULT_SCAN_OUTPUT = "data/cleanup-scan.json";
export const DEFAULT_REPORT_OUTPUT = "data/cleanup-report.html";
export const DEFAULT_QUARANTINE_DIR = "data/.quarantine";
export const PNG_EXTENSION = ".png";

const API_IMAGE_RE = /\/api\/images\/([A-Za-z0-9_-]+)/g;
const DATA_IMAGES_PATH_RE = /(?:^|[/"'\\\s])((?:data[\\/])?images[\\/][^"'<>?\n\r]+\.(?:png|jpg|jpeg|webp))(?=$|[/"'\\\s])/gi;
const STORAGE_PATH_RE = /(?:^|[/"'\\\s])((?:\d{4}-\d{2}|[A-Za-z0-9_.-]+)[\\/][^"'<>?\n\r]+\.(?:png|jpg|jpeg|webp))(?=$|[/"'\\\s])/gi;

export function parseArgs(argv) {
  const result = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      result._.push(arg);
      continue;
    }

    const equalIndex = arg.indexOf("=");
    const rawKey = equalIndex === -1 ? arg.slice(2) : arg.slice(2, equalIndex);
    const key = toCamelCase(rawKey);

    if (equalIndex !== -1) {
      setArgValue(result, key, arg.slice(equalIndex + 1));
      continue;
    }

    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      result[key] = true;
      continue;
    }

    index += 1;
    setArgValue(result, key, next);
  }

  return result;
}

export function getDataRoot(cwd = process.cwd(), env = process.env) {
  const fromEnv = typeof env.SIONBANANA_DATA_DIR === "string" ? env.SIONBANANA_DATA_DIR.trim() : "";
  if (fromEnv) {
    if (fromEnv.startsWith("~/")) {
      return path.resolve(homedir(), fromEnv.slice(2));
    }
    return path.resolve(fromEnv);
  }
  return path.resolve(cwd, "data");
}

export function getImagesRoot(dataRoot) {
  return path.join(dataRoot, "images");
}

export function getAgentRunsRoot(dataRoot) {
  return path.join(dataRoot, "agent-runs");
}

export function getQuarantineRoot(dataRoot) {
  return path.join(dataRoot, ".quarantine");
}

export async function listDiskImages(dataRoot, { extension = PNG_EXTENSION } = {}) {
  const imagesRoot = getImagesRoot(dataRoot);
  const files = await walkFiles(imagesRoot);
  const normalizedExtension = extension.toLowerCase();
  const results = [];

  for (const absolutePath of files) {
    if (path.extname(absolutePath).toLowerCase() !== normalizedExtension) {
      continue;
    }

    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      continue;
    }

    const relativePath = toPosixPath(path.relative(imagesRoot, absolutePath));
    const parsed = path.parse(relativePath);
    results.push({
      id: path.basename(parsed.base, parsed.ext),
      fileName: parsed.base,
      bucket: toPosixPath(parsed.dir),
      relativePath,
      absolutePath,
      apiImageUrl: `/api/images/${path.basename(parsed.base, parsed.ext)}`,
      size: stat.size,
      mtime: stat.mtime.toISOString()
    });
  }

  return results.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function collectManifestReferences(dataRoot) {
  const agentRunsRoot = getAgentRunsRoot(dataRoot);
  const manifestPaths = await findFilesNamed(agentRunsRoot, "manifest.json");
  const index = createReferenceIndex("agent-runs-manifest");
  const warnings = [];
  let parsedCount = 0;

  for (const manifestPath of manifestPaths) {
    try {
      const manifest = await readJsonFile(manifestPath);
      parsedCount += 1;
      collectReferencesFromValue(manifest, index, {
        sourceKind: "agent-runs-manifest",
        sourcePath: manifestPath,
        dataRoot
      });
    } catch (error) {
      warnings.push({
        sourcePath: manifestPath,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    index,
    summary: {
      filesFound: manifestPaths.length,
      filesParsed: parsedCount,
      filesFailed: warnings.length
    },
    warnings
  };
}

export async function collectJsonFileReferences(filePaths, dataRoot, sourceKind = "protect-json") {
  const index = createReferenceIndex(sourceKind);
  const summaries = [];
  const warnings = [];

  for (const inputPath of filePaths) {
    const sourcePath = path.resolve(inputPath);
    try {
      const value = await readJsonFile(sourcePath);
      collectReferencesFromValue(value, index, { sourceKind, sourcePath, dataRoot });
      summaries.push({ sourcePath, ok: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      summaries.push({ sourcePath, ok: false, reason });
      warnings.push({ sourcePath, reason });
    }
  }

  return { index, summaries, warnings };
}

export function createReferenceIndex(defaultSourceKind = "reference") {
  return {
    defaultSourceKind,
    ids: new Map(),
    relativePaths: new Map(),
    absolutePaths: new Map()
  };
}

export function mergeReferenceIndexes(...indexes) {
  const merged = createReferenceIndex("merged");
  for (const index of indexes) {
    mergeMapList(merged.ids, index.ids);
    mergeMapList(merged.relativePaths, index.relativePaths);
    mergeMapList(merged.absolutePaths, index.absolutePaths);
  }
  return merged;
}

export function collectReferencesFromValue(value, index, context) {
  visitJson(value, "$", (item, pointer) => {
    if (typeof item !== "string") {
      return;
    }

    collectReferencesFromString(item, index, {
      ...context,
      pointer
    });
  });
}

export function collectReferencesFromString(value, index, context) {
  const source = {
    sourceKind: context.sourceKind ?? index.defaultSourceKind,
    sourcePath: context.sourcePath ?? null,
    pointer: context.pointer ?? null
  };

  for (const id of matchAllIds(API_IMAGE_RE, value)) {
    addRef(index.ids, id, { ...source, value: `/api/images/${id}` });
  }

  for (const candidate of matchAllPaths(DATA_IMAGES_PATH_RE, value)) {
    addPathReference(candidate, index, context.dataRoot, source);
  }

  for (const candidate of matchAllPaths(STORAGE_PATH_RE, value)) {
    addPathReference(candidate, index, context.dataRoot, source);
  }
}

export function referencesForImage(image, index) {
  return [
    ...(index.ids.get(image.id) ?? []),
    ...(index.relativePaths.get(image.relativePath) ?? []),
    ...(index.absolutePaths.get(path.resolve(image.absolutePath)) ?? [])
  ];
}

export function buildScanResult({
  dataRoot,
  diskImages,
  referenceIndex,
  manifestSummary,
  exportSummaries,
  warnings,
  classificationMode = "conservative",
  generatedAt = new Date().toISOString()
}) {
  const protectedImages = [];
  const orphanImages = [];
  const unknownImages = [];
  const normalizedMode = classificationMode === "orphan" ? "orphan" : "conservative";

  for (const image of diskImages) {
    const references = dedupeReferences(referencesForImage(image, referenceIndex));
    if (references.length > 0) {
      protectedImages.push({
        ...image,
        classification: "protected",
        reasons: buildProtectedReasons(references),
        references
      });
      continue;
    }

    const record = {
      ...image,
      classification: normalizedMode === "orphan" ? "orphan" : "unknown",
      reasons: normalizedMode === "orphan"
        ? ["not referenced by scanned manifests or provided exports"]
        : [
            "not referenced by scanned agent-run manifests",
            "browser localStorage was not read; history, characters, story refs, and gallery slots may still reference this image"
          ],
      references: []
    };

    if (normalizedMode === "orphan") {
      orphanImages.push(record);
    } else {
      unknownImages.push(record);
    }
  }

  const counts = {
    disk: diskImages.length,
    protected: protectedImages.length,
    orphan: orphanImages.length,
    unknown: unknownImages.length,
    bytes: {
      disk: sumBytes(diskImages),
      protected: sumBytes(protectedImages),
      orphan: sumBytes(orphanImages),
      unknown: sumBytes(unknownImages)
    }
  };

  return {
    schemaVersion: CLEANUP_SCHEMA_VERSION,
    generatedAt,
    mode: normalizedMode,
    dataRoot,
    imagesRoot: getImagesRoot(dataRoot),
    counts,
    references: {
      manifests: manifestSummary,
      exports: exportSummaries
    },
    warnings,
    protected: protectedImages,
    orphan: orphanImages,
    unknown: unknownImages
  };
}

export async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function normalizePathList(value) {
  if (value === undefined || value === null || value === false) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap(item => {
    if (typeof item !== "string") {
      return [];
    }
    return item.split(",").map(part => part.trim()).filter(Boolean);
  });
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function safeTimestamp(value = new Date().toISOString()) {
  return value.replace(/[:.]/g, "-");
}

export function toPosixPath(value) {
  return value.replace(/\\/g, "/");
}

export function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
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

async function findFilesNamed(root, fileName) {
  const files = await walkFiles(root);
  return files.filter(filePath => path.basename(filePath) === fileName).sort();
}

function visitJson(value, pointer, callback) {
  callback(value, pointer);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      visitJson(item, `${pointer}/${index}`, callback);
    });
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      visitJson(item, `${pointer}/${escapePointer(key)}`, callback);
    });
  }
}

function addPathReference(candidate, index, dataRoot, source) {
  const normalized = candidate.replace(/^["'\s]+|["'\s]+$/g, "");
  const dataImagesRelative = normalizeImagesRelativePath(normalized);
  if (dataImagesRelative) {
    addRef(index.relativePaths, dataImagesRelative, { ...source, value: dataImagesRelative });
    return;
  }

  if (path.isAbsolute(normalized)) {
    addRef(index.absolutePaths, path.resolve(normalized), { ...source, value: normalized });
    if (dataRoot && isInside(getImagesRoot(dataRoot), normalized)) {
      addRef(index.relativePaths, toPosixPath(path.relative(getImagesRoot(dataRoot), normalized)), {
        ...source,
        value: normalized
      });
    }
  }
}

function normalizeImagesRelativePath(value) {
  const posixValue = toPosixPath(value.trim()).replace(/^\.?\//, "");
  const withoutData = posixValue.startsWith("data/images/") ? posixValue.slice("data/images/".length) : posixValue;
  const withoutImages = withoutData.startsWith("images/") ? withoutData.slice("images/".length) : withoutData;
  if (!withoutImages || withoutImages.startsWith("../") || withoutImages.includes("/../")) {
    return null;
  }
  if (!/\.(png|jpg|jpeg|webp)$/i.test(withoutImages)) {
    return null;
  }
  return withoutImages;
}

function matchAllIds(regex, value) {
  regex.lastIndex = 0;
  return Array.from(value.matchAll(regex), match => match[1]);
}

function matchAllPaths(regex, value) {
  regex.lastIndex = 0;
  return Array.from(value.matchAll(regex), match => match[1]);
}

function addRef(map, key, reference) {
  if (!key) {
    return;
  }
  const current = map.get(key) ?? [];
  current.push(reference);
  map.set(key, current);
}

function mergeMapList(target, source) {
  for (const [key, values] of source.entries()) {
    const current = target.get(key) ?? [];
    target.set(key, [...current, ...values]);
  }
}

function dedupeReferences(references) {
  const seen = new Set();
  return references.filter(reference => {
    const key = [
      reference.sourceKind,
      reference.sourcePath,
      reference.pointer,
      reference.value
    ].join("\u0000");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildProtectedReasons(references) {
  const kinds = new Set(references.map(reference => reference.sourceKind));
  return Array.from(kinds, kind => `referenced by ${kind}`);
}

function sumBytes(items) {
  return items.reduce((total, item) => total + (Number.isFinite(item.size) ? item.size : 0), 0);
}

function setArgValue(result, key, value) {
  if (result[key] === undefined) {
    result[key] = value;
    return;
  }
  if (Array.isArray(result[key])) {
    result[key].push(value);
    return;
  }
  result[key] = [result[key], value];
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function escapePointer(value) {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
