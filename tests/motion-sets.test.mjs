import assert from "node:assert/strict";
import { existsSync, promises as fs } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

import {
  MotionSetStorageError,
  buildMemberProjectRequest,
  createSet,
  deleteSet,
  listSets,
  motionSetStaleMs,
  readSet,
  runNextMember,
  setDir,
  updateSet
} from "@/lib/motion/set-storage";
import { deriveSetStatus, motionSetSchema } from "@/lib/motion/set-types";
import { runSetWorker } from "../scripts/motion-set-worker.mjs";

let routeImportHooksRegistered = false;

async function loadMotionRouteHandlers() {
  if (!routeImportHooksRegistered) {
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === "next/server") {
          return nextResolve(pathToFileURL(path.resolve("node_modules/next/server.js")).href, context);
        }
        if (
          (specifier.startsWith("./") || specifier.startsWith("../")) &&
          context.parentURL?.startsWith("file:")
        ) {
          const absolutePath = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
          if (!path.extname(absolutePath) && existsSync(`${absolutePath}.ts`)) {
            return nextResolve(pathToFileURL(`${absolutePath}.ts`).href, context);
          }
        }
        return nextResolve(specifier, context);
      }
    });
    routeImportHooksRegistered = true;
  }
  const [sets, set] = await Promise.all([
    import("../app/api/motion/sets/route.ts"),
    import("../app/api/motion/sets/[id]/route.ts")
  ]);
  return { sets, set };
}

