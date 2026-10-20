/**
 * Apple Music iTunes Lookup parsing. Pure: no fetch, so the host module can
 * stay within the size limits.
 */
import type { VideoDetails } from "./protocol";

/** Apple Music artwork (`isN-ssl.mzstatic.com`). */
const APPLE_MUSIC_THUMB_HOSTS = new Set(
  Array.from({ length: 9 }, (_, i) => `is${i + 1}-ssl.mzstatic.com`),
);

/**
 * iTunes Lookup for a song or album. Picks the first matching result; album
 * requests may also return tracks — prefer `wrapperType=collection`.
 */
export function parseAppleMusicLookup(
  body: unknown,
  kind: string,
): { details: VideoDetails; cover?: string } {
  const preferred = preferredResult(body, kind);
  const cover = appleMusicThumbnail(artwork(preferred));
  return {
    details: withoutUndefined({
      title: appleMusicTitle(preferred, kind),
      author: text(preferred.artistName, 100),
      duration: appleMusicDuration(preferred, kind),
    }),
    ...(cover ? { cover } : {}),
  };
}

/** mzstatic artwork rewritten to 600×600 when the path is a known thumb. */
export function appleMusicThumbnail(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (!isAppleThumb(url)) {
    return undefined;
  }
  const match = /^(\/image\/thumb\/.+)\/\d+x\d+bb\.(jpe?g|png|webp)$/i.exec(
    url.pathname,
  );
  if (!match) {
    return undefined;
  }
  const base = match[1]!;
  const ext = match[2]!.toLowerCase();
  return `https://${url.hostname}${base}/600x600bb.${ext === "jpeg" ? "jpg" : ext}`;
}

function preferredResult(body: unknown, kind: string): Record<string, unknown> {
  const results = lookupRows(body);
  const preferred =
    kind === "album" ? collectionRow(results) : trackRow(results);
  if (!preferred) {
    throw new Error("Unexpected Apple Music lookup response");
  }
  return preferred;
}

function lookupRows(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body) || !Array.isArray(body.results)) {
    throw new Error("Unexpected Apple Music lookup response");
  }
  if (body.results.length === 0) {
    throw new Error("Unexpected Apple Music lookup response");
  }
  return body.results.filter(isRecord);
}

function collectionRow(
  results: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  return results.find((row) => row.wrapperType === "collection") ?? results[0];
}

function trackRow(
  results: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  return (
    results.find((row) => row.wrapperType === "track" || row.kind === "song") ??
    results[0]
  );
}

function appleMusicTitle(
  row: Record<string, unknown>,
  kind: string,
): string | undefined {
  if (kind === "album") {
    return text(row.collectionName, 300);
  }
  return text(row.trackName, 300) ?? text(row.collectionName, 300);
}

function appleMusicDuration(
  row: Record<string, unknown>,
  kind: string,
): number | undefined {
  if (kind !== "song") {
    return undefined;
  }
  const millis = row.trackTimeMillis;
  if (!isSongMillis(millis)) {
    return undefined;
  }
  return Math.round(millis / 1000);
}

function isSongMillis(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value < 1_000_000_000
  );
}

function artwork(row: Record<string, unknown>): unknown {
  return row.artworkUrl100 ?? row.artworkUrl60 ?? row.artworkUrl600;
}

function isAppleThumb(url: URL): boolean {
  return (
    /^https?:$/.test(url.protocol) &&
    APPLE_MUSIC_THUMB_HOSTS.has(url.hostname) &&
    !url.port &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  );
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

function withoutUndefined(details: {
  [K in keyof VideoDetails]?: VideoDetails[K] | undefined;
}): VideoDetails {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  ) as VideoDetails;
}
