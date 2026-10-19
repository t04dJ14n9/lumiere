import type { Infer } from "@workshop/core";
import { isInsideBundle } from "../../markdown/okf";
import type { OkfBundle } from "../okfCore/api";
import { HARD_MAX_PAYLOAD_BYTES } from "./admission";
import { graphFacets } from "./facets";
import type { GraphFilters } from "./filters";
import type { protocol } from "./protocol";
import { buildConceptGraph } from "./project";
import type { LinkSyntax } from "../../shared/vault-path";
import type { GraphNote, ResolvedTarget } from "./project";
import { drawGraph } from "./view";
import type { DrawnNode } from "./view";

export type GraphSnapshot = Infer<(typeof protocol.notifications)["snapshot"]>;

export interface SnapshotRequest {
  bundle: OkfBundle;
  notes: readonly GraphNote[];
  resolve(
    linktext: string,
    sourcePath: string,
    syntax: LinkSyntax,
  ): ResolvedTarget;
  completeness: GraphSnapshot["completeness"];
  generation: number;
  mode: "global" | "local";
  depth: number;
  colorBy: "type" | "folder" | "tag";
  filters: GraphFilters;
  focusPath?: string;
  maxNodes: number;
  maxEdges: number;
}

const EMPTY_REASON =
  "No OKF bundle is open. Choose a bundle to draw its notes.";

/** A panel with nowhere to draw. The generation still moves so a stale graph clears. */
export function emptySnapshot(generation: number): GraphSnapshot {
  return {
    scopeId: "",
    generation,
    completeness: "ready",
    bundleName: "",
    bundlePath: "",
    mode: "global",
    depth: 2,
    colorBy: "type",
    focusExcluded: false,
    omittedConformant: 0,
    accepted: true,
    nodeCount: 0,
    edgeCount: 0,
    reason: EMPTY_REASON,
    nodes: [],
    edges: [],
    legend: [],
    facets: { types: [], tags: [], folders: [] },
  };
}

/** Project one bundle, draw the requested view, and refuse an oversized payload. */
export function presentSnapshot(request: SnapshotRequest): GraphSnapshot {
  const concept = buildConceptGraph({
    bundleRoot: request.bundle.root,
    notes: request.notes,
    resolve: request.resolve,
  });
  const focusId = focusInside(request.bundle.root, request.focusPath);
  const drawn = drawGraph(concept, {
    mode: request.mode,
    depth: request.depth,
    colorBy: request.colorBy,
    filters: request.filters,
    ...(focusId ? { focusId } : {}),
    maxNodes: request.maxNodes,
    maxEdges: request.maxEdges,
  });
  const snapshot: GraphSnapshot = {
    scopeId: clip(request.bundle.id, 2048),
    generation: request.generation,
    completeness: request.completeness,
    bundleName: clip(request.bundle.name, 500),
    bundlePath: clip(request.bundle.root, 1024),
    mode: request.mode,
    depth: request.depth,
    colorBy: request.colorBy,
    focusExcluded: drawn.focusExcluded,
    omittedConformant: drawn.omittedConformant,
    accepted: drawn.accepted,
    nodeCount: drawn.nodeCount,
    edgeCount: drawn.edgeCount,
    ...(drawn.reason ? { reason: clip(drawn.reason, 500) } : {}),
    nodes: fittedNodes(drawn.nodes),
    edges: fittedEdges(drawn.edges, fittedNodes(drawn.nodes)),
    legend: drawn.legend.map((entry) => ({
      key: clip(entry.key, 200),
      color: clip(entry.color, 16),
      count: entry.count,
    })),
    facets: graphFacets(concept),
  };
  return guardPayload(snapshot);
}

function focusInside(
  bundleRoot: string,
  path: string | undefined,
): string | undefined {
  if (!path || path.length > 1024 || !isInsideBundle(path, bundleRoot)) {
    return undefined;
  }
  return path;
}

function fittedNodes(nodes: readonly DrawnNode[]): GraphSnapshot["nodes"] {
  return nodes.flatMap((node) => fittedNode(node));
}

function fittedEdges(
  edges: GraphSnapshot["edges"],
  nodes: GraphSnapshot["nodes"],
): GraphSnapshot["edges"] {
  const ids = new Set(nodes.map((node) => node.id));
  return edges
    .flatMap((edge) => fittedEdge(edge))
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target));
}

function fittedNode(node: DrawnNode): GraphSnapshot["nodes"] {
  if (node.id.length > 1024 || node.path.length > 1024) {
    return [];
  }
  const description = node.description
    ? clip(node.description, 4000)
    : undefined;
  const type = node.type ? clip(node.type, 200) : undefined;
  return [
    {
      id: node.id,
      title: clip(node.title, 500),
      path: node.path,
      folder: clip(node.folder, 1024),
      tags: node.tags.slice(0, 50).map((tag) => clip(tag, 200)),
      classification: node.classification,
      degree: node.degree,
      orphan: node.orphan,
      unresolved: node.unresolved,
      color: clip(node.color, 16),
      colorKey: clip(node.colorKey, 200),
      ...(description ? { description } : {}),
      ...(type ? { type } : {}),
    },
  ];
}

function fittedEdge(
  edge: GraphSnapshot["edges"][number],
): GraphSnapshot["edges"] {
  if (edge.source.length > 1024 || edge.target.length > 1024) {
    return [];
  }
  return [{ ...edge, id: clip(edge.id, 2100) }];
}

function guardPayload(snapshot: GraphSnapshot): GraphSnapshot {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
  if (bytes <= HARD_MAX_PAYLOAD_BYTES) {
    return snapshot;
  }
  return {
    ...snapshot,
    accepted: false,
    nodes: [],
    edges: [],
    legend: [],
    reason: "This graph is too large to draw. Narrow the bundle or filters.",
  };
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
