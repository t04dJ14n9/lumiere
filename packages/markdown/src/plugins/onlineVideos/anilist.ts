/** AniList Media parsing. Kept beside details.ts so that file stays within the size limit. */
import type { VideoDetails } from "./protocol";

/** AniList GraphQL Media: English/romaji title, studio or staff, CDN cover. */
export function parseAnilistMedia(body: unknown): {
  details: VideoDetails;
  cover?: string;
} {
  if (!isRecord(body) || !isRecord(body.data) || !isRecord(body.data.Media)) {
    throw new Error("Unexpected AniList response");
  }
  const media = body.data.Media;
  const titles = isRecord(media.title) ? media.title : {};
  const title =
    text(titles.english, 300) ??
    text(titles.romaji, 300) ??
    text(titles.native, 300);
  const author = anilistAuthor(media) ?? text(media.type, 100);
  const images = isRecord(media.coverImage) ? media.coverImage : {};
  const cover =
    anilistCoverUrl(images.extraLarge) ??
    anilistCoverUrl(images.large) ??
    anilistCoverUrl(images.medium);
  return {
    details: withoutUndefined({ title, author }),
    ...(cover ? { cover } : {}),
  };
}

/** Main studio, else a preferred staff role (Director, Story & Art, …). */
function anilistAuthor(media: Record<string, unknown>): string | undefined {
  return anilistStudio(media) ?? anilistStaff(media);
}

function anilistStudio(media: Record<string, unknown>): string | undefined {
  const studios = isRecord(media.studios) ? media.studios : {};
  const nodes = Array.isArray(studios.nodes) ? studios.nodes : [];
  for (const node of nodes) {
    if (!isRecord(node)) {
      continue;
    }
    const name = text(node.name, 100);
    if (name) {
      return name;
    }
  }
  return undefined;
}

function anilistStaff(media: Record<string, unknown>): string | undefined {
  const staff = isRecord(media.staff) ? media.staff : {};
  const edges = Array.isArray(staff.edges) ? staff.edges : [];
  const prefer = [
    "Director",
    "Story & Art",
    "Story",
    "Art",
    "Original Creator",
  ];
  for (const role of prefer) {
    const name = staffWithRole(edges, role);
    if (name) {
      return name;
    }
  }
  return undefined;
}

function staffWithRole(edges: unknown[], role: string): string | undefined {
  for (const edge of edges) {
    if (!isRecord(edge)) {
      continue;
    }
    const edgeRole = text(edge.role, 80);
    // Roles often carry a parenthetical (e.g. "Story & Art (vols 1-41)").
    if (!edgeRole || !edgeRole.startsWith(role)) {
      continue;
    }
    const node = isRecord(edge.node) ? edge.node : {};
    const name = isRecord(node.name) ? text(node.name.full, 100) : undefined;
    if (name) {
      return name;
    }
  }
  return undefined;
}

/**
 * AniList covers on `s4.anilist.co` under `/file/anilistcdn/…`.
 */
export function anilistCoverUrl(value: unknown): string | undefined {
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
    url.protocol !== "https:" ||
    url.hostname !== "s4.anilist.co" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/file\/anilistcdn\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp|gif)$/i.test(
      url.pathname,
    )
  ) {
    return undefined;
  }
  return `https://s4.anilist.co${url.pathname}`;
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
