/**
 * What Done saves, as the iPad's canvas does (Board.swift): a sketch is as
 * large as what was drawn on it. Its strokes' bounds, with a margin, are
 * widened to whole steps of the paper's spacing from the sketch's origin,
 * so the paper's lines fall where the saved SVG draws them, and the
 * strokes move so that the cut's top left is the sketch's new origin.
 */
import type { InkStroke, Sketch } from "../format";
import { drawingBounds, type Bounds } from "./bounds";

/** Room kept around the strokes when the sketch is cut to them. */
export const CROP_MARGIN = 16;

/** The part of the paper a sketch keeps; undefined when nothing is drawn. */
export function cropFrame(
  strokes: readonly InkStroke[],
  spacing: number,
): Bounds | undefined {
  const drawn = drawingBounds(strokes);
  if (!drawn) {
    return undefined;
  }
  const step = Math.max(1, spacing);
  const down = (value: number) => Math.floor(value / step) * step;
  const up = (value: number) => Math.ceil(value / step) * step;
  return {
    left: down(drawn.left - CROP_MARGIN),
    top: down(drawn.top - CROP_MARGIN),
    right: up(drawn.right + CROP_MARGIN),
    bottom: up(drawn.bottom + CROP_MARGIN),
  };
}

/**
 * The sketch Done gives back, or undefined when there is nothing to save:
 *
 * - strokes as they were (nothing drawn, or all of it undone): the sketch
 *   as it opened, with PencilKit's own data, so the iPad still reopens it
 *   exactly; a new sketch left blank is not saved at all;
 * - strokes all erased: a new sketch is not saved, and one that existed is
 *   saved empty at its old size;
 * - otherwise the strokes, cut to (`cropFrame`), without PencilKit's data,
 *   which no longer matches them.
 */
export function savedSketch(
  opened: Sketch,
  strokes: readonly InkStroke[],
  isNew: boolean,
): Sketch | undefined {
  if (strokes === opened.strokes) {
    return isNew ? undefined : opened;
  }
  const frame = cropFrame(strokes, opened.paper.spacing);
  if (!frame) {
    return isNew
      ? undefined
      : {
          width: opened.width,
          height: opened.height,
          paper: opened.paper,
          strokes: [],
        };
  }
  return {
    width: frame.right - frame.left,
    height: frame.bottom - frame.top,
    paper: opened.paper,
    strokes: strokes.map((stroke) => moved(stroke, frame)),
  };
}

function moved(stroke: InkStroke, frame: Bounds): InkStroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({
      ...point,
      x: point.x - frame.left,
      y: point.y - frame.top,
    })),
  };
}
