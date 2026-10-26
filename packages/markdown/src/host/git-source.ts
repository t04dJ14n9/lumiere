/**
 * The note behind a `git:` URI from VS Code's Git extension, which names the
 * file by its filesystem path in the query (`toGitUri` writes the same).
 */
import { pathToFileURL } from "node:url";

/** The note's `file:` URI and the revision; any other URI is its own source. */
export function gitSource(uri: string): { source: string; ref?: string } {
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
