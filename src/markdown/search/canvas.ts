import { record } from "../../shared/guards";

export interface CanvasNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  label?: string;
  background?: string;
  backgroundStyle?: string;
}
export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: string;
  toSide?: string;
  fromEnd?: string;
  toEnd?: string;
  color?: string;
  label?: string;
}
export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}
export interface CanvasState {
  scale: number;
  centerX: number;
  centerY: number;
  fit: boolean;
}
export function canvasState(value: unknown): CanvasState | undefined {
  if (
    !record(value) ||
    typeof value.fit !== "boolean" ||
    !["scale", "centerX", "centerY"].every(
      (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
    ) ||
    Number(value.scale) < 0.001 ||
    Number(value.scale) > 4
  ) {
    return;
  }
  return {
    scale: Number(value.scale),
    centerX: Number(value.centerX),
    centerY: Number(value.centerY),
    fit: value.fit,
  };
}
export { canvasData } from "./canvas-data";
export function canvasColor(value?: string): string {
  const colors = [
    "#e05252",
    "#dc923f",
    "#c9b63e",
    "#55a769",
    "#51a5bc",
    "#a576cc",
  ];
  return value && /^#[\da-f]{6}$/i.test(value)
    ? value
    : (colors[Number(value) - 1] ?? "var(--vscode-panel-border, #777)");
}
export function canvasBounds(
  nodes: readonly Pick<CanvasNode, "x" | "y" | "width" | "height">[],
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!nodes.length) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  let x = Infinity;
  let y = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of nodes) {
    x = Math.min(x, node.x);
    y = Math.min(y, node.y);
    right = Math.max(right, node.x + node.width);
    bottom = Math.max(bottom, node.y + node.height);
  }
  return { x, y, width: right - x, height: bottom - y };
}
export function edgePoint(
  node: CanvasNode,
  side: string,
): { x: number; y: number } {
  return {
    x: node.x + sideOffset(side, "left", "right", node.width),
    y: node.y + sideOffset(side, "top", "bottom", node.height),
  };
}

type Point = { x: number; y: number };
const direction: Record<string, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
export function edgeCurve(
  from: CanvasNode,
  to: CanvasNode,
  edge: CanvasEdge,
): { path: string; label: Point; bounds: ReturnType<typeof canvasBounds> } {
  const dx = to.x + to.width / 2 - from.x - from.width / 2;
  const dy = to.y + to.height / 2 - from.y - from.height / 2;
  const automatic = facingSide(dx, dy);
  const opposite: Record<string, string> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  const fromSide = edge.fromSide ?? automatic;
  const toSide =
    edge.toSide ?? (from.id === to.id ? "top" : opposite[automatic]!);
  const start = edgePoint(from, fromSide);
  const end = edgePoint(to, toSide);
  if (from.id !== to.id) {
    const distance = Math.max(40, Math.min(160, Math.hypot(dx, dy) / 2));
    const a = outside(start, fromSide, distance);
    const b = outside(end, toSide, distance);
    return {
      path: `M ${format(start)} C ${format(a)} ${format(b)} ${format(end)}`,
      label: {
        x: (start.x + 3 * a.x + 3 * b.x + end.x) / 8,
        y: (start.y + 3 * a.y + 3 * b.y + end.y) / 8,
      },
      bounds: boundsFor([start, a, b, end]),
    };
  }
  return loopCurve({ from, fromSide, toSide, start, end });
}

function loopCurve({
  from,
  fromSide,
  toSide,
  start,
  end,
}: {
  from: CanvasNode;
  fromSide: string;
  toSide: string;
  start: Point;
  end: Point;
}): ReturnType<typeof edgeCurve> {
  const margin = 64;
  const order = ["top", "right", "bottom", "left"];
  const first = order.indexOf(fromSide);
  const last = order.indexOf(toSide);
  const clockwise = (last - first + 4) % 4;
  const step = clockwise <= 2 ? 1 : -1;
  const steps = loopSteps(clockwise, step);
  const left = from.x - margin;
  const top = from.y - margin;
  const right = from.x + from.width + margin;
  const bottom = from.y + from.height + margin;
  const corners = [
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top },
  ];
  const points = [start, outside(start, fromSide, margin)];
  for (let i = 0; i < steps; i++) {
    points.push(corners[(first + (step === 1 ? i : -i - 1) + 8) % 4]!);
  }
  points.push(outside(end, toSide, margin), end);
  let path = `M ${format(start)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i]!;
    path += ` L ${format(towards(point, points[i - 1]!))} Q ${format(point)} ${format(towards(point, points[i + 1]!))}`;
  }
  path += ` L ${format(end)}`;
  return {
    path,
    label: points[Math.floor(points.length / 2)]!,
    bounds: boundsFor(points),
  };
}

const outside = (point: Point, side: string, distance: number): Point => ({
  x: point.x + direction[side]!.x * distance,
  y: point.y + direction[side]!.y * distance,
});
const format = (point: Point): string => `${point.x} ${point.y}`;
const boundsFor = (points: Point[]) =>
  canvasBounds(points.map((point) => ({ ...point, width: 0, height: 0 })));

const towards = (point: Point, other: Point): Point => {
  const amount = Math.min(
    0.5,
    12 / Math.hypot(other.x - point.x, other.y - point.y),
  );
  return {
    x: point.x + (other.x - point.x) * amount,
    y: point.y + (other.y - point.y) * amount,
  };
};

function loopSteps(clockwise: number, step: number): number {
  if (clockwise === 0) {
    return 4;
  }
  return step === 1 ? clockwise : 4 - clockwise;
}
function facingSide(dx: number, dy: number): string {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}
function sideOffset(
  side: string,
  start: string,
  end: string,
  length: number,
): number {
  if (side === start) {
    return 0;
  }
  return side === end ? length : length / 2;
}
