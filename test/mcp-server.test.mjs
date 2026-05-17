import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");
const SERVER_SCRIPT = path.join(REPO_ROOT, "scripts", "mcp-server.mjs");
const EXPECTED_TOOLS = [
  "health_check",
  "generate",
  "upscale_from",
  "build_index",
  "list_runs",
  "read_manifest",
  "list_images"
];

test("MCP stdio server starts and lists the MVP tools", async () => {
  await withMcpClient(async client => {
    const result = await client.listTools();
    const toolNames = result.tools.map(tool => tool.name).sort();

    assert.deepEqual(toolNames, [...EXPECTED_TOOLS].sort());
  });
});

test("MCP tools expose valid object input schemas", async () => {
  await withMcpClient(async client => {
    const result = await client.listTools();
    const toolsByName = new Map(result.tools.map(tool => [tool.name, tool]));

    for (const name of EXPECTED_TOOLS) {
      const tool = toolsByName.get(name);
      assert.ok(tool, `${name} should be registered`);
      assert.equal(tool.inputSchema.type, "object", `${name} should expose an object input schema`);
      assert.ok(tool.inputSchema.properties, `${name} should expose input properties`);
    }

    assert.deepEqual(toolsByName.get("generate").inputSchema.required, ["prompt"]);
    assert.deepEqual(toolsByName.get("upscale_from").inputSchema.required, ["upscaleFrom"]);
    assert.deepEqual(toolsByName.get("build_index").inputSchema.required, ["category"]);
    assert.deepEqual(toolsByName.get("read_manifest").inputSchema.required, ["run"]);
    assert.deepEqual(toolsByName.get("list_images").inputSchema.required, ["run"]);
  });
});

test("MCP generate tool call can be mocked without invoking generation", async () => {
  await withMcpClient(async client => {
    const result = await client.callTool({
      name: "generate",
      arguments: {
        prompt: "test prompt",
        category: "test",
        slug: "mcp-test",
        count: 1,
        quality: "low",
        size: "1024x1024"
      }
    });

    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.ok, true);
    assert.equal(result.structuredContent.mocked, true);
    assert.equal(result.structuredContent.tool, "generate");
    assert.deepEqual(result.structuredContent.args.slice(-12), [
      "--prompt",
      "test prompt",
      "--category",
      "test",
      "--slug",
      "mcp-test",
      "--count",
      "1",
      "--quality",
      "low",
      "--size",
      "1024x1024"
    ]);
  });
});

async function withMcpClient(callback) {
  const client = new Client({
    name: "sionbanana-mcp-test",
    version: "0.0.0"
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_SCRIPT],
    cwd: REPO_ROOT,
    env: {
      ...stringEnvironment(),
      SIONBANANA_MCP_MOCK: "1"
    },
    stderr: "pipe"
  });

  await client.connect(transport);
  try {
    return await callback(client);
  } finally {
    await client.close();
  }
}

function stringEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === "string"));
}
