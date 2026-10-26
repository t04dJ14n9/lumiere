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
 * waits until it is mounted again, and the one nearest the window goes
 * first.
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
  /** Pixels between an element and the window; 0 when on screen. */
  distance?: (element: Element) => number;
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

/** Read just after a frame, when layout is clean, so this forces no layout. */
function distanceFromWindow(element: Element): number {
  if (typeof element.getBoundingClientRect !== "function") {
    return 0;
  }
  const rect = element.getBoundingClientRect();
  if (rect.bottom < 0) {
    return -rect.bottom;
  }
  return Math.max(0, rect.top - window.innerHeight);
}

export class MermaidQueue {
  private readonly render: (source: string) => Promise<string>;
  private readonly cacheKey: (source: string) => string;
  private readonly cache: MermaidSvgCache;
  private readonly watchMount: MountWatch;
  private readonly afterFrame: () => Promise<void>;
  private readonly distance: (element: Element) => number;
  /** Mounted diagrams waiting for their turn. */
  private readonly waiting = new Set<Job>();
  private running: Promise<void> | undefined;

  constructor(options: MermaidQueueOptions) {
    this.render = options.render;
    this.cacheKey = options.cacheKey ?? ((source) => source);
    this.cache = options.cache ?? sharedCache;
    this.watchMount = options.watchMount ?? watchMount;
    this.afterFrame = options.afterFrame ?? afterNextFrame;
    this.distance = options.distance ?? distanceFromWindow;
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

  /** The waiting diagram nearest the window; unmounted ones leave the queue. */
  private nearest(): Job | undefined {
    let best: Job | undefined;
    let bestDistance = Infinity;
    for (const job of this.waiting) {
      if (job.isDone || job.element.isConnected === false) {
        this.waiting.delete(job);
        continue;
      }
      const distance = this.distance(job.element);
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
