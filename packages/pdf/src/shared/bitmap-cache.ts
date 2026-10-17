/**
 * Page bitmaps, rendered in two qualities the way macOS Preview does:
 *
 * - `low`: a cheap render at about half the displayed size, for the pages around
 *   the one being read, so a page turn shows something at once;
 * - `full`: the render at the displayed size (and pixel ratio), for the pages on
 *   screen, swapped in over the low one when it is ready.
 *
 * The cache owns the object URLs and the render tasks. Memory is bounded: one
 * low bitmap per page, kept only near the pages on screen, and a few full ones
 * that nothing displays any more.
 */

/** The part of EmbedPDF's task this needs. */
export interface RenderTask {
  wait(
    onReady: (blob: unknown) => void,
    onError: (error: unknown) => void,
  ): void;
  abort(reason: { code: number; message: string }): void;
}

export type RenderFn = (
  pageIndex: number,
  scaleFactor: number,
  dpr: number,
) => RenderTask;

export type Quality = "low" | "full";

/** Full bitmaps kept after nothing displays them, for going back a page. */
export const KEPT_FULL_BITMAPS = 6;
/** Pages either side of the pages on screen that get a low bitmap. */
export const PREFETCH_PAGES = 4;
/** The low bitmap's scale, as a fraction of the displayed scale, within these limits. */
const LOW_FRACTION = 0.5;
const LOW_MIN = 0.25;
const LOW_MAX = 0.75;

/** The render scale of a low bitmap for a page shown at `scale`; steps of 0.25 so zooming does not redo them. */
export function lowScale(scale: number): number {
  const wanted = Math.min(LOW_MAX, Math.max(LOW_MIN, scale * LOW_FRACTION));
  return Math.round(wanted * 4) / 4;
}

/** The pages to give a low bitmap: those on screen and `PREFETCH_PAGES` either side. */
export function prefetchRange(
  shown: readonly number[],
  pageCount: number,
): [number, number] | undefined {
  if (shown.length === 0 || pageCount === 0) {
    return undefined;
  }
  return [
    Math.max(0, Math.min(...shown) - PREFETCH_PAGES),
    Math.min(pageCount - 1, Math.max(...shown) + PREFETCH_PAGES),
  ];
}

interface Entry {
  key: string;
  quality: Quality;
  page: number;
  scale: number;
  dpr: number;
  url: string | undefined;
  task: RenderTask | undefined;
  listeners: Set<(url: string) => void>;
  used: number;
}

const CANCELLED = { code: 2, message: "canceled render task" };

export class BitmapCache {
  private readonly entries = new Map<string, Entry>();
  private clock = 0;

  constructor(
    private readonly render: RenderFn,
    private readonly urls: {
      create(blob: unknown, quality: Quality): string;
      revoke(url: string): void;
    },
  ) {}

  private key(
    quality: Quality,
    page: number,
    scale: number,
    dpr: number,
  ): string {
    return `${quality}:${page}@${scale.toFixed(3)}x${dpr.toFixed(2)}`;
  }

  /** The ready bitmap for exactly this request. */
  peek(
    quality: Quality,
    page: number,
    scale: number,
    dpr: number,
  ): string | undefined {
    const entry = this.entries.get(this.key(quality, page, scale, dpr));
    if (entry?.url) {
      entry.used = ++this.clock;
    }
    return entry?.url;
  }

  /** Whether a low bitmap of the page is ready, at this scale. */
  hasLow(page: number, scale: number): boolean {
    return this.entries.get(this.key("low", page, scale, 1))?.url !== undefined;
  }

  /** The newest ready low bitmap of a page, whatever scale it was rendered at. */
  lowOf(page: number): string | undefined {
    let best: Entry | undefined;
    for (const entry of this.entries.values()) {
      if (
        entry.quality === "low" &&
        entry.page === page &&
        entry.url &&
        (!best || entry.used > best.used)
      ) {
        best = entry;
      }
    }
    if (best) {
      best.used = ++this.clock;
    }
    return best?.url;
  }

