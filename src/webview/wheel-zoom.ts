import { useZoom } from '@embedpdf/plugin-zoom/react';
import { useEffect, useRef, type RefObject } from 'react';
import { nextZoomStep } from '../shared/zoom-steps';
import { DOCUMENT_ID } from './plugins';

/** Wheel movement, in pixels, per zoom step: one notch of a mouse wheel. */
const PIXELS_PER_STEP = 50;
/** Pixels per line, for wheels that report lines. */
const PIXELS_PER_LINE = 40;
/** A pause this long (ms) starts a new wheel gesture. */
const GESTURE_PAUSE = 300;

/**
 * Ctrl/Cmd+wheel over `container` zooms one step (`ZOOM_STEPS`) per wheel
 * notch, keeping the point under the pointer in place. Small movements, from
 * trackpads and high-resolution wheels, add up to a notch.
 *
 * EmbedPDF's own wheel zoom scales by (1 - deltaY / 100), made for trackpad
 * deltas: one mouse notch (100 pixels) doubles the zoom or drops it to the
 * minimum.
 */
export function useWheelZoom(container: RefObject<HTMLElement | null>): void {
  const { provides: zoom, state } = useZoom(DOCUMENT_ID);
  const level = useRef(state.currentZoomLevel);
  level.current = state.currentZoomLevel;

  useEffect(() => {
    const element = container.current;
    if (!element || !zoom) return;
    let pending = 0;
    let lastEvent = -Infinity;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * PIXELS_PER_LINE;
      if (delta === 0) return;
      if (event.timeStamp - lastEvent > GESTURE_PAUSE || Math.sign(delta) !== Math.sign(pending)) pending = 0;
      lastEvent = event.timeStamp;
      pending += delta;
      if (Math.abs(pending) < PIXELS_PER_STEP) return;
      pending = 0;
      // Step from the level just requested, so quick notches add up.
      level.current = nextZoomStep(level.current, delta < 0 ? 1 : -1);
      const viewport = (element.querySelector('.viewport') ?? element).getBoundingClientRect();
      zoom.requestZoom(level.current, { vx: event.clientX - viewport.left, vy: event.clientY - viewport.top });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [container, zoom]);
}
