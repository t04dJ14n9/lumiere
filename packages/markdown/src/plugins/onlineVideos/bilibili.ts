/**
 * Bilibili view and bangumi season responses, plus the hdslb cover allowlist.
 * Pure parsing: the host fetch lives in `details.ts`.
 */
import type { VideoDetails } from "./protocol";

const COVER_HOSTS = new Set(["i0.hdslb.com", "i1.hdslb.com", "i2.hdslb.com"]);

/** The view API's details and the cover's https URL, if it is on hdslb.com. */
export function parseBilibiliView(body: unknown): {
  details: VideoDetails;
  cover?: string;
} {
  if (!isRecord(body) || body.code !== 0 || !isRecord(body.data)) {
    throw new Error("Unexpected Bilibili response");
  }
  const data = body.data;
  const owner = isRecord(data.owner) ? data.owner : {};
  const duration =
    typeof data.duration === "number" &&
    Number.isInteger(data.duration) &&
    data.duration > 0 &&
    data.duration < 1_000_000
      ? data.duration
      : undefined;
  const cover = coverUrl(data.pic);
  return {
    details: withoutUndefined({
      title: text(data.title, 300),
      author: text(owner.name, 100),
      duration,
    }),
    ...(cover ? { cover } : {}),
  };
}

/** Season API details; `id` is `ep…` or `ss…` so an episode can pick its row. */
export function parseBilibiliSeason(
  body: unknown,
  id: string,
): {
  details: VideoDetails;
  cover?: string;
} {
  if (!isRecord(body) || body.code !== 0 || !isRecord(body.result)) {
    throw new Error("Unexpected Bilibili bangumi response");
  }
  const result = body.result;
  const seasonTitle = text(result.title, 300) ?? text(result.season_title, 300);
  const up = isRecord(result.up_info) ? result.up_info : {};
  const author = text(up.uname, 100);
  if (id.startsWith("ep")) {
    return parseBangumiEpisode(result, id, author, seasonTitle);
  }
  const cover = coverUrl(result.cover) ?? coverUrl(result.square_cover);
  return {
    details: withoutUndefined({ title: seasonTitle, author }),
    ...(cover ? { cover } : {}),
  };
}

function parseBangumiEpisode(
  result: Record<string, unknown>,
  id: string,
  author: string | undefined,
  seasonTitle: string | undefined,
): { details: VideoDetails; cover?: string } {
  const episode = findBangumiEpisode(result, id);
  const title = bangumiEpisodeTitle(seasonTitle, episode);
  const duration = bangumiDurationSeconds(episode?.duration);
  const cover = coverUrl(episode?.cover) ?? coverUrl(result.cover);
  return {
    details: withoutUndefined({ title, author, duration }),
    ...(cover ? { cover } : {}),
  };
}

function findBangumiEpisode(
  result: Record<string, unknown>,
  id: string,
): Record<string, unknown> | undefined {
  const episodes = Array.isArray(result.episodes) ? result.episodes : [];
  const epId = Number(id.slice(2));
  const row = episodes.find((item) => isRecord(item) && item.id === epId);
  return isRecord(row) ? row : undefined;
}

function bangumiEpisodeTitle(
  seasonTitle: string | undefined,
  episode: Record<string, unknown> | undefined,
): string | undefined {
  const epLabel = text(episode?.long_title, 200) ?? text(episode?.title, 100);
  if (seasonTitle && epLabel) {
    return `${seasonTitle} · ${epLabel}`.slice(0, 300);
  }
  return epLabel ?? seasonTitle;
}

/** Bangumi episode duration is milliseconds. */
function bangumiDurationSeconds(value: unknown): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value >= 1_000_000_000
  ) {
    return undefined;
  }
  return Math.floor(value / 1000);
}

export function coverUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    !COVER_HOSTS.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/bfs\/[A-Za-z0-9_\-/]+\.(?:jpg|jpeg|png|webp|gif)$/i.test(url.pathname)
  ) {
    return undefined;
  }
  return `https://${url.hostname}${url.pathname}`;
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
