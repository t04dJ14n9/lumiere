/**
 * The portable strokes as stored in a sketch's `<metadata>`: JSON, with each
 * stroke's points as one flat array of numbers in the order `fields` names.
 * A point as an object would be several times larger, and a page of
 * handwriting has tens of thousands of points.
 *
 * Readers find each field by name, so a later version can add fields (a
 * Pencil Pro's barrel roll, say) without breaking this one: unknown fields
 * are skipped, and missing optional ones take their defaults.
 */
import { SketchFormatError, readSketchFields } from "./validation";
import type { InkPoint, InkStroke, Sketch } from "./types";

export const FORMAT_NAME = "lumiere-sketch";
export const FORMAT_VERSION = 1;

/** The fields this version writes, in order, with the decimals each keeps. */
export const POINT_FIELDS = [
  ["x", 2],
  ["y", 2],
  ["t", 4],
  ["force", 3],
  ["altitude", 3],
  ["azimuth", 3],
  ["width", 2],
  ["opacity", 3],
] as const satisfies readonly (readonly [keyof InkPoint, number])[];

/** What a point gets when its file does not say. */
const POINT_DEFAULTS: Readonly<Record<keyof InkPoint, number | undefined>> = {
  x: undefined,
  y: undefined,
  t: 0,
  force: 0.5,
  altitude: Math.PI / 2,
  azimuth: 0,
  width: undefined,
  opacity: 1,
};

interface StoredStroke {
  readonly tool: string;
  readonly color: string;
  readonly points: readonly number[];
}

/** A sketch as its metadata's JSON. Numbers are rounded to `POINT_FIELDS`. */
export function encodeSketch(sketch: Sketch): string {
  return JSON.stringify({
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    width: round(sketch.width, 2),
    height: round(sketch.height, 2),
    paper: sketch.paper,
    fields: POINT_FIELDS.map(([name]) => name),
    strokes: sketch.strokes.map(storedStroke),
    ...(sketch.pencilKit ? { pencilKit: sketch.pencilKit } : {}),
  });
}

/** The sketch a metadata JSON holds; throws `SketchFormatError` if it holds none. */
export function decodeSketch(json: string): Sketch {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new SketchFormatError("The sketch's data is not JSON.");
  }
  const fields = readSketchFields(value);
  if (fields.format !== FORMAT_NAME) {
    throw new SketchFormatError("This is not a Lumière sketch.");
  }
  if (fields.version > FORMAT_VERSION) {
    throw new SketchFormatError(
      `This sketch was saved by a newer Lumière (format ${fields.version}).`,
    );
  }
  const columns = pointColumns(fields.fields);
  const strokes = fields.strokes.map((stroke) => ({
    tool: stroke.tool,
    color: stroke.color,
    points: decodePoints(stroke.points, columns),
  }));
  return {
    width: fields.width,
    height: fields.height,
    paper: fields.paper,
    strokes,
    ...(fields.pencilKit ? { pencilKit: fields.pencilKit } : {}),
  };
}

function storedStroke(stroke: InkStroke): StoredStroke {
  const points: number[] = [];
  for (const point of stroke.points) {
    for (const [name, decimals] of POINT_FIELDS) {
      points.push(round(point[name], decimals));
    }
  }
  return { tool: stroke.tool, color: stroke.color, points };
}

/** Where each field this version knows sits in a stored point, if it does. */
interface Columns {
  readonly column: Readonly<Partial<Record<keyof InkPoint, number>>>;
  /** How many numbers one stored point takes. */
  readonly stride: number;
}

function pointColumns(names: readonly string[]): Columns {
  const column: Partial<Record<keyof InkPoint, number>> = {};
  for (const [name] of POINT_FIELDS) {
    const at = names.indexOf(name);
    if (at >= 0) {
      column[name] = at;
    } else if (POINT_DEFAULTS[name] === undefined) {
      throw new SketchFormatError(`The sketch's points have no ${name}.`);
    }
  }
  return { column, stride: names.length };
}

function decodePoints(values: readonly number[], columns: Columns): InkPoint[] {
  if (columns.stride === 0 || values.length % columns.stride !== 0) {
    throw new SketchFormatError("A stroke's points are incomplete.");
  }
  const points: InkPoint[] = [];
  for (let start = 0; start < values.length; start += columns.stride) {
    const field = (name: keyof InkPoint): number => {
      const at = columns.column[name];
      return at === undefined
        ? (POINT_DEFAULTS[name] ?? 0)
        : (values[start + at] ?? 0);
    };
    points.push({
      x: field("x"),
      y: field("y"),
      t: field("t"),
      force: clamp(field("force"), 0, 1),
      altitude: clamp(field("altitude"), 0, Math.PI / 2),
      azimuth: field("azimuth"),
      width: clamp(field("width"), 0, MAX_WIDTH),
      opacity: clamp(field("opacity"), 0, 1),
    });
  }
  return points;
}

/** Wider than any ink draws; a larger width is a damaged file. */
const MAX_WIDTH = 1000;

export function round(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  // `+ 0` turns -0 into 0, so a rounded file never stores "-0".
  return Math.round(value * scale) / scale + 0;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * A short digest of the strokes as stored: PencilKit's data is kept only
 * while it matches. FNV-1a over the stored JSON, with the counts in front
 * so a dropped stroke is caught even if the hash collides.
 */
export function strokesFingerprint(strokes: readonly InkStroke[]): string {
  const text = JSON.stringify(strokes.map(storedStroke));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const points = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
  return `${strokes.length}:${points}:${hash.toString(16).padStart(8, "0")}`;
}

/** The sketch with PencilKit's data for exactly these strokes. */
export function withPencilKit(sketch: Sketch, data: string): Sketch {
  return {
    ...sketch,
    pencilKit: { data, strokes: strokesFingerprint(sketch.strokes) },
  };
}

/** The sketch without PencilKit's data if its strokes changed since it was saved. */
export function checkedPencilKit(sketch: Sketch): Sketch {
  if (
    !sketch.pencilKit ||
    sketch.pencilKit.strokes === strokesFingerprint(sketch.strokes)
  ) {
    return sketch;
  }
  const { width, height, paper, strokes } = sketch;
  return { width, height, paper, strokes };
}
