import type { NoteMetadata } from "../../markdown/metadata";
import {
  linkpathOf,
  linkSyntax,
  vaultLinks,
} from "../../markdown/metadata/linkpaths";
import { linkLookupKey, type LinkSyntax } from "../../shared/vault-path";
import type { Backlink, VaultFile } from "./api";

export interface IndexedLink {
  path: string;
  syntax: LinkSyntax;
}

type Resolver = (
  linkpath: string,
  sourcePath: string,
  syntax: LinkSyntax,
) => VaultFile | undefined;

/**
 * The vault paths a note links to, as written: links, embeds and links in
 * properties, without `#subpaths`, each with the syntax that produced it.
 */
export function outgoingLinks(metadata: NoteMetadata): IndexedLink[] {
  return vaultLinks(metadata).map((link) => ({
    path: linkpathOf(link)!,
    syntax: linkSyntax(link),
  }));
}

/**
 * Obsidian's `resolvedLinks` and `unresolvedLinks`, kept current
 * incrementally. A file event re-resolves only the notes whose links mention
 * that file's name (Obsidian's `updateRelatedLinks`).
 */
export class LinkMaps {
  private readonly linkpaths = new Map<string, readonly IndexedLink[]>();
  private readonly resolved = new Map<string, Map<string, number>>();
  private readonly unresolved = new Map<string, Map<string, number>>();
  /** Lower-case link name → notes whose links use that name. */
  private readonly mentions = new Map<string, Set<string>>();

  constructor(private readonly resolve: Resolver) {}

  sources(): IterableIterator<string> {
    return this.linkpaths.keys();
  }

  setLinks(sourcePath: string, links: readonly IndexedLink[]): void {
    this.forgetMentions(sourcePath);
    this.linkpaths.set(sourcePath, links);
    for (const link of links) {
      const key = linkLookupKey(link.path);
      const sources = this.mentions.get(key) ?? new Set<string>();
      sources.add(sourcePath);
      this.mentions.set(key, sources);
    }
    this.resolveSource(sourcePath);
  }

  deleteSource(sourcePath: string): void {
    this.forgetMentions(sourcePath);
    this.linkpaths.delete(sourcePath);
    this.resolved.delete(sourcePath);
    this.unresolved.delete(sourcePath);
  }

  /** Notes whose links mention any of these lookup keys. */
  sourcesMentioning(keys: Iterable<string>): Set<string> {
    const sources = new Set<string>();
    for (const key of keys) {
      for (const source of this.mentions.get(key) ?? []) {
        sources.add(source);
      }
    }
    return sources;
  }

  resolveSources(sourcePaths: Iterable<string>): void {
    for (const sourcePath of sourcePaths) {
      this.resolveSource(sourcePath);
    }
  }

  resolvedLinks(sourcePath: string): ReadonlyMap<string, number> {
    return this.resolved.get(sourcePath) ?? new Map();
  }

  unresolvedLinks(sourcePath: string): ReadonlyMap<string, number> {
    return this.unresolved.get(sourcePath) ?? new Map();
  }

  /** Computed on demand by inverting `resolvedLinks`, as Obsidian does. */
  backlinks(targetPath: string): Backlink[] {
    const backlinks: Backlink[] = [];
    for (const [path, targets] of this.resolved) {
      const count = targets.get(targetPath);
      if (count && path !== targetPath) {
        backlinks.push({ path, count });
      }
    }
    return backlinks.sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  private resolveSource(sourcePath: string): void {
    const resolved = new Map<string, number>();
    const unresolved = new Map<string, number>();
    for (const link of this.linkpaths.get(sourcePath) ?? []) {
      const target = this.resolve(link.path, sourcePath, link.syntax);
      const counts = target ? resolved : unresolved;
      const key = target ? target.path : link.path;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    this.resolved.set(sourcePath, resolved);
    this.unresolved.set(sourcePath, unresolved);
  }

  private forgetMentions(sourcePath: string): void {
    for (const link of this.linkpaths.get(sourcePath) ?? []) {
      const key = linkLookupKey(link.path);
      const sources = this.mentions.get(key);
      sources?.delete(sourcePath);
      if (sources?.size === 0) {
        this.mentions.delete(key);
      }
    }
  }
}
