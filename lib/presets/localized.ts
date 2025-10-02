export type LocalizedValue =
  | string
  | {
      ko?: string | null;
      en?: string | null;
      [key: string]: string | null | undefined;
    }
  | null
  | undefined;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveLocalizedText(
  value: LocalizedValue,
  prefer: "ko" | "en" = "ko"
): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const primary = record[prefer];
  if (isNonEmptyString(primary)) {
    return primary;
  }

  const fallbackKey = prefer === "ko" ? "en" : "ko";
  const alternate = record[fallbackKey];
  if (isNonEmptyString(alternate)) {
    return alternate;
  }

  for (const entry of Object.values(record)) {
    if (isNonEmptyString(entry)) {
      return entry;
    }
  }

  return "";
}

export function resolveLocalizedPair(value: LocalizedValue): { ko: string; en: string } {
  const ko = resolveLocalizedText(value, "ko");
  const en = resolveLocalizedText(value, "en");
  return { ko, en };
}
