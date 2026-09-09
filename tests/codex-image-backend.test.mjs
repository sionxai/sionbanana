import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

let hooksRegistered = false;
let codexFetchModule;

function installHooks() {
  if (hooksRegistered) return;
  const authStub = `data:text/javascript,${encodeURIComponent(
    [
      "export class CodexAuthError extends Error {};",
      'export async function getCodexAuth() { return { accessToken: "test-token", accountId: "test-account" }; }',
      "export async function getCodexAuthStatus() { return { authenticated: false }; }"
    ].join("\n")
  )}`;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        (specifier === "./codex-oauth" && context.parentURL?.endsWith("/lib/codex-fetch.ts")) ||
        specifier === "@/lib/codex-oauth"
      ) {
        return { url: authStub, shortCircuit: true };
      }
      if (specifier === "next/server") {
        return nextResolve(pathToFileURL(path.resolve("node_modules/next/server.js")).href, context);
      }
      return nextResolve(specifier, context);
    }
  });
  hooksRegistered = true;
}

async function codexFetch() {
  installHooks();
  codexFetchModule ??= import("../lib/codex-fetch.ts");
  return codexFetchModule;
}

function imageTool(values = {}) {
  return { type: "image_generation", ...values };
}

function sse(events) {
  return events
    .map(({ event, payload }) => `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
    .join("");
}

async function callWithSse(events, imageOptions) {
  const { callCodexResponses } = await codexFetch();
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(sse(events), { headers: { "content-type": "text/event-stream" } });
  };
  try {
    const result = await callCodexResponses({
      mode: "image",
      input: [{ role: "user", content: "test image backend" }],
      imageOptions
    });
    return { result, requestBody };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function completed(tools, output = []) {
  return {
    event: "response.completed",
    payload: { response: { tools, output, status: "completed" } }
  };
}

test("response.completed 에코를 추출하고 health에 마지막 관측값을 노출한다", async () => {
  const { getLastObservedImageBackend } = await codexFetch();
  const { GET } = await import("../app/api/health/route.ts");

  const initialHealth = await (await GET()).json();
  assert.equal(initialHealth.imageBackend, null);

  const backend = {
    model: "stable-image-model",
    quality: "auto",
    size: "auto",
    moderation: "low",
    output_format: "webp",
    background: "transparent"
  };
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(message);
  let result;
  let requestBody;
  try {
    ({ result, requestBody } = await callWithSse(
      [completed([{ type: "function", name: "unrelated" }, imageTool(backend)])],
      { quality: "high", size: "1536x1024", moderation: "auto", output_format: "webp" }
    ));
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(result.imageBackend, {
    model: "stable-image-model",
    quality: "auto",
    size: "auto",
    moderation: "low",
    outputFormat: "webp",
    background: "transparent"
  });
  assert.deepEqual(requestBody.tools[0], {
    type: "image_generation",
    quality: "high",
    size: "1536x1024",
    moderation: "auto",
    output_format: "webp"
  });
  assert.deepEqual(warnings, []);

  const observed = getLastObservedImageBackend();
  assert.ok(observed);
  assert.deepEqual({ ...observed, observedAtIso: undefined }, { ...result.imageBackend, observedAtIso: undefined });
  assert.equal(Number.isNaN(Date.parse(observed.observedAtIso)), false);
  const observedHealth = await (await GET()).json();
  assert.deepEqual(observedHealth.imageBackend, observed);
});

test("초기 SSE 에코보다 response.completed 에코가 우선한다", async () => {
  const { result } = await callWithSse([
    {
      event: "response.created",
      payload: {
        response: {
          tools: [imageTool({ model: "stable-image-model", quality: "low", size: "1024x1024" })]
        }
      }
    },
    completed([imageTool({ model: "stable-image-model", quality: "high", size: "1536x1024" })])
  ]);

  assert.deepEqual(result.imageBackend, {
    model: "stable-image-model",
    quality: "high",
    size: "1536x1024"
  });
});

test("최종 에코에 유효한 문자열이 없으면 이전 에코를 유지하지 않는다", async () => {
  const { result } = await callWithSse([
    {
      event: "response.created",
      payload: {
        response: {
          tools: [imageTool({ model: "stable-image-model", quality: "low", size: "1024x1024" })]
        }
      }
    },
    completed([imageTool({ model: 2, quality: { value: "high" }, size: false })])
  ]);

  assert.equal(result.imageBackend, undefined);
  assert.equal("imageBackend" in result, false);
});

test("image_generation 에코가 없으면 imageBackend를 반환하지 않는다", async () => {
  const { result } = await callWithSse([
    completed([{ type: "function", name: "unrelated" }, { type: "web_search" }])
  ]);

  assert.equal(result.imageBackend, undefined);
  assert.equal("imageBackend" in result, false);
});

test("문자열이 아닌 에코 필드는 무시한다", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const { result } = await callWithSse([
      completed([
        imageTool({
          model: 2,
          quality: { value: "high" },
          size: "auto",
          moderation: ["low"],
          output_format: "png",
          background: false,
          unknown: "ignored"
        })
      ])
    ]);
    assert.deepEqual(result.imageBackend, { size: "auto", outputFormat: "png" });
  } finally {
    console.warn = originalWarn;
  }
});

test("모델 변경만 경고하고 같은 모델 반복 관측은 경고하지 않는다", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await callWithSse([completed([imageTool({ model: "stable-image-model", quality: "auto", size: "auto" })])]);
  } finally {
    console.warn = originalWarn;
  }

  const warnings = [];
  console.warn = message => warnings.push(message);
  try {
    await callWithSse([completed([imageTool({ model: "stable-image-model", quality: "auto", size: "auto" })])]);
    await callWithSse([completed([imageTool({ model: "changed-image-model", quality: "auto", size: "auto" })])]);
    await callWithSse([completed([imageTool({ model: "changed-image-model", quality: "high", size: "auto" })])]);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(warnings, ["[codex] image backend changed: stable-image-model → changed-image-model"]);
});

test("일반 생성은 호출별 실제 백엔드를 각 사이드카에 기록하고 응답 model을 보존한다", async t => {
  installHooks();
  const previousDataDir = process.env.SIONBANANA_DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-image-backend-"));
  process.env.SIONBANANA_DATA_DIR = dataDir;
  t.after(async () => {
    if (previousDataDir === undefined) delete process.env.SIONBANANA_DATA_DIR;
    else process.env.SIONBANANA_DATA_DIR = previousDataDir;
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  const originalFetch = globalThis.fetch;
  const requestBodies = [];
  let callCount = 0;
  globalThis.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));
    callCount += 1;
    const model = callCount === 1 ? "sidecar-image-model-a" : "sidecar-image-model-b";
    return new Response(
      sse([
        completed(
          [imageTool({ model, quality: "auto", size: "auto" })],
          [
            {
              type: "image_generation_call",
              result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
              output_format: "png"
            }
          ]
        )
      ])
    );
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const originalWarn = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = originalWarn;
  });
  const { POST } = await import("../app/api/generate/route.ts");
  const response = await POST({
    json: async () => ({
      prompt: "A test image",
      options: { count: 2, quality: "high", imageSize: "1536x1024", format: "webp" }
    }),
    nextUrl: new URL("http://localhost/api/generate")
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  const { DEFAULT_IMAGE_MODEL } = await codexFetch();
  assert.equal(body.model, DEFAULT_IMAGE_MODEL);
  assert.equal(requestBodies.length, 2);
  for (const requestBody of requestBodies) {
    assert.equal(requestBody.tools[0].quality, "high");
    assert.equal(requestBody.tools[0].size, "1536x1024");
  }

  const { readImageMetadata } = await import("../lib/local/storage.ts");
  const metadata = await Promise.all(body.images.map(image => readImageMetadata(image.id)));
  for (const value of metadata) {
    assert.ok(value?.imageBackend);
    assert.equal(Number.isNaN(Date.parse(value.imageBackend.observedAtIso)), false);
  }
  assert.deepEqual(
    metadata.map(value => ({ ...value.imageBackend, observedAtIso: undefined })),
    [
      { model: "sidecar-image-model-a", quality: "auto", size: "auto", observedAtIso: undefined },
      { model: "sidecar-image-model-b", quality: "auto", size: "auto", observedAtIso: undefined }
    ]
  );
});
