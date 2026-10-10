import { MAX_ZOOM, MIN_ZOOM } from "./zoom-steps";

/** A pause this long (ms) after the last pinch event settles the gesture. */
export const PINCH_SETTLE_MS = 140;

/**
 * The scale one pinch (or trackpad Ctrl/Cmd+scroll) event applies, as macOS
 * Preview and browsers do: proportional to the delta, so the page follows the
 * fingers. Line and page deltas count as 40 pixels and 400.
 */
export function pinchFactor(deltaY: number, deltaMode: number): number {
  const pixels = deltaY * (deltaMode === 1 ? 40 : deltaMode === 2 ? 400 : 1);
  return Math.exp(-pixels / 100);
}

/** The gesture's cumulative scale, held so the zoom it ends at stays within the limits. */
export function clampGestureScale(base: number, scale: number): number {
  return Math.min(MAX_ZOOM / base, Math.max(MIN_ZOOM / base, scale));
}
