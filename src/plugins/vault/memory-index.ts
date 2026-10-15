import type { Disposer } from "../../kernel";
import type { NoteMetadata } from "../../markdown/metadata";
import {
  lookupKey,
  nameOf,
  folderOf,
  type LinkSyntax,
} from "../../shared/vault-path";
import type {
  Backlink,
  LinkPolicy,
  LinkPolicyDecision,
  VaultChange,
  VaultFile,
  VaultIndex,
} from "./api";
import { FileTable, vaultFile } from "./file-table";
import type { FileEntry } from "./file-table";
import { LinkMaps, outgoingLinks } from "./link-maps";
import { linkText } from "./link-text";
import type { LinkFormat } from "./link-text";
import { resolveCandidates } from "./resolve";

export interface IndexOptions {
  root: string;
  folderNote: string;
  linkFormat: LinkFormat;
}

/**
 * The vault index held in memory: files, parsed metadata and link maps. It is
 * pure and synchronous; the host plugin feeds it from the file system, the
 * indexing worker and open documents, and decides when indexing has settled.
 */
export class MemoryVaultIndex implements VaultIndex {
  readonly root: string;
  private options: IndexOptions;
  private readonly table = new FileTable();
  private readonly notes = new Map<string, NoteMetadata>();
  private readonly links = new LinkMaps((linkpath, source, syntax) =>
    this.resolveLink(linkpath, source, syntax),
  );
  private readonly changeListeners = new Set<(change: VaultChange) => void>();
  private readonly resolveListeners = new Set<() => void>();
  private policies: readonly LinkPolicy[] = [];
  private tagCounts?: Map<string, number>;

  constructor(options: IndexOptions) {
    this.root = options.root;
    this.options = options;
  }

  // Reading (the VaultIndex contract)

  files(): readonly VaultFile[] {
    return this.table.all();
  }

  file(path: string): VaultFile | undefined {
    return this.table.get(path);
  }

  metadata(path: string): NoteMetadata | undefined {
    return this.notes.get(path);
  }

  resolveLink(
    linktext: string,
    sourcePath: string,
    syntax: LinkSyntax = "wikilink",
  ): VaultFile | undefined {
    return this.resolveLinkCandidates(linktext, sourcePath, syntax)[0];
  }

  resolveLinkCandidates(
    linktext: string,
    sourcePath: string,
    syntax: LinkSyntax = "wikilink",
  ): readonly VaultFile[] {
    const decided = this.policyDecision(linktext, sourcePath, syntax);
    if (decided?.status === "unresolved") {
      return [];
    }
    if (decided?.status === "resolved") {
      const file = this.table.get(decided.path);
      return file ? [file] : [];
    }
    return resolveCandidates(this.table, linktext, sourcePath, this.options);
  }

  classifyLink(
    linktext: string,
    sourcePath: string,
    syntax: LinkSyntax = "wikilink",
  ): LinkPolicyDecision | undefined {
    return this.policyDecision(linktext, sourcePath, syntax);
  }

  linkText(target: VaultFile, sourcePath: string): string {
    return (
      this.describeLink(target.path, sourcePath) ??
      linkText(this.table, target, sourcePath, this.options.linkFormat)
    );
  }

  describeLink(targetPath: string, sourcePath: string): string | undefined {
    for (const policy of this.policies) {
      const text = policy.linkText?.({
        vaultRoot: this.root,
        sourcePath,
        targetPath,
      });
      if (text !== undefined) {
        return text;
      }
    }
    return undefined;
  }

  resolvedLinks(sourcePath: string): ReadonlyMap<string, number> {
    return this.links.resolvedLinks(sourcePath);
  }

  unresolvedLinks(sourcePath: string): ReadonlyMap<string, number> {
    return this.links.unresolvedLinks(sourcePath);
  }

  backlinks(targetPath: string): readonly Backlink[] {
    return this.links.backlinks(targetPath);
  }

  /** Tag counts across the vault, keyed as written without `#` (`project/a`). */
  tags(): ReadonlyMap<string, number> {
    this.tagCounts ??= countTags(this.notes.values());
    return this.tagCounts;
  }

