/**
 * Recognise YouTube, Bilibili, Hugging Face, Spotify, SoundCloud and npm
 * links (YouTube playlists, Bilibili bangumi). Only a fully parsed and
 * validated ID leaves this module; players and cards are built from it,
 * never from the link text.
 */
export type VideoProvider =
  "youtube" | "bilibili" | "huggingface" | "spotify" | "soundcloud" | "npm";
export type MediaKind = "video" | "playlist" | "bangumi";
export interface OnlineVideo {
  readonly provider: VideoProvider;
  /** Video, playlist (YouTube), or bangumi episode/season (Bilibili). */
  readonly kind: MediaKind;
  /**
   * An 11-character YouTube video ID, a YouTube playlist ID, a Bilibili
   * `BV…` / `av` id, a bangumi `ep…` / `ss…` id, a Hugging Face model id
   * (`name` or `owner/name`), a Spotify `track|album|playlist|episode|show:…`
   * id, a SoundCloud `user/slug` (or `user/sets/slug`) path, or an npm
   * package name (`lodash` or `@scope/name`).
   */
  readonly id: string;
  /** YouTube start time in whole seconds (videos only). */
  readonly start?: number;
  /** Bilibili part number (`?p=`), 1 for the first part. */
  readonly part?: number;
  /** The canonical page, opened in the external browser. */
  readonly page: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
/** Common public playlist prefixes; reject short/ambiguous tokens. */
const YOUTUBE_PLAYLIST = /^(?:PL|UU|LL|FL|OL|RD)[A-Za-z0-9_-]{10,64}$/;
const BVID = /^BV[0-9A-Za-z]{10}$/;
const CANONICAL_AID = /^av[1-9][0-9]{0,15}$/;
const AID = /^av([1-9][0-9]{0,15})$/i;
/** Bangumi episode (`ep409506`) or season (`ss40154`) ids. */
const BANGUMI_ID = /^(?:ep|ss)([1-9][0-9]{0,9})$/;
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
const SOUNDCLOUD_HOSTS = new Set([
  "soundcloud.com",
  "www.soundcloud.com",
  "m.soundcloud.com",
]);
/** `user/track` or `user/sets/playlist` (slugs: letters, digits, `_`, `-`). */
const SOUNDCLOUD_ID = /^[A-Za-z0-9_-]{1,50}\/(?:sets\/)?[A-Za-z0-9_-]{1,200}$/;
const SOUNDCLOUD_PATH =
  /^\/([A-Za-z0-9_-]{1,50})\/(?:(sets)\/)?([A-Za-z0-9_-]{1,200})\/?$/;
const YOUTUBE_PATHS = /^\/(?:shorts|embed|live|v)\/([^/]+)\/?$/;
const BANGUMI_PATH = /^\/bangumi\/play\/((?:ep|ss)[1-9][0-9]{0,9})\/?$/i;
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

/** Spotify resource id with type prefix (`track:…`). */
const SPOTIFY_ID = /^(track|album|playlist|episode|show):([A-Za-z0-9]{22})$/;

const SPOTIFY_PATH =
  /^\/(track|album|playlist|episode|show)\/([A-Za-z0-9]{22})\/?$/;

const SPOTIFY_HOSTS = new Set(["open.spotify.com"]);

const NPM_NAME =
  /^(?:@[a-z0-9-][a-z0-9-._]{0,213}\/[a-z0-9-][a-z0-9-._]{0,213}|[a-z0-9-][a-z0-9-._]{0,213})$/;

/** Package page; optional `/v/{version}` is normalised away. */
const NPM_PATH = /^\/package\/(@[^/]+\/[^/]+|[^/@]+)(?:\/v\/[^/]+)?\/?$/;

const NPM_HOSTS = new Set(["www.npmjs.com", "npmjs.com"]);

function npmPackage(name: string): OnlineVideo | undefined {
  const id = name.toLowerCase();
  if (!NPM_NAME.test(id) || id.length > 214) {
    return undefined;
  }
  return {
    provider: "npm",
    kind: "video",
    id,
    page: `https://www.npmjs.com/package/${id}`,
  };
}

/** `/track|album|playlist|episode|show/{22-char id}`. */
function spotify(url: URL): OnlineVideo | undefined {
  const match = SPOTIFY_PATH.exec(url.pathname);
  if (!match) {
    return undefined;
  }
  const resourceKind = match[1]!;
  const resource = match[2]!;
  const id = `${resourceKind}:${resource}`;
  return {
    provider: "spotify",
    kind: "video",
    id,
    page: `https://open.spotify.com/${resourceKind}/${resource}`,
  };
}

/** Whether `id` is an ID `parseVideoUrl` could have produced for that kind. */
export function isVideoId(
  provider: VideoProvider,
  id: string,
  kind: MediaKind = "video",
): boolean {
  if (kind === "playlist") {
    return provider === "youtube" && YOUTUBE_PLAYLIST.test(id);
  }
  if (kind === "bangumi") {
    return provider === "bilibili" && BANGUMI_ID.test(id);
  }
  if (provider === "youtube") {
    return YOUTUBE_ID.test(id);
  }
  if (provider === "bilibili") {
    return BVID.test(id) || CANONICAL_AID.test(id);
  }
  if (provider === "huggingface") {
    return id.length <= 200 && HF_ID.test(id);
  }
  if (provider === "spotify") {
    return SPOTIFY_ID.test(id);
  }
  if (provider === "soundcloud") {
    return SOUNDCLOUD_ID.test(id);
  }
  return id.length <= 214 && NPM_NAME.test(id);
}

export function parseVideoUrl(raw: string): OnlineVideo | undefined {
  const url = httpUrl(raw);
  return url ? parseKnownHost(url.hostname.toLowerCase(), url) : undefined;
}

function parseKnownHost(host: string, url: URL): OnlineVideo | undefined {
  if (host === "youtu.be" || YOUTUBE_HOSTS.has(host)) {
    return parseYoutubeHost(host, url);
  }
  if (BILIBILI_HOSTS.has(host)) {
    const bangumi = bilibiliBangumi(url);
    if (bangumi) {
      return bangumi;
    }
    return bilibili(/^\/video\/([^/]+)\/?$/.exec(url.pathname)?.[1], url);
  }
  if (HF_HOSTS.has(host)) {
    const match = HF_PATH.exec(url.pathname);
    return match ? huggingface(match[1]!) : undefined;
  }
  if (SPOTIFY_HOSTS.has(host)) {
    return spotify(url);
  }
  if (SOUNDCLOUD_HOSTS.has(host)) {
    return soundcloud(url);
  }
  if (NPM_HOSTS.has(host)) {
    const match = NPM_PATH.exec(url.pathname);
    return match ? npmPackage(match[1]!) : undefined;
  }
  return undefined;
}

function httpUrl(raw: string): URL | undefined {
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
  return url;
}

function parseYoutubeHost(host: string, url: URL): OnlineVideo | undefined {
  if (host === "youtu.be") {
    return youtubeVideo(/^\/([^/]+)\/?$/.exec(url.pathname)?.[1], url);
  }
  const playlist = youtubePlaylist(url);
  if (playlist) {
    return playlist;
  }
  const id =
    url.pathname === "/watch"
      ? url.searchParams.get("v")
      : YOUTUBE_PATHS.exec(url.pathname)?.[1];
  return youtubeVideo(id ?? undefined, url);
}

/**
 * Playlist-only URLs (`/playlist?list=` or `/embed/videoseries?list=`).
 * A watch URL with both `v` and `list` stays a single video.
 */
function youtubePlaylist(url: URL): OnlineVideo | undefined {
  const list = url.searchParams.get("list");
  if (!list || !YOUTUBE_PLAYLIST.test(list)) {
    return undefined;
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const playlistPath = path === "/playlist";
  const videoseries =
    path === "/embed/videoseries" || path === "/embed/videoseries/";
  if (!playlistPath && !videoseries) {
    return undefined;
  }
  // Prefer a concrete video when `v=` is present on a non-playlist path.
  if (!playlistPath && url.searchParams.get("v")) {
    return undefined;
  }
  return {
    provider: "youtube",
    kind: "playlist",
    id: list,
    page: `https://www.youtube.com/playlist?list=${list}`,
  };
}

function youtubeVideo(
  id: string | undefined,
  url: URL,
): OnlineVideo | undefined {
  if (!id || !YOUTUBE_ID.test(id)) {
    return undefined;
  }
  const start = seconds(
    url.searchParams.get("t") ?? url.searchParams.get("start"),
  );
  const page = `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`;
  return start
    ? { provider: "youtube", kind: "video", id, start, page }
    : { provider: "youtube", kind: "video", id, page };
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
  return { provider: "bilibili", kind: "video", id: valid, part, page };
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
    kind: "video",
    id,
    page: `https://huggingface.co/${id}`,
  };
}

/** `/user/track` or `/user/sets/playlist` (not discover/you/settings). */
function soundcloud(url: URL): OnlineVideo | undefined {
  const match = SOUNDCLOUD_PATH.exec(url.pathname);
  if (!match) {
    return undefined;
  }
  const user = match[1]!;
  const sets = match[2];
  const slug = match[3]!;
  // Reserved first segments that are not artist pages.
  if (
    /^(?:discover|you|settings|pages|charts|genres|search|signin|signup|upload|messages|notifications|premium|pro|jobs|terms|privacy|cookies|imprint|about)$/i.test(
      user,
    )
  ) {
    return undefined;
  }
  const id = sets ? `${user}/sets/${slug}` : `${user}/${slug}`;
  if (!SOUNDCLOUD_ID.test(id)) {
    return undefined;
  }
  return {
    provider: "soundcloud",
    kind: "video",
    id,
    page: `https://soundcloud.com/${id}`,
  };
}

/** `/bangumi/play/ep409506` or `/bangumi/play/ss40154`. */
function bilibiliBangumi(url: URL): OnlineVideo | undefined {
  const match = BANGUMI_PATH.exec(url.pathname);
  if (!match) {
    return undefined;
  }
  const id = match[1]!.toLowerCase();
  if (!BANGUMI_ID.test(id)) {
    return undefined;
  }
  return {
    provider: "bilibili",
    kind: "bangumi",
    id,
    page: `https://www.bilibili.com/bangumi/play/${id}`,
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
