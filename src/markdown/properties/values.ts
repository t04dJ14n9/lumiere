import type { PropertyKind } from "./types";
export type PropertyScalar = string | number | boolean | null;
export type PropertyValue = PropertyScalar | readonly PropertyScalar[];

export function propertyInput(
  kind: PropertyKind,
  text: string,
): PropertyScalar | undefined {
  if (kind === "text") {
    return text;
  }
  if (!text.trim()) {
    return null;
  }
  if (kind === "number") {
    return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) &&
      Number.isFinite(Number(text))
      ? Number(text)
      : undefined;
  }
  if (kind === "date" || kind === "datetime") {
    const pattern =
      kind === "date"
        ? /^\d{4}-\d{2}-\d{2}$/
        : /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
    if (!pattern.test(text)) {
      return undefined;
    }
    const date = new Date(text.slice(0, 10) + "T00:00:00Z");
    return Number.isFinite(date.valueOf()) &&
      date.toISOString().slice(0, 10) === text.slice(0, 10)
      ? text
      : undefined;
  }
  return undefined;
}

export function matchesPropertyKind(
  kind: PropertyKind,
  value: unknown,
): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  switch (kind) {
    case "text":
      return typeof value === "string";
    case "list":
    case "tags":
    case "aliases":
      return typeof value === "string" || Array.isArray(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "checkbox":
      return typeof value === "boolean";
    case "date":
    case "datetime":
      return (
        typeof value === "string" && propertyInput(kind, value) !== undefined
      );
  }
}
