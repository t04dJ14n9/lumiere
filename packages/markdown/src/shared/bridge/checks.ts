import type { BridgeViewRect, BridgeWikiContext } from "./model";

const HASH = /^[a-f0-9]{16,64}$/i;
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function asObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}

export function optionalText(
  value: unknown,
  label: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}

export function assertTimestamp(value: string, label: string): void {
  if (!TIMESTAMP.test(value)) {
    throw new TypeError(`${label} must be an ISO-8601 timestamp.`);
  }
}

export function normalizeHash(value: string): string {
  if (!HASH.test(value)) {
    throw new TypeError("Hashes are 16 to 64 lowercase hex digits.");
  }
  return value.toLowerCase();
}

export function optionalInteger(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return value;
}

export function assertLines(startLine?: number, endLine?: number): void {
  if (startLine === undefined && endLine === undefined) {
    return;
  }
  if (
    startLine === undefined ||
    endLine === undefined ||
    startLine < 1 ||
    endLine < startLine
  ) {
    throw new TypeError(
      "Markdown locator lines must be ordered positive integers.",
    );
  }
}

export function assertRect(value: unknown): BridgeViewRect {
  const input = asObject(value, "viewRect");
  const rect = {
    x: finite(input.x, "x"),
    y: finite(input.y, "y"),
    width: finite(input.width, "width"),
    height: finite(input.height, "height"),
  };
  if (rect.width < 0 || rect.height < 0) {
    throw new TypeError("viewRect sizes must be non-negative.");
  }
  return rect;
}

export function readWikiContext(value: unknown): BridgeWikiContext | undefined {
  if (value === undefined) {
    return undefined;
  }
  const input = asObject(value, "wiki");
  const wiki = {
    preset: optionalText(input.preset, "wiki.preset"),
    bundle: optionalText(input.bundle, "wiki.bundle"),
    collection: optionalText(input.collection, "wiki.collection"),
    type: optionalText(input.type, "wiki.type"),
  };
  const present = Object.fromEntries(
    Object.entries(wiki).filter(([, item]) => item !== undefined),
  );
  return Object.keys(present).length === 0
    ? undefined
    : (present as BridgeWikiContext);
}

/** Command arguments are untrusted: a bad context is ignored, not thrown. */
export function parseWikiContext(
  value: unknown,
): BridgeWikiContext | undefined {
  try {
    return readWikiContext(value);
  } catch {
    return undefined;
  }
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}
