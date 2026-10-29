/**
 * Panning and zooming with a trackpad or a wheel: scrolling pans the paper
 * in every direction; a pinch (which Chromium sends as a wheel with Ctrl,
 * and WebKit, the desktop app's view, as gesture events) or Ctrl with the
 * wheel zooms about the pointer.
 */
import type { ViewPoint } from "./camera";

export interface NavigationHost {
  /** The view moved by (dx, dy) CSS pixels over the paper. */
  scroll(dx: number, dy: number): void;
  /** Zoomed by `factor` about a point of the window. */
  zoomAt(client: ViewPoint, factor: number): void;
}

/** CSS pixels per line, for a wheel that counts in lines. */
const LINE = 16;
/** How fast a pinch sent as a wheel zooms, per CSS pixel of its delta. */
const PINCH_RATE = 0.01;

/** WebKit's gesture events, which the DOM's types do not know. */
interface GestureEvent extends UIEvent {
  readonly scale: number;
  readonly clientX: number;
  readonly clientY: number;
}

export function listenForNavigation(
  surface: HTMLElement,
  host: NavigationHost,
  signal: AbortSignal,
): void {
  let gestureScale: number | undefined;
  surface.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      // WebKit sends a pinch as gesture events too; one is enough.
      if (gestureScale === undefined) {
        wheel(event, surface, host);
      }
    },
    { passive: false, signal },
  );
  const gesture = (event: Event) => {
    event.preventDefault();
    const { scale, clientX, clientY } = event as GestureEvent;
    if (event.type === "gestureend") {
      gestureScale = undefined;
      return;
    }
    const last = gestureScale ?? 1;
    gestureScale = scale;
    host.zoomAt({ x: clientX, y: clientY }, scale / last);
  };
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    surface.addEventListener(type, gesture, { passive: false, signal });
  }
}

function wheel(
  event: WheelEvent,
  surface: HTMLElement,
  host: NavigationHost,
): void {
  const unit = deltaUnit(event, surface);
  const dx = event.deltaX * unit;
  const dy = event.deltaY * unit;
  if (event.ctrlKey) {
    host.zoomAt(
      { x: event.clientX, y: event.clientY },
      Math.exp(-dy * PINCH_RATE),
    );
  } else if (event.shiftKey && dx === 0) {
    // A mouse wheel with Shift scrolls across, where the system does not already.
    host.scroll(dy, 0);
  } else {
    host.scroll(dx, dy);
  }
}

function deltaUnit(event: WheelEvent, surface: HTMLElement): number {
  switch (event.deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      return LINE;
    case WheelEvent.DOM_DELTA_PAGE:
      return surface.clientHeight;
    default:
      return 1;
  }
}
