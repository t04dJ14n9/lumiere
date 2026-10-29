/**
 * A sketch: strokes drawn with a Pencil, a pen tablet, a finger or a mouse,
 * in the sketch's own coordinates (points, y downwards). Every stroke keeps
 * the raw input of each point and the width and opacity its ink drew there,
 * so any engine can show it as drawn and edit it further.
 *
 * Points map one to one onto PencilKit's `PKStrokePoint`.
 */

/**
 * The inks, named as PencilKit names them (`PKInk.InkType`). An engine that
 * lacks one draws it as the nearest it has.
 */
export const INK_TOOLS = [
  "pen",
  "fountainPen",
  "pencil",
  "marker",
  "monoline",
  "watercolor",
  "crayon",
  // iPadOS 26.
  "reed",
] as const;

export type InkTool = (typeof INK_TOOLS)[number];

export interface InkPoint {
  readonly x: number;
  readonly y: number;
  /** Seconds since the stroke began. */
  readonly t: number;
  /**
   * How hard the tip pressed, from 0 to 1, on Pointer Events' pressure
   * scale. PencilKit's force is divided by the Pencil's maximum force
   * (`UITouch.maximumPossibleForce`); a mouse leaves it at 0.5.
   */
  readonly force: number;
  /** The tip's angle to the screen, in radians: 0 lying flat, π/2 upright. */
  readonly altitude: number;
  /**
   * The direction the tip leans, in radians in the screen's plane: 0 along
   * +x, growing towards +y (clockwise on screen), as UIKit and Pointer
   * Events define it.
   */
  readonly azimuth: number;
  /** The width the ink drew at this point. */
  readonly width: number;
  /** The opacity the ink drew at this point, from 0 to 1. */
  readonly opacity: number;
}

export interface InkStroke {
  readonly tool: InkTool;
  /** `#rrggbb` or `#rrggbbaa`, as drawn on light paper. */
  readonly color: string;
  readonly points: readonly InkPoint[];
}

export const PAPER_STYLES = ["plain", "ruled", "grid", "dotted"] as const;

export type PaperStyle = (typeof PAPER_STYLES)[number];

/** The page behind the strokes, drawn in the SVG, as Notes' lines and grids. */
export interface Paper {
  readonly style: PaperStyle;
  /** Distance between lines, grid lines or dots. */
  readonly spacing: number;
  /** The page's colour, `#rrggbb`, or `none` for a transparent page. */
  readonly color: string;
}

/**
 * PencilKit's own drawing data (`PKDrawing.dataRepresentation()`, base64),
 * so the iPad reopens a sketch exactly as it was drawn. It is only valid for
 * the strokes it was saved with: `strokes` is their fingerprint
 * (`strokesFingerprint`), and a sketch whose strokes changed elsewhere
 * drops it.
 */
export interface PencilKitData {
  readonly data: string;
  readonly strokes: string;
}

export interface Sketch {
  readonly width: number;
  readonly height: number;
  readonly paper: Paper;
  readonly strokes: readonly InkStroke[];
  readonly pencilKit?: PencilKitData;
}

export const DEFAULT_PAPER: Paper = {
  style: "plain",
  spacing: 32,
  color: "#ffffff",
};

/** A new sketch's size: a little narrower than a note's readable line. */
export const DEFAULT_SKETCH_SIZE = { width: 720, height: 480 } as const;

export function emptySketch(
  size: {
    readonly width: number;
    readonly height: number;
  } = DEFAULT_SKETCH_SIZE,
  paper: Paper = DEFAULT_PAPER,
): Sketch {
  return { width: size.width, height: size.height, paper, strokes: [] };
}
