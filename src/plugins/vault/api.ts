import type { Disposer } from "../../kernel";
import type { NoteMetadata } from "../../markdown/metadata";
export interface VaultFile {
  path: string;
  basename: string;
  extension: string;
  mtime: number;
  size: number;
  uri: string;
  /**
   * Matched by `markdownWorkbench.vault.excludedFiles`. As in Obsidian, an
   * excluded file is still indexed and links to it resolve, but quick switcher,
   * suggestions, search and unlinked mentions leave it out.
   */
  excluded?: boolean;
}
export type VaultChange =
  | { type: "create" | "modify" | "delete"; path: string }
  | { type: "rename"; path: string; oldPath: string };
export interface Backlink {
  path: string;
  count: number;
}
export interface VaultIndex {
  readonly root: string;
  files(): readonly VaultFile[];
  metadata(path: string): NoteMetadata | undefined;
  resolveLink(linktext: string, sourcePath: string): VaultFile | undefined;
  resolveLinkCandidates(
    linktext: string,
    sourcePath: string,
  ): readonly VaultFile[];
  linkText(target: VaultFile, sourcePath: string): string;
  resolvedLinks(sourcePath: string): ReadonlyMap<string, number>;
  unresolvedLinks(sourcePath: string): ReadonlyMap<string, number>;
  backlinks(targetPath: string): readonly Backlink[];
  tags(): ReadonlyMap<string, number>;
  onDidChange(listener: (change: VaultChange) => void): Disposer;
  onDidResolve(listener: () => void): Disposer;
}
declare module "../../kernel/types" {
  interface Services {
    vault: VaultIndex;
  }
}
