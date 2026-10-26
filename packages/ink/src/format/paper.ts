/**
 * The page behind a sketch, as SVG: a colour, then ruled lines, a grid or
 * dots. Each kind is one path, without `<pattern>` ids, so two sketches
 * inlined in one page cannot clash.
 */
import { round } from "./encoding";
import type { Paper } from "./types";

const LINE_COLOR = "#d5dce6";
const DOT_COLOR = "#bcc5d1";

export function paperSvg(
  paper: Paper,
  size: { readonly width: number; readonly height: number },
): string {
  const page =
    paper.color === "none"
      ? ""
      : `<rect width="${n(size.width)}" height="${n(size.height)}" fill="${paper.color}"/>`;
  return page + paperMarks(paper, size);
}

function paperMarks(
  paper: Paper,
  size: { readonly width: number; readonly height: number },
): string {
  const rows = offsets(paper.spacing, size.height);
  const columns = offsets(paper.spacing, size.width);
  // Half a pixel off the grid, so a one-pixel line is crisp at 1x.
  const across = rows.map((y) => `M0 ${n(y + 0.5)}H${n(size.width)}`);
  const down = columns.map((x) => `M${n(x + 0.5)} 0V${n(size.height)}`);
  switch (paper.style) {
    case "plain":
      return "";
    case "ruled":
      return line(across.join(""));
    case "grid":
      return line([...across, ...down].join(""));
    case "dotted":
      return dots(
        rows.flatMap((y) => columns.map((x) => `M${n(x)} ${n(y)}h0`)).join(""),
      );
  }
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
  return `<path d="${data}" fill="none" stroke="${LINE_COLOR}" stroke-width="1"/>`;
}

function dots(data: string): string {
  return `<path d="${data}" fill="none" stroke="${DOT_COLOR}" stroke-width="2.5" stroke-linecap="round"/>`;
}

function n(value: number): string {
  return String(round(value, 2));
}
