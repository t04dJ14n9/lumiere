import { useZoom } from "@embedpdf/plugin-zoom/react";
import { useEffect, useRef, type RefObject } from "react";
import {
  clampGestureScale,
  PINCH_SETTLE_MS,
  pinchFactor,
} from "../shared/pinch-zoom";
import { WheelGesture } from "../shared/smooth-motion";
import { nextZoomStep } from "../shared/zoom-steps";
import { setCommittingPinch } from "./zoom-gesture";
import { DOCUMENT_ID } from "./plugins";

/** Wheel movement, in pixels, per zoom step: one notch of a mouse wheel. */
const PIXELS_PER_STEP = 50;
/** Pixels per line, for wheels that report lines. */
const PIXELS_PER_LINE = 40;
/** A pause this long (ms) starts a new wheel gesture. */
const GESTURE_PAUSE = 300;
/** The longest a committed pinch's preview waits for the layout it shows. */
const COMMIT_TIMEOUT_MS = 1_000;

/**
 * Ctrl/Cmd+wheel over `container` zooms. Two kinds of input arrive this way:
 *
 * - A mouse wheel's notches (and a macOS trackpad pinch, which the browser
 *   reports as Ctrl+wheel with small fractional deltas) are told apart by
 *   the whole gesture (`WheelGesture`). A notch zooms one step (`ZOOM_STEPS`),
 *   keeping the point under the pointer in place.
 * - A pinch or trackpad scroll follows the fingers: the scale is proportional
 *   to the deltas, shown at once by scaling the existing page bitmaps with a
 *   CSS transform about the pointer, and the zoom is applied, and the pages
 *   rendered crisply, once, when the gesture settles.
 *
 * EmbedPDF's own wheel zoom scales by (1 - deltaY / 100) at every event,
 * re-rendering each time, and one mouse notch would double the zoom.
 */
export function useWheelZoom(container: RefObject<HTMLElement | null>): void {
  const { provides: zoom, state } = useZoom(DOCUMENT_ID);
  const level = useRef(state.currentZoomLevel);
  level.current = state.currentZoomLevel;
  useEffect(() => {
    const element = container.current;
    if (!element || !zoom) {
      return;
    }
    return new WheelZoom(element, zoom, level).attach();
  }, [container, zoom]);
}

type Zoom = NonNullable<ReturnType<typeof useZoom>["provides"]>;
type Anchor = { vx: number; vy: number };

/** The pinch in progress: the preview shows `scale` times the layout at `base`. */
interface Pinch {
  base: number;
  /** Width of a page at `base`, in pixels. */
  baseWidth: number;
  scale: number;
  scroller: HTMLElement;
  at: Anchor;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * A pinch whose zoom was requested and whose layout has not arrived: the
 * preview stays until it does. It ends by itself, or is taken over by the
 * next pinch (which carries on from what is on screen).
 */
interface Committing {
  base: number;
  baseWidth: number;
  scale: number;
  scroller: HTMLElement;
  /** Stop waiting for the layout; the preview stays as it is. */
  detach: () => void;
  /** Stop waiting and drop the preview. */
  finish: () => void;
}

/** Ctrl/Cmd+wheel zoom over one viewer element, for as long as it is attached. */
class WheelZoom {
  private readonly gesture = new WheelGesture();
  private pending = 0;
  private lastEvent = -Infinity;
  private pinch: Pinch | undefined;
  private committing: Committing | undefined;

  constructor(
    private readonly element: HTMLElement,
    private readonly zoom: Zoom,
    /** The zoom level the viewer shows, or was last asked for. */
    private readonly level: { current: number },
  ) {}

  attach(): () => void {
    const { element } = this;
    element.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("blur", this.commitNow);
    document.addEventListener("visibilitychange", this.onVisibility);
    return () => {
      element.removeEventListener("wheel", this.onWheel);
      window.removeEventListener("blur", this.commitNow);
      document.removeEventListener("visibilitychange", this.onVisibility);
      this.dispose();
    };
  }

  private dispose(): void {
    if (this.pinch) {
      clearTimeout(this.pinch.timer);
      clearPreview(this.pinch.scroller);
      this.pinch = undefined;
    }
    this.committing?.finish();
    this.committing = undefined;
    setCommittingPinch(false);
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    const notch = this.gesture.discrete(event, event.timeStamp);
    const viewport = (
      this.element.querySelector(".viewport") ?? this.element
    ).getBoundingClientRect();
    const at = {
      vx: event.clientX - viewport.left,
      vy: event.clientY - viewport.top,
    };
    if (notch) {
      this.zoomByNotch(event, at);
    } else if (event.deltaY !== 0) {
      this.pinchBy(event, at);
    }
  };

