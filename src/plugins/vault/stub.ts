import path from "node:path";
import type { FileInfo } from "../../shared/runtime";
import type { VaultFile, VaultIndex } from "./api";
/** Phase 3 only: snapshot resolution compatible with the source resource lookup.
 * No metadata/index persistence is claimed; Phase 5 replaces this entire stub.
 */
export function snapshotVault(root: string, entries: readonly FileInfo[]): VaultIndex {
  const files: VaultFile[] = entries.map((entry) => ({
    ...entry,
    basename: path.posix.basename(entry.path, path.posix.extname(entry.path)),
    extension: path.posix.extname(entry.path).slice(1),
  }));
  function candidates(raw: string, source: string): VaultFile[] {
    const link = raw.split("|")[0]!.split("#")[0]!;
    if (!link) return files.filter((file) => file.path === source);
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(source), link));
    const possible = [
      relative,
      relative + ".md",
      link.replace(/^\//, ""),
      link.replace(/^\//, "") + ".md",
    ];
    const direct = possible.flatMap((target) => files.filter((file) => file.path === target));
    return direct.length
      ? [...new Set(direct)]
      : files.filter((file) =>
          [link, link + ".md"].some(
            (target) => file.path === target || file.path.endsWith("/" + target),
          ),
        );
  }
  return {
    root,
    files: () => files,
    metadata: () => undefined,
    resolveLink: (link, source) => candidates(link, source)[0],
    resolveLinkCandidates: candidates,
    linkText: (target) => target.path.replace(/\.md$/i, ""),
    resolvedLinks: () => new Map(),
    unresolvedLinks: () => new Map(),
    backlinks: () => [],
    tags: () => new Map(),
    onDidChange: () => () => {},
    onDidResolve: () => () => {},
  };
}
