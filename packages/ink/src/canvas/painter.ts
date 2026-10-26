/**
 * Draws the page on the canvas from the format's own shapes (`strokeFills`,
 * `paperMarks`), so the page while drawing is the page the SVG shows: the
 * same outlines, the same pieces of pencil shading, the same paper.
 *
 * The canvases cover the view, not the page; each paint places the page by
 * the view's scroll and the page's layout, and draws only the strokes in
 * sight.
 */
import {
  PAPER_DOT,
  PAPER_LINE,
  paperMarks,
  strokeFills,
  type InkStroke,
  type Paper,
} from "../format";
import { boundsOf, type PageLayout } from "./page";
import { MUTED, PAGE_EDGE } from "./styles";

export interface Viewport {
  /** CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly scrollTop: number;
  /** Device pixels per CSS pixel. */
  readonly ratio: number;
  readonly layout: PageLayout;
}

export interface PageShown {
  readonly width: number;
  readonly height: number;
  readonly paper: Paper;
}

/** The eraser's reach around the pointer, in the sketch's points. */
export interface EraserRing {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** The canvas's backing store at the view's size and the screen's density. */
export function fitLayer(canvas: HTMLCanvasElement, viewport: Viewport): void {
  const width = Math.round(viewport.width * viewport.ratio);
  const height = Math.round(viewport.height * viewport.ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
  }
}

/** The paper and every stroke in sight. */
export function paintPage(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
  page: PageShown,
  strokes: readonly InkStroke[],
): void {
  startPaint(context, viewport, page);
  paintPaper(context, page, viewport.layout.scale);
  const top =
    (viewport.scrollTop - viewport.layout.top) / viewport.layout.scale;
  const bottom = top + viewport.height / viewport.layout.scale;
  for (const stroke of strokes) {
    const bounds = boundsOf(stroke);
    if (bounds && bounds.bottom >= top && bounds.top <= bottom) {
      fill(context, preparedFills(stroke));
    }
  }
  context.restore();
}

/** The stroke being drawn, or the eraser's ring, over the page. */
export function paintLive(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
  page: PageShown,
  shown: { readonly stroke?: InkStroke; readonly eraser?: EraserRing },
): void {
  startPaint(context, viewport, page);
  if (shown.stroke) {
    fill(context, prepare(shown.stroke));
  }
  if (shown.eraser) {
    const { x, y, radius } = shown.eraser;
    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    context.fillStyle = "rgba(255, 255, 255, 0.35)";
    context.fill();
    context.lineWidth = 1.5 / viewport.layout.scale;
    context.strokeStyle = MUTED;
    context.stroke();
  }
  context.restore();
}

/** Cleared, in the sketch's coordinates, and clipped to the page's width as the SVG's view box is. */
function startPaint(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
  page: PageShown,
): void {
  const { ratio, layout, scrollTop } = viewport;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.save();
  context.setTransform(
    ratio * layout.scale,
    0,
    0,
    ratio * layout.scale,
    ratio * layout.left,
    ratio * (layout.top - scrollTop),
  );
  context.beginPath();
  // Downwards without end: what is drawn below the page grows it.
  context.rect(0, 0, page.width, 1e6);
  context.clip();
}

function paintPaper(
  context: CanvasRenderingContext2D,
  page: PageShown,
  scale: number,
): void {
  // A transparent page shows white here, as on the iPad: ink is drawn as on light paper.
  context.fillStyle =
    page.paper.color === "none" ? "#ffffff" : page.paper.color;
  context.fillRect(0, 0, page.width, page.height);
  const marks = paperPaths(page);
  context.lineWidth = PAPER_LINE.width;
  context.strokeStyle = PAPER_LINE.color;
  context.stroke(marks.lines);
  context.fillStyle = PAPER_DOT.color;
  context.fill(marks.dots);
  context.lineWidth = 1 / scale;
  context.strokeStyle = PAGE_EDGE;
  context.strokeRect(0, 0, page.width, page.height);
}

interface PaperPaths {
  readonly key: string;
  readonly lines: Path2D;
  readonly dots: Path2D;
}

let paper: PaperPaths | undefined;

/** The paper's marks as paths, kept until the page changes size. */
function paperPaths(page: PageShown): PaperPaths {
  const key = JSON.stringify([page.paper, page.width, page.height]);
  if (paper?.key === key) {
    return paper;
  }
  const marks = paperMarks(page.paper, page);
  const lines = new Path2D();
  for (const y of marks.across) {
    lines.moveTo(0, y);
    lines.lineTo(page.width, y);
  }
  for (const x of marks.down) {
    lines.moveTo(x, 0);
    lines.lineTo(x, page.height);
  }
  const dots = new Path2D();
  for (const [x, y] of marks.dots) {
    dots.moveTo(x + PAPER_DOT.diameter / 2, y);
    dots.arc(x, y, PAPER_DOT.diameter / 2, 0, 2 * Math.PI);
  }
  paper = { key, lines, dots };
  return paper;
}

interface PreparedFills {
  readonly rgb: string;
  readonly multiplies: boolean;
  readonly pieces: readonly {
    readonly path: Path2D;
    readonly opacity: number;
  }[];
}

/** Strokes never change once drawn, so their paths are built once. */
const prepared = new WeakMap<InkStroke, PreparedFills | undefined>();

function preparedFills(stroke: InkStroke): PreparedFills | undefined {
  if (!prepared.has(stroke)) {
    prepared.set(stroke, prepare(stroke));
  }
  return prepared.get(stroke);
}

function prepare(stroke: InkStroke): PreparedFills | undefined {
  const fills = strokeFills(stroke);
  return (
    fills && {
      rgb: fills.rgb,
      multiplies: fills.multiplies,
      pieces: fills.pieces.map((piece) => ({
        path: new Path2D(piece.path),
        opacity: piece.opacity,
      })),
    }
  );
}

function fill(
  context: CanvasRenderingContext2D,
  fills: PreparedFills | undefined,
): void {
  if (!fills) {
    return;
  }
  context.save();
  context.fillStyle = fills.rgb;
  context.globalCompositeOperation = fills.multiplies
    ? "multiply"
    : "source-over";
  for (const piece of fills.pieces) {
    context.globalAlpha = piece.opacity;
    context.fill(piece.path, "nonzero");
  }
  context.restore();
}
