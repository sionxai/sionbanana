import assert from "node:assert/strict";
import { test } from "node:test";

import { runWithConcurrency } from "../lib/concurrency.ts";

function defer() {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });

  return { promise, resolve };
}

test("runWithConcurrency collects every result in input order", async () => {
  let inFlight = 0;
  let maxInFlight = 0;

  const results = await runWithConcurrency([1, 2, 3, 4, 5], 2, async item => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight -= 1;
    return item * 2;
  });

  assert.equal(maxInFlight, 2);
  assert.deepEqual(
    results.map(result => result.status),
    ["fulfilled", "fulfilled", "fulfilled", "fulfilled", "fulfilled"]
  );
  assert.deepEqual(
    results.map(result => result.value),
    [2, 4, 6, 8, 10]
  );
});

test("runWithConcurrency returns Promise.allSettled-style rejected entries", async () => {
  const failure = new Error("boom");
  const results = await runWithConcurrency(["a", "b", "c"], 2, async item => {
    if (item === "b") {
      throw failure;
    }
    return item.toUpperCase();
  });

  assert.deepEqual(results[0], { status: "fulfilled", value: "A" });
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason, failure);
  assert.deepEqual(results[2], { status: "fulfilled", value: "C" });
});

test("runWithConcurrency treats zero and negative limits as a single worker", async () => {
  for (const limit of [0, -3]) {
    let inFlight = 0;
    let maxInFlight = 0;
    const gate = defer();

    const resultsPromise = runWithConcurrency([1, 2], limit, async item => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate.promise;
      inFlight -= 1;
      return item;
    });

    await Promise.resolve();
    assert.equal(maxInFlight, 1);
    gate.resolve();

    const results = await resultsPromise;
    assert.deepEqual(
      results.map(result => result.status),
      ["fulfilled", "fulfilled"]
    );
  }
});
