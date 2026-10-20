/**
 * Video titles and covers from the providers' public, keyless endpoints,
 * fetched by the extension host (the webview CSP allows no network). Every
 * failure resolves to `{}`, so the card simply stays as it is.
 */
import type { MediaKind, VideoProvider } from "./parse";
import { isVideoId } from "./parse";
import {
  oEmbedThumbnail,
  soundcloudThumbnail,
  spotifyThumbnail,
} from "./thumbnails";
import { npmRegistryPath, parseNpmPackage } from "./npm";

export {
  oEmbedThumbnail,
  soundcloudThumbnail,
  spotifyThumbnail,
} from "./thumbnails";
export { npmRegistryPath, parseNpmPackage } from "./npm";

import type { VideoDetails } from "./protocol";
export type { VideoDetails };
import { imageDataUrl } from "./imageData";
export { imageDataUrl } from "./imageData";
import {
  parseBilibiliCard,
  parseBilibiliSeason,
  parseBilibiliView,
} from "./bilibili";
export {
  coverUrl,
  parseBilibiliCard,
  parseBilibiliSeason,
  parseBilibiliView,
} from "./bilibili";

/** The part of `fetch` this module uses, so tests can pass a fake. */
export type Fetch = (
  url: string,
  init: {
    headers: Record<string, string>;
    signal: AbortSignal;
    redirect: "error";
  },
) => Promise<FetchResponse>;
export interface FetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface DetailsOptions {
  fetch: Fetch;
  /** Budget for one lookup, metadata and cover together. */
  timeoutMs?: number;
  maxCoverBytes?: number;
  maxEntries?: number;
  /** How long a failed lookup is remembered before it may be retried. */
  retryAfterMs?: number;
  /** Lookups in flight at once; the rest wait their turn. */
  concurrency?: number;
  now?: () => number;
}

