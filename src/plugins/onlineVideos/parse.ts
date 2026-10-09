/**
 * Recognise YouTube and Bilibili video links. Only a fully parsed and
 * validated ID leaves this module; players and cards are built from it, never
 * from the link text.
 */
export type VideoProvider = "youtube" | "bilibili";
export interface OnlineVideo {
  readonly provider: VideoProvider;
  /** An 11-character YouTube ID, or a Bilibili `BV…` ID or `av` number. */
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
  const host = url.hostname.toLowerCase();
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
