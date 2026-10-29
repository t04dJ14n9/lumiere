/**
 * The web canvas's tools: three of PencilKit's inks and an eraser, with the
 * colours and widths on offer, and how each ink answers pressure and tilt
 * (docs/IPAD_PLAN.md 5.2): the pen thickens as it presses; the pencil
 * shades darker as it presses and broader as it tilts; the marker lays a
 * broad, nearly even line that multiplies with what is under it.
 */
import type { InkTool } from "../format";
import { clamp } from "./input";

export type DrawingTool = Extract<InkTool, "pen" | "pencil" | "marker">;

export const DRAWING_TOOLS: readonly DrawingTool[] = [
  "pen",
  "pencil",
  "marker",
];

/** The eraser removes each stroke it touches, as PencilKit's object eraser. */
export type CanvasTool = DrawingTool | "eraser";

/** Three widths per ink, in the sketch's points, at the pressure of a resting mouse. */
export const WIDTHS: Readonly<
  Record<DrawingTool, readonly [number, number, number]>
> = {
  pen: [1.5, 3, 6],
  pencil: [1.5, 3, 6],
  marker: [8, 15, 26],
};

/** Colours as drawn on light paper. */
export const COLORS = [
  "#1f2328",
  "#0a64d6",
  "#d1242f",
  "#1a7f37",
  "#8250df",
  "#f5c400",
] as const;

/** How far the eraser reaches around the pointer, in the sketch's points. */
export const ERASER_RADIUS = 8;

/** An ink and the width it was chosen at. */
export interface Nib {
  readonly tool: DrawingTool;
  readonly width: number;
}

export interface NibInput {
  /** 0 to 1. */
  readonly pressure: number;
  /** Radians: 0 lying flat, π/2 upright. */
  readonly altitude: number;
}

/** The width and opacity the ink draws at one point. */
export function inkAt(
  nib: Nib,
  input: NibInput,
): { width: number; opacity: number } {
  const pressure = clamp(input.pressure, 0, 1);
  switch (nib.tool) {
    case "pen":
      return { width: nib.width * (0.3 + 1.4 * pressure), opacity: 1 };
    case "pencil": {
      // 0 upright, 1 lying flat: the side of the lead lays a broad, light line.
      const tilt = 1 - clamp(input.altitude, 0, Math.PI / 2) / (Math.PI / 2);
      return {
        width: nib.width * (0.8 + 0.4 * pressure) * (1 + 2.5 * tilt),
        opacity: (0.3 + 0.65 * pressure) * (1 - 0.4 * tilt),
      };
    }
    case "marker":
      return { width: nib.width * (0.85 + 0.3 * pressure), opacity: 1 };
  }
}

/** The colours' names, for a screen reader. */
export const COLOR_NAMES: Readonly<Record<(typeof COLORS)[number], string>> = {
  "#1f2328": "Black",
  "#0a64d6": "Blue",
  "#d1242f": "Red",
  "#1a7f37": "Green",
  "#8250df": "Purple",
  "#f5c400": "Yellow",
};

export const WIDTH_NAMES = ["Thin", "Medium", "Thick"] as const;

export type WidthStep = 0 | 1 | 2;

/**
 * What the palette has chosen: a tool, and each ink's colour and width,
 * kept while the window lives, as the iPad's tool picker keeps its tools.
 */
export interface ToolChoice {
  readonly tool: CanvasTool;
  readonly colors: Readonly<Record<DrawingTool, string>>;
  readonly widths: Readonly<Record<DrawingTool, WidthStep>>;
}

export const FIRST_CHOICE: ToolChoice = {
  tool: "pen",
  colors: { pen: "#1f2328", pencil: "#1f2328", marker: "#f5c400" },
  widths: { pen: 1, pencil: 1, marker: 1 },
};

/** The ink the choice draws with; undefined while the eraser is chosen. */
export function chosenInk(
  choice: ToolChoice,
): { readonly nib: Nib; readonly color: string } | undefined {
  if (choice.tool === "eraser") {
    return undefined;
  }
  const { tool } = choice;
  return {
    nib: { tool, width: WIDTHS[tool][choice.widths[tool]] },
    color: choice.colors[tool],
  };
}