// Bilibili's firewall answers 412 to browser-like agents that are not browsers.
export const USER_AGENT = "MarkdownWorkshop (VS Code extension)";
// Bilibili's image service scales covers; a card needs no more than this.
const COVER_SIZE = "@480w_270h_1c.jpg";
export class VideoDetailsSource {
  private readonly cache = new Map<
    string,
    { expires: number; value: Promise<VideoDetails> }
  >();
  private readonly timeoutMs: number;
  private readonly maxCoverBytes: number;
  private readonly maxEntries: number;
  private readonly retryAfterMs: number;
  private readonly now: () => number;
  private readonly concurrency: number;
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly options: DetailsOptions) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.maxCoverBytes = options.maxCoverBytes ?? 512 * 1024;
    this.maxEntries = options.maxEntries ?? 200;
    this.retryAfterMs = options.retryAfterMs ?? 5 * 60_000;
    this.now = options.now ?? Date.now;
    this.concurrency = options.concurrency ?? 4;
  }

  get(
    provider: VideoProvider,
    id: string,
    kind: MediaKind = "video",
    part = 1,
  ): Promise<VideoDetails> {
    if (!isVideoId(provider, id, kind)) {
      return Promise.resolve({});
    }
    const page = Number.isInteger(part) && part > 0 ? part : 1;
    const key = `${provider}:${kind}:${id}:${page}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) {
      return cached.value;
    }
    const entry = { expires: Infinity, value: Promise.resolve({}) };
    entry.value = this.queued(() =>
      this.lookup(provider, id, kind, page),
    ).catch(() => {
      entry.expires = this.now() + this.retryAfterMs;
      return {};
    });
    this.cache.delete(key);
    this.cache.set(key, entry);
    for (const old of this.cache.keys()) {
      if (this.cache.size <= this.maxEntries) {
        break;
      }
      this.cache.delete(old);
    }
    return entry.value;
  }

  private async queued<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }

  private async lookup(
    provider: VideoProvider,
    id: string,
    kind: MediaKind,
    part: number,
  ): Promise<VideoDetails> {
    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(new Error("Video details timed out")),
      this.timeoutMs,
    );
    try {
      return await this.fetchDetails(
        { provider, id, kind, part },
        timeout.signal,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchDetails(
    video: {
      provider: VideoProvider;
      id: string;
      kind: MediaKind;
      part: number;
    },
    signal: AbortSignal,
  ): Promise<VideoDetails> {
    const { provider, id, kind, part } = video;
    if (provider === "youtube") {
      return this.fetchYoutube(id, kind, signal);
    }
    if (provider === "huggingface") {
      const body = await this.json(
        `https://huggingface.co/api/models/${id}`,
        signal,
      );
      return parseHuggingFaceModel(body);
    }
    if (provider === "spotify") {
      return this.fetchSpotify(id, signal);
    }
    if (provider === "soundcloud") {
      return this.fetchSoundcloud(id, signal);
    }
    if (provider === "npm") {
      const body = await this.json(
        `https://registry.npmjs.org/${npmRegistryPath(id)}`,
        signal,
      );
      return parseNpmPackage(body);
    }
    if (kind === "bangumi") {
      return this.fetchBangumi(id, signal);
    }
    if (kind === "space") {
      return this.fetchBilibiliSpace(id, signal);
    }
    return this.fetchBilibiliView(id, part, signal);
  }

  private async fetchYoutube(
    id: string,
    kind: MediaKind,
    signal: AbortSignal,
  ): Promise<VideoDetails> {
    // Channels have no keyless oEmbed; the card keeps alt text / id.
    if (kind === "channel") {
      return {};
    }
    const page =
      kind === "playlist"
        ? `https://www.youtube.com/playlist?list=${id}`
        : `https://www.youtube.com/watch?v=${id}`;
    const body = await this.json(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(page)}`,
      signal,
    );
    const details = parseOEmbed(body);
    if (kind === "playlist") {
      await this.attachCover(details, oEmbedThumbnail(body), signal);
    }
    return details;
  }

  private async fetchSpotify(
    id: string,
    signal: AbortSignal,
  ): Promise<VideoDetails> {
    const colon = id.indexOf(":");
    const resourceKind = id.slice(0, colon);
    const resource = id.slice(colon + 1);
    const page = `https://open.spotify.com/${resourceKind}/${resource}`;
    const body = await this.json(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(page)}`,
      signal,
    );
    const details = parseOEmbed(body);
    await this.attachCover(details, spotifyThumbnail(body), signal);
    return details;
  }

  private async fetchSoundcloud(
    id: string,
    signal: AbortSignal,
  ): Promise<VideoDetails> {
    const page = `https://soundcloud.com/${id}`;
    const body = await this.json(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(page)}`,
      signal,
    );
    const details = parseOEmbed(body);
    await this.attachCover(details, soundcloudThumbnail(body), signal);
    return details;
  }

  private async fetchBangumi(
    id: string,
    signal: AbortSignal,
  ): Promise<VideoDetails> {
    const query = id.startsWith("ep")
      ? `ep_id=${id.slice(2)}`
      : `season_id=${id.slice(2)}`;
    const body = await this.json(
      `https://api.bilibili.com/pgc/view/web/season?${query}`,
      signal,
    );
    const { details, cover } = parseBilibiliSeason(body, id);
    await this.attachCover(
      details,
      cover ? cover + COVER_SIZE : undefined,
      signal,
    );
    return details;
  }

  /** UP space card API, plus a scaled face when the cover host is allowed. */
  private async fetchBilibiliSpace(
    id: string,
    signal: AbortSignal,
  ): Promise<VideoDetails> {
    const mid = id.slice("space:".length);
    const body = await this.json(
      `https://api.bilibili.com/x/web-interface/card?mid=${mid}`,
      signal,
    );
    const { details, cover } = parseBilibiliCard(body);
    await this.attachCover(
      details,
      cover ? cover + COVER_SIZE : undefined,
      signal,
    );
    return details;
  }

  private async fetchBilibiliView(
    id: string,
    part: number,
    signal: AbortSignal,
  ): Promise<VideoDetails> {
    const query = id.startsWith("BV") ? `bvid=${id}` : `aid=${id.slice(2)}`;
    const body = await this.json(
      `https://api.bilibili.com/x/web-interface/view?${query}`,
      signal,
    );
    const { details, cover } = parseBilibiliView(body, part);
    // A missing cover still leaves the title.
    await this.attachCover(
      details,
      cover ? cover + COVER_SIZE : undefined,
      signal,
    );
    return details;
  }

  private async attachCover(
    details: VideoDetails,
    cover: string | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    if (!cover) {
      return;
    }
    const image = await this.image(cover, signal).catch(() => undefined);
    if (image !== undefined) {
      details.cover = image;
    }
  }

  private async json(url: string, signal: AbortSignal): Promise<unknown> {
    const response = await this.request(url, signal);
    return response.json();
  }

  private async image(url: string, signal: AbortSignal): Promise<string> {
    const response = await this.request(url, signal);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > this.maxCoverBytes) {
      throw new Error("Cover too large");
    }
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      throw new Error(`Not an image: ${type}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > this.maxCoverBytes) {
      throw new Error("Cover too large");
    }
    return imageDataUrl(bytes);
  }

  private async request(
    url: string,
    signal: AbortSignal,
  ): Promise<FetchResponse> {
    const response = await this.options.fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      signal,
      redirect: "error",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response;
  }
}

/** YouTube oEmbed thumbnail when it is a known img host (playlist covers). */
export function parseOEmbed(body: unknown): VideoDetails {
  if (!isRecord(body)) {
    throw new Error("Unexpected oEmbed response");
  }
  return withoutUndefined({
    title: text(body.title, 300),
    author: text(body.author_name, 100),
  });
}

/**
 * Hugging Face model API (`/api/models/{id}`): pipeline tag or model id as
 * title; author from `author` or the owner segment of the id. No cover.
 */
export function parseHuggingFaceModel(body: unknown): VideoDetails {
  if (!isRecord(body)) {
    throw new Error("Unexpected Hugging Face response");
  }
  const modelId =
    text(body.modelId, 200) ?? text(body.id, 200) ?? text(body._id, 200);
  const pipeline = text(body.pipeline_tag, 100);
  const title =
    pipeline && modelId ? `${pipeline} · ${modelId}` : (pipeline ?? modelId);
  return withoutUndefined({
    title,
    author: huggingfaceAuthor(body, modelId),
  });
}

function huggingfaceAuthor(
  body: Record<string, unknown>,
  modelId: string | undefined,
): string | undefined {
  const direct = text(body.author, 100);
  if (direct) {
    return direct;
  }
  const owner = modelId?.includes("/") ? modelId.split("/")[0] : undefined;
  return text(owner, 100);
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
