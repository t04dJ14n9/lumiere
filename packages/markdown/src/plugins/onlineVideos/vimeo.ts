/**
 * Vimeo video URL recognition. Pure parse helpers for `parse.ts`.
 */
import type { OnlineVideo } from "./parse";

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com"]);
const VIMEO_PLAYER_HOSTS = new Set(["player.vimeo.com"]);

/** Vimeo video id (digits). */
const VIMEO_ID = /^[1-9][0-9]{0,15}$/;
const VIMEO_PATH = /^\/([1-9][0-9]{0,15})\/?$/;
const VIMEO_PLAYER_PATH = /^\/video\/([1-9][0-9]{0,15})\/?$/;

export function isVimeoId(id: string): boolean {
  return VIMEO_ID.test(id);
}

/** `vimeo.com/{id}` or `player.vimeo.com/video/{id}`. */
export function vimeo(url: URL): OnlineVideo | undefined {
  const host = url.hostname.toLowerCase();
  let pattern: RegExp | undefined;
  if (VIMEO_HOSTS.has(host)) {
    pattern = VIMEO_PATH;
  } else if (VIMEO_PLAYER_HOSTS.has(host)) {
    pattern = VIMEO_PLAYER_PATH;
  } else {
    return undefined;
  }
  const match = pattern.exec(url.pathname);
  if (!match) {
    return undefined;
  }
  const id = match[1]!;
  if (!VIMEO_ID.test(id)) {
    return undefined;
  }
  return {
    provider: "vimeo",
    kind: "video",
    id,
    page: `https://vimeo.com/${id}`,
  };
}
