/**
 * DSH's file addresses, as DSH 0.2.1's `@deepseek-ai/dsh-util-workspace-path`
 * writes them: `dsh-resource://file/session/<sessionId>/<path>`, the path
 * relative to the session's workspace (or absolute), each segment encoded
 * except `:`. Rewritten here: DSH asks plugins not to load its packages.
 */

const PREFIX = "dsh-resource://file/";

const encodeSegment = (segment: string) =>
  encodeURIComponent(segment).replace(/%3A/gi, ":");

/** The session and path of a session file address; undefined for any other. */
export function parseSessionAddress(
  address: string,
): { sessionId: string; path: string } | undefined {
  if (!address.startsWith(PREFIX + "session/")) {
    return undefined;
  }
  const end = address.search(/[?#]/);
  const [id, ...segments] = address
    .slice(PREFIX.length + "session/".length, end < 0 ? undefined : end)
    .split("/");
  try {
    return id && segments.length > 0
      ? {
          sessionId: decodeURIComponent(id),
          path: segments.map(decodeURIComponent).join("/"),
        }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The session's workspace root: the absolute path minus the workspace-relative
 * path the address names. Undefined when the address is absolute already.
 */
export function workspaceRoot(
  address: string,
  absolute: string,
): string | undefined {
  const parsed = parseSessionAddress(address);
  if (!parsed || parsed.path.startsWith("/") || parsed.path === "") {
    return undefined;
  }
  const suffix = "/" + parsed.path;
  return absolute.endsWith(suffix)
    ? absolute.slice(0, -suffix.length) || "/"
    : undefined;
}

/**
 * Whether `absolute` is `root` or a file inside it. A filesystem root is
 * refused: it would let a page open any path the host can name.
 */
export function insideWorkspace(
  root: string | undefined,
  absolute: string,
): boolean {
  if (!root || !absolute || absolute.includes("\0")) {
    return false;
  }
  const base = root.replace(/[\\/]+$/, "");
  if (base === "" || base === "/" || /^[A-Za-z]:$/.test(base)) {
    return false;
  }
  // A string prefix would admit `/vault/../etc`. The host checks too.
  if (absolute.split(/[\\/]/).includes("..")) {
    return false;
  }
  return (
    absolute === base ||
    absolute.startsWith(`${base}/`) ||
    absolute.startsWith(`${base}\\`)
  );
}

/** The address of another file of the session, from its absolute path. */
export function sessionAddress(
  sessionId: string,
  root: string | undefined,
  absolute: string,
): string {
  const base = root?.replace(/\/+$/, "");
  const path =
    base && absolute.startsWith(base + "/")
      ? absolute.slice(base.length + 1)
      : absolute;
  return `${PREFIX}session/${encodeSegment(sessionId)}/${path
    .split("/")
    .map(encodeSegment)
    .join("/")}`;
}
