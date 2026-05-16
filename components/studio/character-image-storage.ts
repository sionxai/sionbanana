"use client";

import { resizeImageToDataUrl } from "@/lib/image-resize";

type StoryReferenceUploadResponse =
  | { ok: true; imageUrl: string; id: string }
  | { ok: false; reason?: string };

function getDataUrlMime(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;,]+)[;,]/);
  return match?.[1] ?? "image/jpeg";
}

async function postCharacterImage(dataUrl: string, mime: string): Promise<string> {
  const response = await fetch("/api/story-references", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: dataUrl, mime })
  });
  const body = (await response.json().catch(() => null)) as StoryReferenceUploadResponse | null;

  if (!body) {
    throw new Error("이미지 저장 응답을 읽지 못했습니다.");
  }

  if (!response.ok || !body.ok) {
    throw new Error(body.ok ? "이미지 저장에 실패했습니다." : body.reason ?? "이미지 저장에 실패했습니다.");
  }

  return body.imageUrl;
}

export async function storeCharacterImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }

  const { dataUrl, mime } = await resizeImageToDataUrl(file, {
    maxSize: 1920,
    mime: "image/jpeg",
    quality: 0.85
  });
  return postCharacterImage(dataUrl, mime);
}

export async function copyCharacterImageToStorage(imageUrl: string): Promise<string> {
  if (!imageUrl.trim()) {
    throw new Error("복사할 이미지 URL이 없습니다.");
  }

  if (imageUrl.startsWith("data:")) {
    return postCharacterImage(imageUrl, getDataUrlMime(imageUrl));
  }

  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("이미지를 불러오지 못했습니다.");
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("이미지 파일만 저장할 수 있습니다.");
  }

  const file = new File([blob], "character-import", { type: blob.type });
  return storeCharacterImageFile(file);
}