async function useTempDataDir(t) {
  const previous = process.env.SIONBANANA_DATA_DIR;
  const directory = await fs.mkdtemp(path.join(tmpdir(), "sionbanana-motion-sets-"));
  process.env.SIONBANANA_DATA_DIR = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.SIONBANANA_DATA_DIR;
    else process.env.SIONBANANA_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function schemaInput(overrides = {}) {
  return {
    id: "motion-set-schema",
    name: "Schema set",
    createdAtIso: "2026-09-07T00:00:00.000Z",
    updatedAtIso: "2026-09-07T00:00:00.000Z",
    base: { description: "A banana hero" },
    common: { cols: 2, rows: 2 },
    members: [{ action: "walk" }],
    ...overrides
  };
}

function setInput(overrides = {}) {
  return {
    name: "Banana actions",
    base: { description: "A bright banana hero" },
    common: { cols: 2, rows: 2, fps: 12 },
    members: [{ action: "walk" }],
    ...overrides
  };
}

function parsedSet(overrides = {}) {
  return motionSetSchema.parse(schemaInput(overrides));
}

async function pngBuffer() {
  return sharp({
    create: { width: 1, height: 1, channels: 4, background: { r: 240, g: 210, b: 50, alpha: 1 } }
  })
    .png()
    .toBuffer();
}

function request(body, method = "POST") {
  return new Request("http://localhost/api/motion/sets", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function workerResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("motion set schema rejects duplicate actions and incomplete custom members, and supplies member defaults", () => {
  assert.equal(
    motionSetSchema.safeParse(
      schemaInput({ members: [{ action: "walk" }, { action: "walk" }] })
    ).success,
    false
  );
  assert.equal(motionSetSchema.safeParse(schemaInput({ members: [{ action: "custom" }] })).success, false);

  const parsed = parsedSet();
  assert.equal(parsed.members[0].status, "pending");
  assert.equal(parsed.members[0].projectId, null);
  assert.equal(parsed.members[0].reason, null);
  assert.equal(parsed.members[0].startedAtIso, null);
  assert.equal(parsed.members[0].finishedAtIso, null);
});

test("deriveSetStatus distinguishes terminal, running, and pending member states", () => {
  const members = statuses => statuses.map(status => ({ status }));

  assert.equal(deriveSetStatus(members(["ready", "ready"])), "ready");
  assert.equal(deriveSetStatus(members(["ready", "running"])), "running");
  assert.equal(deriveSetStatus(members(["pending", "pending"])), "pending");
  assert.equal(deriveSetStatus(members(["failed", "failed"])), "failed");
  assert.equal(deriveSetStatus(members(["ready", "failed"])), "partial");
  assert.equal(deriveSetStatus(members(["pending", "ready"])), "pending");
});

test("buildMemberProjectRequest applies member settings, defaults, references, and custom prompts", () => {
  const set = parsedSet({
    name: "Banana combat",
    base: { description: "A banana knight", style: "inked fantasy", allowMirror: true },
    common: { cols: 2, rows: 2, fps: 12 },
    members: [{ action: "walk", overrides: { cols: 4, rows: 3, fps: 8, loop: "once" } }]
  });
  const overridden = buildMemberProjectRequest(set, set.members[0], null);

  assert.deepEqual(overridden.grid, { cols: 4, rows: 3 });
  assert.equal(overridden.fps, 8);
  assert.equal(overridden.loop, "once");
  assert.equal(overridden.autoFlipRows, true);
  assert.equal(overridden.source.type, "generate");
  assert.equal(overridden.source.style, "inked fantasy");
  assert.equal("autoExcludeRepeatedRows" in overridden, false);

  const walk = parsedSet({ members: [{ action: "walk" }] });
  const attack = parsedSet({ members: [{ action: "attack" }] });
  assert.equal(buildMemberProjectRequest(walk, walk.members[0], null).loop, "loop");
  assert.equal(buildMemberProjectRequest(attack, attack.members[0], null).loop, "once");

  const reference = buildMemberProjectRequest(set, set.members[0], "aGVsbG8=");
  assert.equal(reference.source.type, "reference");
  assert.equal(reference.source.style, "inked fantasy");
  assert.equal(reference.source.referenceImage.mimeType, "image/png");
  assert.equal(reference.source.referenceImage.data, "aGVsbG8=");
  assert.equal("autoExcludeRepeatedRows" in reference, false);

  const commonFallback = parsedSet({
    base: { description: "A banana knight", allowMirror: false },
    common: { cols: 3, rows: 2, fps: 15 },
    members: [{ action: "walk" }]
  });
  const fallbackRequest = buildMemberProjectRequest(
    commonFallback,
    commonFallback.members[0],
    null
  );
  assert.deepEqual(fallbackRequest.grid, { cols: 3, rows: 2 });
  assert.equal(fallbackRequest.fps, 15);
  assert.equal(fallbackRequest.autoFlipRows, false);

  const partialOverride = parsedSet({
    common: { cols: 3, rows: 2, fps: 15 },
    members: [{ action: "walk", overrides: { cols: 4 } }]
  });
  const partialOverrideRequest = buildMemberProjectRequest(
    partialOverride,
    partialOverride.members[0],
    null
  );
  assert.deepEqual(partialOverrideRequest.grid, { cols: 4, rows: 2 });
  assert.equal(partialOverrideRequest.fps, 15);

  const noStyle = parsedSet({ base: { description: "A banana knight" } });
  assert.equal("style" in buildMemberProjectRequest(noStyle, noStyle.members[0], null).source, false);

  const custom = parsedSet({ members: [{ action: "custom", prompt: "spins through the air" }] });
  assert.match(
    buildMemberProjectRequest(custom, custom.members[0], null).source.prompt,
    /A banana hero\. spins through the air/
  );
  assert.throws(
    () => buildMemberProjectRequest(custom, { ...custom.members[0], prompt: undefined }, null),
    TypeError
  );
});

test("motion set storage preserves optional references, summaries, timestamps, and errors", async t => {
  await useTempDataDir(t);
  const reference = await pngBuffer();
  const withReference = await createSet({ ...setInput(), referencePng: reference });
  const withoutReference = await createSet(setInput({ name: "No reference" }));

  assert.equal(withReference.base.hasReference, true);
  assert.equal(withoutReference.base.hasReference, false);
  assert.deepEqual(await readSet(withReference.id), withReference);
  assert.deepEqual(await readSet(withoutReference.id), withoutReference);
  assert.equal(await fs.stat(path.join(setDir(withReference.id), "reference.png")).then(entry => entry.isFile()), true);
  assert.deepEqual(await fs.readFile(path.join(setDir(withReference.id), "reference.png")), reference);
  await assert.rejects(fs.access(path.join(setDir(withoutReference.id), "reference.png")));

  const summaries = await listSets();
  assert.deepEqual(
    summaries.find(summary => summary.id === withReference.id),
    {
      id: withReference.id,
      name: withReference.name,
      createdAtIso: withReference.createdAtIso,
      updatedAtIso: withReference.updatedAtIso,
      status: "pending",
      members: [{ action: "walk", status: "pending", projectId: null }]
    }
  );

  await new Promise(resolve => setTimeout(resolve, 2));
  const updated = await updateSet(withReference.id, current => ({ ...current, name: "Updated banana actions" }));
  assert.equal(updated.name, "Updated banana actions");
  assert.ok(updated.updatedAtIso > withReference.updatedAtIso);
  assert.deepEqual(await readSet(withReference.id), updated);

  await deleteSet(withoutReference.id);
  await assert.rejects(readSet(withoutReference.id), error => error instanceof MotionSetStorageError && error.status === 404);
  await assert.rejects(readSet("../x"), error => error instanceof MotionSetStorageError && error.status === 400);
  await assert.rejects(readSet("missing-set"), error => error instanceof MotionSetStorageError && error.status === 404);
});

test("runNextMember marks a successful pending member ready and updates the set", async t => {
  await useTempDataDir(t);
  const set = await createSet(setInput());
  const requests = [];
  const result = await runNextMember(set.id, {
    createProject: async body => {
      requests.push(body);
      return { status: 201, body: { ok: true, project: { id: "project-ready", frames: [] } } };
    }
  });
  const stored = await readSet(set.id);

  assert.equal(requests.length, 1);
  assert.equal(result.member.status, "ready");
  assert.equal(result.member.projectId, "project-ready");
  assert.ok(result.member.finishedAtIso);
  assert.equal(stored.status, "ready");
  assert.equal(stored.members[0].projectId, "project-ready");
});

test("runNextMember records failed project responses", async t => {
  await useTempDataDir(t);
  const set = await createSet(setInput());
  const result = await runNextMember(set.id, {
    createProject: async () => ({ status: 500, body: { ok: false, reason: "upstream unavailable" } })
  });
  const stored = await readSet(set.id);

  assert.equal(result.member.status, "failed");
  assert.equal(result.member.reason, "http-500: upstream unavailable");
  assert.equal(stored.status, "failed");
});

test("runNextMember reverses every project frame once for left-facing sets", async t => {
  await useTempDataDir(t);
  const set = await createSet(setInput({ base: { description: "A left-facing banana", facing: "left" } }));
  const rebuildCalls = [];
  const result = await runNextMember(set.id, {
    createProject: async () => ({
      status: 201,
      body: {
        ok: true,
        project: {
          id: "left-project",
          frames: [
            { index: 0, flipX: false },
            { index: 1, flipX: true }
          ]
        }
      }
    }),
    rebuildProject: async (...args) => {
      rebuildCalls.push(args);
    }
  });

  assert.equal(result.member.status, "ready");
  assert.equal(rebuildCalls.length, 1);
  assert.equal(rebuildCalls[0][0], "left-project");
  assert.deepEqual(
    rebuildCalls[0][1].frames.map(frame => frame.flipX),
    [true, false]
  );
});

test("runNextMember returns busy while a fresh member is running", async t => {
  await useTempDataDir(t);
  const set = await createSet(setInput());
  const now = new Date("2026-09-07T00:10:00.000Z");
  await updateSet(set.id, current => ({
    ...current,
    members: [{ ...current.members[0], status: "running", startedAtIso: now.toISOString() }],
    status: "running"
  }));
  let calls = 0;

  assert.deepEqual(
    await runNextMember(set.id, {
      createProject: async () => {
        calls += 1;
        return { status: 201, body: {} };
      },
      now: () => now
    }),
    { busy: true }
  );
  assert.equal(calls, 0);
});

test("runNextMember fails stale work before claiming the next pending member", async t => {
  await useTempDataDir(t);
  const now = new Date("2026-09-07T00:10:00.000Z");
  const set = await createSet(setInput({ members: [{ action: "walk" }, { action: "attack" }] }));
  await updateSet(set.id, current => ({
    ...current,
    members: [
      {
        ...current.members[0],
        status: "running",
        startedAtIso: new Date(now.getTime() - motionSetStaleMs() - 1).toISOString()
      },
      current.members[1]
    ],
    status: "running"
  }));

  const result = await runNextMember(set.id, {
    now: () => now,
    createProject: async () => ({ status: 201, body: { ok: true, project: { id: "attack-project", frames: [] } } })
  });
  const stored = await readSet(set.id);

  assert.equal(result.member.action, "attack");
  assert.equal(result.member.status, "ready");
  assert.equal(stored.members[0].status, "failed");
  assert.equal(stored.members[0].reason, "stale-running");
  assert.equal(stored.members[1].status, "ready");
  assert.equal(stored.status, "partial");
});

test("runNextMember reports done when no pending members remain", async t => {
  await useTempDataDir(t);
  const set = await createSet(setInput({ members: [{ action: "walk", status: "ready", projectId: "project-existing" }] }));

  assert.deepEqual(
    await runNextMember(set.id, { createProject: async () => ({ status: 201, body: {} }) }),
    { done: true }
  );
  assert.equal((await readSet(set.id)).status, "ready");
});

test("motion set routes validate creation, list and item lookup, patching, and deletion without a worker", async t => {
  await useTempDataDir(t);
  const { sets, set } = await loadMotionRouteHandlers();
  const dataUrl = `data:image/png;base64,${(await pngBuffer()).toString("base64")}`;
  const createBody = {
    name: "Route banana actions",
    base: { description: "A route banana", referenceImage: dataUrl },
    common: { cols: 2, rows: 2 },
    members: [{ action: "walk" }],
    start: false
  };
  const createdResponse = await sets.POST(request(createBody));
  const created = await createdResponse.json();

  assert.equal(createdResponse.status, 201);
  assert.equal(created.ok, true);
  assert.equal(created.set.base.hasReference, true);
  assert.equal(created.set.members[0].status, "pending");

  const tooManyFrames = await sets.POST(
    request({
      ...createBody,
      base: { description: "Too many frames" },
      members: [{ action: "walk", overrides: { cols: 4, rows: 4 } }]
    })
  );
  assert.equal(tooManyFrames.status, 400);
  const duplicateAction = await sets.POST(
    request({ ...createBody, base: { description: "Duplicates" }, members: [{ action: "walk" }, { action: "walk" }] })
  );
  assert.equal(duplicateAction.status, 400);
  const invalidDataUrl = await sets.POST(
    request({ ...createBody, base: { description: "Bad reference", referenceImage: "data:image/png;base64,not-valid!" } })
  );
  assert.equal(invalidDataUrl.status, 400);

  const listedResponse = await sets.GET();
  const listed = await listedResponse.json();
  assert.equal(listedResponse.status, 200);
  assert.equal(listed.sets.some(summary => summary.id === created.set.id), true);

  const itemResponse = await set.GET(new Request("http://localhost/api/motion/sets/item"), {
    params: { id: created.set.id }
  });
  assert.equal(itemResponse.status, 200);
  assert.equal((await itemResponse.json()).set.id, created.set.id);
  const missingResponse = await set.GET(new Request("http://localhost/api/motion/sets/missing"), {
    params: { id: "missing-set" }
  });
  assert.equal(missingResponse.status, 404);

  await updateSet(created.set.id, current => ({
    ...current,
    members: [
      {
        ...current.members[0],
        status: "ready",
        projectId: "project-ready",
        reason: "prior failure",
        startedAtIso: "2026-09-07T00:00:00.000Z",
        finishedAtIso: "2026-09-07T00:01:00.000Z"
      }
    ],
    status: "ready"
  }));
  const regenerateResponse = await set.PATCH(
    request({ regenerate: ["walk"], start: false }, "PATCH"),
    { params: { id: created.set.id } }
  );
  const regenerated = await regenerateResponse.json();
  assert.equal(regenerateResponse.status, 200);
  assert.equal(regenerated.set.members[0].status, "pending");
  assert.equal(regenerated.set.members[0].projectId, null);
  assert.equal(regenerated.set.members[0].reason, null);
  assert.equal(regenerated.set.members[0].startedAtIso, null);
  assert.equal(regenerated.set.members[0].finishedAtIso, null);
  assert.deepEqual(await readSet(created.set.id), regenerated.set);

  const running = {
    ...regenerated.set,
    members: [
      {
        ...regenerated.set.members[0],
        status: "running",
        startedAtIso: new Date().toISOString()
      }
    ],
    status: "running"
  };
  await fs.writeFile(path.join(setDir(created.set.id), "set.json"), `${JSON.stringify(running, null, 2)}\n`);
  const runningJson = await fs.readFile(path.join(setDir(created.set.id), "set.json"), "utf8");
  const runningPatch = await set.PATCH(
    request({ members: [{ action: "walk", prompt: "should be refused" }], start: false }, "PATCH"),
    { params: { id: created.set.id } }
  );
  assert.equal(runningPatch.status, 409);
  assert.equal(await fs.readFile(path.join(setDir(created.set.id), "set.json"), "utf8"), runningJson);

  const stopped = {
    ...running,
    members: [
      {
        ...running.members[0],
        status: "pending",
        startedAtIso: null
      }
    ],
    status: "pending"
  };
  await fs.writeFile(path.join(setDir(created.set.id), "set.json"), `${JSON.stringify(stopped, null, 2)}\n`);
  const deletedResponse = await set.DELETE(new Request("http://localhost/api/motion/sets/item", { method: "DELETE" }), {
    params: { id: created.set.id }
  });
  assert.equal(deletedResponse.status, 200);
  const deletedLookup = await set.GET(new Request("http://localhost/api/motion/sets/item"), {
    params: { id: created.set.id }
  });
  assert.equal(deletedLookup.status, 404);
});

test("runSetWorker processes members until a done response", async () => {
  const responses = [
    workerResponse({ ok: true, member: { action: "walk" } }),
    workerResponse({ ok: true, member: { action: "attack" } }),
    workerResponse({ ok: true, done: true })
  ];
  const calls = [];
  const result = await runSetWorker({
    setId: "motion-set-worker",
    baseUrl: "http://localhost/",
    fetchImpl: async (...args) => {
      calls.push(args);
      return responses.shift();
    }
  });

  assert.deepEqual(result, { processed: 2, stoppedBecause: "done" });
  assert.equal(calls.length, 3);
  assert.equal(calls[0][0], "http://localhost/api/motion/sets/motion-set-worker/run-next");
  assert.equal(calls[0][1].method, "POST");
});

test("runSetWorker stops on busy, failed response bodies, HTTP errors, and fetch errors", async () => {
  const busy = await runSetWorker({
    setId: "motion-set-busy",
    baseUrl: "http://localhost",
    fetchImpl: async () => workerResponse({ ok: true, busy: true })
  });
  const failedBody = await runSetWorker({
    setId: "motion-set-failed-body",
    baseUrl: "http://localhost",
    fetchImpl: async () => workerResponse({ ok: false, reason: "route failure" })
  });
  const failedHttp = await runSetWorker({
    setId: "motion-set-failed",
    baseUrl: "http://localhost",
    fetchImpl: async () => workerResponse({ ok: false, reason: "route failure" }, 500)
  });
  const fetchError = await runSetWorker({
    setId: "motion-set-fetch-error",
    baseUrl: "http://localhost",
    fetchImpl: async () => {
      throw new Error("network unavailable");
    }
  });

  assert.deepEqual(busy, { processed: 0, stoppedBecause: "busy" });
  assert.deepEqual(failedBody, { processed: 0, stoppedBecause: "error" });
  assert.deepEqual(failedHttp, { processed: 0, stoppedBecause: "error" });
  assert.deepEqual(fetchError, { processed: 0, stoppedBecause: "error" });
});

test("runSetWorker honors maxMembers", async () => {
  const result = await runSetWorker({
    setId: "motion-set-limit",
    baseUrl: "http://localhost",
    maxMembers: 1,
    fetchImpl: async () => workerResponse({ ok: true, member: { action: "walk" } })
  });

  assert.deepEqual(result, { processed: 1, stoppedBecause: "limit" });
});
