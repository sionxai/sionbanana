import assert from "node:assert/strict";
import { test } from "node:test";

import { copyCharacterImageToStorage } from "../components/studio/character-image-storage.ts";
import { loadCharacters, saveCharacter } from "../lib/characters.ts";
import { loadStoryReferences, saveStoryReference } from "../lib/story-references.ts";

function createLocalStorage() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.get(key) ?? null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, String(value));
    }
  };
}

function setupBrowserStorage() {
  const localStorage = createLocalStorage();
  globalThis.window = {
    localStorage,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    }
  };
  globalThis.CustomEvent =
    globalThis.CustomEvent ??
    class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };
  globalThis.btoa =
    globalThis.btoa ??
    (value => Buffer.from(value, "binary").toString("base64"));
  return localStorage;
}

function mockImageCopyFetch(t, copiedUrl = "/api/images/copied") {
  const calls = [];
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = init.method ?? "GET";
    calls.push({ url, method, body: init.body });

    if (url === "/api/images/original" && method === "GET") {
      return new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), {
        status: 200
      });
    }

    if (url === "/api/story-references" && method === "POST") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.mime, "image/png");
      assert.match(body.imageBase64, /^data:image\/png;base64,/);
      return Response.json({ ok: true, imageUrl: copiedUrl, id: copiedUrl.split("/").at(-1) });
    }

    return new Response(null, { status: 404 });
  };

  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  return calls;
}

test("copyCharacterImageToStorage stores a new URL and does not delete the original", async t => {
  setupBrowserStorage();
  const calls = mockImageCopyFetch(t);

  const copiedUrl = await copyCharacterImageToStorage("/api/images/original");

  assert.equal(copiedUrl, "/api/images/copied");
  assert.notEqual(copiedUrl, "/api/images/original");
  assert.equal(calls.some(call => call.url === "/api/images/original" && call.method === "DELETE"), false);
});

test("character and story reference handle duplicates throw", () => {
  setupBrowserStorage();

  saveCharacter({
    name: "민수",
    handle: "minsu",
    thumbnailUrl: "/api/images/minsu",
    primaryImageUrl: "/api/images/minsu"
  });

  assert.throws(
    () =>
      saveCharacter({
        name: "다른 민수",
        handle: "minsu",
        thumbnailUrl: "/api/images/minsu-2",
        primaryImageUrl: "/api/images/minsu-2"
      }),
    /이미 사용 중인 핸들/
  );

  saveStoryReference("character", 0, {
    handle: "hero",
    imageUrl: "/api/images/hero"
  });

  assert.throws(
    () =>
      saveStoryReference("character", 1, {
        handle: "hero",
        imageUrl: "/api/images/hero-2"
      }),
    /이미 사용 중인 핸들/
  );
});

test("story character slot import uses a copied URL and preserves the character original", async t => {
  setupBrowserStorage();
  mockImageCopyFetch(t, "/api/images/story-copy");

  const character = saveCharacter({
    name: "민수",
    handle: "minsu",
    description: "빨간 재킷",
    thumbnailUrl: "/api/images/original",
    primaryImageUrl: "/api/images/original"
  });

  const copiedUrl = await copyCharacterImageToStorage(character.primaryImageUrl);
  const library = saveStoryReference("character", 0, {
    handle: character.handle,
    imageUrl: copiedUrl,
    description: character.description
  });

  const slot = library.characters[0];
  assert.equal(slot?.handle, character.handle);
  assert.equal(slot?.imageUrl, "/api/images/story-copy");
  assert.notEqual(slot?.imageUrl, character.primaryImageUrl);
  assert.equal(loadCharacters()[0]?.primaryImageUrl, "/api/images/original");

  saveStoryReference("character", 0, null);

  assert.equal(loadStoryReferences().characters[0], null);
  assert.equal(loadCharacters()[0]?.primaryImageUrl, "/api/images/original");
});
