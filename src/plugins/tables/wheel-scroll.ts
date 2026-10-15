type TableWheelEvent = Pick<
  WheelEvent,
  | "deltaX"
  | "deltaY"
  | "deltaMode"
  | "shiftKey"
  | "ctrlKey"
  | "metaKey"
  | "cancelable"
  | "defaultPrevented"
  | "preventDefault"
>;

type NoteViewport = Pick<
  HTMLElement,
  "scrollTop" | "scrollHeight" | "clientHeight"
> & { scrollBy(options: ScrollToOptions): void };

/** Keep vertical wheel input out of the table's horizontal overflow box. */
export function forwardTableWheel(
  event: TableWheelEvent,
  viewport: NoteViewport,
  lineHeight: number,
): void {
  if (
    event.defaultPrevented ||
    !event.cancelable ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    Math.abs(event.deltaX) >= Math.abs(event.deltaY)
  ) {
    return;
  }
  const top = verticalDistance(event, lineHeight, viewport.clientHeight);
  const remaining =
    top < 0
      ? viewport.scrollTop
      : viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
  if (remaining <= 0) {
    return;
  }
  // overflow-x: auto also makes overflow-y auto. Chromium can keep wheel
  // input in that nested scrollport after grid selection focuses the widget.
  // Cancel its default only when forwarding to the note, to avoid double scroll.
  event.preventDefault();
  viewport.scrollBy({ left: 0, top, behavior: "instant" });
}

function verticalDistance(
  event: Pick<WheelEvent, "deltaMode" | "deltaY">,
  lineHeight: number,
  pageHeight: number,
): number {
  switch (event.deltaMode) {
    case 1: // DOM_DELTA_LINE
      return event.deltaY * lineHeight;
    case 2: // DOM_DELTA_PAGE
      return event.deltaY * pageHeight;
    default:
      return event.deltaY;
  }
}
