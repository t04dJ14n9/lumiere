import {
  extensionOf,
  folderDistance,
  folderOf,
  joinVaultPath,
  linkLookupKey,
  splitLinktext,
} from "../../shared/vault-path";
import type { VaultFile } from "./api";
import type { FileTable } from "./file-table";

export interface ResolveOptions {
  /** `markdownWorkbench.links.folderNote`, for example `_index.md`; empty to disable. */
  folderNote: string;
}

/**
 * Obsidian's `getLinkpathDest` (DESIGN §12.3). Returns every candidate in
 * preference order; the first one is the link's destination.
 */
export function resolveCandidates(
  files: FileTable,
  linktext: string,
  sourcePath: string,
  options: ResolveOptions,
): readonly VaultFile[] {
  const { path } = splitLinktext(linktext);
  if (path === "") {
    const source = files.get(sourcePath);
    return source ? [source] : [];
  }
  const direct = directMatch(files, path, sourcePath);
  if (direct) {
    return [direct];
  }
  const suffix = suffixMatches(files, path, sourcePath);
  if (suffix.length > 0) {
    return suffix;
  }
  const folderNote = folderNoteMatch(files, path, sourcePath, options);
  return folderNote ? [folderNote] : [];
}

/** Steps 2 to 5: exact path, unique basename, relative path, root path. */
function directMatch(
  files: FileTable,
  path: string,
  sourcePath: string,
): VaultFile | undefined {
  if (path.startsWith("./") || path.startsWith("../")) {
    const relative = joinVaultPath(folderOf(sourcePath), path);
    return relative === undefined ? undefined : withExtension(files, relative);
  }
  if (path.startsWith("/")) {
    const rooted = joinVaultPath(path);
    return rooted === undefined ? undefined : withExtension(files, rooted);
  }
  const exact = withExtension(files, path);
  if (exact) {
    return exact;
  }
  if (path.includes("/")) {
    return undefined;
  }
  const named = files.withKey(linkLookupKey(path));
  return named.length === 1 ? named[0] : undefined;
}

/** A link without an extension names a note: `Note` finds `Note.md`. */
function withExtension(files: FileTable, path: string): VaultFile | undefined {
  if (extensionOf(path)) {
    return files.find(path) ?? files.find(`${path}.md`);
  }
  return files.find(`${path}.md`) ?? files.find(path);
}

/**
 * Step 6: files whose path ends with the link path, nearest folder first.
 * Only files sharing the link's basename can match, so the lookup table
 * bounds the search instead of a scan of the vault.
 */
function suffixMatches(
  files: FileTable,
  path: string,
  sourcePath: string,
): VaultFile[] {
  const wanted = path.replace(/^\/+/, "").toLowerCase();
  const wantedWithExtension = extensionOf(wanted) ? wanted : `${wanted}.md`;
  const sourceFolder = folderOf(sourcePath);
  return files
    .withKey(linkLookupKey(path))
    .filter((file) => {
      const candidate = file.path.toLowerCase();
      return (
        endsWithSegments(candidate, wantedWithExtension) ||
        endsWithSegments(candidate, wanted)
      );
    })
    .map((file) => ({
      file,
      distance: folderDistance(sourceFolder, folderOf(file.path)),
    }))
    .sort(
      (a, b) => a.distance - b.distance || compare(a.file.path, b.file.path),
    )
    .map(({ file }) => file);
}

function endsWithSegments(path: string, suffix: string): boolean {
  return path === suffix || path.endsWith(`/${suffix}`);
}

function compare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** A link to a folder opens its folder note when one is configured. */
function folderNoteMatch(
  files: FileTable,
  path: string,
  sourcePath: string,
  options: ResolveOptions,
): VaultFile | undefined {
  if (!options.folderNote) {
    return undefined;
  }
  const folder = path.startsWith(".")
    ? joinVaultPath(folderOf(sourcePath), path)
    : joinVaultPath(path);
  if (folder === undefined) {
    return undefined;
  }
  return files.find(`${folder}/${options.folderNote}`);
}
