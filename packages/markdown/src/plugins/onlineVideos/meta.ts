import type { MediaKind } from "./parse";
import type { VideoDetails } from "./protocol";

/** `4:17` or `1:02:03`. */
export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The card's second line: provider, then author and length when known, else the ID. */
export function videoMeta(
  provider: string,
  id: string,
  details: VideoDetails = {},
  kind: MediaKind = "video",
): string {
  const known = [
    kind === "playlist" ? "Playlist" : undefined,
    details.author,
    details.duration ? formatDuration(details.duration) : undefined,
  ].filter((part): part is string => Boolean(part));
  return [provider, ...(known.length ? known : [id])].join(" · ");
}
