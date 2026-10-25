/**
 * Serial Mermaid work gated on near-viewport presence.
 *
 * Live Preview already mounts diagram shells for a wide document hot band
 * (~5 KB). Mermaid itself is expensive and mutates shared engine state, so a
 * superfast wheel through a long note would otherwise enqueue dozens of
 * renders; cancelled mid-flight jobs still occupy the serial queue and starve
 * diagrams that are actually on screen. This scheduler only starts Mermaid
 * after the fence stays intersecting (with rootMargin) for `settleMs`, and
 * drops unpainted work when the fence leaves that band.
 */

export type VisibilityWatch = (
  element: Element,
  onVisible: (visible: boolean) => void,
) => () => void;

export type MermaidRenderFn = (source: string) => Promise<string>;

export interface MermaidViewportSchedulerOptions {
  watch: VisibilityWatch;
  render: MermaidRenderFn;
  /** Require continuous near-viewport time before starting Mermaid. */
  settleMs?: number;
}

export interface MermaidScheduleHandlers {
  onSvg: (svg: string) => void;
  onError?: (error: unknown) => void;
}

interface Job {
  source: string;
  handlers: MermaidScheduleHandlers;
  cancelled: boolean;
  painted: boolean;
  queued: boolean;
}

/**
 * Default near-viewport observer. `rootMargin` keeps a short warm band so
 * Mermaid can finish just before the diagram enters the screen, without the
 * multi-screen document hot band that mounts shells.
 */
export function observeNearViewport(
  element: Element,
  onVisible: (visible: boolean) => void,
  rootMargin = "200px",
): () => void {
  if (typeof IntersectionObserver !== "function") {
    onVisible(true);
    return () => {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      onVisible(entries.some((entry) => entry.isIntersecting));
    },
    { root: null, rootMargin, threshold: 0 },
  );
  observer.observe(element);
  return () => observer.disconnect();
}

export class MermaidViewportScheduler {
  private readonly settleMs: number;
  private readonly watch: VisibilityWatch;
  private readonly render: MermaidRenderFn;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: MermaidViewportSchedulerOptions) {
    this.settleMs = options.settleMs ?? 80;
    this.watch = options.watch;
    this.render = options.render;
  }

  /** Wait until the serial queue drains (tests). */
  whenIdle(): Promise<void> {
    return this.queue.then(() => undefined);
  }

  /**
   * Watch `element` and run Mermaid once it settles near the viewport.
   * Returns a disposer that cancels unpainted work.
   */
  schedule(
    element: Element,
    source: string,
    handlers: MermaidScheduleHandlers,
  ): () => void {
    const job: Job = {
      source,
      handlers,
      cancelled: false,
      painted: false,
      queued: false,
    };
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
      clearSettle();
      if (!visible) {
        // Flash-by: drop any pending settle and mark the job cancelled so a
        // serial queue entry that has not painted yet becomes a no-op.
        job.cancelled = true;
        return;
      }
      job.cancelled = false;
      settleTimer = setTimeout(() => {
        settleTimer = undefined;
        if (job.cancelled || job.painted || job.queued) {
          return;
        }
        job.queued = true;
        this.enqueue(job);
      }, this.settleMs);
    });
    return () => {
      job.cancelled = true;
      clearSettle();
      unwatch();
    };
  }

  private enqueue(job: Job): void {
    this.queue = this.queue.then(async () => {
      if (job.cancelled) {
        job.queued = false;
        return;
      }
      try {
        const svg = await this.render(job.source);
        if (job.cancelled) {
          job.queued = false;
          return;
        }
        job.painted = true;
        job.handlers.onSvg(svg);
      } catch (error) {
        job.queued = false;
        if (!job.cancelled) {
          job.handlers.onError?.(error);
        }
      }
    });
  }
}
