/**
 * SoundCloud track/set URL recognition. Pure parse helpers for `parse.ts`.
 */
import type { OnlineVideo } from "./parse";

const SOUNDCLOUD_HOSTS = new Set([
  "soundcloud.com",
  "www.soundcloud.com",
  "m.soundcloud.com",
]);

/** `user/track` or `user/sets/playlist` (slugs: letters, digits, `_`, `-`). */
const SOUNDCLOUD_ID = /^[A-Za-z0-9_-]{1,50}\/(?:sets\/)?[A-Za-z0-9_-]{1,200}$/;
const SOUNDCLOUD_PATH =
  /^\/([A-Za-z0-9_-]{1,50})\/(?:(sets)\/)?([A-Za-z0-9_-]{1,200})\/?$/;

export function isSoundcloudHost(host: string): boolean {
  return SOUNDCLOUD_HOSTS.has(host);
}

export function isSoundcloudId(id: string): boolean {
  return SOUNDCLOUD_ID.test(id);
}

/** `/user/track` or `/user/sets/playlist` (not discover/you/settings). */
export function soundcloud(url: URL): OnlineVideo | undefined {
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
