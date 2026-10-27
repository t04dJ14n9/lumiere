/**
 * Sticky horizontal scrollbar for tall wide tables (BH-016).
 *
 * `.table-scroll` grows with the table (`overflow-y: hidden`), so its native
 * horizontal scrollbar sits only at the table's foot. A custom bar right after
 * it is `position: sticky; bottom: 0`: while the foot is below the note
 * viewport the browser keeps the bar on the viewport's bottom edge, and it
 * hides once the native bar is on screen. CSS does all the positioning and
 * observers decide only whether to show the bar, so scrolling the note runs
 * no script and reads no layout, however many wide tables are mounted.
 */

/** Hidden unless the table overflows sideways and its native bar is off screen. */
export function stickyHScrollHidden(state: {
  overflowsX: boolean;
  footVisible: boolean;
}): boolean {
  return !state.overflowsX || state.footVisible;
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

function element(className: string): HTMLElement {
  const created = document.createElement("div");
  created.className = className;
  created.setAttribute("aria-hidden", "true");
  return created;
}

/**
 * Owns the sticky custom scrollbar and drives `.table-scroll.scrollLeft`.
 * It inserts itself right after the table scroller.
 */
export class TableStickyHScroll {
  readonly root = element("table-hscroll-sticky");
  /** Covers the native bar's strip; whether it is on screen hides the mirror. */
  private readonly foot = element("table-hscroll-foot");
  private readonly track = element("table-hscroll-track");
  private readonly thumb = element("table-hscroll-thumb");
  private readonly events = new AbortController();
  private readonly resize: ResizeObserver;
  private readonly footWatch: IntersectionObserver;
  private drag?: { startX: number; startLeft: number };
  private overflowsX = false;
  /** Assumed until the observer reports, so the mirror never flashes over the native bar. */
  private footVisible = true;
  private clientWidth = 0;
  private scrollWidth = 0;

  constructor(
    private readonly tableScroll: HTMLElement,
    noteScroll: HTMLElement,
  ) {
    this.root.hidden = true;
    this.track.append(this.thumb);
    this.root.append(this.track);
    tableScroll.after(this.foot, this.root);
    this.footWatch = new IntersectionObserver(
      (entries) => {
        this.footVisible = entries[entries.length - 1]?.isIntersecting ?? true;
        this.show();
      },
      { root: noteScroll },
    );
    this.resize = new ResizeObserver(() => this.measureOverflow());
    this.resize.observe(tableScroll);
    if (tableScroll.firstElementChild) {
      this.resize.observe(tableScroll.firstElementChild);
    }
    this.registerPointer();
    tableScroll.addEventListener("scroll", () => this.paintThumb(), {
      passive: true,
      signal: this.events.signal,
    });
  }

  private registerPointer(): void {
    const { signal } = this.events;
    this.thumb.addEventListener(
      "pointerdown",
      (event) => this.onThumbDown(event),
      { signal },
    );
    this.track.addEventListener(
      "pointerdown",
      (event) => this.onTrackDown(event),
      { signal },
    );
    window.addEventListener("pointermove", (event) => this.onDrag(event), {
      signal,
    });
    window.addEventListener("pointerup", () => this.endDrag(), { signal });
    window.addEventListener("pointercancel", () => this.endDrag(), { signal });
  }

  /**
   * ResizeObserver reports after layout, so these reads do not force one.
   * A detached table reports zero sizes and stops watching its foot.
   */
  private measureOverflow(): void {
    this.clientWidth = this.tableScroll.clientWidth;
    this.scrollWidth = this.tableScroll.scrollWidth;
    const overflowsX = this.scrollWidth > this.clientWidth + 1;
    if (overflowsX !== this.overflowsX) {
      this.overflowsX = overflowsX;
      this.footVisible = true;
      // Only overflowing tables are watched while the note scrolls.
      if (overflowsX) {
        this.footWatch.observe(this.foot);
      } else {
        this.footWatch.unobserve(this.foot);
      }
    }
    this.show();
    this.paintThumb();
  }

  private show(): void {
    this.root.hidden = stickyHScrollHidden({
      overflowsX: this.overflowsX,
      footVisible: this.footVisible,
    });
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
    const metrics = this.metrics();
    const click = event.clientX - bounds.left - metrics.thumbWidth / 2;
    const travel = bounds.width - metrics.thumbWidth;
    if (travel <= 0 || metrics.maxLeft <= 0) {
      return;
    }
    this.tableScroll.scrollLeft =
      (Math.max(0, Math.min(travel, click)) / travel) * metrics.maxLeft;
  }

  private onDrag(event: PointerEvent): void {
    if (!this.drag) {
      return;
    }
    const metrics = this.metrics();
    const travel = this.track.clientWidth - metrics.thumbWidth;
    if (travel <= 0 || metrics.maxLeft <= 0) {
      return;
    }
    const delta = event.clientX - this.drag.startX;
    this.tableScroll.scrollLeft =
      this.drag.startLeft + (delta / travel) * metrics.maxLeft;
  }

  private endDrag(): void {
    delete this.drag;
  }

  private metrics(): ReturnType<typeof stickyThumbMetrics> {
    return stickyThumbMetrics(
      this.clientWidth,
      this.scrollWidth,
      this.tableScroll.scrollLeft,
    );
  }

  /** Runs when the table pans or resizes, never for a note scroll. */
  private paintThumb(): void {
    if (!this.overflowsX) {
      return;
    }
    const metrics = this.metrics();
    this.thumb.style.width = `${metrics.thumbWidth}px`;
    this.thumb.style.transform = `translateX(${metrics.thumbLeft}px)`;
  }

  destroy(): void {
    this.events.abort();
    this.resize.disconnect();
    this.footWatch.disconnect();
    this.foot.remove();
    this.root.remove();
  }
}
