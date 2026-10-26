/**
 * Serial Mermaid work with near-viewport scroll settle, frame yielding between
 * consecutive renders, and an SVG cache (matching Obsidian's `Fj` / `Oj`).
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
  /** Optional ahead-of-time prefetch trigger (no-op by default in browser). */
  scheduleIdle?: IdleScheduler;
  /** Cache key for a diagram source (theme / trust / source). Defaults to source. */
  cacheKey?: (source: string) => string;
  /** Optional frame yield between consecutive serial renders. */
  yieldBetweenJobs?: () => Promise<void>;
}

export interface MermaidScheduleHandlers {
  onSvg: (svg: string) => void;
  onError?: (error: unknown) => void;
}

type JobKind = "prefetch" | "paint";

interface Job {
  element: Element;
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

let lastBrowserScrollAt = -Infinity;
let scrollListenerAttached = false;

function ensureBrowserScrollListener(): void {
  if (
    scrollListenerAttached ||
    typeof window === "undefined" ||
    typeof window.addEventListener !== "function"
  ) {
    return;
  }
  scrollListenerAttached = true;
  const markScroll = () => {
    lastBrowserScrollAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();
  };
  window.addEventListener("scroll", markScroll, {
    capture: true,
    passive: true,
  });
  window.addEventListener("wheel", markScroll, {
    capture: true,
    passive: true,
  });
}

function remainingScrollSettleMs(settleMs: number): number {
  if (!scrollListenerAttached || settleMs <= 0) {
    return 0;
  }
  const now =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsed = now - lastBrowserScrollAt;
  return elapsed < settleMs ? Math.ceil(settleMs - elapsed) : 0;
}

export function observeNearViewport(
  element: Element,
  onVisible: (visible: boolean) => void,
  rootMargin = "200px",
): () => void {
  ensureBrowserScrollListener();
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

/**
 * Do not run background idle prefetch by default: `mermaid.render()` runs
 * synchronous D3/dagre layout on the main UI thread.
 */
function defaultScheduleIdle(): () => void {
  return () => {};
}

function defaultYieldBetweenJobs(settleMs: number): () => Promise<void> {
  return async () => {
    const raf = (
      globalThis as typeof globalThis & {
        requestAnimationFrame?: (cb: () => void) => number;
      }
    ).requestAnimationFrame;
    if (typeof raf === "function") {
      await new Promise<void>((resolve) => raf(() => resolve()));
    }
    for (;;) {
      const waitMs = remainingScrollSettleMs(settleMs);
      if (waitMs <= 0) {
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
  };
}

export class MermaidViewportScheduler {
  private readonly settleMs: number;
  private readonly watch: VisibilityWatch;
  private readonly render: MermaidRenderFn;
  private readonly cache: MermaidSvgCache;
  private readonly scheduleIdle: IdleScheduler;
  private readonly cacheKey: (source: string) => string;
  private readonly yieldBetweenJobs: () => Promise<void>;
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
    this.yieldBetweenJobs =
      options.yieldBetweenJobs ?? defaultYieldBetweenJobs(this.settleMs);
  }

  /** Wait until the serial queue drains (tests). */
  whenIdle(): Promise<void> {
    return this.queue.then(() => undefined);
  }

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
      element,
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

  private watchSettle(element: Element, job: Job): () => void {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const clearSettle = () => {
      if (settleTimer !== undefined) {
        clearTimeout(settleTimer);
        settleTimer = undefined;
      }
    };
    const armSettle = (delayMs: number) => {
      settleTimer = setTimeout(() => {
        settleTimer = undefined;
        if (element.isConnected === false) {
          job.settled = false;
          return;
        }
        const scrollWait = remainingScrollSettleMs(this.settleMs);
        if (scrollWait > 0) {
          armSettle(scrollWait);
          return;
        }
        this.onSettled(job);
      }, delayMs);
    };
    const unwatch = this.watch(element, (visible) => {
      if (job.painted) {
        return;
      }
      if (!visible || element.isConnected === false) {
        clearSettle();
        job.settled = false;
        this.dequeuePaint(job);
        return;
      }
      if (!job.settled && settleTimer === undefined) {
        armSettle(this.settleMs);
      }
    });
    return () => {
      clearSettle();
      unwatch();
    };
  }

  private dequeuePaint(job: Job): void {
    if (job.kind === "paint") {
      const idx = this.paintWaiters.indexOf(job);
      if (idx >= 0) {
        this.paintWaiters.splice(idx, 1);
        job.queued = false;
      }
    }
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
          if (remainingScrollSettleMs(this.settleMs) > 0) {
            await this.yieldBetweenJobs();
          }
          const job = this.paintWaiters.shift() ?? this.prefetchWaiters.shift();
          if (!job) {
            return;
          }
          await this.runJob(job);
          if (this.paintWaiters.length > 0 || this.prefetchWaiters.length > 0) {
            await this.yieldBetweenJobs();
          }
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
    if (!isJobRunnable(job)) {
      job.queued = false;
      job.settled = false;
      return;
    }
    const key = this.cacheKey(job.source);
    const existing = this.cache.get(key);
    if (existing !== undefined) {
      job.queued = false;
      paintIfSettled(job, existing);
      return;
    }
    try {
      const svg = await this.render(job.source);
      this.cache.set(key, svg);
      job.queued = false;
      paintIfReady(job, svg);
    } catch (error) {
      job.queued = false;
      reportIfReady(job, error);
    }
  }
}

function isJobRunnable(job: Job): boolean {
  if (job.cancelled) {
    return false;
  }
  return !(job.kind === "paint" && job.element.isConnected === false);
}

function paintIfSettled(job: Job, svg: string): void {
  if (job.settled && !job.painted) {
    job.painted = true;
    job.handlers.onSvg(svg);
  }
}

function paintIfReady(job: Job, svg: string): void {
  if (!job.cancelled && !job.painted && (job.kind === "paint" || job.settled)) {
    job.painted = true;
    job.handlers.onSvg(svg);
  }
}

function reportIfReady(job: Job, error: unknown): void {
  if (!job.cancelled && (job.kind === "paint" || job.settled)) {
    job.handlers.onError?.(error);
  }
}
