import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { PropertyKind } from "./types";
export type PropertyScalar = string | number | boolean | null;
/** Scalars, scalar lists, and nested YAML maps/lists that Properties can set. */
export type PropertyValue =
  | PropertyScalar
  | readonly PropertyValue[]
  | { readonly [key: string]: PropertyValue };

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

/** True when distinct YAML keys would collapse to one JS property name. */
function hasCollidingJsKeys(node: unknown): boolean {
  if (isSeq(node)) {
    return node.items.some((item) => hasCollidingJsKeys(item));
  }
  if (!isMap(node)) {
    return false;
  }
  const seen = new Set<string>();
  for (const pair of node.items) {
    if (
      !isScalar(pair.key) ||
      pair.key.value === undefined ||
      pair.key.value === null
    ) {
      return true;
    }
    const jsKey = String(pair.key.toJSON());
    if (seen.has(jsKey)) {
      return true;
    }
    seen.add(jsKey);
    if (hasCollidingJsKeys(pair.value)) {
      return true;
    }
  }
  return false;
}

/** Parse a Properties YAML draft into a settable value, or undefined if invalid. */
export function propertyYamlInput(text: string): PropertyValue | undefined {
  if (!/[\S\u00A0]/.test(text)) {
    return null;
  }
  try {
    const document = parseDocument(text, { uniqueKeys: true });
    if (document.errors.length) {
      return undefined;
    }
    if (hasCollidingJsKeys(document.contents)) {
      return undefined;
    }
    const value: unknown = document.toJS({ maxAliasCount: 100 });
    return settablePropertyValue(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function settablePropertyValue(
  value: unknown,
  ancestors = new Set<object>(),
): value is PropertyValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (
    !value ||
    typeof value !== "object" ||
    ancestors.has(value) ||
    value instanceof Date ||
    value instanceof Map ||
    value instanceof Set
  ) {
    return false;
  }
  ancestors.add(value);
  const ok = Array.isArray(value)
    ? value.every((item) => settablePropertyValue(item, ancestors))
    : Object.values(value).every((item) =>
        settablePropertyValue(item, ancestors),
      );
  ancestors.delete(value);
  return ok;
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
