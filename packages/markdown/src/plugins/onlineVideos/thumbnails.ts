/** YouTube oEmbed / still hosts used for playlist covers. */
const YOUTUBE_THUMB_HOSTS = new Set(["i.ytimg.com", "img.youtube.com"]);

const SPOTIFY_THUMB_HOSTS = new Set([
  "i.scdn.co",
  "image-cdn-ak.spotifycdn.com",
  "image-cdn-fa.spotifycdn.com",
]);

const SOUNDCLOUD_THUMB_HOSTS = new Set([
  "i1.sndcdn.com",
  "i2.sndcdn.com",
  "i3.sndcdn.com",
  "i4.sndcdn.com",
]);

/** YouTube oEmbed thumbnail when it is a known img host (playlist covers). */
export function oEmbedThumbnail(body: unknown): string | undefined {
  return thumbnailFromHosts(body, YOUTUBE_THUMB_HOSTS);
}

/** Spotify oEmbed thumbnail when it is a known CDN host. */
export function spotifyThumbnail(body: unknown): string | undefined {
  return thumbnailFromHosts(body, SPOTIFY_THUMB_HOSTS);
}

/** SoundCloud oEmbed thumbnail when it is a known sndcdn host. */
export function soundcloudThumbnail(body: unknown): string | undefined {
  return thumbnailFromHosts(body, SOUNDCLOUD_THUMB_HOSTS);
}

/** oEmbed `thumbnail_url` when it is https on an allowlisted host. */
function thumbnailFromHosts(
  body: unknown,
  hosts: ReadonlySet<string>,
): string | undefined {
  if (!isRecord(body) || typeof body.thumbnail_url !== "string") {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(body.thumbnail_url);
  } catch {
    return undefined;
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    !hosts.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  ) {
    return undefined;
  }
  return url.href;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
