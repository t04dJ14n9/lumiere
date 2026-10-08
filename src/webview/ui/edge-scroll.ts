export interface PointerPoint {
  x: number;
  y: number;
}

/** Scroll a captured drag without requiring another pointermove event. */
export class EdgeScroll {
  private point?: PointerPoint;
  private frame?: number;
  private previous?: number;
  private events?: AbortController;
  private resize?: ResizeObserver;
  private remainder = { x: 0, y: 0 };

  constructor(
    private readonly viewport: HTMLElement,
    private readonly content: HTMLElement,
    private readonly update: (point: PointerPoint) => void,
  ) {}

  move(point: PointerPoint): void {
    if (!this.point) {
      this.events = new AbortController();
      const schedule = (): void => this.schedule();
      this.viewport.addEventListener("scroll", schedule, {
        passive: true,
        signal: this.events.signal,
      });
      window.addEventListener("resize", schedule, {
        signal: this.events.signal,
      });
      this.resize = new ResizeObserver(schedule);
      this.resize.observe(this.viewport);
      this.resize.observe(this.content);
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
    this.previous = undefined;
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  private tick(time: number): void {
    this.frame = undefined;
    const point = this.point;
    if (!point || !this.content.isConnected || !this.viewport.isConnected) {
      this.stop();
      return;
    }
    const bounds = this.viewport.getBoundingClientRect();
    const left = Math.max(0, bounds.left + this.viewport.clientLeft);
    const top = Math.max(0, bounds.top + this.viewport.clientTop);
    const right = Math.min(
      innerWidth,
      bounds.left + this.viewport.clientLeft + this.viewport.clientWidth,
    );
    const bottom = Math.min(
      innerHeight,
      bounds.top + this.viewport.clientTop + this.viewport.clientHeight,
    );
    const elapsed =
      this.previous === undefined ? 16 : Math.min(50, time - this.previous);
    this.previous = time;
    const x = this.distance("x", edgeVelocity(point.x, left, right), elapsed);
    const y = this.distance("y", edgeVelocity(point.y, top, bottom), elapsed);
    const beforeX = this.viewport.scrollLeft;
    const beforeY = this.viewport.scrollTop;
    this.viewport.scrollBy({ left: x, top: y, behavior: "instant" });
    this.update(point);
    if (
      this.point &&
      (this.viewport.scrollLeft !== beforeX ||
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
    this.point = undefined;
    this.remainder = { x: 0, y: 0 };
    this.events?.abort();
    this.events = undefined;
    this.resize?.disconnect();
    this.resize = undefined;
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
  }

  destroy(): void {
    this.stop();
  }
}

function edgeVelocity(position: number, from: number, to: number): number {
  const edge = Math.min((to - from) / 3, 16 * devicePixelRatio);
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
