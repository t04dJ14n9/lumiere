/**
 * A stroke's filled shape when its width changes along it: the outline is
 * offset from the stroke's centre line by half the width stored at each
 * point, so a stroke pressed harder in the middle is wider there. The SVG
 * and the web canvas both fill this outline, so a sketch looks the same
 * wherever it is shown.
 *
 * The outline may cross itself (at sharp turns, or where a stroke loops);
 * it is meant to be filled with the nonzero rule, which fills the stroke's
 * body and leaves the hole of a drawn "O" empty.
 */
import { round } from "./encoding";

export interface OutlinePoint {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export type Vec = readonly [number, number];

/** One piece of a stroke whose points share a key (an opacity, say). */
export interface OutlinePiece {
  readonly key: number;
  readonly outline: Vec[];
  /**
   * The outline's indices that are a cut's ends, where the piece meets its
   * neighbour: drawn sharp (`outlinePathData`), so the two meet exactly.
   */
  readonly corners: readonly number[];
}

/** Points closer than this are the same point; they have no direction. */
const SAME_POINT = 0.01;
/** The thinnest a stroke draws, so a point of width 0 still has a side. */
const MIN_RADIUS = 0.05;
/** Arcs are drawn in steps of at most this angle. */
const ARC_STEP = Math.PI / 8;
const EAST: Vec = [1, 0];

/** The closed polygon around a stroke whose width varies point by point. */
export function strokeOutline(points: readonly OutlinePoint[]): Vec[] {
  return strokePieces(points, () => 0)[0]?.outline ?? [];
}

/**
 * The stroke's outline cut where `key` changes along it. Neighbouring
 * pieces share the point between them and its offsets exactly, so they
 * meet without a gap; only the stroke's own two ends are rounded.
 */
export function strokePieces<P extends OutlinePoint>(
  points: readonly P[],
  key: (point: P) => number,
): OutlinePiece[] {
  const path = distinctPoints(points);
  const [first, second] = path;
  if (!first) {
    return [];
  }
  if (!second) {
    const dot = arc(
      { center: first, radius: radiusOf(first), from: 0 },
      2 * Math.PI,
    );
    return [{ key: key(first), outline: dot, corners: [] }];
  }
  const sides = path.map((point, index) =>
    offsetPoint(point, neighbourDirections(path, index)),
  );
  const startCap = cap(first, direction(second, first));
  const last = path.length - 1;
  const endCap = cap(
    path[last] ?? first,
    direction(path[last - 1] ?? first, path[last] ?? first),
  );
  return runs(path, key).map(({ from, to, key: runKey }) => {
    const plus = sides.slice(from, to + 1).flatMap((side) => side.plus);
    const minus = sides
      .slice(from, to + 1)
      .reverse()
      .flatMap((side) => [...side.minus].reverse());
    const end = to === last ? endCap : [];
    const outline = [
      ...plus,
      ...end,
      ...minus,
      ...(from === 0 ? startCap : []),
    ];
    // A cut runs straight from one side to the other: at the end, from the
    // plus side's last offset to the minus side's first; at the start, from
    // the minus side's last back to the plus side's first.
    const corners = [
      ...(to === last ? [] : [plus.length - 1, plus.length]),
      ...(from === 0 ? [] : [plus.length + end.length + minus.length - 1, 0]),
    ];
    return { key: runKey, outline, corners };
  });
}

/**
 * A smooth closed SVG path through the outline: each vertex is a quadratic
 * curve's control point between its neighbours' midpoints, so the handful
 * of points per input sample draw as a curve rather than facets. A corner
 * (a piece's cut) is passed through with straight lines instead: as a
 * control point it would pull the path in to the middle of the cut.
 */
export function outlinePathData(
  outline: readonly Vec[],
  corners: readonly number[] = [],
): string {
  if (outline.length < 3) {
    return "";
  }
  const at = (index: number) => outline[index % outline.length] ?? EAST;
  const isCorner = new Set(corners);
  const parts = [`M${format(midpoint(at(0), at(1)))}`];
  for (let index = 1; index <= outline.length; index++) {
    const vertex = at(index);
    const next = format(midpoint(vertex, at(index + 1)));
    parts.push(
      isCorner.has(index % outline.length)
        ? `L${format(vertex)}L${next}`
        : `Q${format(vertex)} ${next}`,
    );
  }
  return `${parts.join("")}Z`;
}

/** The SVG path data of a whole stroke's outline. */
export function strokePathData(points: readonly OutlinePoint[]): string {
  return outlinePathData(strokeOutline(points));
}

interface Run {
  readonly from: number;
  /** The run's last point: the first of the next run, so the two meet. */
  readonly to: number;
  readonly key: number;
}

function runs<P extends OutlinePoint>(
  path: readonly P[],
  key: (point: P) => number,
): Run[] {
  const found: Run[] = [];
  let from = 0;
  for (let index = 1; index <= path.length; index++) {
    const current = path[index];
    const runKey = key(path[from] as P);
    if (current === undefined || key(current) !== runKey) {
      found.push({ from, to: Math.min(index, path.length - 1), key: runKey });
      from = index;
    }
  }
  // A run that is only the stroke's last point has nothing left to draw.
  return found.filter((run) => run.to > run.from || path.length === 1);
}

interface Directions {
  readonly incoming: Vec;
  readonly outgoing: Vec;
}

function neighbourDirections(
  path: readonly OutlinePoint[],
  index: number,
): Directions {
  const point = path[index] as OutlinePoint;
  const before = path[index - 1];
  const after = path[index + 1];
  const backward = before ? direction(before, point) : undefined;
  const forward = after ? direction(point, after) : undefined;
  const incoming = backward ?? forward ?? EAST;
  return { incoming, outgoing: forward ?? incoming };
}

interface Sides {
  /** Offsets on the plus side, in the stroke's direction. */
  readonly plus: Vec[];
  readonly minus: Vec[];
}

/**
 * The outline's two sides at one point. On a gentle bend each side moves
 * out along the bend's normal. At a sharp turn (more than a right angle)
 * that normal would throw the outline far out, so the outer side follows
 * an arc around the point and the inner side cuts across.
 */
function offsetPoint(
  point: OutlinePoint,
  { incoming, outgoing }: Directions,
): Sides {
  const radius = radiusOf(point);
  if (dot(incoming, outgoing) >= 0) {
    const tangent = normalize([
      incoming[0] + outgoing[0],
      incoming[1] + outgoing[1],
    ]);
    const normal = perpendicular(tangent ?? incoming);
    return {
      plus: [along(point, normal, radius)],
      minus: [along(point, normal, -radius)],
    };
  }
  const normalIn = perpendicular(incoming);
  const normalOut = perpendicular(outgoing);
  // Turning towards the plus side makes the minus side the outer one.
  const sign = cross(incoming, outgoing) > 0 ? -1 : 1;
  const start = along(point, normalIn, sign * radius);
  const outer = arc(
    { center: point, radius, from: angleOf(point, start) },
    signedAngle(normalIn, normalOut),
  );
  const inner = [
    along(point, normalIn, -sign * radius),
    along(point, normalOut, -sign * radius),
  ];
  return sign < 0
    ? { plus: inner, minus: outer }
    : { plus: outer, minus: inner };
}

/** A half circle around an end of the stroke, bulging towards `facing`. */
function cap(point: OutlinePoint, facing: Vec): Vec[] {
  const side = perpendicular(facing);
  const from = Math.atan2(side[1], side[0]);
  // The two ends of the half circle are the sides' own offsets.
  return arc({ center: point, radius: radiusOf(point), from }, -Math.PI).slice(
    1,
    -1,
  );
}

interface ArcStart {
  readonly center: OutlinePoint;
  readonly radius: number;
  readonly from: number;
}

/** Points along an arc, both ends included; a full turn ends where it began. */
function arc({ center, radius, from }: ArcStart, sweep: number): Vec[] {
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP));
  const points: Vec[] = [];
  for (let step = 0; step <= steps; step++) {
    const angle = from + (sweep * step) / steps;
    points.push([
      center.x + radius * Math.cos(angle),
      center.y + radius * Math.sin(angle),
    ]);
  }
  return Math.abs(sweep) >= 2 * Math.PI ? points.slice(0, -1) : points;
}

