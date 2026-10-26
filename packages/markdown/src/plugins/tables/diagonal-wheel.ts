type DiagonalInput = Pick<
  WheelEvent,
  "deltaX" | "deltaY" | "deltaMode" | "ctrlKey" | "metaKey" | "shiftKey"
>;

type HorizontalScroller = Pick<
  HTMLElement,
  "scrollLeft" | "scrollWidth" | "clientWidth"
>;

/**
 * How long a remembered vertical part waits for the table to pan. The pan
 * arrives as a scroll event in the frame after the wheel, so this only has to
 * outlast one slow frame; anything older was a gesture the note took itself.
 */
const PAN_WINDOW_MS = 100;

/** A wheel that moves mostly down or up but also a little sideways. */
export function isMostlyVerticalDiagonal(event: DiagonalInput): boolean {
  return (
    event.deltaMode === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.deltaX !== 0 &&
    Math.abs(event.deltaY) > Math.abs(event.deltaX)
  );
}

/** Whether the table has room to pan in the direction of `deltaX`. */
export function canPanToward(
  table: HorizontalScroller,
  deltaX: number,
): boolean {
  if (deltaX > 0) {
    return table.scrollLeft < table.scrollWidth - table.clientWidth - 0.5;
  }
  return deltaX < 0 && table.scrollLeft > 0.5;
}

/**
 * Lets a mostly vertical diagonal wheel over a wide table scroll the note.
 *
 * Chromium latches a wheel gesture to the first scroller that can take either
 * axis of its first delta, and the latched scroller gets the whole gesture. A
 * diagonal whose sideways part `.table-scroll` can take therefore latches
 * there and its larger vertical part is dropped: the table pans and the note
 * does not move. (macOS rails most trackpad gestures to one axis first, so
 * this shows mainly on other platforms.)
 *
 * Cancelling such a wheel would need a non-passive listener, which makes
 * Chromium wait for the main thread before every tick over the table.
 * Instead a passive listener remembers the vertical part, and only if the
 * table really pans is the note scrolled by it. When the note took the
 * gesture itself, the table does not pan and nothing is added.
 */
export function followDiagonalWheel(
  table: HTMLElement,
  note: () => Pick<HTMLElement, "scrollBy">,
  signal: AbortSignal,
): void {
  let pending = 0;
  let since = 0;
  const remember = (event: WheelEvent): void => {
    if (!isMostlyVerticalDiagonal(event)) {
      pending = 0;
      return;
    }
    const now = performance.now();
    if (pending !== 0 && now - since > PAN_WINDOW_MS) {
      pending = 0;
    }
    // At its edge the table cannot take the sideways part, so the note
    // latches the gesture and scrolls by itself.
    if (!canPanToward(table, event.deltaX)) {
      return;
    }
    if (pending === 0) {
      since = now;
    }
    pending += event.deltaY;
  };
  const release = (): void => {
    const distance = pending;
    pending = 0;
    if (distance !== 0 && performance.now() - since <= PAN_WINDOW_MS) {
      note().scrollBy({ top: distance, behavior: "instant" });
    }
  };
  const options = { passive: true, signal };
  table.addEventListener("wheel", remember, options);
  table.addEventListener("scroll", release, options);
}
