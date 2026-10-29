import type { InkPoint, InkStroke, InkTool, Sketch } from "../../src/format";
import { DEFAULT_PAPER } from "../../src/format";

/** A point with the Pencil held upright at half pressure, unless overridden. */
export function point(
  x: number,
  y: number,
  overrides: Partial<InkPoint> = {},
): InkPoint {
  return {
    x,
    y,
    t: 0,
    force: 0.5,
    altitude: Math.PI / 2,
    azimuth: 0,
    width: 4,
    opacity: 1,
    ...overrides,
  };
}

/** A straight stroke along y = 0, one point per entry of `widths`, 25 apart. */
export function horizontalStroke(
  widths: readonly number[],
  tool: InkTool = "pen",
): InkStroke {
  return {
    tool,
    color: "#1f2328",
    points: widths.map((width, index) =>
      point(index * 25, 0, { width, t: index / 100, force: width / 10 }),
    ),
  };
}

export function sketchOf(strokes: readonly InkStroke[]): Sketch {
  return { width: 200, height: 100, paper: DEFAULT_PAPER, strokes };
}

/** The outline's half-height near `x`: how wide the stroke is drawn there. */
export function halfWidthAt(
  outline: readonly (readonly [number, number])[],
  x: number,
  tolerance = 3,
): number {
  const near = outline.filter(([px]) => Math.abs(px - x) <= tolerance);
  return Math.max(...near.map(([, py]) => Math.abs(py)));
}
