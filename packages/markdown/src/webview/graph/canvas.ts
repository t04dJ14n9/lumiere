import Graph from "graphology";
import Sigma from "sigma";
import { extremityArrow } from "sigma/rendering";
import {
  startLayoutWorker,
  stopLayoutWorker,
  type LayoutWorkerSession,
} from "./worker-boot";

export interface GraphCamera {
  x: number;
  y: number;
  angle: number;
  ratio: number;
}

export interface CanvasNode {
  id: string;
  title: string;
  color: string;
  classification: "conformant" | "nonconformant" | "indexing";
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  count: number;
}

export interface GraphCanvas {
  apply(
    nodes: readonly CanvasNode[],
    edges: readonly CanvasEdge[],
    saved: ReadonlyMap<string, { x: number; y: number }>,
  ): { needsRelayout: boolean };
  relayout(): void;
  stop(): void;
  restoreCamera(state: GraphCamera | undefined): void;
  camera(): GraphCamera;
  onOpen(listener: (nodeId: string) => void): void;
  onCamera(listener: (state: GraphCamera) => void): void;
  positions(): Map<string, { x: number; y: number }>;
  destroy(): void;
}

interface CanvasModel {
  graph: Graph;
  renderer: Sigma;
  positions: Map<string, { x: number; y: number }>;
  previous: Set<string>;
  workerSession: LayoutWorkerSession | undefined;
  workerTicket: number;
  workerUrl: string | undefined;
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
}

/** Sigma drawing. Layout runs in a worker and stops when the snapshot is replaced. */
export function mountCanvas(
  container: HTMLElement,
  workerUrl: string | undefined,
): GraphCanvas {
  const graph = new Graph({ type: "directed", multi: false });
  return bindCanvas({
    graph,
    renderer: new Sigma(graph, container, {
      // v3 sized nodes/edges in screen pixels; v4 defaults to "positions".
      settings: { itemSizesReference: "screen" },
      primitives: {
        edges: {
          extremities: [extremityArrow()],
          defaultHead: "arrow",
        },
      },
    }),
    positions: new Map(),
    previous: new Set(),
    workerSession: undefined,
    workerTicket: 0,
    workerUrl,
    nodes: [],
    edges: [],
  });
}

function bindCanvas(model: CanvasModel): GraphCanvas {
  return {
    apply: (nodes, edges, saved) => applySnapshot(model, nodes, edges, saved),
    relayout: () => restartWorker(model),
    stop: () => stopWorker(model),
    restoreCamera(state) {
      if (state) {
        model.renderer.getCamera().setState(state);
      }
    },
    camera: () => readCamera(model),
    onOpen(listener) {
      model.renderer.on("clickNode", ({ node }) => listener(node));
    },
    onCamera(listener) {
      model.renderer
        .getCamera()
        .on("updated", () => listener(readCamera(model)));
    },
    positions: () => model.positions,
    destroy() {
      stopWorker(model);
      model.renderer.kill();
    },
  };
}

function applySnapshot(
  model: CanvasModel,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  saved: ReadonlyMap<string, { x: number; y: number }>,
): { needsRelayout: boolean } {
  model.nodes = nodes;
  model.edges = edges;
  const shift =
    model.previous.size === 0 ? 0 : shiftCount(model.previous, nodes);
  const first =
    model.previous.size === 0 && nodes.length > 0 && saved.size === 0;
  stopWorker(model);
  place(nodes, edges, saved, model.positions);
  replaceGraph(model.graph, nodes, edges, model.positions);
  model.previous = new Set(nodes.map((node) => node.id));
  if (first) {
    startWorker(model);
  }
  return { needsRelayout: shift > 40 };
}

function restartWorker(model: CanvasModel): void {
  stopWorker(model);
  startWorker(model);
}

function startWorker(model: CanvasModel): void {
  if (!model.workerUrl || model.nodes.length === 0) {
    return;
  }
  const ticket = ++model.workerTicket;
  const scriptUrl = model.workerUrl;
  void startLayoutWorker({
    scriptUrl,
    ticket,
    isCurrent: (current) => current === model.workerTicket,
    fetchScript: fetchWorkerSource,
    createObjectUrl: (source) =>
      URL.createObjectURL(new Blob([source], { type: "text/javascript" })),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    createWorker: (objectUrl) => new Worker(objectUrl, { type: "module" }),
  }).then((session) => attachWorker(model, ticket, session));
}

