import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createHttpError,
  createTimeoutError,
  isTransientRequestError,
  normalizeConfig
} from "../scripts/agent-generate.mjs";

test("request error metadata marks transient HTTP statuses", () => {
  for (const status of [429, 502, 503, 504]) {
    const error = createHttpError(status, "temporary");

    assert.equal(error.message, `${status} temporary`);
    assert.equal(error.status, status);
    assert.equal(error.transient, true);
    assert.equal(isTransientRequestError(error), true);
  }
});

test("request error metadata does not retry non-transient HTTP statuses", () => {
  for (const status of [400, 401]) {
    const error = createHttpError(status, "permanent");

    assert.equal(error.message, `${status} permanent`);
    assert.equal(error.status, status);
    assert.equal(error.transient, false);
    assert.equal(isTransientRequestError(error), false);
  }
});

test("timeout request errors are transient without changing the message", () => {
  const error = createTimeoutError(180000);

  assert.equal(error.message, "Request timed out after 180000ms");
  assert.equal(error.transient, true);
  assert.equal(isTransientRequestError(error), true);
});

test("normalizeConfig keeps retry disabled by default and accepts zero", () => {
  const defaults = normalizeConfig({ prompt: "banana storyboard frame" });

  assert.equal(defaults.retry, 0);
  assert.equal(defaults.retryBaseDelayMs, 2000);

  const explicit = normalizeConfig({
    prompt: "banana storyboard frame",
    retry: "0",
    retryBaseDelay: "1500"
  });

  assert.equal(explicit.retry, 0);
  assert.equal(explicit.retryBaseDelayMs, 1500);
});

test("normalizeConfig rejects negative retry values", () => {
  assert.throws(
    () => normalizeConfig({ prompt: "x", retry: "-1" }),
    /--retry must be a non-negative integer/
  );
});
