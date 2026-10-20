/**
 * Recognise YouTube, Bilibili and Hugging Face model links. Only a fully
 * parsed and validated ID leaves this module; players and cards are built
 * from it, never from the link text.
 */
export type VideoProvider =
  "youtube" | "bilibili" | "huggingface" | "applePodcasts";
export interface OnlineVideo {
  readonly provider: VideoProvider;
  /**
   * An 11-character YouTube ID, a Bilibili `BV…` / `av` id, or a Hugging Face
   * model id (`name` or `owner/name`).
   */
  readonly id: string;
  /** YouTube start time in whole seconds. */
  readonly start?: number;
  /** Bilibili part number (`?p=`), 1 for the first part. */
  readonly part?: number;
  /** The canonical page, opened in the external browser. */
  readonly page: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const BVID = /^BV[0-9A-Za-z]{10}$/;
const CANONICAL_AID = /^av[1-9][0-9]{0,15}$/;
const AID = /^av([1-9][0-9]{0,15})$/i;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const BILIBILI_HOSTS = new Set([
  "bilibili.com",
  "www.bilibili.com",
  "m.bilibili.com",
]);
const YOUTUBE_PATHS = /^\/(?:shorts|embed|live|v)\/([^/]+)\/?$/;
const MAX_INTEGER = 10 ** 9;

/**
 * Hugging Face model id: `name` or `owner/name` (letters, digits, `.`, `_`,
 * `-`); at most 200 chars. Hub marketing paths are rejected.
 */
const HF_SEGMENT = "[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?";
const HF_ID = new RegExp(`^(?:${HF_SEGMENT}|${HF_SEGMENT}/${HF_SEGMENT})$`);
const HF_PATH = new RegExp(
  `^\\/(${HF_SEGMENT}(?:\\/${HF_SEGMENT})?)(?:\\/(?:tree|blob|resolve|discussions|settings)(?:\\/.*)?)?\\/?$`,
);
const HF_HOSTS = new Set(["huggingface.co", "www.huggingface.co"]);
const HF_RESERVED = new Set([
  "models",
  "datasets",
  "spaces",
  "docs",
  "blog",
  "learn",
  "pricing",
  "enterprise",
  "login",
  "join",
  "settings",
  "api",
  "chat",
  "spaces",
  "datasets",
  "tasks",
  "metrics",
  "organizations",
  "collections",
]);

/** Whether `id` is an ID `parseVideoUrl` could have produced. */

/** Apple Podcasts collection id (`podcast:1200361736`). */
const APPLE_PODCASTS_ID = /^podcast:([1-9][0-9]{0,15})$/;

/** `/{cc}/podcast/{slug?}/id{digits}` (episode `?i=` ignored — show card). */
const APPLE_PODCASTS_PATH =
  /^\/[a-z]{2}\/podcast(?:\/[^/]+)?\/id([1-9][0-9]{0,15})\/?$/;

const APPLE_PODCASTS_HOSTS = new Set(["podcasts.apple.com"]);

/** Show collection `id{digits}`; episode `?i=` still resolves to the show. */
function applePodcasts(url: URL): OnlineVideo | undefined {
  const match = APPLE_PODCASTS_PATH.exec(url.pathname);
  if (!match) {
    return undefined;
  }
  const resource = match[1]!;
  const id = `podcast:${resource}`;
  if (!APPLE_PODCASTS_ID.test(id)) {
    return undefined;
  }
  return {
    provider: "applePodcasts",
    id,
    page: `https://podcasts.apple.com/us/podcast/id${resource}`,
  };
}
export function isVideoId(provider: VideoProvider, id: string): boolean {
  if (provider === "youtube") {
    return YOUTUBE_ID.test(id);
  }
  if (provider === "bilibili") {
    return BVID.test(id) || CANONICAL_AID.test(id);
  }
  if (provider === "huggingface") {
    return id.length <= 200 && HF_ID.test(id);
  }
  return APPLE_PODCASTS_ID.test(id);
}

export function parseVideoUrl(raw: string): OnlineVideo | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  ) {
    return undefined;
  }
  return parseKnownHost(url.hostname.toLowerCase(), url);
}

function parseKnownHost(host: string, url: URL): OnlineVideo | undefined {
  if (host === "youtu.be") {
    return youtube(/^\/([^/]+)\/?$/.exec(url.pathname)?.[1], url);
  }
  if (YOUTUBE_HOSTS.has(host)) {
    const id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : YOUTUBE_PATHS.exec(url.pathname)?.[1];
    return youtube(id ?? undefined, url);
  }
  if (BILIBILI_HOSTS.has(host)) {
    return bilibili(/^\/video\/([^/]+)\/?$/.exec(url.pathname)?.[1], url);
  }
  if (HF_HOSTS.has(host)) {
    const match = HF_PATH.exec(url.pathname);
    return match ? huggingface(match[1]!) : undefined;
  }
  if (APPLE_PODCASTS_HOSTS.has(host)) {
    return applePodcasts(url);
  }
  return undefined;
}

function youtube(id: string | undefined, url: URL): OnlineVideo | undefined {
  if (!id || !YOUTUBE_ID.test(id)) {
    return undefined;
  }
  const start = seconds(
    url.searchParams.get("t") ?? url.searchParams.get("start"),
  );
  const page = `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`;
  return start
    ? { provider: "youtube", id, start, page }
    : { provider: "youtube", id, page };
}

function bilibili(id: string | undefined, url: URL): OnlineVideo | undefined {
  const aid = id ? AID.exec(id)?.[1] : undefined;
  const bvid = id && BVID.test(id) ? id : undefined;
  const valid = aid ? `av${aid}` : bvid;
  if (!valid) {
    return undefined;
  }
  const part = positive(url.searchParams.get("p")) ?? 1;
  const page = `https://www.bilibili.com/video/${valid}/${part > 1 ? `?p=${part}` : ""}`;
  return { provider: "bilibili", id: valid, part, page };
}

function huggingface(id: string): OnlineVideo | undefined {
  if (!HF_ID.test(id) || id.length > 200) {
    return undefined;
  }
  const root = id.split("/")[0]!.toLowerCase();
  if (HF_RESERVED.has(root)) {
    return undefined;
  }
  return {
    provider: "huggingface",
    id,
    page: `https://huggingface.co/${id}`,
  };
}

/** `90`, `90s`, `1m30s` or `1h2m3s`; anything else is ignored. */
function seconds(value: string | null): number | undefined {
  const match = value
    ? /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value)
    : undefined;
  if (!match || !value) {
    return undefined;
  }
  const [, h = "0", m = "0", s = "0"] = match;
  const total = Number(h) * 3600 + Number(m) * 60 + Number(s);
  return total > 0 && total < MAX_INTEGER ? total : undefined;
}

function positive(value: string | null): number | undefined {
  if (!value || !/^[1-9][0-9]{0,5}$/.test(value)) {
    return undefined;
  }
  return Number(value);
}
