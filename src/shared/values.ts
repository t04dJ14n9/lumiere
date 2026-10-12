export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asStrings(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
