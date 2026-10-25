/**
 * Serial Mermaid work with near-viewport settle, ahead-of-time idle prefetch,
 * and an SVG cache.
 *
 * Live Preview mounts diagram shells across a wide document hot band. Mermaid
 * mutates shared engine state, so renders stay serial. A superfast wheel would
 * otherwise enqueue dozens of renders and starve on-screen diagrams.
 *
 * Strategy:
 * 1. Cache hit → paint immediately (no Mermaid).
 * 2. Idle prefetch on mount → fill the cache without painting.
 * 3. Near-viewport settle → paint from cache, or run Mermaid at paint priority.
 * 4. Dispose cancels unpainted work. Finished prefetches (while still mounted)
 *    land in the cache so a remount / revisit paints instantly.
 */

export type VisibilityWatch = (
  element: Element,
  onVisible: (visible: boolean) => void,
) => () => void;

export type MermaidRenderFn = (source: string) => Promise<string>;

export type IdleScheduler = (run: () => void) => () => void;

export interface MermaidViewportSchedulerOptions {
  watch: VisibilityWatch;
  render: MermaidRenderFn;
  /** Require continuous near-viewport time before painting (default 80). */
  settleMs?: number;
  /** Shared SVG cache; defaults to a module-local LRU. */
  cache?: MermaidSvgCache;
  /**
   * Ahead-of-time prefetch trigger. Defaults to `requestIdleCallback` (2s
   * timeout) or a short `setTimeout` fallback.
   */
  scheduleIdle?: IdleScheduler;
  /** Cache key for a diagram source (theme / trust / source). Defaults to source. */
  cacheKey?: (source: string) => string;
}

export interface MermaidScheduleHandlers {
  onSvg: (svg: string) => void;
  onError?: (error: unknown) => void;
}

type JobKind = "prefetch" | "paint";

interface Job {
  source: string;
  handlers: MermaidScheduleHandlers;
  kind: JobKind;
  cancelled: boolean;
  painted: boolean;
  queued: boolean;
  settled: boolean;
}

/** LRU cache of rendered Mermaid SVG keyed by diagram source (or caller key). */
export class MermaidSvgCache {
  private readonly entries = new Map<string, string>();

  constructor(private readonly maxEntries = 64) {}

  get(key: string): string | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      return undefined;
    }
    // Refresh LRU order.
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, svg: string): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, svg);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}

const defaultCache = new MermaidSvgCache();

/**
 * Default near-viewport observer. `rootMargin` keeps a short warm band so
 * Mermaid can finish just before the diagram enters the screen. An initial
 * `getBoundingClientRect` check starts settle immediately for connected
 * near-viewport fences without waiting on IntersectionObserver.
 */
export function observeNearViewport(
  element: Element,
  onVisible: (visible: boolean) => void,
  rootMargin = "200px",
): () => void {
  const marginPx = Number.parseFloat(rootMargin) || 0;
  if (typeof IntersectionObserver !== "function") {
    onVisible(true);
    return () => {};
  }
  if (isNearViewport(element, marginPx)) {
    onVisible(true);
  }
  const observer = new IntersectionObserver(
    (entries) => {
      const visible =
        entries.some((entry) => entry.isIntersecting) ||
        isNearViewport(element, marginPx);
      onVisible(visible);
    },
    { root: null, rootMargin, threshold: 0 },
  );
  observer.observe(element);
  return () => observer.disconnect();
}

function isNearViewport(element: Element, marginPx: number): boolean {
  if (
    !element.isConnected ||
    typeof element.getBoundingClientRect !== "function" ||
    typeof window === "undefined"
  ) {
    return false;
  }
  const vh = window.innerHeight || 0;
  const vw = window.innerWidth || 0;
  if (vh <= 0 || vw <= 0) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return (
    rect.bottom >= -marginPx &&
    rect.top <= vh + marginPx &&
    rect.right >= -marginPx &&
    rect.left <= vw + marginPx
  );
}

