import type { ConceptEdge, ConceptGraph, ConceptNode } from "./project";

export interface GraphFilters {
  types: readonly string[];
  tags: readonly string[];
  folders: readonly string[];
  text: string;
  orphans: boolean;
  conformantOnly: boolean;
}

export const emptyFilters = (): GraphFilters => ({
  types: [],
  tags: [],
  folders: [],
  text: "",
  orphans: false,
  conformantOnly: false,
});

/** Structural filters. Orphan uses the degree from the unfiltered projection. */
export function filterGraph(
  graph: ConceptGraph,
  filters: GraphFilters,
): { graph: ConceptGraph; omittedConformant: number } {
  const nodes = graph.nodes.filter((node) => matches(node, filters));
  const ids = new Set(nodes.map((node) => node.id));
  const omittedConformant = filters.conformantOnly
    ? graph.nodes.filter(
        (node) => node.classification !== "conformant" && !ids.has(node.id),
      ).length
    : 0;
  return {
    graph: {
      nodes,
      edges: graph.edges.filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    },
    omittedConformant,
  };
}

/**
 * Undirected neighbourhood of `focusId` on an already filtered graph.
 * An excluded focus is not replaced with another node.
 */
export function localGraph(
  graph: ConceptGraph,
  focusId: string | undefined,
  depth: number,
): { graph: ConceptGraph; focusExcluded: boolean } {
  if (!focusId || !graph.nodes.some((node) => node.id === focusId)) {
    return { graph: { nodes: [], edges: [] }, focusExcluded: true };
  }
  const adjacency = undirected(graph.edges);
  const keep = new Set<string>([focusId]);
  let frontier = [focusId];
  for (let hop = 0; hop < depth; hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (!keep.has(neighbour)) {
          keep.add(neighbour);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }
  return {
    graph: {
      nodes: graph.nodes.filter((node) => keep.has(node.id)),
      edges: graph.edges.filter(
        (edge) => keep.has(edge.source) && keep.has(edge.target),
      ),
    },
    focusExcluded: false,
  };
}

function matches(node: ConceptNode, filters: GraphFilters): boolean {
  if (filters.orphans && !node.orphan) {
    return false;
  }
  if (filters.conformantOnly && node.classification !== "conformant") {
    return false;
  }
  if (!facet(filters.types, node.type ? [node.type] : [])) {
    return false;
  }
  if (!facet(filters.tags, node.tags)) {
    return false;
  }
  if (!folderFacet(node.folder, filters.folders)) {
    return false;
  }
  return textMatches(node, filters.text);
}

function facet(wanted: readonly string[], have: readonly string[]): boolean {
  if (wanted.length === 0) {
    return true;
  }
  const owned = new Set(have);
  return wanted.some((item) => owned.has(item));
}

function folderFacet(folder: string, prefixes: readonly string[]): boolean {
  if (prefixes.length === 0) {
    return true;
  }
  return prefixes.some((prefix) => folderMatches(folder, prefix));
}

export function folderMatches(folder: string, prefix: string): boolean {
  const normalized = prefix.replace(/^\/+|\/+$/g, "");
  if (!normalized) {
    return false;
  }
  return folder === normalized || folder.startsWith(`${normalized}/`);
}

function textMatches(node: ConceptNode, text: string): boolean {
  const query = text.trim().toLowerCase();
  if (!query) {
    return true;
  }
  const haystack = [node.title, node.path, node.description ?? ""]
    .join("\n")
    .toLowerCase();
  return haystack.includes(query);
}

function undirected(edges: readonly ConceptEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    const next = adjacency.get(from) ?? new Set<string>();
    next.add(to);
    adjacency.set(from, next);
  };
  for (const edge of edges) {
    add(edge.source, edge.target);
    add(edge.target, edge.source);
  }
  return adjacency;
}
