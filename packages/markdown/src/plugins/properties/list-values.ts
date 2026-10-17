import type { PropertyScalar } from "../../markdown/properties";
import { validTag } from "../../markdown/tags/grammar";

export function normalizeListInput(
  key: string,
  text: string,
): string | undefined {
  const value = text.trim();
  if (key.toLowerCase() !== "tags") {
    return value;
  }
  const tag = value.replace(/^#/, "");
  return !tag || validTag(tag) ? tag : undefined;
}

/** Scalar YAML values may be edited as a one-item list; objects remain source-only. */
export function listValues(raw: unknown): PropertyScalar[] | undefined {
  if (raw === null || raw === undefined) {
    return [];
  }
  const values = Array.isArray(raw) ? raw : [raw];
  return values.every(isListScalar) ? values : undefined;
}

function isListScalar(value: unknown): value is PropertyScalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
