/**
 * Video titles and covers from the providers' public, keyless endpoints,
 * fetched by the extension host (the webview CSP allows no network). Every
 * failure resolves to `{}`, so the card simply stays as it is.
 */
import type { VideoProvider } from "./parse";
import { isVideoId } from "./parse";

import type { VideoDetails } from "./protocol";
export type { VideoDetails };

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
const COVER_HOSTS = new Set(["i0.hdslb.com", "i1.hdslb.com", "i2.hdslb.com"]);
// Bilibili's image service scales covers; a card needs no more than this.
const COVER_SIZE = "@480w_270h_1c.jpg";
const SIGNATURES: readonly [string, (bytes: Uint8Array) => boolean][] = [
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/png", (b) => ascii(b, 1, 4) === "PNG" && b[0] === 0x89],
  ["image/gif", (b) => ascii(b, 0, 4) === "GIF8"],
  [
    "image/webp",
    (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  ],
];

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

  get(provider: VideoProvider, id: string): Promise<VideoDetails> {
    if (!isVideoId(provider, id)) {
      return Promise.resolve({});
    }
    const key = `${provider}:${id}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) {
      return cached.value;
    }
    const entry = { expires: Infinity, value: Promise.resolve({}) };
    entry.value = this.queued(() => this.lookup(provider, id)).catch(() => {
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
  ): Promise<VideoDetails> {
    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(new Error("Video details timed out")),
      this.timeoutMs,
    );
    try {
      return await this.fetchDetails(provider, id, timeout.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchBluesky(
    id: string,
    signal: AbortSignal,
  ): Promise<VideoDetails> {
    const marker = "/post/";
    const at = id.indexOf(marker);
    const actor = id.slice(0, at);
    const rkey = id.slice(at + marker.length);
    let did = actor;
    if (!actor.startsWith("did:")) {
      const resolved = await this.json(
        `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`,
        signal,
      );
      if (!isRecord(resolved) || typeof resolved.did !== "string") {
        throw new Error("Unexpected Bluesky resolve response");
      }
      did = resolved.did;
    }
    const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
    const body = await this.json(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`,
      signal,
    );
    const { details, cover } = parseBlueskyPosts(body);
    if (cover) {
      const image = await this.image(cover, signal).catch(() => undefined);
      if (image !== undefined) {
        details.cover = image;
      }
    }
    return details;
  }

  private async fetchDetails(
    provider: VideoProvider,
    id: string,
    signal: AbortSignal,
  ): Promise<VideoDetails> {
    if (provider === "youtube") {
      const page = `https://www.youtube.com/watch?v=${id}`;
      const body = await this.json(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(page)}`,
        signal,
      );
      return parseOEmbed(body);
    }
    if (provider === "huggingface") {
      const body = await this.json(
        `https://huggingface.co/api/models/${id}`,
        signal,
      );
      return parseHuggingFaceModel(body);
    }
    if (provider === "bluesky") {
      return this.fetchBluesky(id, signal);
    }
    const query = id.startsWith("BV") ? `bvid=${id}` : `aid=${id.slice(2)}`;
    const body = await this.json(
      `https://api.bilibili.com/x/web-interface/view?${query}`,
      signal,
    );
    const { details, cover } = parseBilibiliView(body);
    if (cover) {
      // A missing cover still leaves the title.
      const image = await this.image(cover + COVER_SIZE, signal).catch(
        () => undefined,
      );
      if (image !== undefined) {
        details.cover = image;
      }
    }
    return details;
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

/** Bluesky getPosts: post text, author display/handle, embed thumb or avatar. */
export function parseBlueskyPosts(body: unknown): {
  details: VideoDetails;
  cover?: string;
} {
  if (
    !isRecord(body) ||
    !Array.isArray(body.posts) ||
    body.posts.length === 0
  ) {
    throw new Error("Unexpected Bluesky response");
  }
  const post = body.posts[0];
  if (!isRecord(post)) {
    throw new Error("Unexpected Bluesky response");
  }
  const record = isRecord(post.record) ? post.record : {};
  const title = text(record.text, 300);
  const authorRec = isRecord(post.author) ? post.author : {};
  const author =
    text(authorRec.displayName, 100) ?? text(authorRec.handle, 100);
  const cover =
    blueskyEmbedThumb(post.embed) ?? blueskyCdnUrl(authorRec.avatar);
  return {
    details: withoutUndefined({ title, author }),
    ...(cover ? { cover } : {}),
  };
}

function blueskyEmbedThumb(embed: unknown): string | undefined {
  if (!isRecord(embed)) {
    return undefined;
  }
  // app.bsky.embed.images#view
  if (Array.isArray(embed.images) && embed.images.length > 0) {
    const image = embed.images[0];
    if (isRecord(image)) {
      return blueskyCdnUrl(image.thumb) ?? blueskyCdnUrl(image.fullsize);
    }
  }
  // app.bsky.embed.recordWithMedia#view — media.images
  if (isRecord(embed.media)) {
    return blueskyEmbedThumb(embed.media);
  }
  return undefined;
}

/**
 * Bluesky CDN images on `cdn.bsky.app` under `/img/{avatar|feed_*}/plain/…`
 * (CIDs have no file extension; typed later by signature).
 */
export function blueskyCdnUrl(value: unknown): string | undefined {
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
    url.hostname !== "cdn.bsky.app" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/img\/(?:avatar|feed_thumbnail|feed_fullsize)\/plain\/did:[a-z0-9]+:[a-zA-Z0-9._%-]+\/[a-z0-9]+$/i.test(
      url.pathname,
    )
  ) {
    return undefined;
  }
  return `https://cdn.bsky.app${url.pathname}`;
}

/** The view API's details and the cover's https URL, if it is on hdslb.com. */
export function parseBilibiliView(body: unknown): {
  details: VideoDetails;
  cover?: string;
} {
  if (!isRecord(body) || body.code !== 0 || !isRecord(body.data)) {
    throw new Error("Unexpected Bilibili response");
  }
  const data = body.data;
  const owner = isRecord(data.owner) ? data.owner : {};
  const duration =
    typeof data.duration === "number" &&
    Number.isInteger(data.duration) &&
    data.duration > 0 &&
    data.duration < 1_000_000
      ? data.duration
      : undefined;
  const cover = coverUrl(data.pic);
  return {
    details: withoutUndefined({
      title: text(data.title, 300),
      author: text(owner.name, 100),
      duration,
    }),
    ...(cover ? { cover } : {}),
  };
}

export function coverUrl(value: unknown): string | undefined {
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
    !/^https?:$/.test(url.protocol) ||
    !COVER_HOSTS.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/bfs\/[A-Za-z0-9_\-/]+\.(?:jpg|jpeg|png|webp|gif)$/i.test(url.pathname)
  ) {
    return undefined;
  }
  return `https://${url.hostname}${url.pathname}`;
}

/** A data URL typed by the image's own signature, not the server's header. */
export function imageDataUrl(bytes: Uint8Array): string {
  const type = SIGNATURES.find(([, matches]) => matches(bytes))?.[0];
  if (!type) {
    throw new Error("Unrecognised image");
  }
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to));
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