function defaultScheduleIdle(run: () => void): () => void {
  const idle = (
    globalThis as typeof globalThis & {
      requestIdleCallback?: (
        callback: () => void,
        opts?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    }
  ).requestIdleCallback;
  const cancelIdle = (
    globalThis as typeof globalThis & {
      cancelIdleCallback?: (id: number) => void;
    }
  ).cancelIdleCallback;
  if (typeof idle === "function") {
    const id = idle(run, { timeout: 2000 });
    return () => cancelIdle?.(id);
  }
  const timer = setTimeout(run, 120);
  return () => clearTimeout(timer);
}

export class MermaidViewportScheduler {
  private readonly settleMs: number;
  private readonly watch: VisibilityWatch;
  private readonly render: MermaidRenderFn;
  private readonly cache: MermaidSvgCache;
  private readonly scheduleIdle: IdleScheduler;
  private readonly cacheKey: (source: string) => string;
  private queue: Promise<void> = Promise.resolve();
  private readonly paintWaiters: Job[] = [];
  private readonly prefetchWaiters: Job[] = [];
  private draining = false;

  constructor(options: MermaidViewportSchedulerOptions) {
    this.settleMs = options.settleMs ?? 80;
    this.watch = options.watch;
    this.render = options.render;
    this.cache = options.cache ?? defaultCache;
    this.scheduleIdle = options.scheduleIdle ?? defaultScheduleIdle;
    this.cacheKey = options.cacheKey ?? ((source) => source);
  }

  /** Wait until the serial queue drains (tests). */
  whenIdle(): Promise<void> {
    return this.queue.then(() => undefined);
  }

  /**
   * Prefetch on idle; paint on near-viewport settle (or immediately from cache).
   * Returns a disposer that cancels unpainted work.
   */
  schedule(
    element: Element,
    source: string,
    handlers: MermaidScheduleHandlers,
  ): () => void {
    const cached = this.cache.get(this.cacheKey(source));
    if (cached !== undefined) {
      handlers.onSvg(cached);
      return () => {};
    }
    const job: Job = {
      source,
      handlers,
      kind: "prefetch",
      cancelled: false,
      painted: false,
      queued: false,
      settled: false,
    };
    const cancelIdle = this.scheduleIdle(() => {
      if (!job.cancelled && !job.painted && !job.queued) {
        this.enqueue(job, "prefetch");
      }
    });
    const stopWatch = this.watchSettle(element, job);
    return () => {
      job.cancelled = true;
      cancelIdle();
      stopWatch();
    };
  }

  /** Near-viewport settle → paint from cache or enqueue at paint priority. */
  private watchSettle(element: Element, job: Job): () => void {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const clearSettle = () => {
      if (settleTimer !== undefined) {
        clearTimeout(settleTimer);
        settleTimer = undefined;
      }
    };
    const unwatch = this.watch(element, (visible) => {
      if (job.painted) {
        return;
      }
      if (!visible) {
        clearSettle();
        job.settled = false;
        return;
      }
      if (job.settled || settleTimer !== undefined) {
        return;
      }
      settleTimer = setTimeout(() => {
        settleTimer = undefined;
        this.onSettled(job);
      }, this.settleMs);
    });
    return () => {
      clearSettle();
      unwatch();
    };
  }

  private onSettled(job: Job): void {
    if (job.cancelled || job.painted) {
      return;
    }
    job.settled = true;
    const hit = this.cache.get(this.cacheKey(job.source));
    if (hit !== undefined) {
      job.painted = true;
      job.handlers.onSvg(hit);
      return;
    }
    this.enqueue(job, "paint");
  }

  private enqueue(job: Job, kind: JobKind): void {
    job.kind = kind;
    if (kind === "paint") {
      const prefetchIndex = this.prefetchWaiters.indexOf(job);
      if (prefetchIndex >= 0) {
        this.prefetchWaiters.splice(prefetchIndex, 1);
      }
      if (!this.paintWaiters.includes(job)) {
        this.paintWaiters.push(job);
      }
    } else if (!job.queued && !this.prefetchWaiters.includes(job)) {
      this.prefetchWaiters.push(job);
    }
    job.queued = true;
    this.drain();
  }

  private drain(): void {
    if (this.draining) {
      return;
    }
    this.draining = true;
    this.queue = this.queue
      .then(async () => {
        for (;;) {
          const job = this.paintWaiters.shift() ?? this.prefetchWaiters.shift();
          if (!job) {
            return;
          }
          await this.runJob(job);
        }
      })
      .finally(() => {
        this.draining = false;
        if (this.paintWaiters.length > 0 || this.prefetchWaiters.length > 0) {
          this.drain();
        }
      });
  }

  private async runJob(job: Job): Promise<void> {
    // Dispose / flash-away: skip. Prefetch only warms the cache while mounted.
    if (job.cancelled) {
      job.queued = false;
      return;
    }
    const key = this.cacheKey(job.source);
    const existing = this.cache.get(key);
    if (existing !== undefined) {
      job.queued = false;
      if (job.settled && !job.painted) {
        job.painted = true;
        job.handlers.onSvg(existing);
      }
      return;
    }
    try {
      const svg = await this.render(job.source);
      this.cache.set(key, svg);
      job.queued = false;
      if (job.cancelled || job.painted) {
        return;
      }
      if (job.kind === "paint" || job.settled) {
        job.painted = true;
        job.handlers.onSvg(svg);
      }
    } catch (error) {
      job.queued = false;
      if (!job.cancelled && (job.kind === "paint" || job.settled)) {
        job.handlers.onError?.(error);
      }
    }
  }
}
