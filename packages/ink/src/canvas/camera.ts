/**
 * Where the canvas looks, as Freeform's: the paper has no edge, so the view
 * is a camera over the sketch's coordinates that pans in every direction
 * and zooms from a quarter to four times. The view is measured in CSS
 * pixels from its top left.
 */
import type { Bounds } from "./bounds";

export interface Camera {
  /** The sketch's point at the view's top left. */
  readonly x: number;
  readonly y: number;
  /** CSS pixels per point of the sketch. */
  readonly zoom: number;
}

export interface ViewPoint {
  readonly x: number;
  readonly y: number;
}

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
/** Room around the sketch when it opens, in CSS pixels: below the bar, and at its sides. */
export const OPENING_MARGIN = 24;

/**
 * The sketch opens at its own size, centred across, its top a margin below
 * the bar; a view too narrow for it shows it whole across instead.
 */
export function openingCamera(
  view: ViewSize,
  sketch: { readonly width: number },
): Camera {
  const fitting = (view.width - 2 * OPENING_MARGIN) / sketch.width;
  const zoom = clampZoom(Math.min(1, fitting));
  return {
    x: (sketch.width - view.width / zoom) / 2,
    y: -OPENING_MARGIN / zoom,
    zoom,
  };
}

/** The sketch's point under a point of the view. */
export function toSketch(camera: Camera, at: ViewPoint): ViewPoint {
  return { x: camera.x + at.x / camera.zoom, y: camera.y + at.y / camera.zoom };
}

/** The camera moved so that the paper moves by (dx, dy) in the view, as under a dragging finger. */
export function dragged(camera: Camera, dx: number, dy: number): Camera {
  return {
    ...camera,
    x: camera.x - dx / camera.zoom,
    y: camera.y - dy / camera.zoom,
  };
}

/** Zoomed by `factor` about a point of the view, which stays over the same point of the sketch. */
export function zoomedAt(
  camera: Camera,
  at: ViewPoint,
  factor: number,
): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  const fixed = toSketch(camera, at);
  return { x: fixed.x - at.x / zoom, y: fixed.y - at.y / zoom, zoom };
}

/**
 * Two fingers moving from `before` to `after`: the paper follows the point
 * between them, and grows as far as they spread.
 */
export function pinched(
  camera: Camera,
  before: readonly [ViewPoint, ViewPoint],
  after: readonly [ViewPoint, ViewPoint],
): Camera {
  const from = middle(before);
  const to = middle(after);
  const spread = distance(after) / Math.max(1, distance(before));
  return zoomedAt(dragged(camera, to.x - from.x, to.y - from.y), to, spread);
}

/** What the view shows, in the sketch's coordinates. */
export function visibleArea(camera: Camera, view: ViewSize): Bounds {
  return {
    left: camera.x,
    top: camera.y,
    right: camera.x + view.width / camera.zoom,
    bottom: camera.y + view.height / camera.zoom,
  };
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function middle([a, b]: readonly [ViewPoint, ViewPoint]): ViewPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance([a, b]: readonly [ViewPoint, ViewPoint]): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
