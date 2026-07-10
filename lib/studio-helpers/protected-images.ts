import { getLocalImageIdFromUrl } from "@/lib/studio-helpers/url";

export function collectProtectedLocalImageIds(
  urls: Array<string | null | undefined>
): Set<string> {
  const ids = new Set<string>();

  for (const url of urls) {
    const id = getLocalImageIdFromUrl(url);
    if (id) {
      ids.add(id);
    }
  }

  return ids;
}