  /**
   * Ask for a bitmap. `onReady` is called with its URL, at once when it is
   * ready already. Returns a cancel function: when nobody wants a bitmap that
   * is still being rendered, its render is aborted.
   */
  request(
    quality: Quality,
    page: number,
    scale: number,
    dpr: number,
    onReady: (url: string) => void,
  ): () => void {
    const key = this.key(quality, page, scale, dpr);
    let entry = this.entries.get(key);
    if (entry?.url) {
      entry.used = ++this.clock;
      onReady(entry.url);
      return () => undefined;
    }
    if (!entry) {
      entry = {
        key,
        quality,
        page,
        scale,
        dpr,
        url: undefined,
        task: undefined,
        listeners: new Set(),
        used: ++this.clock,
      };
      this.entries.set(key, entry);
      this.start(entry);
    }
    const target = entry;
    target.listeners.add(onReady);
    return () => {
      target.listeners.delete(onReady);
      if (target.listeners.size === 0 && !target.url && target.task) {
        const task = target.task;
        target.task = undefined;
        this.entries.delete(target.key);
        task.abort(CANCELLED);
      }
    };
  }

  private start(entry: Entry): void {
    let task: RenderTask;
    try {
      task = this.render(entry.page, entry.scale, entry.dpr);
    } catch {
      this.entries.delete(entry.key);
      return;
    }
    entry.task = task;
    task.wait(
      (blob) => {
        if (this.entries.get(entry.key) !== entry) {
          return;
        } // cancelled meanwhile
        entry.task = undefined;
        entry.url = this.urls.create(blob, entry.quality);
        entry.used = ++this.clock;
        for (const listener of [...entry.listeners]) {
          listener(entry.url);
        }
        entry.listeners.clear();
        this.trim();
      },
      () => {
        if (this.entries.get(entry.key) === entry) {
          this.entries.delete(entry.key);
        }
      },
    );
  }

  /**
   * Drop what is no longer near: low bitmaps of pages outside `keep`, and all
   * but the newest few ready full bitmaps outside `shown`.
   */
  retain(
    keep: [number, number] | undefined,
    shown: readonly number[] = [],
  ): void {
    for (const entry of [...this.entries.values()]) {
      if (
        entry.quality === "low" &&
        entry.listeners.size === 0 &&
        (!keep || entry.page < keep[0] || entry.page > keep[1])
      ) {
        this.drop(entry);
      }
    }
    // One low bitmap per page: the newest.
    const newest = new Map<number, Entry>();
    for (const entry of this.entries.values()) {
      if (entry.quality !== "low" || !entry.url) {
        continue;
      }
      const other = newest.get(entry.page);
      if (!other) {
        newest.set(entry.page, entry);
      } else if (other.used >= entry.used) {
        this.drop(entry);
      } else {
        this.drop(other);
        newest.set(entry.page, entry);
      }
    }
    this.shown = new Set(shown);
    this.trim();
  }

  private shown = new Set<number>();

  /** Keep the newest `KEPT_FULL_BITMAPS` ready full bitmaps of pages not on screen. */
  private trim(): void {
    const idle = [...this.entries.values()]
      .filter(
        (entry) =>
          entry.quality === "full" && entry.url && !this.shown.has(entry.page),
      )
      .sort((a, b) => b.used - a.used);
    for (const entry of idle.slice(KEPT_FULL_BITMAPS)) {
      this.drop(entry);
    }
  }

  private drop(entry: Entry): void {
    this.entries.delete(entry.key);
    if (entry.task) {
      entry.task.abort(CANCELLED);
    }
    if (entry.url) {
      this.urls.revoke(entry.url);
    }
  }

  /** Release everything: the document closed or the viewer unmounted. */
  dispose(): void {
    for (const entry of [...this.entries.values()]) {
      this.drop(entry);
    }
    this.shown.clear();
  }

  /** How many bitmaps are held, by quality: for tests. */
  size(): { low: number; full: number } {
    const all = [...this.entries.values()].filter((entry) => entry.url);
    return {
      low: all.filter((entry) => entry.quality === "low").length,
      full: all.filter((entry) => entry.quality === "full").length,
    };
  }
}
