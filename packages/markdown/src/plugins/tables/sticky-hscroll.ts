/**
 * Sticky horizontal scrollbar for tall wide tables (BH-016).
 *
 * `.table-scroll` grows with the table (`overflow-y: hidden`), so the native
 * horizontal scrollbar sits only at the table bottom. While that native bar is
 * below the note viewport, a sticky custom scrollbar stays at the bottom of the
 * visible note and drives `.table-scroll.scrollLeft` directly.
 */

export type StickyHScrollLayout = {
  overflowsX: boolean;
  tableTop: number;
  tableBottom: number;
  viewportTop: number;
  viewportBottom: number;
  scrollbar: number;
};

/** Whether the sticky mirror should be shown for this layout. */
export function stickyHScrollVisible(layout: StickyHScrollLayout): boolean {
  if (!layout.overflowsX) {
    return false;
  }
  if (
    layout.tableBottom <= layout.viewportTop ||
    layout.tableTop >= layout.viewportBottom
  ) {
    return false;
  }
  const nativeTop = layout.tableBottom - layout.scrollbar;
  return nativeTop > layout.viewportBottom - 0.5;
}

/** Sticky `top` so the bar rides the bottom edge of the note scrollport. */
export function stickyHScrollTop(
  viewportHeight: number,
  barHeight: number,
): number {
  return Math.max(0, viewportHeight - barHeight);
}

export function stickyThumbMetrics(
  clientWidth: number,
  scrollWidth: number,
  scrollLeft: number,
): { thumbWidth: number; thumbLeft: number; maxLeft: number } {
  const maxLeft = Math.max(0, scrollWidth - clientWidth);
  if (maxLeft <= 0 || clientWidth <= 0) {
    return { thumbWidth: clientWidth, thumbLeft: 0, maxLeft: 0 };
  }
  const thumbWidth = Math.max(24, (clientWidth / scrollWidth) * clientWidth);
  const travel = clientWidth - thumbWidth;
  const thumbLeft = travel <= 0 ? 0 : (scrollLeft / maxLeft) * travel;
  return { thumbWidth, thumbLeft, maxLeft };
}

/**
 * Owns the sticky custom scrollbar and drives `.table-scroll.scrollLeft`.
 */
export class TableStickyHScroll {
  readonly root: HTMLElement;
  private readonly track: HTMLElement;
  private readonly thumb: HTMLElement;
  private readonly events = new AbortController();
  private frame?: number;
  private resize?: ResizeObserver;
  private drag?: { startX: number; startLeft: number };

  constructor(
    private readonly tableScroll: HTMLElement,
    private readonly noteScroll: HTMLElement,
    private readonly barHeight = 14,
  ) {
    this.root = document.createElement("div");
    this.root.className = "table-hscroll-sticky";
    this.root.hidden = true;
    this.root.setAttribute("aria-hidden", "true");
    this.track = document.createElement("div");
    this.track.className = "table-hscroll-track";
    this.thumb = document.createElement("div");
    this.thumb.className = "table-hscroll-thumb";
    this.track.append(this.thumb);
    this.root.append(this.track);

    const schedule = (): void => this.schedule();
    this.noteScroll.addEventListener("scroll", schedule, {
      passive: true,
      signal: this.events.signal,
    });
    this.tableScroll.addEventListener("scroll", () => this.paintThumb(), {
      passive: true,
      signal: this.events.signal,
    });
    this.resize = new ResizeObserver(schedule);
    this.resize.observe(this.tableScroll);
    this.resize.observe(this.noteScroll);
    if (this.tableScroll.firstElementChild) {
      this.resize.observe(this.tableScroll.firstElementChild);
    }
    window.addEventListener("resize", schedule, { signal: this.events.signal });

    this.thumb.addEventListener(
      "pointerdown",
      (event) => this.onThumbDown(event),
      { signal: this.events.signal },
    );
    this.track.addEventListener(
      "pointerdown",
      (event) => this.onTrackDown(event),
      { signal: this.events.signal },
    );
    window.addEventListener("pointermove", (event) => this.onDrag(event), {
      signal: this.events.signal,
    });
    window.addEventListener("pointerup", () => this.endDrag(), {
      signal: this.events.signal,
    });
    window.addEventListener("pointercancel", () => this.endDrag(), {
      signal: this.events.signal,
    });
    this.schedule();
  }

  private onThumbDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.drag = {
      startX: event.clientX,
      startLeft: this.tableScroll.scrollLeft,
    };
    this.thumb.setPointerCapture(event.pointerId);
  }

  private onTrackDown(event: PointerEvent): void {
    if (event.button !== 0 || event.target === this.thumb) {
      return;
    }
    event.preventDefault();
    const bounds = this.track.getBoundingClientRect();
    const metrics = stickyThumbMetrics(
      this.tableScroll.clientWidth,
      this.tableScroll.scrollWidth,
      this.tableScroll.scrollLeft,
    );
    const click = event.clientX - bounds.left - metrics.thumbWidth / 2;
    const travel = bounds.width - metrics.thumbWidth;
    if (travel <= 0 || metrics.maxLeft <= 0) {
      return;
    }
    this.tableScroll.scrollLeft =
      (Math.max(0, Math.min(travel, click)) / travel) * metrics.maxLeft;
    this.paintThumb();
  }

  private onDrag(event: PointerEvent): void {
    if (!this.drag) {
      return;
    }
    const metrics = stickyThumbMetrics(
      this.tableScroll.clientWidth,
      this.tableScroll.scrollWidth,
      this.tableScroll.scrollLeft,
    );
    const travel = this.track.clientWidth - metrics.thumbWidth;
    if (travel <= 0 || metrics.maxLeft <= 0) {
      return;
    }
    const delta = event.clientX - this.drag.startX;
    this.tableScroll.scrollLeft =
      this.drag.startLeft + (delta / travel) * metrics.maxLeft;
    this.paintThumb();
  }

  private endDrag(): void {
    delete this.drag;
  }

  private schedule(): void {
    if (this.frame !== undefined) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      delete this.frame;
      this.measure();
    });
  }

  /** Recompute visibility, sticky top, and thumb geometry. */
  measure(): void {
    if (!this.tableScroll.isConnected || !this.noteScroll.isConnected) {
      return;
    }
    const overflowsX =
      this.tableScroll.scrollWidth > this.tableScroll.clientWidth + 1;
    const table = this.tableScroll.getBoundingClientRect();
    const note = this.noteScroll.getBoundingClientRect();
    const scrollbar = Math.max(
      this.barHeight,
      this.tableScroll.offsetHeight - this.tableScroll.clientHeight,
    );
    const visible = stickyHScrollVisible({
      overflowsX,
      tableTop: table.top,
      tableBottom: table.bottom,
      viewportTop: note.top,
      viewportBottom: note.bottom,
      scrollbar,
    });
    this.root.hidden = !visible;
    if (!visible) {
      return;
    }
    this.root.style.top = `${stickyHScrollTop(this.noteScroll.clientHeight, this.barHeight)}px`;
    this.paintThumb();
  }

  private paintThumb(): void {
    const metrics = stickyThumbMetrics(
      this.tableScroll.clientWidth,
      this.tableScroll.scrollWidth,
      this.tableScroll.scrollLeft,
    );
    this.thumb.style.width = `${metrics.thumbWidth}px`;
    this.thumb.style.transform = `translateX(${metrics.thumbLeft}px)`;
  }

  destroy(): void {
    this.events.abort();
    this.resize?.disconnect();
    delete this.resize;
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
      delete this.frame;
    }
    this.root.remove();
  }
}
