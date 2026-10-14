import {
  extensionOf,
  folderOf,
  joinVaultPath,
  splitLinktext,
} from "../../shared/vault-path";

export type OkfLinkAction =
  | { action: "passthrough" }
  | { action: "resolved"; path: string }
  | { action: "unresolved" };

export interface OkfLinkQuery {
  linktext: string;
  sourcePath: string;
  /** Set when the source note sits inside an OKF bundle. */
  bundleRoot: string | undefined;
  /** Canonical vault path when that exact path exists. */
  find(path: string): string | undefined;
}

/**
 * Context-aware OKF resolution. Outside a bundle, and for extensionless
 * wikilinks, the vault's own rules still apply (`passthrough`). A leading
 * `/` is bundle-root relative. Other explicit paths are source-file
 * relative. A miss is unresolved and must not basename-fallback.
 */
export function resolveOkfLink(query: OkfLinkQuery): OkfLinkAction {
  if (query.bundleRoot === undefined) {
    return { action: "passthrough" };
  }
  const { path } = splitLinktext(query.linktext);
  if (path === "" || isWikilinkPath(path)) {
    return { action: "passthrough" };
  }
  const joined = explicitPath(path, query.sourcePath, query.bundleRoot);
  if (joined === undefined) {
    return { action: "unresolved" };
  }
  const found = locateFile(query.find, joined);
  return found ? { action: "resolved", path: found } : { action: "unresolved" };
}

function isWikilinkPath(path: string): boolean {
  if (path.startsWith("/") || path.startsWith("./") || path.startsWith("../")) {
    return false;
  }
  return extensionOf(path) === "";
}

function explicitPath(
  path: string,
  sourcePath: string,
  bundleRoot: string,
): string | undefined {
  if (path.startsWith("/")) {
    return joinVaultPath(bundleRoot, path.slice(1));
  }
  return joinVaultPath(folderOf(sourcePath), path);
}

function locateFile(
  find: (path: string) => string | undefined,
  path: string,
): string | undefined {
  if (extensionOf(path)) {
    return find(path) ?? find(`${path}.md`);
  }
  return find(`${path}.md`) ?? find(path);
}
