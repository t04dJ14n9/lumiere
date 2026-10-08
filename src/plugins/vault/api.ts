import type { Disposer } from "../../kernel";
import type { NoteMetadata } from "../../markdown/metadata";
export interface VaultFile {
  path: string;
  basename: string;
  extension: string;
  mtime: number;
  size: number;
  uri: string;
}
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
  onDidChange(listener: () => void): Disposer;
  onDidResolve(listener: () => void): Disposer;
}
declare module "../../kernel/types" {
  interface Services {
    vault: VaultIndex;
  }
}
