/**
 * The eraser removes each stroke it touches, whole, as PencilKit's object
 * eraser does: a stroke is touched where the eraser's path comes within
 * its reach of the stroke's ink.
 */
import type { InkPoint, InkStroke } from "../format";
import { boundsOf, type Bounds } from "./page";

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The strokes the eraser touches moving from `from` to `to`, reaching `radius` around it. */
export function strokesTouched(
  strokes: readonly InkStroke[],
  path: { readonly from: Point; readonly to: Point },
  radius: number,
): Set<InkStroke> {
  const touched = new Set<InkStroke>();
  const reach = {
    left: Math.min(path.from.x, path.to.x) - radius,
    top: Math.min(path.from.y, path.to.y) - radius,
    right: Math.max(path.from.x, path.to.x) + radius,
    bottom: Math.max(path.from.y, path.to.y) + radius,
  };
  for (const stroke of strokes) {
    const bounds = boundsOf(stroke);
    if (bounds && overlaps(bounds, reach) && isTouched(stroke, path, radius)) {
      touched.add(stroke);
    }
  }
  return touched;
}

function isTouched(
  stroke: InkStroke,
  path: { readonly from: Point; readonly to: Point },
  radius: number,
): boolean {
  const { points } = stroke;
  const [first] = points;
  if (first && points.length === 1) {
    return (
      segmentDistance(path, { from: first, to: first }) <=
      reachOf(radius, first, first)
    );
  }
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1] as InkPoint;
    const to = points[index] as InkPoint;
    if (segmentDistance(path, { from, to }) <= reachOf(radius, from, to)) {
      return true;
    }
  }
  return false;
}

function reachOf(radius: number, a: InkPoint, b: InkPoint): number {
  return radius + Math.max(a.width, b.width) / 2;
}

interface Segment {
  readonly from: Point;
  readonly to: Point;
}

/** The shortest distance between two segments; 0 where they cross. */
export function segmentDistance(a: Segment, b: Segment): number {
  if (crosses(a, b)) {
    return 0;
  }
  return Math.min(
    pointToSegment(a.from, b),
    pointToSegment(a.to, b),
    pointToSegment(b.from, a),
    pointToSegment(b.to, a),
  );
}

function pointToSegment(point: Point, segment: Segment): number {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  const length = dx * dx + dy * dy;
  const along =
    length === 0
      ? 0
      : ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) /
        length;
  const t = Math.min(1, Math.max(0, along));
  return Math.hypot(
    point.x - (segment.from.x + t * dx),
    point.y - (segment.from.y + t * dy),
  );
}

function crosses(a: Segment, b: Segment): boolean {
  const d1 = side(b.from, b.to, a.from);
  const d2 = side(b.from, b.to, a.to);
  const d3 = side(a.from, a.to, b.from);
  const d4 = side(a.from, a.to, b.to);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Which side of the line through `a` and `b` the point is on (the cross product's sign). */
function side(a: Point, b: Point, point: Point): number {
  return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.left <= b.right &&
    b.left <= a.right &&
    a.top <= b.bottom &&
    b.top <= a.bottom
  );
}
