/**
 * TED talk URL recognition. Pure parse helpers for `parse.ts`.
 */
import type { OnlineVideo } from "./parse";

/** TED talk slug (`ken_robinson_do_schools_kill_creativity`). */
const TED_ID = /^[a-z0-9_]{1,200}$/;

const TED_PATH = /^\/talks\/([a-z0-9_]{1,200})\/?$/;

const TED_HOSTS = new Set(["ted.com", "www.ted.com", "embed.ted.com"]);

export function isTedId(id: string): boolean {
  return TED_ID.test(id);
}

/** `ted.com/talks/{slug}` or `embed.ted.com/talks/{slug}`. */
export function ted(url: URL): OnlineVideo | undefined {
  if (!TED_HOSTS.has(url.hostname.toLowerCase())) {
    return undefined;
  }
  const match = TED_PATH.exec(url.pathname);
  if (!match) {
    return undefined;
  }
  const id = match[1]!;
  if (!TED_ID.test(id)) {
    return undefined;
  }
  return {
    provider: "ted",
    kind: "video",
    id,
    page: `https://www.ted.com/talks/${id}`,
  };
}
