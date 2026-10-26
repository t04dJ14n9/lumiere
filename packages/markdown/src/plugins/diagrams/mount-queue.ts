/**
 * Mermaid work, started as soon as a diagram is in the page.
 *
 * CodeMirror mounts block widgets for its viewport plus a margin of about
 * 1000 px, so a diagram mounts about a screen before it scrolls into view.
 * Obsidian renders at that moment too. Rendering then, rather than once the
 * diagram is on screen and scrolling has stopped, means a reader finds the
 * diagram drawn, and its height changes while it is still off screen, where
 * CodeMirror's scroll anchoring hides the change.
 *
 * Mermaid keeps shared state, so renders run one at a time. Each starts just
 * after a frame, so a run of diagrams mounting together costs a frame each
 * instead of one long task. A diagram that left the page before its turn
 * waits until it is mounted again, and the one nearest the view goes first.
 *
 * While the reader scrolls, diagrams behind them (above, scrolling down)
 * wait until the scroll stops. Drawing one changes the height above the
 * view, and CodeMirror keeps the text still by moving the scroll position,
 * which fights a scroll in flight; the reader has left it behind anyway.
 */

import { RENDER_REMOUNT_EVENT } from "../render/api";

/** Calls `onMount` each time `element` is put in the page; returns a stop. */
export type MountWatch = (element: Element, onMount: () => void) => () => void;

export interface MermaidQueueOptions {
  render: (source: string) => Promise<string>;
  /** The cache key of a source (theme, trust and source); the source by default. */
  cacheKey?: (source: string) => string;
  cache?: MermaidSvgCache;
  watchMount?: MountWatch;
  /** Resolves just after the next frame. */
  afterFrame?: () => Promise<void>;
  /**
   * Pixels between an element and the visible part of the note: positive
   * below it, negative above it, 0 when on screen.
   */
  offset?: (element: Element) => number;
  /** Which way the reader is scrolling: 1 down, -1 up, 0 when still. */
  scrolling?: () => -1 | 0 | 1;
}

export interface MermaidHandlers {
  onSvg: (svg: string) => void;
  onError?: (error: unknown) => void;
}

interface Job {
  readonly element: Element;
  readonly source: string;
  readonly key: string;
  readonly handlers: MermaidHandlers;
  isDone: boolean;
  stopWatching: () => void;
}

/** Least recently used SVG by cache key, shared by every editor in the webview. */
export class MermaidSvgCache {
  private readonly entries = new Map<string, string>();

  constructor(private readonly maxEntries = 64) {}

  get(key: string): string | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, svg: string): void {
    this.entries.delete(key);
    this.entries.set(key, svg);
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }
}

const sharedCache = new MermaidSvgCache();

/**
 * A diagram is taken up when it is scheduled, which happens as its block is
 * built, just before CodeMirror puts it in the page (the queue checks after
 * a frame), and again each time its block is mounted after being scrolled
 * out (RENDER_REMOUNT_EVENT, from MarkdownBlock).
 */
export function watchMount(element: Element, onMount: () => void): () => void {
  element.addEventListener?.(RENDER_REMOUNT_EVENT, onMount);
  onMount();
  return () => element.removeEventListener?.(RENDER_REMOUNT_EVENT, onMount);
}

function afterNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

/**
 * Where an element is from the visible part of its scroller (the note's
 * `.cm-scroller`, which can be shorter than the window). Read just after a
 * frame, when layout is clean, so this forces no layout.
 */
function offsetFromView(element: Element): number {
  if (typeof element.getBoundingClientRect !== "function") {
    return 0;
  }
  const rect = element.getBoundingClientRect();
  const view = element.closest?.(".cm-scroller")?.getBoundingClientRect() ?? {
    top: 0,
    bottom: window.innerHeight,
  };
  if (rect.bottom < view.top) {
    return rect.bottom - view.top;
  }
  return Math.max(0, rect.top - view.bottom);
}

/** How long after the last scroll event the reader counts as still. */
const STILL_AFTER_MS = 150;

/**
 * Follows scrolling anywhere in `target` with one passive listener: which
 * way the last scroll went, until it has been still for a moment.
 */
