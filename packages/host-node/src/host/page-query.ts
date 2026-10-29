/** An editor page's request, on Node: Windows paths and real roots need Node's path. */
import * as path from "node:path";
import { isFilesystemRoot } from "./paths";

/** A note to open and the workspace it was opened from. */
export interface PageQuery {
  readonly note: string;
  readonly root: string;
}

/**
 * `?path=<note>&root=<workspace>`, both absolute; the note must be Markdown
 * inside the workspace. Without a workspace, the note's folder stands in.
 */
export function pageQuery(url: URL): PageQuery | undefined {
  return fileQuery(url, /\.(md|markdown)$/i);
}

/** As `pageQuery`, for a PDF. */
export function pdfQuery(url: URL): PageQuery | undefined {
  return fileQuery(url, /\.pdf$/i);
}

function fileQuery(url: URL, kind: RegExp): PageQuery | undefined {
  const note = url.searchParams.get("path") ?? "";
  if (!path.isAbsolute(note) || !kind.test(note)) {
    return undefined;
  }
  const normalized = path.normalize(note);
  const given = url.searchParams.get("root");
  const root = given ? path.normalize(given) : path.dirname(normalized);
  if (!path.isAbsolute(root)) {
    return undefined;
  }
  const relative = path.relative(root, normalized);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    isFilesystemRoot(root)
  ) {
    return undefined;
  }
  return { note: normalized, root };
}
