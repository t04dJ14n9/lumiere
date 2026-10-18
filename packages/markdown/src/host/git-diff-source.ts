import { pathToFileURL } from "node:url";

/**
 * The file and revision a diff side shows: a `git:` URI (VS Code's Git
 * extension's form, `toGitUri`) names a working-tree path and a ref; any
 * other URI is its own source.
 */
export function diffSource(uri: string): { source: string; ref?: string } {
  const parsed = new URL(uri);
  if (parsed.protocol !== "git:") {
    return { source: uri };
  }
  const query = JSON.parse(decodeURIComponent(parsed.search.slice(1))) as {
    path: string;
    ref: string;
  };
  if (typeof query.path !== "string" || typeof query.ref !== "string") {
    throw new Error("Invalid Git source");
  }
  // Git stores filesystem paths, including literal percent signs. Select the
  // path dialect explicitly so drive and UNC paths retain their URI semantics.
  const windows = /^(?:[a-z]:[\\/]|\\\\)/i.test(query.path);
  const source = pathToFileURL(query.path, { windows });
  return { source: source.href, ref: query.ref };
}
