import { normalizeReferenceHandle as normalizeReferenceHandleValue } from "@/lib/studio-helpers/constants";

export { normalizeReferenceHandle } from "@/lib/studio-helpers/constants";

export type ReferenceHandleMapping = {
  handle: string;
  referenceIndex: number;
};

export type ReferenceHandleMapEntry = {
  handle: string;
  referenceIndex: number;
  url: string;
};

const HANDLE_TOKEN_PATTERN = /@([A-Za-z0-9_가-힣ㄱ-ㅎㅏ-ㅣ]+)/gu;

export function formatOrdinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`;
  }
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export function buildReferenceHandleMappings(handles: string[]): ReferenceHandleMapping[] {
  const seen = new Set<string>();
  return handles
    .map((handle, index) => {
      const normalizedHandle = normalizeReferenceHandleValue(handle);
      if (!normalizedHandle || seen.has(normalizedHandle)) {
        return null;
      }
      seen.add(normalizedHandle);
      return { handle: normalizedHandle, referenceIndex: index + 1 };
    })
    .filter((entry): entry is ReferenceHandleMapping => Boolean(entry));
}

export function replaceReferenceHandleMentions(text: string, mappings: ReferenceHandleMapping[]): string {
  if (!mappings.length) {
    return text;
  }

  const indexByHandle = new Map(mappings.map(item => [item.handle, item.referenceIndex]));
  return text.replace(HANDLE_TOKEN_PATTERN, (match, rawHandle: string) => {
    const normalizedHandle = normalizeReferenceHandleValue(rawHandle);
    const referenceIndex = indexByHandle.get(normalizedHandle);
    if (!referenceIndex) {
      return match;
    }
    return `the ${formatOrdinal(referenceIndex)} reference image (@${normalizedHandle})`;
  });
}

export function buildReferenceHandleMap(urls: string[], handles: string[]): ReferenceHandleMapEntry[] {
  return handles
    .map((handle, index) => {
      const normalizedHandle = handle.trim();
      const url = urls[index];
      return normalizedHandle && url
        ? { handle: normalizedHandle, referenceIndex: index + 1, url }
        : null;
    })
    .filter((entry): entry is ReferenceHandleMapEntry => Boolean(entry));
}

export function resolveReferenceHandles(args: {
  requestedHandles: string[];
  primaryRequested: boolean;
  primaryResolved: boolean;
  galleryResolvedFlags: boolean[];
}): string[] {
  const { requestedHandles, primaryRequested, primaryResolved, galleryResolvedFlags } = args;
  const resolvedHandles: string[] = [];

  if (primaryResolved) {
    resolvedHandles.push(requestedHandles[0] ?? "");
  }

  const galleryHandleOffset = primaryRequested ? 1 : 0;
  galleryResolvedFlags.forEach((resolved, index) => {
    if (resolved) {
      resolvedHandles.push(requestedHandles[index + galleryHandleOffset] ?? "");
    }
  });

  return resolvedHandles;
}
