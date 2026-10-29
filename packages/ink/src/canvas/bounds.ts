/**
 * Where strokes' ink reaches: for the eraser, for drawing only what shows,
 * and for cutting a sketch to its strokes when it is saved.
 */
import type { InkStroke } from "../format";

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

/** Where all the strokes' ink reaches; undefined when there is none. */
export function drawingBounds(
  strokes: readonly InkStroke[],
): Bounds | undefined {
  let all: Bounds | undefined;
  for (const stroke of strokes) {
    const each = boundsOf(stroke);
    if (each) {
      all = all ? union(all, each) : each;
    }
  }
  return all;
}

export function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.left <= b.right &&
    b.left <= a.right &&
    a.top <= b.bottom &&
    b.top <= a.bottom
  );
}

function union(a: Bounds, b: Bounds): Bounds {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}
