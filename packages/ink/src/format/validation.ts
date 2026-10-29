/**
 * Checks a sketch's stored JSON before anything uses it. A sketch file comes
 * from anywhere (another device, another app, a sync conflict), and its
 * colours are written back into SVG markup, so nothing is trusted: the shape
 * is checked, colours must be hex, numbers finite, and sizes bounded. Values
 * a newer Lumière may add (a new ink, a new paper) fall back to one this
 * version knows, so the sketch still shows.
 */
import {
  DEFAULT_PAPER,
  INK_TOOLS,
  PAPER_STYLES,
  type InkTool,
  type Paper,
  type PaperStyle,
  type PencilKitData,
} from "./types";

export class SketchFormatError extends Error {
  override readonly name = "SketchFormatError";
}

/** Large enough for any page; larger is a damaged or hostile file. */
export const LIMITS = {
  side: 100_000,
  strokes: 100_000,
  valuesPerStroke: 2_000_000,
  fields: 64,
} as const;

const HEX_COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export interface StoredFields {
  readonly format: unknown;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly paper: Paper;
  readonly fields: readonly string[];
  readonly strokes: readonly {
    readonly tool: InkTool;
    readonly color: string;
    readonly points: readonly number[];
  }[];
  readonly pencilKit: PencilKitData | undefined;
}

export function readSketchFields(value: unknown): StoredFields {
  const root = record(value, "The sketch's data");
  return {
    format: root.format,
    version: integer(root.version, "The sketch's version"),
    width: side(root.width, "width"),
    height: side(root.height, "height"),
    paper: readPaper(root.paper),
    fields: strings(root.fields),
    strokes: list(root.strokes, LIMITS.strokes, "strokes").map(readStroke),
    pencilKit: readPencilKit(root.pencilKit),
  };
}

export function isColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

function readPaper(value: unknown): Paper {
  if (value === undefined) {
    return DEFAULT_PAPER;
  }
  const paper = record(value, "The sketch's paper");
  const style = PAPER_STYLES.includes(paper.style as PaperStyle)
    ? (paper.style as PaperStyle)
    : "plain";
  const spacing =
    typeof paper.spacing === "number" &&
    paper.spacing >= 4 &&
    paper.spacing <= 400
      ? paper.spacing
      : DEFAULT_PAPER.spacing;
  const color =
    paper.color === "none" || isColor(paper.color) ? paper.color : undefined;
  if (color === undefined) {
    throw new SketchFormatError("The sketch's paper colour is not a colour.");
  }
  return { style, spacing, color };
}

function readStroke(value: unknown): StoredFields["strokes"][number] {
  const stroke = record(value, "A stroke");
  if (!isColor(stroke.color)) {
    throw new SketchFormatError("A stroke's colour is not a colour.");
  }
  const points = list(stroke.points, LIMITS.valuesPerStroke, "points");
  if (!points.every((item) => typeof item === "number" && isFinite(item))) {
    throw new SketchFormatError("A stroke's points are not all numbers.");
  }
  const tool = INK_TOOLS.includes(stroke.tool as InkTool)
    ? (stroke.tool as InkTool)
    : "pen";
  return { tool, color: stroke.color, points: points as number[] };
}

function readPencilKit(value: unknown): PencilKitData | undefined {
  if (value === undefined) {
    return undefined;
  }
  const data = record(value, "The sketch's PencilKit data");
  if (
    typeof data.data !== "string" ||
    typeof data.strokes !== "string" ||
    !BASE64.test(data.data)
  ) {
    throw new SketchFormatError("The sketch's PencilKit data is damaged.");
  }
  return { data: data.data, strokes: data.strokes };
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SketchFormatError(`${what} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, limit: number, what: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new SketchFormatError(`The sketch's ${what} are not a list.`);
  }
  if (value.length > limit) {
    throw new SketchFormatError(`The sketch has too many ${what}.`);
  }
  return value;
}

function strings(value: unknown): string[] {
  const items = list(value, LIMITS.fields, "fields");
  if (!items.every((item) => typeof item === "string")) {
    throw new SketchFormatError("The sketch's fields are not names.");
  }
  return items as string[];
}

function integer(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new SketchFormatError(`${what} is not a positive whole number.`);
  }
  return value;
}

function side(value: unknown, name: string): number {
  if (
    typeof value !== "number" ||
    !isFinite(value) ||
    value <= 0 ||
    value > LIMITS.side
  ) {
    throw new SketchFormatError(`The sketch's ${name} is not a size.`);
  }
  return value;
}
