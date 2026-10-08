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
const sides = ["top", "right", "bottom", "left"];
export function canvasData(source: string): CanvasData {
  const data: unknown = JSON.parse(source);
  if (
    !record(data) ||
    (data.nodes !== undefined && !Array.isArray(data.nodes)) ||
    (data.edges !== undefined && !Array.isArray(data.edges))
  ) {
    throw new Error("Canvas must contain node and edge arrays.");
  }
  const nodes: CanvasNode[] = [],
    edges: CanvasEdge[] = [],
    ids = new Set<string>();
  for (const node of data.nodes ?? []) {
    if (
      !record(node) ||
      typeof node.id !== "string" ||
      ids.has(node.id) ||
      !["text", "file", "link", "group"].includes(String(node.type)) ||
      !["x", "y", "width", "height"].every(
        (key) => typeof node[key] === "number" && Number.isSafeInteger(node[key]),
      ) ||
      Number(node.width) <= 0 ||
      Number(node.height) <= 0
    ) {
      throw new Error("Canvas contains an invalid or duplicate node.");
    }
    for (const field of [
      "color",
      "text",
      "file",
      "subpath",
      "url",
      "label",
      "background",
      "backgroundStyle",
    ]) {
      if (node[field] !== undefined && typeof node[field] !== "string") {
        throw new Error(`Invalid Canvas node ${field}.`);
      }
    }
    const required =
      node.type === "text"
        ? "text"
        : node.type === "file"
          ? "file"
          : node.type === "link"
            ? "url"
            : undefined;
    if (required && typeof node[required] !== "string") {
      throw new Error(`Canvas node requires ${required}.`);
    }
    if (
      node.subpath !== undefined &&
      (typeof node.subpath !== "string" || !node.subpath.startsWith("#"))
    ) {
      throw new Error("Canvas subpaths must begin with #.");
    }
    if (
      node.backgroundStyle !== undefined &&
      (typeof node.backgroundStyle !== "string" ||
        !["cover", "ratio", "repeat"].includes(node.backgroundStyle))
    ) {
      throw new Error("Invalid Canvas background style.");
    }
    ids.add(node.id);
    nodes.push(node as unknown as CanvasNode);
  }
  const edgeIds = new Set<string>();
  for (const edge of data.edges ?? []) {
    if (
      !record(edge) ||
      typeof edge.id !== "string" ||
      edgeIds.has(edge.id) ||
      typeof edge.fromNode !== "string" ||
      !ids.has(edge.fromNode) ||
      typeof edge.toNode !== "string" ||
      !ids.has(edge.toNode)
    ) {
      throw new Error("Canvas contains an invalid edge.");
    }
    for (const key of ["fromSide", "toSide"]) {
      if (
        edge[key] !== undefined &&
        (typeof edge[key] !== "string" || !sides.includes(edge[key]))
      ) {
        throw new Error("Invalid Canvas edge side.");
      }
    }
    for (const key of ["fromEnd", "toEnd"]) {
      if (
        edge[key] !== undefined &&
        (typeof edge[key] !== "string" || !["none", "arrow"].includes(edge[key]))
      ) {
        throw new Error("Invalid Canvas edge end.");
      }
    }
    for (const key of ["label", "color"]) {
      if (edge[key] !== undefined && typeof edge[key] !== "string") {
        throw new Error(`Invalid Canvas edge ${key}.`);
      }
    }
    edgeIds.add(edge.id);
    edges.push(edge as unknown as CanvasEdge);
  }
  return { nodes, edges };
}
export function canvasColor(value?: string): string {
  const colors = ["#e05252", "#dc923f", "#c9b63e", "#55a769", "#51a5bc", "#a576cc"];
  return value && /^#[\da-f]{6}$/i.test(value)
    ? value
    : (colors[Number(value) - 1] ?? "var(--vscode-panel-border, #777)");
}
export function canvasBounds(nodes: readonly Pick<CanvasNode, "x" | "y" | "width" | "height">[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!nodes.length) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const node of nodes) {
    x = Math.min(x, node.x);
    y = Math.min(y, node.y);
    right = Math.max(right, node.x + node.width);
    bottom = Math.max(bottom, node.y + node.height);
  }
  return { x, y, width: right - x, height: bottom - y };
}
export function edgePoint(node: CanvasNode, side: string): { x: number; y: number } {
  return {
    x: node.x + (side === "left" ? 0 : side === "right" ? node.width : node.width / 2),
    y: node.y + (side === "top" ? 0 : side === "bottom" ? node.height : node.height / 2),
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
  const dx = to.x + to.width / 2 - from.x - from.width / 2,
    dy = to.y + to.height / 2 - from.y - from.height / 2;
  const automatic =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
  const opposite: Record<string, string> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  const fromSide = edge.fromSide ?? automatic,
    toSide = edge.toSide ?? (from.id === to.id ? "top" : opposite[automatic]!);
  const start = edgePoint(from, fromSide),
    end = edgePoint(to, toSide);
  const outside = (point: Point, side: string, distance: number): Point => ({
    x: point.x + direction[side]!.x * distance,
    y: point.y + direction[side]!.y * distance,
  });
  const format = (point: Point): string => `${point.x} ${point.y}`;
  const boundsFor = (points: Point[]) =>
    canvasBounds(points.map((point) => ({ ...point, width: 0, height: 0 })));
  if (from.id !== to.id) {
    const distance = Math.max(40, Math.min(160, Math.hypot(dx, dy) / 2));
    const a = outside(start, fromSide, distance),
      b = outside(end, toSide, distance);
    return {
      path: `M ${format(start)} C ${format(a)} ${format(b)} ${format(end)}`,
      label: {
        x: (start.x + 3 * a.x + 3 * b.x + end.x) / 8,
        y: (start.y + 3 * a.y + 3 * b.y + end.y) / 8,
      },
      bounds: boundsFor([start, a, b, end]),
    };
  }
  const margin = 64,
    order = ["top", "right", "bottom", "left"];
  const first = order.indexOf(fromSide),
    last = order.indexOf(toSide),
    clockwise = (last - first + 4) % 4;
  const step = clockwise <= 2 ? 1 : -1,
    steps = clockwise === 0 ? 4 : step === 1 ? clockwise : 4 - clockwise;
  const left = from.x - margin,
    top = from.y - margin,
    right = from.x + from.width + margin,
    bottom = from.y + from.height + margin;
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
  const towards = (point: Point, other: Point): Point => {
    const amount = Math.min(0.5, 12 / Math.hypot(other.x - point.x, other.y - point.y));
    return {
      x: point.x + (other.x - point.x) * amount,
      y: point.y + (other.y - point.y) * amount,
    };
  };
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
