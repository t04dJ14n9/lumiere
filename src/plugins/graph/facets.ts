import type { ConceptGraph } from "./project";

export interface GraphFacets {
  types: string[];
  tags: string[];
  folders: string[];
}

/** Filter choices from the unfiltered concept graph, capped for the snapshot schema. */
export function graphFacets(graph: ConceptGraph): GraphFacets {
  const types = new Set<string>();
  const tags = new Set<string>();
  const folders = new Set<string>();
  for (const node of graph.nodes) {
    if (node.type) {
      types.add(node.type);
    }
    if (node.folder) {
      folders.add(node.folder);
    }
    for (const tag of node.tags) {
      tags.add(tag);
    }
  }
  return {
    types: sorted(types, 50),
    tags: sorted(tags, 50),
    folders: sorted(folders, 50),
  };
}

function sorted(values: Set<string>, limit: number): string[] {
  return [...values]
    .map((value) => (value.length <= 200 ? value : value.slice(0, 200)))
    .sort()
    .slice(0, limit);
}
