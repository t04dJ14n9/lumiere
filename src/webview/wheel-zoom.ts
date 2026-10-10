import { useZoom } from '@embedpdf/plugin-zoom/react';
import { useEffect, useRef, type RefObject } from 'react';
import { clampGestureScale, PINCH_SETTLE_MS, pinchFactor } from '../shared/pinch-zoom';
import { WheelGesture } from '../shared/smooth-motion';
import { nextZoomStep } from '../shared/zoom-steps';
import { setCommittingPinch } from './zoom-gesture';
import { DOCUMENT_ID } from './plugins';

/** Wheel movement, in pixels, per zoom step: one notch of a mouse wheel. */
const PIXELS_PER_STEP = 50;
/** Pixels per line, for wheels that report lines. */
const PIXELS_PER_LINE = 40;
/** A pause this long (ms) starts a new wheel gesture. */
const GESTURE_PAUSE = 300;

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
    if (!element || !zoom) return;
    const gesture = new WheelGesture();
    let pending = 0;
    let lastEvent = -Infinity;
    let pinch:
      | {
          base: number;
          scale: number;
          scroller: HTMLElement;
          at: { vx: number; vy: number };
          timer: ReturnType<typeof setTimeout>;
        }
      | undefined;

    const clearPreview = (scroller: HTMLElement): void => {
      scroller.style.transform = "";
      scroller.style.transformOrigin = "";
      scroller.style.willChange = "";
    };

    const settle = (): void => {
      if (!pinch) return;
      const { base, scale, scroller, at } = pinch;
      pinch = undefined;
      const target = base * scale;
      if (Math.abs(target - base) < 1e-4) {
        clearPreview(scroller);
        return;
      }
      setCommittingPinch(true);
      level.current = target;
      // The new layout has the scale the preview shows: drop the preview in
      // the very frame the layout appears, or a frame would show both, at the
      // scale squared. A ResizeObserver runs after layout and before paint, and
      // the scroller's layout size ignores the transform.
      const pageWidth = (): number =>
        scroller.querySelector<HTMLElement>(".page")?.offsetWidth ?? 0;
      const expected = (pageWidth() * target) / base;
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        observer.disconnect();
        clearTimeout(fallback);
        clearPreview(scroller);
        setCommittingPinch(false);
      };
      const observer = new ResizeObserver(() => {
        if (Math.abs(pageWidth() - expected) < 1.5) finish();
      });
      observer.observe(scroller);
      const fallback = setTimeout(finish, 600);
      zoom.requestZoom(target, at);
    };

    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const notch = gesture.discrete(event, event.timeStamp);
      const viewport = (element.querySelector(".viewport") ?? element).getBoundingClientRect();
      const at = { vx: event.clientX - viewport.left, vy: event.clientY - viewport.top };
      if (notch) {
        const delta = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * PIXELS_PER_LINE;
        if (delta === 0) return;
        if (event.timeStamp - lastEvent > GESTURE_PAUSE || Math.sign(delta) !== Math.sign(pending)) pending = 0;
        lastEvent = event.timeStamp;
        pending += delta;
        if (Math.abs(pending) < PIXELS_PER_STEP) return;
        pending = 0;
        // Step from the level just requested, so quick notches add up.
        level.current = nextZoomStep(level.current, delta < 0 ? 1 : -1);
        zoom.requestZoom(level.current, at);
        return;
      }
      if (event.deltaY === 0) return;
      if (!pinch) {
        const scroller = element.querySelector<HTMLElement>("[data-pdf-scroller]");
        if (!scroller) return;
        pinch = { base: level.current, scale: 1, scroller, at, timer: undefined as never };
        const box = scroller.getBoundingClientRect();
        scroller.style.willChange = "transform";
        scroller.style.transformOrigin = `${event.clientX - box.left}px ${event.clientY - box.top}px`;
      }
      clearTimeout(pinch.timer);
      pinch.scale = clampGestureScale(pinch.base, pinch.scale * pinchFactor(event.deltaY, event.deltaMode));
      pinch.at = at;
      pinch.scroller.style.transform = `scale(${pinch.scale})`;
      pinch.timer = setTimeout(settle, PINCH_SETTLE_MS);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
      if (pinch) {
        clearTimeout(pinch.timer);
        clearPreview(pinch.scroller);
        pinch = undefined;
      }
    };
  }, [container, zoom]);
}
