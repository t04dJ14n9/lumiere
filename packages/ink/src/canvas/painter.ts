/**
 * Draws the sketch on the canvas from the format's own shapes
 * (`strokeFills`, `paperMarksWithin`), so what is drawn is what the SVG
 * shows: the same outlines, the same pieces of pencil shading, the same
 * paper. The paper has no edge here: it fills whatever the camera shows.
 *
 * The canvases cover the view; each paint places the sketch by the camera
 * and draws only the strokes in sight.
 */
import {
  PAPER_DOT,
  PAPER_LINE,
  paperMarksWithin,
  strokeFills,
  type InkStroke,
  type Paper,
  type PaperArea,
} from "../format";
import { boundsOf, overlaps } from "./bounds";
import { visibleArea, type Camera } from "./camera";
import { MUTED } from "./styles";

export interface Viewport {
  /** CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Device pixels per CSS pixel. */
  readonly ratio: number;
  readonly camera: Camera;
}

/** The eraser's reach around the pointer, in the sketch's points. */
export interface EraserRing {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Marks closer than this on screen, in CSS pixels, would be a grey wash
 * (and, zoomed far out on fine paper, millions of dots): they are left out.
 */
const FINEST_MARKS = 6;
/** The paper's marks are worked out for squares this large, in points, and kept while the view stays within them. */
const PAPER_CHUNK = 512;

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
export function paintBoard(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
  paper: Paper,
  strokes: readonly InkStroke[],
): void {
  const area = visibleArea(viewport.camera, viewport);
  startPaint(context, viewport);
  paintPaper(context, paper, area, viewport.camera.zoom);
  for (const stroke of strokes) {
    const bounds = boundsOf(stroke);
    if (bounds && overlaps(bounds, area)) {
      fill(context, preparedFills(stroke));
    }
  }
  context.restore();
}

/** The stroke being drawn, or the eraser's ring, over the paper. */
export function paintLive(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
  shown: { readonly stroke?: InkStroke; readonly eraser?: EraserRing },
): void {
  startPaint(context, viewport);
  if (shown.stroke) {
    fill(context, prepare(shown.stroke));
  }
  if (shown.eraser) {
    const { x, y, radius } = shown.eraser;
    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    context.fillStyle = "rgba(255, 255, 255, 0.35)";
    context.fill();
    context.lineWidth = 1.5 / viewport.camera.zoom;
    context.strokeStyle = MUTED;
    context.stroke();
  }
  context.restore();
}

/** Cleared, and in the sketch's coordinates as the camera sees them. */
function startPaint(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
): void {
  const { ratio, camera } = viewport;
  const scale = ratio * camera.zoom;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.save();
  context.setTransform(
    scale,
    0,
    0,
    scale,
    -camera.x * scale,
    -camera.y * scale,
  );
}

function paintPaper(
  context: CanvasRenderingContext2D,
  paper: Paper,
  area: PaperArea,
  zoom: number,
): void {
  // A transparent paper shows white here, as on the iPad: ink is drawn as on light paper.
  context.fillStyle = paper.color === "none" ? "#ffffff" : paper.color;
  context.fillRect(
    area.left,
    area.top,
    area.right - area.left,
    area.bottom - area.top,
  );
  if (paper.style === "plain" || paper.spacing * zoom < FINEST_MARKS) {
    return;
  }
  const marks = paperPaths(paper, area);
  context.lineWidth = PAPER_LINE.width;
  context.strokeStyle = PAPER_LINE.color;
  context.stroke(marks.lines);
  context.fillStyle = PAPER_DOT.color;
  context.fill(marks.dots);
}

interface PaperPaths {
  readonly key: string;
  readonly lines: Path2D;
  readonly dots: Path2D;
}

let paperCache: PaperPaths | undefined;

/** The paper's marks over the chunks the view is in, kept while it stays in them. */
function paperPaths(paper: Paper, area: PaperArea): PaperPaths {
  const chunk = {
    left: Math.floor(area.left / PAPER_CHUNK) * PAPER_CHUNK,
    top: Math.floor(area.top / PAPER_CHUNK) * PAPER_CHUNK,
    right: Math.ceil(area.right / PAPER_CHUNK) * PAPER_CHUNK,
    bottom: Math.ceil(area.bottom / PAPER_CHUNK) * PAPER_CHUNK,
  };
  const key = JSON.stringify([paper, chunk]);
  if (paperCache?.key === key) {
    return paperCache;
  }
  const marks = paperMarksWithin(paper, chunk);
  const lines = new Path2D();
  for (const y of marks.across) {
    lines.moveTo(chunk.left, y);
    lines.lineTo(chunk.right, y);
  }
  for (const x of marks.down) {
    lines.moveTo(x, chunk.top);
    lines.lineTo(x, chunk.bottom);
  }
  const dots = new Path2D();
  const radius = PAPER_DOT.diameter / 2;
  for (const [x, y] of marks.dots) {
    dots.moveTo(x + radius, y);
    dots.arc(x, y, radius, 0, 2 * Math.PI);
  }
  paperCache = { key, lines, dots };
  return paperCache;
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
