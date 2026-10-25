/**
 * npm registry helpers for package cards (description + author). No cover.
 */
import type { VideoDetails } from "./protocol";

export function parseNpmPackage(body: unknown): VideoDetails {
  if (!isRecord(body)) {
    throw new Error("Unexpected npm registry response");
  }
  const title =
    text(body.description, 300) ?? text(body.name, 300) ?? text(body._id, 300);
  return withoutUndefined({
    title,
    author: npmAuthor(body),
  });
}

/** Prefer a display name over a bare email address. */
export function npmAuthor(body: Record<string, unknown>): string | undefined {
  const fromAuthor = npmPersonName(body.author);
  if (fromAuthor) {
    return fromAuthor;
  }
  if (Array.isArray(body.maintainers)) {
    for (const person of body.maintainers) {
      const name = npmPersonName(person);
      if (name) {
        return name;
      }
    }
  }
  return undefined;
}

function npmPersonName(value: unknown): string | undefined {
  if (typeof value === "string") {
    const named = /^(.*?)\s*<[^<>]+>$/.exec(value.trim());
    const raw = named ? named[1]! : value;
    const name = text(raw, 100);
    return name && !name.includes("@") ? name : undefined;
  }
  if (isRecord(value)) {
    const name = text(value.name, 100);
    return name && !name.includes("@") ? name : undefined;
  }
  return undefined;
}

/** Scoped names use `@scope%2Fname` on the registry path. */
export function npmRegistryPath(id: string): string {
  return encodeURIComponent(id).replace(/^%40/, "@");
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parsing yields undefined for a missing or invalid field; drop those keys. */
function withoutUndefined(details: {
  [K in keyof VideoDetails]?: VideoDetails[K] | undefined;
}): VideoDetails {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  ) as VideoDetails;
}
