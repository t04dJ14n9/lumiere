/**
 * Docker Hub repository helpers for image cards (description + namespace).
 * No cover.
 */
import type { VideoDetails } from "./protocol";

export function parseDockerHubRepository(body: unknown): VideoDetails {
  if (!isRecord(body)) {
    throw new Error("Unexpected Docker Hub response");
  }
  const name = text(body.name, 100);
  const namespace = text(body.namespace, 100);
  const title =
    text(body.description, 300) ??
    (namespace && name ? `${namespace}/${name}` : name);
  return withoutUndefined({
    title,
    author: text(body.namespace, 100) ?? text(body.user, 100),
  });
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
