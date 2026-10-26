/**
 * The page on the canvas: how large it shows, how tall it grows to hold
 * what is drawn below it (as on the iPad), and what Done gives back.
 */
import type { InkStroke, Sketch } from "../format";

/** Room kept below the lowest stroke when the page grows (the iPad's too). */
export const GROWTH_MARGIN = 32;
/** The page fills the width up to this many CSS pixels per point. */
export const MAX_SCALE = 1.5;
/** Grey kept around the page where the window has room for it, in CSS pixels. */
export const GUTTER = 24;
/** Below this width the page fills the window edge to edge. */
const ROOMY_WIDTH = 640;

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Where a stroke's ink reaches, its widths included. */
export function strokeBounds(stroke: InkStroke): Bounds | undefined {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of stroke.points) {
    const radius = point.width / 2;
    left = Math.min(left, point.x - radius);
    top = Math.min(top, point.y - radius);
    right = Math.max(right, point.x + radius);
    bottom = Math.max(bottom, point.y + radius);
  }
  return left <= right ? { left, top, right, bottom } : undefined;
}

/** Strokes never change once drawn, so their bounds are worked out once. */
const bounds = new WeakMap<InkStroke, Bounds | undefined>();

/** `strokeBounds`, worked out once per stroke. */
export function boundsOf(stroke: InkStroke): Bounds | undefined {
  if (!bounds.has(stroke)) {
    bounds.set(stroke, strokeBounds(stroke));
  }
  return bounds.get(stroke);
}

/** The page's height once it holds `strokes`: never shorter than it was. */
export function pageHeightHolding(
  strokes: readonly InkStroke[],
  current: number,
): number {
  let lowest = -Infinity;
  for (const stroke of strokes) {
    lowest = Math.max(lowest, boundsOf(stroke)?.bottom ?? -Infinity);
  }
  return lowest > current ? Math.ceil(lowest + GROWTH_MARGIN) : current;
}

/** Where the page sits in the canvas's view, in CSS pixels. */
export interface PageLayout {
  /** CSS pixels per point of the sketch. */
  readonly scale: number;
  readonly left: number;
  readonly top: number;
}

/** The page fills the view's width (less a gutter where there is room), at most `MAX_SCALE`. */
export function pageLayout(viewWidth: number, pageWidth: number): PageLayout {
  const gutter = viewWidth >= ROOMY_WIDTH ? GUTTER : 0;
  const scale = Math.min(
    MAX_SCALE,
    Math.max(0.1, (viewWidth - 2 * gutter) / pageWidth),
  );
  const left = Math.max(0, (viewWidth - pageWidth * scale) / 2);
  return { scale, left, top: gutter };
}

/**
 * The sketch Done gives back. With its strokes as they were (nothing drawn,
 * or all of it undone) it is the sketch the canvas opened, with PencilKit's
 * own data, so the iPad still reopens it exactly; changed, that data no
 * longer matches and is left out.
 */
export function finishedSketch(
  opened: Sketch,
  strokes: readonly InkStroke[],
  height: number,
): Sketch {
  if (strokes === opened.strokes) {
    return opened;
  }
  return { width: opened.width, height, paper: opened.paper, strokes };
}
