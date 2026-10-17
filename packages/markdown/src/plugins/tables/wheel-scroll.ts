export type TableWheelEvent = Pick<
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

type NoteViewport = Pick<HTMLElement, "clientHeight">;

/** Keep vertical wheel input out of the table's horizontal overflow box. */
export function forwardTableWheel(
  event: TableWheelEvent,
  viewport: NoteViewport,
  lineHeight: number,
  scroll: (distance: number, event: TableWheelEvent) => boolean,
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
  // The motion owner checks room at its pending destination, since the visible
  // position can still be catching up with an earlier tick at the note's edge.
  if (!scroll(top, event)) {
    return;
  }
  // overflow-x: auto also makes overflow-y auto. Chromium can keep wheel
  // input in that nested scrollport after grid selection focuses the widget.
  // Cancel its default only when forwarding to the note, to avoid double scroll.
  event.preventDefault();
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
