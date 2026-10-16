export interface PointerPoint {
  x: number;
  y: number;
}

/** Note scroller (vertical) plus optional nested horizontal scroller. */
export interface DragViewports {
  vertical: HTMLElement;
  horizontal?: HTMLElement;
}

export interface EdgeScrollOptions {
  horizontal?: HTMLElement | undefined;
  /** Pixels per millisecond; callers may supply a different edge-speed curve. */
  velocity?: typeof edgeVelocity;
}

/**
 * Scroll a captured drag without requiring another pointermove event.
 * Wide tables keep their own horizontal scroller (`.table-scroll`) while the
 * note scroller owns vertical motion, so callers may pass a separate
 * horizontal viewport.
 */
export class EdgeScroll {
  private point?: PointerPoint;
  private frame?: number;
  private previous?: number;
  private events?: AbortController;
  private resize?: ResizeObserver;
  private remainder = { x: 0, y: 0 };
  private readonly horizontal: HTMLElement;
  private readonly velocity: typeof edgeVelocity;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly content: HTMLElement,
    private readonly update: (point: PointerPoint) => void,
    options: EdgeScrollOptions = {},
  ) {
    const { horizontal } = options;
    this.horizontal = horizontal ?? viewport;
    this.velocity = options.velocity ?? edgeVelocity;
  }

  move(point: PointerPoint): void {
    if (!this.point) {
      this.events = new AbortController();
      const schedule = (): void => this.schedule();
      for (const target of new Set([this.viewport, this.horizontal])) {
        target.addEventListener("scroll", schedule, {
          passive: true,
          signal: this.events.signal,
        });
        this.resize ??= new ResizeObserver(schedule);
        this.resize.observe(target);
      }
      window.addEventListener("resize", schedule, {
        signal: this.events.signal,
      });
      this.resize!.observe(this.content);
    }
    this.point = point;
    this.schedule();
  }

  private schedule(): void {
    if (!this.point || this.frame !== undefined) {
      return;
    }
    // Use the animation clock consistently. Its first timestamp can precede
    // performance.now() sampled while handling the pointer event.
    delete this.previous;
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  private tick(time: number): void {
    delete this.frame;
    const point = this.point;
    if (
      !point ||
      !this.content.isConnected ||
      !this.viewport.isConnected ||
      !this.horizontal.isConnected
    ) {
      this.stop();
      return;
    }
    const verticalBounds = visibleBounds(this.viewport);
    const horizontalBounds = visibleBounds(this.horizontal);
    const elapsed =
      this.previous === undefined ? 16 : Math.min(50, time - this.previous);
    this.previous = time;
    const x = this.distance(
      "x",
      this.velocity(point.x, horizontalBounds.left, horizontalBounds.right),
      elapsed,
    );
    const y = this.distance(
      "y",
      this.velocity(point.y, verticalBounds.top, verticalBounds.bottom),
      elapsed,
    );
    const beforeX = this.horizontal.scrollLeft;
    const beforeY = this.viewport.scrollTop;
    this.horizontal.scrollBy({ left: x, top: 0, behavior: "instant" });
    this.viewport.scrollBy({ left: 0, top: y, behavior: "instant" });
    this.update(point);
    if (
      this.point &&
      (this.horizontal.scrollLeft !== beforeX ||
        this.viewport.scrollTop !== beforeY ||
        (x === 0 && this.remainder.x !== 0) ||
        (y === 0 && this.remainder.y !== 0))
    ) {
      this.frame = requestAnimationFrame((next) => this.tick(next));
    }
  }

  private distance(axis: "x" | "y", velocity: number, elapsed: number): number {
    // CSSOM may round scroll positions to whole pixels. Retain slow movement
    // near the edge threshold until it adds up to a visible scroll.
    const distance = velocity ? velocity * elapsed + this.remainder[axis] : 0;
    const pixels = Math.trunc(distance);
    this.remainder[axis] = distance - pixels;
    return pixels;
  }

  stop(): void {
    delete this.point;
    this.remainder = { x: 0, y: 0 };
    this.events?.abort();
    delete this.events;
    this.resize?.disconnect();
    delete this.resize;
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
      delete this.frame;
    }
  }

  destroy(): void {
    this.stop();
  }
}

/** Visible client area of a scrollport, clipped to the window. */
export function visibleBounds(element: HTMLElement): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const bounds = element.getBoundingClientRect();
  return {
    left: Math.max(0, bounds.left + element.clientLeft),
    top: Math.max(0, bounds.top + element.clientTop),
    right: Math.min(
      innerWidth,
      bounds.left + element.clientLeft + element.clientWidth,
    ),
    bottom: Math.min(
      innerHeight,
      bounds.top + element.clientTop + element.clientHeight,
    ),
  };
}

export function edgeVelocity(
  position: number,
  from: number,
  to: number,
): number {
  const dpr = globalThis.devicePixelRatio || 1;
  const edge = Math.min((to - from) / 3, 16 * dpr);
  if (edge <= 0) {
    return 0;
  }
  if (position < from + edge) {
    return (-2 * (from + edge - position)) / edge;
  }
  if (position > to - edge) {
    return (2 * (position - to + edge)) / edge;
  }
  return 0;
}