function distinctPoints<P extends OutlinePoint>(points: readonly P[]): P[] {
  const kept: P[] = [];
  for (const point of points) {
    const previous = kept.at(-1);
    if (previous && distance(previous, point) < SAME_POINT) {
      // The wider of two samples at one place is what the ink drew.
      kept[kept.length - 1] = point.width > previous.width ? point : previous;
    } else {
      kept.push(point);
    }
  }
  return kept;
}

function radiusOf(point: OutlinePoint): number {
  return Math.max(MIN_RADIUS, point.width / 2);
}

function direction(from: OutlinePoint, to: OutlinePoint): Vec {
  return normalize([to.x - from.x, to.y - from.y]) ?? EAST;
}

function normalize(vector: Vec): Vec | undefined {
  const length = Math.hypot(vector[0], vector[1]);
  return length < 1e-9 ? undefined : [vector[0] / length, vector[1] / length];
}

function perpendicular(vector: Vec): Vec {
  return [-vector[1], vector[0]];
}

function along(point: OutlinePoint, unit: Vec, length: number): Vec {
  return [point.x + unit[0] * length, point.y + unit[1] * length];
}

function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1];
}

function cross(a: Vec, b: Vec): number {
  return a[0] * b[1] - a[1] * b[0];
}

/** The angle from `a` to `b` the short way round, in (-π, π]. */
function signedAngle(a: Vec, b: Vec): number {
  return Math.atan2(cross(a, b), dot(a, b));
}

function angleOf(center: OutlinePoint, point: Vec): number {
  return Math.atan2(point[1] - center.y, point[0] - center.x);
}

function distance(a: OutlinePoint, b: OutlinePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Vec, b: Vec): Vec {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function format(point: Vec): string {
  return `${round(point[0], 2)} ${round(point[1], 2)}`;
}
