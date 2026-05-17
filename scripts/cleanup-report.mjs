#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEFAULT_REPORT_OUTPUT,
  DEFAULT_SCAN_OUTPUT,
  escapeAttr,
  escapeHtml,
  formatBytes,
  parseArgs,
  printJson,
  readJsonFile,
  toPosixPath
} from "./cleanup-utils.mjs";

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      return;
    }

    const scanPath = path.resolve(String(args.scan ?? DEFAULT_SCAN_OUTPUT));
    const outPath = path.resolve(String(args.out ?? DEFAULT_REPORT_OUTPUT));
    const scan = await readJsonFile(scanPath);
    const html = renderReport(scan, { scanPath, outPath });

    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, html, "utf8");
    printJson({
      ok: true,
      scanPath,
      outPath,
      counts: scan.counts ?? {}
    });
  } catch (error) {
    printJson({
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  }
}

function renderReport(scan, { scanPath, outPath }) {
  const counts = scan.counts ?? {};
  const generatedAt = scan.generatedAt ?? "";
  const mode = scan.mode ?? "conservative";
  const warnings = Array.isArray(scan.warnings) ? scan.warnings : [];
  const sections = [
    renderImageSection("Protected", scan.protected ?? [], outPath, "보호 참조가 확인된 파일입니다. quarantine 후보가 아닙니다."),
    renderImageSection("Orphan", scan.orphan ?? [], outPath, "명시적으로 orphan으로 분류된 파일입니다. 기본 conservative 모드에서는 보통 0개입니다."),
    renderImageSection("Unknown", scan.unknown ?? [], outPath, "localStorage 보호 여부를 알 수 없는 파일입니다. 삭제가 아니라 quarantine 검토 후보입니다.")
  ].join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sion Banana Cleanup Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --panel: #ffffff;
      --text: #172033;
      --muted: #5f6b7a;
      --line: #d8dee8;
      --protected: #137a4b;
      --unknown: #8a5a00;
      --orphan: #9c2d2d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 28px; letter-spacing: 0; }
    h2 { margin-top: 32px; font-size: 20px; letter-spacing: 0; }
    h3 { font-size: 14px; letter-spacing: 0; }
    .muted { color: var(--muted); }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
      margin-bottom: 24px;
    }
    .meta {
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      text-align: right;
      word-break: break-all;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin: 20px 0;
    }
    .stat, .note, .bucket-table, .warning-list {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .stat { padding: 14px 16px; }
    .stat strong { display: block; font-size: 24px; line-height: 1.1; }
    .stat span { color: var(--muted); font-size: 12px; }
    .note {
      padding: 14px 16px;
      color: var(--muted);
      font-size: 14px;
    }
    .bucket-table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      margin-top: 12px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
      font-size: 13px;
      vertical-align: top;
    }
    th { color: var(--muted); font-weight: 600; }
    tr:last-child td { border-bottom: 0; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .image-card {
      overflow: hidden;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .image-card img {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      background: #eef2f7;
    }
    .image-body {
      padding: 10px;
      display: grid;
      gap: 6px;
      min-width: 0;
    }
    code {
      color: #23304a;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 11px;
      overflow-wrap: anywhere;
    }
    .pill {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 2px 7px;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.4;
    }
    .pill.protected { background: #e9f7ef; color: var(--protected); }
    .pill.orphan { background: #faeeee; color: var(--orphan); }
    .pill.unknown { background: #fff5d8; color: var(--unknown); }
    .references {
      color: var(--muted);
      font-size: 11px;
      overflow-wrap: anywhere;
    }
    .warning-list {
      margin-top: 12px;
      padding: 12px 16px;
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 760px) {
      .header { display: block; }
      .meta { margin-top: 12px; text-align: left; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <main>
    <section class="header">
      <div>
        <h1>Sion Banana Cleanup Report</h1>
        <p class="muted">scan only 결과를 사람이 검토하기 위한 리포트입니다. 이 파일은 이미지를 이동하거나 삭제하지 않습니다.</p>
      </div>
      <div class="meta">
        <div>generated: ${escapeHtml(generatedAt)}</div>
        <div>mode: ${escapeHtml(mode)}</div>
        <div>scan: ${escapeHtml(scanPath)}</div>
      </div>
    </section>
    ${renderSummary(counts)}
    <section class="note">
      Conservative 기본 정책: agent-runs manifest 또는 사용자가 제공한 export JSON에서 확인된 이미지만 protected입니다.
      localStorage는 서버 스크립트에서 직접 읽을 수 없으므로, 나머지는 삭제 대상이 아니라 unknown 검토 대상입니다.
    </section>
    ${renderBucketStats(scan)}
    ${warnings.length ? renderWarnings(warnings) : ""}
    ${sections}
  </main>
</body>
</html>
`;
}

function renderSummary(counts) {
  const bytes = counts.bytes ?? {};
  return `<section class="summary">
  ${renderStat("Disk", counts.disk, bytes.disk)}
  ${renderStat("Protected", counts.protected, bytes.protected)}
  ${renderStat("Orphan", counts.orphan, bytes.orphan)}
  ${renderStat("Unknown", counts.unknown, bytes.unknown)}
</section>`;
}

function renderStat(label, count, bytes) {
  return `<div class="stat"><strong>${escapeHtml(count ?? 0)}</strong><span>${escapeHtml(label)} · ${escapeHtml(formatBytes(bytes ?? 0))}</span></div>`;
}

function renderBucketStats(scan) {
  const rows = bucketStats([...(scan.protected ?? []), ...(scan.orphan ?? []), ...(scan.unknown ?? [])]);
  if (rows.length === 0) {
    return "";
  }

  return `<section>
  <h2>Disk Size By Bucket</h2>
  <table class="bucket-table">
    <thead><tr><th>bucket</th><th>count</th><th>size</th><th>protected</th><th>orphan</th><th>unknown</th></tr></thead>
    <tbody>
      ${rows.map(row => `<tr><td><code>${escapeHtml(row.bucket || "(root)")}</code></td><td>${row.count}</td><td>${escapeHtml(formatBytes(row.size))}</td><td>${row.protected}</td><td>${row.orphan}</td><td>${row.unknown}</td></tr>`).join("\n")}
    </tbody>
  </table>
</section>`;
}

function renderWarnings(warnings) {
  return `<section>
  <h2>Warnings</h2>
  <div class="warning-list">
    ${warnings.map(warning => `<div><code>${escapeHtml(warning.sourcePath ?? "")}</code> ${escapeHtml(warning.reason ?? "")}</div>`).join("\n")}
  </div>
</section>`;
}

function renderImageSection(title, images, outPath, description) {
  const key = title.toLowerCase();
  return `<section>
  <h2>${escapeHtml(title)} (${images.length})</h2>
  <p class="muted">${escapeHtml(description)}</p>
  <div class="grid">
    ${images.map(image => renderImageCard(image, outPath, key)).join("\n")}
  </div>
</section>`;
}

function renderImageCard(image, outPath, key) {
  const refs = Array.isArray(image.references) ? image.references : [];
  const referenceText = refs.length
    ? refs.slice(0, 3).map(ref => `${ref.sourceKind}${ref.pointer ? ` ${ref.pointer}` : ""}`).join(" · ")
    : (image.reasons ?? []).join(" · ");
  return `<article class="image-card">
  <img src="${escapeAttr(imageSrc(image, outPath))}" alt="${escapeAttr(image.relativePath)}" loading="lazy">
  <div class="image-body">
    <span class="pill ${escapeAttr(key)}">${escapeHtml(key)}</span>
    <code>${escapeHtml(image.relativePath)}</code>
    <h3>${escapeHtml(formatBytes(image.size ?? 0))}</h3>
    <div class="references">${escapeHtml(referenceText)}</div>
  </div>
</article>`;
}

function bucketStats(images) {
  const rows = new Map();
  for (const image of images) {
    const bucket = image.bucket ?? "";
    const row = rows.get(bucket) ?? {
      bucket,
      count: 0,
      size: 0,
      protected: 0,
      orphan: 0,
      unknown: 0
    };
    row.count += 1;
    row.size += Number.isFinite(image.size) ? image.size : 0;
    if (image.classification === "protected") row.protected += 1;
    if (image.classification === "orphan") row.orphan += 1;
    if (image.classification === "unknown") row.unknown += 1;
    rows.set(bucket, row);
  }
  return Array.from(rows.values()).sort((left, right) => right.size - left.size);
}

function imageSrc(image, outPath) {
  if (!image.absolutePath) {
    return image.relativePath ?? "";
  }
  const relative = path.relative(path.dirname(outPath), image.absolutePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return encodePath(toPosixPath(relative));
  }
  return `file://${encodePath(toPosixPath(image.absolutePath))}`;
}

function encodePath(value) {
  return value.split("/").map(part => encodeURIComponent(part)).join("/");
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/cleanup-report.mjs --scan data/cleanup-scan.json --out data/cleanup-report.html

Options:
  --scan    Scan JSON path. Default: ${DEFAULT_SCAN_OUTPUT}
  --out     HTML report output path. Default: ${DEFAULT_REPORT_OUTPUT}
`);
}

main();
