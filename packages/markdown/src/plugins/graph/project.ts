import type { NoteMetadata } from "../../markdown/metadata";
import { linkpathOf, linkSyntax } from "../../markdown/metadata/linkpaths";
import {
  conceptClass,
  conceptDescription,
  conceptTags,
  conceptTitle,
  conceptType,
  isInsideBundle,
  isReservedNote,
} from "../../markdown/okf";
import {
  extensionOf,
  folderOf,
  isMarkdownPath,
  type LinkSyntax,
} from "../../shared/vault-path";

export interface GraphNote {
  path: string;
  metadata?: NoteMetadata;
}

export interface ResolvedTarget {
  status: "file" | "missing";
  path?: string;
}

export interface ConceptNode {
  id: string;
  path: string;
  title: string;
  description?: string;
  type?: string;
  folder: string;
  tags: readonly string[];
  classification: ReturnType<typeof conceptClass>;
  degree: number;
  orphan: boolean;
  unresolved: number;
  navigation: number;
  assets: number;
  outOfScope: number;
}

export interface ConceptEdge {
  id: string;
  source: string;
  target: string;
  count: number;
}

export interface ConceptGraph {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

interface EdgeHit {
  kind:
    "concept" | "navigation" | "asset" | "out-of-scope" | "unresolved" | "self";
  path?: string;
}

/** Concept graph for one bundle. Reserved notes are omitted. Edges are directed and aggregated. */
export function buildConceptGraph(input: {
  bundleRoot: string;
  notes: readonly GraphNote[];
  resolve(
    linktext: string,
    sourcePath: string,
    syntax: LinkSyntax,
  ): ResolvedTarget;
}): ConceptGraph {
  const nodes = conceptNodes(input.bundleRoot, input.notes);
  const byPath = new Map(nodes.map((node) => [node.path, node]));
  const counts = new Map<string, number>();
  const neighbours = new Map<string, Set<string>>(
    nodes.map((node) => [node.id, new Set()]),
  );
  for (const note of input.notes) {
    const source = byPath.get(note.path);
    if (!source || !note.metadata) {
      continue;
    }
    for (const link of noteLinks(note.metadata)) {
      const hit = classifyHit(input, source.path, link, byPath);
      if (hit) {
        recordHit(source, hit, counts, neighbours);
      }
    }
  }
  for (const node of nodes) {
    const degree = neighbours.get(node.id)?.size ?? 0;
    node.degree = degree;
    node.orphan = degree === 0;
  }
  return { nodes, edges: edgesFrom(counts) };
}

function conceptNodes(
  bundleRoot: string,
  notes: readonly GraphNote[],
): ConceptNode[] {
  return notes
    .filter((note) => isConcept(bundleRoot, note.path))
    .map((note) => {
      const frontmatter = note.metadata?.frontmatter;
      const description = conceptDescription(frontmatter);
      const type = conceptType(frontmatter);
      return {
        id: note.path,
        path: note.path,
        title: conceptTitle(note.path, frontmatter),
        ...(description ? { description } : {}),
        ...(type ? { type } : {}),
        folder: folderOf(note.path),
        tags: conceptTags(frontmatter),
        classification: conceptClass(note.metadata),
        degree: 0,
        orphan: true,
        unresolved: 0,
        navigation: 0,
        assets: 0,
        outOfScope: 0,
      };
    });
}

function isConcept(bundleRoot: string, path: string): boolean {
  return (
    isMarkdownPath(path) &&
    isInsideBundle(path, bundleRoot) &&
    !isReservedNote(path)
  );
}

/** Body links/embeds plus frontmatter wikilinks (Obsidian graph includes both). */
function noteLinks(metadata: NoteMetadata) {
  return [...metadata.links, ...metadata.embeds, ...metadata.frontmatterLinks];
}

function classifyHit(
  input: {
    bundleRoot: string;
    resolve(
      linktext: string,
      sourcePath: string,
      syntax: LinkSyntax,
    ): ResolvedTarget;
  },
  sourcePath: string,
  link: ReturnType<typeof noteLinks>[number],
  nodes: Map<string, ConceptNode>,
): EdgeHit | undefined {
  const linktext = linkpathOf(link);
  if (!linktext) {
    return undefined;
  }
  const target = input.resolve(linktext, sourcePath, linkSyntax(link));
  if (target.status === "missing" || !target.path) {
    return { kind: "unresolved" };
  }
  if (target.path === sourcePath) {
    return { kind: "self" };
  }
  if (!isInsideBundle(target.path, input.bundleRoot)) {
    return { kind: "out-of-scope", path: target.path };
  }
  if (isReservedNote(target.path)) {
    return { kind: "navigation", path: target.path };
  }
  if (!isMarkdownPath(target.path) || extensionOf(target.path) !== "md") {
    return { kind: "asset", path: target.path };
  }
  if (!nodes.has(target.path)) {
    return { kind: "out-of-scope", path: target.path };
  }
  return { kind: "concept", path: target.path };
}

function recordHit(
  source: ConceptNode,
  hit: EdgeHit,
  counts: Map<string, number>,
  neighbours: Map<string, Set<string>>,
): void {
  if (hit.kind === "unresolved") {
    source.unresolved += 1;
    return;
  }
  if (hit.kind === "navigation") {
    source.navigation += 1;
    return;
  }
  if (hit.kind === "asset") {
    source.assets += 1;
    return;
  }
  if (hit.kind === "out-of-scope") {
    source.outOfScope += 1;
    return;
  }
  if (hit.kind === "self" || !hit.path) {
    return;
  }
  const key = `${source.id}\0${hit.path}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
  neighbours.get(source.id)?.add(hit.path);
  neighbours.get(hit.path)?.add(source.id);
}

function edgesFrom(counts: Map<string, number>): ConceptEdge[] {
  return [...counts].map(([key, count]) => {
    const [source = "", target = ""] = key.split("\0");
    return { id: `${source}->${target}`, source, target, count };
  });
}
