/**
 * A sketch file, `*.sketch.svg`: an SVG any viewer shows as drawn (Obsidian,
 * GitHub, VS Code, a browser), with the portable strokes in its
 * `<metadata>` so Lumière can edit it again.
 *
 * Each stroke is a filled outline whose width follows the widths stored at
 * its points (outline.ts), not a line of one width. Where a stroke's
 * opacity changes along it (pencil shading), it is cut into pieces of
 * nearly equal opacity.
 */
import {
  checkedPencilKit,
  decodeSketch,
  encodeSketch,
  round,
} from "./encoding";
import { outlinePathData, strokePieces } from "./outline";
import { paperSvg } from "./paper";
import type { InkPoint, InkStroke, Sketch } from "./types";
import { SketchFormatError } from "./validation";

export const SKETCH_EXTENSION = ".sketch.svg";

/** Where the metadata's element lives; readers match it by local name. */
export const SKETCH_NAMESPACE = "https://github.com/t04dJ14n9/lumiere/sketch";

/** Opacities closer than this draw as one piece. */
const OPACITY_STEP = 0.1;

export function isSketchPath(path: string): boolean {
  return path.toLowerCase().endsWith(SKETCH_EXTENSION);
}

export function sketchToSvg(sketch: Sketch): string {
  const width = n(sketch.width);
  const height = n(sketch.height);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<metadata><lumiere:sketch xmlns:lumiere="${SKETCH_NAMESPACE}"><![CDATA[${cdataSafe(encodeSketch(sketch))}]]></lumiere:sketch></metadata>`,
    paperSvg(sketch.paper, sketch),
    `<g fill-rule="nonzero">`,
    ...sketch.strokes.map(strokeSvg),
    `</g>`,
    `</svg>`,
    "",
  ].join("\n");
}

/**
 * The sketch an SVG file holds. Throws `SketchFormatError` when the file is
 * not a Lumière sketch (a plain SVG drawn elsewhere, or a damaged one).
 */
export function sketchFromSvg(svg: string): Sketch {
  const metadata = /<metadata\b[^>]*>([\s\S]*?)<\/metadata\s*>/i.exec(svg)?.[1];
  const element =
    metadata &&
    /<(?:[\w.-]+:)?sketch\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?sketch\s*>/.exec(
      metadata,
    )?.[1];
  if (element === undefined || element === "") {
    throw new SketchFormatError("This SVG has no Lumière sketch in it.");
  }
  return checkedPencilKit(decodeSketch(elementText(element)));
}

/** One stroke as SVG: a path, or a group of pieces when its opacity varies. */
export function strokeSvg(stroke: InkStroke): string {
  if (stroke.points.length === 0) {
    return "";
  }
  const { rgb, alpha } = splitColor(stroke.color);
  const blend =
    stroke.tool === "marker" ? ` style="mix-blend-mode:multiply"` : "";
  const range = opacityRange(stroke.points);
  if (range.highest - range.lowest <= OPACITY_STEP / 2) {
    const outline = strokePieces(stroke.points, () => 0)[0]?.outline ?? [];
    return path(outlinePathData(outline), {
      rgb,
      opacity: alpha * range.mean,
      blend,
    });
  }
  const pieces = strokePieces(stroke.points, opacityKey).map((piece) =>
    path(outlinePathData(piece.outline), {
      opacity: alpha * piece.key * OPACITY_STEP,
    }),
  );
  return `<g fill="${rgb}"${blend}>${pieces.join("")}</g>`;
}

/** Without spreading the points into `Math.min`, which a long stroke overflows. */
function opacityRange(points: readonly InkPoint[]): {
  lowest: number;
  highest: number;
  mean: number;
} {
  let lowest = Infinity;
  let highest = -Infinity;
  let sum = 0;
  for (const { opacity } of points) {
    lowest = Math.min(lowest, opacity);
    highest = Math.max(highest, opacity);
    sum += opacity;
  }
  return { lowest, highest, mean: sum / points.length };
}

function opacityKey(point: InkPoint): number {
  return Math.round(point.opacity / OPACITY_STEP);
}

interface PathStyle {
  readonly rgb?: string;
  readonly opacity: number;
  readonly blend?: string;
}

function path(data: string, style: PathStyle): string {
  const fill = style.rgb ? ` fill="${style.rgb}"` : "";
  const opacity =
    style.opacity < 0.999 ? ` fill-opacity="${round(style.opacity, 3)}"` : "";
  return `<path${fill}${opacity}${style.blend ?? ""} d="${data}"/>`;
}

/** `#rrggbbaa` as `#rrggbb` and an opacity: SVG 1.1 viewers know no alpha in colours. */
function splitColor(color: string): { rgb: string; alpha: number } {
  if (color.length === 9) {
    return {
      rgb: color.slice(0, 7),
      alpha: parseInt(color.slice(7), 16) / 255,
    };
  }
  return { rgb: color, alpha: 1 };
}

/**
 * JSON can hold `>` and `<` only inside strings, where `>` means the
 * same, so the metadata can never close its CDATA section early.
 */
function cdataSafe(json: string): string {
  return json.replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
}

/**
 * The element's text: a CDATA section as Lumière writes it, or escaped text
 * as an SVG editor may write it back.
 */
function elementText(element: string): string {
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(element);
  if (cdata) {
    return cdata[1] ?? "";
  }
  return element
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      character(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) => character(Number(decimal)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

/** A numeric character reference's character; a damaged one reads as U+FFFD. */
function character(codePoint: number): string {
  return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "\ufffd";
}

function n(value: number): string {
  return String(round(value, 2));
}
