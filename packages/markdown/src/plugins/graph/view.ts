import { admit } from "./admission";
import { filterGraph, localGraph } from "./filters";
import type { GraphFilters } from "./filters";
import type { ConceptGraph } from "./project";

const PALETTE = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac",
];

export interface GraphViewRequest {
  mode: "global" | "local";
  depth: number;
  colorBy: "type" | "folder" | "tag";
  filters: GraphFilters;
  focusId?: string;
  maxNodes: number;
  maxEdges: number;
}

export interface DrawnNode {
  id: string;
  title: string;
  path: string;
  description?: string;
  type?: string;
  folder: string;
  tags: readonly string[];
  classification: "conformant" | "nonconformant" | "indexing";
  degree: number;
  orphan: boolean;
  unresolved: number;
  color: string;
  colorKey: string;
}

export interface DrawnGraph {
  nodes: DrawnNode[];
  edges: ConceptGraph["edges"];
  focusExcluded: boolean;
  omittedConformant: number;
  accepted: boolean;
  nodeCount: number;
  edgeCount: number;
  reason?: string;
  legend: { key: string; color: string; count: number }[];
}

/** Filter, take the local neighbourhood, then refuse anything over the hard caps. */
export function drawGraph(
  graph: ConceptGraph,
  request: GraphViewRequest,
): DrawnGraph {
  const filtered = filterGraph(graph, request.filters);
  const local =
    request.mode === "local"
      ? localGraph(filtered.graph, request.focusId, clampDepth(request.depth))
      : { graph: filtered.graph, focusExcluded: false };
  const admission = admit(local.graph.nodes, local.graph.edges, request);
  const drawn = admission.accepted
    ? colorNodes(local.graph, request.colorBy)
    : [];
  return {
    nodes: drawn,
    edges: admission.accepted ? local.graph.edges : [],
    focusExcluded: local.focusExcluded,
    omittedConformant: filtered.omittedConformant,
    accepted: admission.accepted,
    nodeCount: admission.nodeCount,
    edgeCount: admission.edgeCount,
    ...(admission.reason ? { reason: admission.reason } : {}),
    legend: legendOf(drawn),
  };
}

function colorNodes(
  graph: ConceptGraph,
  colorBy: GraphViewRequest["colorBy"],
): DrawnNode[] {
  return graph.nodes.map((node) => {
    const colorKey = keyFor(node, colorBy);
    const description = node.description;
    const type = node.type;
    return {
      id: node.id,
      title: node.title,
      path: node.path,
      ...(description ? { description } : {}),
      ...(type ? { type } : {}),
      folder: node.folder,
      tags: node.tags,
      classification: node.classification,
      degree: node.degree,
      orphan: node.orphan,
      unresolved: node.unresolved,
      color: colorFor(colorKey),
      colorKey,
    };
  });
}

function keyFor(
  node: ConceptGraph["nodes"][number],
  colorBy: GraphViewRequest["colorBy"],
): string {
  if (colorBy === "folder") {
    return node.folder || "(root)";
  }
  if (colorBy === "tag") {
    return node.tags[0] || "(none)";
  }
  return node.type || "(none)";
}

function legendOf(nodes: readonly DrawnNode[]): DrawnGraph["legend"] {
  const counts = new Map<string, { color: string; count: number }>();
  for (const node of nodes) {
    const current = counts.get(node.colorKey) ?? {
      color: node.color,
      count: 0,
    };
    current.count += 1;
    counts.set(node.colorKey, current);
  }
  return [...counts]
    .map(([key, value]) => ({ key, color: value.color, count: value.count }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
    .slice(0, 40);
}

export function colorFor(key: string): string {
  let hash = 0;
  for (const char of key) {
    hash = Math.imul(hash, 31) + char.charCodeAt(0);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length] ?? PALETTE[0]!;
}

function clampDepth(depth: number): number {
  if (!Number.isFinite(depth)) {
    return 2;
  }
  return Math.min(3, Math.max(1, Math.floor(depth)));
}
