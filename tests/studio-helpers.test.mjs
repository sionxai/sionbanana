import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_REFERENCE_GALLERY_COUNT,
  MAX_REFERENCE_SLOT_COUNT
} from "../lib/studio-helpers/constants.ts";
import {
  buildCameraAdjustmentInstruction,
  buildCharacterReferencePrompt,
  normalizeCameraSettings
} from "../lib/studio-helpers/prompt.ts";
import {
  getLocalImageIdFromUrl,
  mergeReferenceGalleryUrls
} from "../lib/studio-helpers/url.ts";
import {
  DEFAULT_CAMERA_ANGLE,
  DEFAULT_CAMERA_DIRECTION
} from "../lib/camera.ts";

test("mergeReferenceGalleryUrls drops empty entries and keeps first occurrence order", () => {
  assert.deepEqual(
    mergeReferenceGalleryUrls(["/a.png", "", null, "  ", "/b.png", "/a.png", undefined]),
    ["/a.png", "/b.png"]
  );
  assert.equal(MAX_REFERENCE_GALLERY_COUNT, MAX_REFERENCE_SLOT_COUNT);
});

test("getLocalImageIdFromUrl accepts only local image API ids", () => {
  assert.equal(getLocalImageIdFromUrl("/api/images/image_123-abc?cache=1"), "image_123-abc");
  assert.equal(getLocalImageIdFromUrl("/api/images/../secret"), null);
  assert.equal(getLocalImageIdFromUrl("https://example.com/api/images/image_123"), null);
});

test("prompt helpers build camera and character reference guidance", () => {
  const cameraSettings = normalizeCameraSettings(
    DEFAULT_CAMERA_ANGLE,
    "left",
    DEFAULT_CAMERA_DIRECTION,
    "closeup"
  );

  assert.deepEqual(cameraSettings, { subjectDirection: "left", zoom: "closeup" });
  assert.equal(
    buildCameraAdjustmentInstruction(cameraSettings),
    "Maintain a close-up / CU centered on the full face, emphasizing emotion, reaction, and immersion. Keep the subject turned to the left."
  );

  const characters = [
    {
      id: "character-1",
      name: "Sion",
      handle: "sion",
      thumbnailUrl: "/sion.png",
      primaryImageUrl: "/sion.png",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ];

  assert.equal(
    buildCharacterReferencePrompt("hero pose", "@sion hero pose", characters),
    "Reference map: Image 1 = Character @sion (name: Sion). Detailed prompt: hero pose"
  );
});