export function followScrolling(target: Document): {
  direction: () => -1 | 0 | 1;
  stop: () => void;
} {
  const tops = new WeakMap<EventTarget, number>();
  let direction: -1 | 1 = 1;
  let at = -Infinity;
  const onScroll = (event: Event) => {
    const scroller = event.target;
    const top =
      scroller instanceof Element
        ? scroller.scrollTop
        : (target.scrollingElement?.scrollTop ?? 0);
    const previous = scroller ? tops.get(scroller) : undefined;
    if (scroller) {
      tops.set(scroller, top);
    }
    if (previous !== undefined && top !== previous) {
      direction = top > previous ? 1 : -1;
      at = performance.now();
    }
  };
  const options = { capture: true, passive: true } as const;
  target.addEventListener("scroll", onScroll, options);
  return {
    direction: () => (performance.now() - at < STILL_AFTER_MS ? direction : 0),
    stop: () => target.removeEventListener("scroll", onScroll, options),
  };
}

export class MermaidQueue {
  private readonly render: (source: string) => Promise<string>;
  private readonly cacheKey: (source: string) => string;
  private readonly cache: MermaidSvgCache;
  private readonly watchMount: MountWatch;
  private readonly afterFrame: () => Promise<void>;
  private readonly offset: (element: Element) => number;
  private readonly scrolling: () => -1 | 0 | 1;
  private readonly stopFollowing: () => void = () => {};
  /** Mounted diagrams waiting for their turn. */
  private readonly waiting = new Set<Job>();
  private running: Promise<void> | undefined;

  constructor(options: MermaidQueueOptions) {
    this.render = options.render;
    this.cacheKey = options.cacheKey ?? ((source) => source);
    this.cache = options.cache ?? sharedCache;
    this.watchMount = options.watchMount ?? watchMount;
    this.afterFrame = options.afterFrame ?? afterNextFrame;
    this.offset = options.offset ?? offsetFromView;
    if (options.scrolling) {
      this.scrolling = options.scrolling;
    } else if (typeof document !== "undefined") {
      const following = followScrolling(document);
      this.scrolling = following.direction;
      this.stopFollowing = following.stop;
    } else {
      this.scrolling = () => 0;
    }
  }

  /** Stop following the reader's scrolling. */
  dispose(): void {
    this.stopFollowing();
  }

  /** Paint `source` into `element` when its turn comes; returns a cancel. */
  schedule(
    element: Element,
    source: string,
    handlers: MermaidHandlers,
  ): () => void {
    const key = this.cacheKey(source);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      handlers.onSvg(cached);
      return () => {};
    }
    const job: Job = {
      element,
      source,
      key,
      handlers,
      isDone: false,
      stopWatching: () => {},
    };
    job.stopWatching = this.watchMount(element, () => this.enqueue(job));
    return () => this.finish(job);
  }

  /** Resolves when no diagram is waiting or rendering (tests). */
  async whenIdle(): Promise<void> {
    while (this.running) {
      await this.running;
    }
  }

  private enqueue(job: Job): void {
    if (job.isDone) {
      return;
    }
    this.waiting.add(job);
    this.startDrain();
  }

  private startDrain(): void {
    if (this.running) {
      return;
    }
    this.running = this.drain().finally(() => {
      this.running = undefined;
      // A diagram queued after the loop's last check, before this runs.
      if (this.waiting.size > 0) {
        this.startDrain();
      }
    });
  }

  private async drain(): Promise<void> {
    while (this.waiting.size > 0) {
      await this.afterFrame();
      const job = this.nearest();
      if (job) {
        this.waiting.delete(job);
        await this.run(job);
      }
    }
  }

  /**
   * The waiting diagram nearest the view, leaving out those behind a reader
   * who is scrolling; unmounted ones leave the queue.
   */
  private nearest(): Job | undefined {
    const direction = this.scrolling();
    let best: Job | undefined;
    let bestDistance = Infinity;
    for (const job of this.waiting) {
      if (job.isDone || job.element.isConnected === false) {
        this.waiting.delete(job);
        continue;
      }
      const offset = this.offset(job.element);
      if (offset * direction < 0) {
        continue;
      }
      const distance = Math.abs(offset);
      if (distance < bestDistance) {
        best = job;
        bestDistance = distance;
      }
    }
    return best;
  }

  private async run(job: Job): Promise<void> {
    let svg = this.cache.get(job.key);
    try {
      if (svg === undefined) {
        svg = await this.render(job.source);
        this.cache.set(job.key, svg);
      }
    } catch (error) {
      if (!job.isDone) {
        this.finish(job);
        job.handlers.onError?.(error);
      }
      return;
    }
    if (!job.isDone) {
      this.finish(job);
      job.handlers.onSvg(svg);
    }
  }

  private finish(job: Job): void {
    job.isDone = true;
    job.stopWatching();
    this.waiting.delete(job);
  }
}
