/**
 * `file:` URIs as paths, for the shared host: joining a relative path onto a
 * folder (resolving `.` and `..` as `path.posix.join` does), a URI's folder,
 * and its name. The host compares URIs as strings, so they are built by the
 * platform (`HostFiles.uriOf`), exactly as its own runtime writes them.
 */
import type { HostFiles } from "./platform";

/**
 * The URI of an absolute path with `/`, as Node 26's `pathToFileURL` writes
 * it: the URL standard's path encoding, plus `% \ [ ] | ~` and line breaks.
 * A platform without Node builds URIs with this.
 */
export function fileUri(path: string): string {
  const url = new URL("file:///");
  url.pathname = path.replace(
    /[%\\[\]|~\n\r\t]/g,
    (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
  return url.href;
}

/** The decoded path of a `file:` URI, with `/` (`/C:/x` for a Windows drive). */
export function uriPath(uri: string): string {
  return decodeURIComponent(new URL(uri).pathname);
}

/** `relative` (with `/`) under `folder`; `..` may leave it, as with `path.join`. */
export function joinUri(
  files: Pick<HostFiles, "uriOf">,
  folder: string,
  relative: string,
): string {
  return files.uriOf(joinPaths(uriPath(folder), relative));
}

/** The folder `uri` is in. */
export function parentUri(
  files: Pick<HostFiles, "uriOf">,
  uri: string,
): string {
  const path = uriPath(uri).replace(/\/+$/, "");
  return files.uriOf(path.slice(0, path.lastIndexOf("/")) || "/");
}

/** The last part of `uri`'s path, decoded. */
export function uriName(uri: string): string {
  const path = uriPath(uri).replace(/\/+$/, "");
  return path.slice(path.lastIndexOf("/") + 1);
}

function joinPaths(base: string, relative: string): string {
  const parts: string[] = [];
  for (const part of `${base}/${relative}`.split("/")) {
    if (part === "..") {
      parts.pop();
    } else if (part !== "" && part !== ".") {
      parts.push(part);
    }
  }
  return `/${parts.join("/")}`;
}
