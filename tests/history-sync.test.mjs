import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HISTORY_REFRESH_EVENT,
  persistRecordsMerge
} from "../components/studio/history-sync.ts";
import { LOCAL_STORAGE_KEY } from "../components/studio/constants.ts";

function createLocalStorage() {
  const store = new Map();
  let writes = 0;

  return {
    get writes() {
      return writes;
    },
    getItem(key) {
      return store.get(key) ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      writes += 1;
      store.set(key, String(value));
    }
  };
}

function createRecord(overrides = {}) {
  return {
    id: "image-1",
    userId: "local",
    mode: "create",
    promptMeta: {
      rawPrompt: "prompt",
      refinedPrompt: "prompt"
    },
    status: "completed",
    imageUrl: "/api/images/image-1",
    model: "gpt-image-2",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    ...overrides
  };
}

function setupWindow(localStorage) {
  const dispatched = [];
  const previousWindow = globalThis.window;

  globalThis.window = {
    localStorage,
    dispatchEvent(event) {
      dispatched.push(event.type);
      return true;
    }
  };

  return {
    dispatched,
    restore() {
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
    }
  };
}

test("persistRecordsMerge skips write and refresh event when merge output is unchanged", t => {
  const record = createRecord();
  const localStorage = createLocalStorage();
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([record]));
  const initialWrites = localStorage.writes;
  const { dispatched, restore } = setupWindow(localStorage);
  t.after(restore);

  const merged = persistRecordsMerge([{ ...record }]);

  assert.deepEqual(merged, [record]);
  assert.equal(localStorage.writes, initialWrites);
  assert.deepEqual(dispatched, []);
});

test("persistRecordsMerge writes and refreshes when a record changes", t => {
  const record = createRecord();
  const updatedRecord = createRecord({
    promptMeta: {
      rawPrompt: "updated",
      refinedPrompt: "updated"
    },
    updatedAt: "2026-05-20T00:01:00.000Z"
  });
  const localStorage = createLocalStorage();
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([record]));
  const { dispatched, restore } = setupWindow(localStorage);
  t.after(restore);

  const merged = persistRecordsMerge([updatedRecord]);
  const stored = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY));

  assert.deepEqual(merged, [updatedRecord]);
  assert.deepEqual(stored, [updatedRecord]);
  assert.deepEqual(dispatched, [HISTORY_REFRESH_EVENT]);
});