function attachWorker(
  model: CanvasModel,
  ticket: number,
  session: LayoutWorkerSession | undefined,
): void {
  if (!session) {
    return;
  }
  if (ticket !== model.workerTicket) {
    stopLayoutWorker(session, (url) => URL.revokeObjectURL(url));
    return;
  }
  model.workerSession = session;
  session.worker.onmessage = (event: MessageEvent<unknown>) => {
    receivePositions(model, event.data);
  };
  session.worker.postMessage(layoutMessage(model));
}

function receivePositions(model: CanvasModel, data: unknown): void {
  if (
    !isRecord(data) ||
    data.type !== "positions" ||
    !Array.isArray(data.positions)
  ) {
    return;
  }
  applyPositions(model.graph, model.positions, data.positions);
}

function layoutMessage(model: CanvasModel): {
  type: "start";
  nodes: { id: string; x: number; y: number }[];
  edges: { source: string; target: string }[];
} {
  return {
    type: "start",
    nodes: [...model.positions].map(([id, point]) => ({
      id,
      x: point.x,
      y: point.y,
    })),
    edges: model.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    })),
  };
}

async function fetchWorkerSource(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Layout worker failed to load");
  }
  return response.text();
}

function stopWorker(model: CanvasModel): void {
  model.workerTicket += 1;
  const session = model.workerSession;
  model.workerSession = undefined;
  stopLayoutWorker(session, (url) => URL.revokeObjectURL(url));
}

function readCamera(model: CanvasModel): GraphCamera {
  const state = model.renderer.getCamera().getState();
  return { x: state.x, y: state.y, angle: state.angle, ratio: state.ratio };
}

function place(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  saved: ReadonlyMap<string, { x: number; y: number }>,
  positions: Map<string, { x: number; y: number }>,
): void {
  const known = new Map(saved);
  positions.clear();
  for (const node of nodes) {
    positions.set(node.id, known.get(node.id) ?? seed(node.id, edges, known));
  }
}

function seed(
  id: string,
  edges: readonly CanvasEdge[],
  saved: ReadonlyMap<string, { x: number; y: number }>,
): { x: number; y: number } {
  for (const edge of edges) {
    const other = otherEnd(edge, id);
    const point = other ? saved.get(other) : undefined;
    if (point) {
      return { x: point.x + 0.08, y: point.y + 0.08 };
    }
  }
  return hashPosition(id);
}

function otherEnd(edge: CanvasEdge, id: string): string | undefined {
  if (edge.source === id) {
    return edge.target;
  }
  if (edge.target === id) {
    return edge.source;
  }
  return undefined;
}

function hashPosition(id: string): { x: number; y: number } {
  let hash = 0;
  for (const char of id) {
    hash = Math.imul(hash, 31) + char.charCodeAt(0);
  }
  const angle = (Math.abs(hash) % 628) / 100;
  const radius = 0.2 + (Math.abs(hash) % 100) / 100;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function replaceGraph(
  graph: Graph,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  positions: Map<string, { x: number; y: number }>,
): void {
  graph.clear();
  for (const node of nodes) {
    const point = positions.get(node.id);
    if (!point) {
      continue;
    }
    graph.addNode(node.id, {
      x: point.x,
      y: point.y,
      size: sizeFor(node.classification),
      color: node.color,
      label: labelFor(node),
    });
  }
  for (const edge of edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
      continue;
    }
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      size: Math.min(5, Math.max(1, edge.count)),
      color: "#8a8a8a",
    });
  }
}

function applyPositions(
  graph: Graph,
  positions: Map<string, { x: number; y: number }>,
  incoming: readonly unknown[],
): void {
  for (const value of incoming) {
    if (!isRecord(value) || typeof value.id !== "string") {
      continue;
    }
    if (typeof value.x !== "number" || typeof value.y !== "number") {
      continue;
    }
    if (!graph.hasNode(value.id)) {
      continue;
    }
    positions.set(value.id, { x: value.x, y: value.y });
    graph.mergeNodeAttributes(value.id, { x: value.x, y: value.y });
  }
}

function shiftCount(
  previous: Set<string>,
  nodes: readonly CanvasNode[],
): number {
  const next = new Set(nodes.map((node) => node.id));
  let count = 0;
  for (const id of previous) {
    if (!next.has(id)) {
      count += 1;
    }
  }
  for (const id of next) {
    if (!previous.has(id)) {
      count += 1;
    }
  }
  return count;
}

function labelFor(node: CanvasNode): string {
  if (node.classification === "nonconformant") {
    return `! ${node.title}`;
  }
  if (node.classification === "indexing") {
    return `? ${node.title}`;
  }
  return node.title;
}

function sizeFor(classification: CanvasNode["classification"]): number {
  if (classification === "nonconformant") {
    return 7;
  }
  if (classification === "indexing") {
    return 4;
  }
  return 5;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
