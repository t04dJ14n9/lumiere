/**
 * The zoom levels the zoom buttons and Ctrl/Cmd+wheel step through, as
 * browsers and other PDF viewers do: small steps near 100%, larger ones
 * further away. The first and last are the viewer's zoom limits.
 */
export const ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
] as const;
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[15];

/** Zoom levels this close to a step count as that step (100.4% is 100%). */
const SAME_STEP = 0.005;

/** The next step above (`direction` 1) or below (-1) `current`, within the limits. */
export function nextZoomStep(current: number, direction: 1 | -1): number {
  if (direction > 0) {
    return ZOOM_STEPS.find((step) => step > current + SAME_STEP) ?? MAX_ZOOM;
  }
  for (let index = ZOOM_STEPS.length - 1; index >= 0; index--) {
    if (ZOOM_STEPS[index]! < current - SAME_STEP) {
      return ZOOM_STEPS[index]!;
    }
  }
  return MIN_ZOOM;
}
