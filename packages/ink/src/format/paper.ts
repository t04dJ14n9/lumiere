/**
 * The page behind a sketch: a colour, then ruled lines, a grid or dots.
 * `paperMarks` says where they go; the SVG (`paperSvg`) and the web canvas
 * both draw from it, so the page looks the same while drawing and in a
 * note. In the SVG each kind is one path, without `<pattern>` ids, so two
 * sketches inlined in one page cannot clash.
 */
import { round } from "./encoding";
import type { Paper } from "./types";

export const PAPER_LINE = { color: "#d5dce6", width: 1 } as const;
export const PAPER_DOT = { color: "#bcc5d1", diameter: 2.5 } as const;

/** Where a page's marks go, in the sketch's coordinates. */
export interface PaperMarks {
  /** The y of each line across the page; half a point off the grid, so a one-pixel line is crisp at 1x. */
  readonly across: readonly number[];
  /** The x of each line down the page, likewise. */
  readonly down: readonly number[];
  /** The centre of each dot. */
  readonly dots: readonly (readonly [number, number])[];
}

export function paperMarks(
  paper: Paper,
  size: { readonly width: number; readonly height: number },
): PaperMarks {
  const rows = offsets(paper.spacing, size.height);
  const columns = offsets(paper.spacing, size.width);
  const lines = (at: readonly number[]) => at.map((offset) => offset + 0.5);
  switch (paper.style) {
    case "plain":
      return { across: [], down: [], dots: [] };
    case "ruled":
      return { across: lines(rows), down: [], dots: [] };
    case "grid":
      return { across: lines(rows), down: lines(columns), dots: [] };
    case "dotted":
      return {
        across: [],
        down: [],
        dots: rows.flatMap((y) => columns.map((x) => [x, y] as const)),
      };
  }
}

export function paperSvg(
  paper: Paper,
  size: { readonly width: number; readonly height: number },
): string {
  const page =
    paper.color === "none"
      ? ""
      : `<rect width="${n(size.width)}" height="${n(size.height)}" fill="${paper.color}"/>`;
  const marks = paperMarks(paper, size);
  const lines = [
    ...marks.across.map((y) => `M0 ${n(y)}H${n(size.width)}`),
    ...marks.down.map((x) => `M${n(x)} 0V${n(size.height)}`),
  ];
  const dots = marks.dots.map(([x, y]) => `M${n(x)} ${n(y)}h0`);
  return (
    page +
    (lines.length > 0 ? line(lines.join("")) : "") +
    (dots.length > 0 ? dotted(dots.join("")) : "")
  );
}

/** Every multiple of `spacing` strictly inside the page. */
function offsets(spacing: number, length: number): number[] {
  const marks: number[] = [];
  for (let at = spacing; at < length; at += spacing) {
    marks.push(at);
  }
  return marks;
}

function line(data: string): string {
  return `<path d="${data}" fill="none" stroke="${PAPER_LINE.color}" stroke-width="${PAPER_LINE.width}"/>`;
}

function dotted(data: string): string {
  return `<path d="${data}" fill="none" stroke="${PAPER_DOT.color}" stroke-width="${PAPER_DOT.diameter}" stroke-linecap="round"/>`;
}

function n(value: number): string {
  return String(round(value, 2));
}
