type WheelInput = Pick<
  WheelEvent,
  "deltaX" | "deltaY" | "ctrlKey" | "metaKey" | "shiftKey"
>;

/**
 * A wheel the note scrolls vertically for: not a zoom, and not a horizontal
 * pan (Chromium turns Shift and a vertical wheel sideways on Windows and Linux).
 */
export function isVerticalWheel(event: WheelInput): boolean {
  return (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    Math.abs(event.deltaY) > Math.abs(event.deltaX)
  );
}

function isInsideTable(target: EventTarget | null): boolean {
  const element = target as Partial<Pick<Element, "closest">> | null;
  return Boolean(element?.closest?.(".hybrid-table"));
}

/**
 * Report vertical wheel input over a table.
 *
 * The table widget ignores events, so CodeMirror's own wheel observer never
 * hears a wheel over a table, and a saved-view restore would keep pinning the
 * note against the reader's scrolling. The listener is passive: one that
 * could cancel makes Chromium wait for the main thread before every tick.
 */
export function listenForTableWheel(
  dom: Pick<HTMLElement, "addEventListener">,
  report: () => void,
): () => void {
  const events = new AbortController();
  dom.addEventListener(
    "wheel",
    (event) => {
      if (isVerticalWheel(event) && isInsideTable(event.target)) {
        report();
      }
    },
    { passive: true, signal: events.signal },
  );
  return () => events.abort();
}