  onDidChange(listener: (change: VaultChange) => void): Disposer {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  onDidResolve(listener: () => void): Disposer {
    this.resolveListeners.add(listener);
    return () => {
      this.resolveListeners.delete(listener);
    };
  }

  // Writing (the vault host plugin)

  /**
   * Replace the whole file list. Metadata for kept files stays; only notes
   * whose links mention an added or removed file are resolved again.
   */
  replaceFiles(entries: readonly FileEntry[]): void {
    this.removeFilesExcept(new Set(entries.map((entry) => entry.path)));
    this.addFiles(entries);
  }

  /** Add or update files without events, as at start-up. */
  addFiles(entries: readonly FileEntry[]): void {
    const added: string[] = [];
    for (const entry of entries) {
      const current = this.table.get(entry.path);
      if (!current) {
        added.push(entry.path);
      }
      if (!current || !isSameEntry(current, entry)) {
        this.table.set(vaultFile(entry));
      }
    }
    this.links.resolveSources(this.affectedBy(...added));
  }

  /** Forget every file not in `keep`, without events. */
  removeFilesExcept(keep: ReadonlySet<string>): void {
    const removed: string[] = [];
    for (const path of this.table.paths()) {
      if (!keep.has(path)) {
        this.forgetFile(path);
        removed.push(path);
      }
    }
    this.links.resolveSources(this.affectedBy(...removed));
  }

  /** A file was created, or its size or time changed. */
  upsertFile(entry: FileEntry): void {
    const isNew = !this.table.get(entry.path);
    this.table.set(vaultFile(entry));
    if (isNew) {
      this.links.resolveSources(this.affectedBy(entry.path));
    }
    this.emit({ type: isNew ? "create" : "modify", path: entry.path });
  }

  deleteFile(path: string): void {
    if (!this.table.get(path)) {
      return;
    }
    this.forgetFile(path);
    this.links.resolveSources(this.affectedBy(path));
    this.emit({ type: "delete", path });
  }

  renameFile(oldPath: string, entry: FileEntry): void {
    const metadata = this.notes.get(oldPath);
    this.forgetFile(oldPath);
    this.table.set(vaultFile(entry));
    if (metadata) {
      this.setNote(entry.path, metadata);
    }
    const affected = this.affectedBy(oldPath, entry.path);
    affected.add(entry.path);
    this.links.resolveSources(affected);
    this.emit({ type: "rename", path: entry.path, oldPath });
  }

  /** Parsed metadata for a note, or `undefined` when it can no longer be read. */
  setMetadata(path: string, metadata: NoteMetadata | undefined): void {
    if (!this.table.get(path)) {
      return;
    }
    if (metadata) {
      this.setNote(path, metadata);
    } else {
      this.notes.delete(path);
      this.links.deleteSource(path);
      delete this.tagCounts;
    }
    this.emit({ type: "modify", path });
  }

  /** Settings that change how links resolve re-resolve every note. */
  configure(options: Omit<IndexOptions, "root">): void {
    this.options = { ...options, root: this.root };
    this.links.resolveSources([...this.links.sources()]);
  }

  /** Replace the window's link policies and re-resolve every note. */
  setLinkPolicies(policies: readonly LinkPolicy[]): void {
    this.policies = policies;
    this.reResolve();
  }

  invalidateLinkResolution(): void {
    this.reResolve();
  }

  /** Called by the host when the indexing queue has drained. */
  notifyResolved(): void {
    for (const listener of [...this.resolveListeners]) {
      listener();
    }
  }

  private setNote(path: string, metadata: NoteMetadata): void {
    this.notes.set(path, metadata);
    this.links.setLinks(path, outgoingLinks(metadata));
    delete this.tagCounts;
  }

  private forgetFile(path: string): void {
    this.table.delete(path);
    if (this.notes.delete(path)) {
      delete this.tagCounts;
    }
    this.links.deleteSource(path);
  }

  /**
   * Notes whose links could resolve differently after a file appears or
   * disappears at these paths: links by the file's name, and links to its
   * folder when it may be that folder's note.
   */
  private affectedBy(...paths: string[]): Set<string> {
    const keys = new Set<string>();
    for (const path of paths) {
      keys.add(lookupKey(path));
      if (this.options.folderNote && nameOf(path) === this.options.folderNote) {
        keys.add(nameOf(folderOf(path)).toLowerCase());
      }
    }
    return this.links.sourcesMentioning(keys);
  }

  private policyDecision(
    linktext: string,
    sourcePath: string,
    syntax: LinkSyntax,
  ): LinkPolicyDecision | undefined {
    const query = {
      vaultRoot: this.root,
      linktext,
      sourcePath,
      syntax,
      find: (path: string) => this.table.find(path)?.path,
    };
    for (const policy of this.policies) {
      const decision = policy.resolve(query);
      if (decision) {
        return decision;
      }
    }
    return undefined;
  }

  private reResolve(): void {
    this.links.resolveSources([...this.links.sources()]);
    this.notifyResolved();
  }

  private emit(change: VaultChange): void {
    for (const listener of [...this.changeListeners]) {
      listener(change);
    }
  }
}

function isSameEntry(file: VaultFile, entry: FileEntry): boolean {
  return (
    file.uri === entry.uri &&
    file.mtime === entry.mtime &&
    file.size === entry.size &&
    Boolean(file.excluded) === Boolean(entry.excluded)
  );
}

function countTags(notes: Iterable<NoteMetadata>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const { tag } of note.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}