  /** A mouse notch zooms one step, keeping the point under the pointer. */
  private zoomByNotch(event: WheelEvent, at: Anchor): void {
    const delta =
      event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
        ? event.deltaY
        : event.deltaY * PIXELS_PER_LINE;
    if (delta === 0) {
      return;
    }
    if (
      event.timeStamp - this.lastEvent > GESTURE_PAUSE ||
      Math.sign(delta) !== Math.sign(this.pending)
    ) {
      this.pending = 0;
    }
    this.lastEvent = event.timeStamp;
    this.pending += delta;
    if (Math.abs(this.pending) < PIXELS_PER_STEP) {
      return;
    }
    this.pending = 0;
    // Step from the level just requested, so quick notches add up.
    this.level.current = nextZoomStep(this.level.current, delta < 0 ? 1 : -1);
    this.zoom.requestZoom(this.level.current, at);
  }

  /** A pinch follows the fingers on a CSS preview until it settles. */
  private pinchBy(event: WheelEvent, at: Anchor): void {
    const pinch = this.pinch ?? this.startPinch(event, at);
    if (!pinch) {
      return;
    }
    clearTimeout(pinch.timer);
    pinch.scale = clampGestureScale(
      pinch.base,
      pinch.scale * pinchFactor(event.deltaY, event.deltaMode),
    );
    pinch.at = at;
    pinch.scroller.style.transform = `scale(${pinch.scale})`;
    pinch.timer = setTimeout(this.settle, PINCH_SETTLE_MS);
  }

  private startPinch(event: WheelEvent, at: Anchor): Pinch | undefined {
    const scroller = this.element.querySelector<HTMLElement>(
      "[data-pdf-scroller]",
    );
    if (!scroller) {
      return undefined;
    }
    const previous = this.committing;
    if (
      previous &&
      previous.scroller === scroller &&
      Math.abs(pageWidth(scroller) - previous.baseWidth) < 1.5
    ) {
      // The layout is still the old one and the preview still shows the
      // last pinch: carry on from what is on screen.
      previous.detach();
      const { base, baseWidth, scale } = previous;
      this.pinch = { base, baseWidth, scale, scroller, at, timer: undefined };
      return this.pinch;
    }
    this.committing?.finish();
    this.pinch = {
      base: this.level.current,
      baseWidth: pageWidth(scroller),
      scale: 1,
      scroller,
      at,
      timer: undefined,
    };
    clearPreview(scroller);
    const box = scroller.getBoundingClientRect();
    scroller.style.willChange = "transform";
    scroller.style.transformOrigin = `${event.clientX - box.left}px ${event.clientY - box.top}px`;
    return this.pinch;
  }

  private readonly settle = (): void => {
    const pinch = this.pinch;
    if (!pinch) {
      return;
    }
    this.pinch = undefined;
    const target = pinch.base * pinch.scale;
    if (Math.abs(target - pinch.base) < 1e-4) {
      clearPreview(pinch.scroller);
      setCommittingPinch(false);
      return;
    }
    setCommittingPinch(true);
    this.level.current = target;
    this.commit(pinch, target);
    this.zoom.requestZoom(target, pinch.at);
  };

  /**
   * The new layout has the scale the preview shows: drop the preview in the
   * very frame the layout appears, or a frame would show both, at the scale
   * squared. A ResizeObserver runs after layout and before paint, and the
   * scroller's layout size ignores the transform. Should the layout never
   * match (the zoom was clamped, the page changed), a timeout ends it.
   */
  private commit(pinch: Pinch, target: number): void {
    const { base, baseWidth, scale, scroller } = pinch;
    const expected = (baseWidth * target) / base;
    let done = false;
    const detach = (): void => {
      done = true;
      observer.disconnect();
      clearTimeout(fallback);
      if (this.committing?.detach === detach) {
        this.committing = undefined;
      }
    };
    const finish = (): void => {
      if (done) {
        return;
      }
      detach();
      clearPreview(scroller);
      setCommittingPinch(false);
    };
    const observer = new ResizeObserver(() => {
      if (Math.abs(pageWidth(scroller) - expected) < 1.5) {
        finish();
      }
    });
    observer.observe(scroller);
    const fallback = setTimeout(finish, COMMIT_TIMEOUT_MS);
    this.committing = { base, baseWidth, scale, scroller, detach, finish };
  }

  /** Commit a pinch now: the window lost focus or the page was hidden. */
  private readonly commitNow = (): void => {
    if (!this.pinch) {
      return;
    }
    clearTimeout(this.pinch.timer);
    this.settle();
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState === "hidden") {
      this.commitNow();
    }
  };
}

function clearPreview(scroller: HTMLElement): void {
  scroller.style.transform = "";
  scroller.style.transformOrigin = "";
  scroller.style.willChange = "";
}

function pageWidth(scroller: HTMLElement): number {
  return scroller.querySelector<HTMLElement>(".page")?.offsetWidth ?? 0;
}
