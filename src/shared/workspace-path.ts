/**
 * Workspace path helpers for plugins. File URIs only: a remote or untitled
 * document has no portable relative path.
 */

/** One relative segment sequence: no absolutes, no `..`, no empty segments. */
export function safeRelative(value: string): string | undefined {
  const normalized = value
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
  if (!normalized || normalized.startsWith("/")) {
    return undefined;
  }
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    return undefined;
  }
  return normalized;
}

/** `rootUri` plus a safe relative path, or undefined when it would escape. */
export function joinContained(
  rootUri: string,
  relative: string,
): string | undefined {
  const safe = safeRelative(relative);
  const root = parseUri(rootUri.endsWith("/") ? rootUri : `${rootUri}/`);
  if (!safe || !root) {
    return undefined;
  }
  const encoded = safe
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const pathname = root.pathname.endsWith("/")
    ? `${root.pathname}${encoded}`
    : `${root.pathname}/${encoded}`;
  const joined = formatUri(root, pathname);
  const rootPath = decodePath(root.pathname);
  const joinedPath = decodePath(parseUri(joined)?.pathname ?? "");
  if (
    !rootPath ||
    joinedPath === undefined ||
    !joinedPath.startsWith(rootPath)
  ) {
    return undefined;
  }
  return joined;
}

/**
 * Path of `uri` inside `root` when both are `file:` URIs and `uri` is inside
 * `root`. Percent-encoding is decoded, matching Copy Link for Agent.
 */
export function relativeFilePath(
  uri: string,
  root: string,
): string | undefined {
  const source = parseUri(uri);
  const base = parseUri(root);
  if (
    !source ||
    !base ||
    source.protocol !== "file:" ||
    base.protocol !== "file:" ||
    source.host !== base.host
  ) {
    return undefined;
  }
  const basePath = decodePath(base.pathname);
  const sourcePath = decodePath(source.pathname);
  if (basePath === undefined || sourcePath === undefined) {
    return undefined;
  }
  const prefix = `${basePath.replace(/\/$/, "")}/`;
  if (!sourcePath.startsWith(prefix)) {
    return undefined;
  }
  const relative = sourcePath.slice(prefix.length);
  if (!relative || relative.split("/").includes("..")) {
    return undefined;
  }
  return relative;
}

/** Longest workspace folder that contains `uri`, if any. */
export function containingFolder(
  uri: string,
  roots: readonly string[],
): { root: string; relative: string } | undefined {
  let best: { root: string; relative: string } | undefined;
  for (const root of roots) {
    const relative = relativeFilePath(uri, root);
    if (relative !== undefined && (!best || root.length > best.root.length)) {
      best = { root, relative };
    }
  }
  return best;
}

/** Portable relative link from one project file to another. */
export function relativePosix(fromFile: string, toFile: string): string {
  const from = fromFile.split("/").slice(0, -1);
  const to = toFile.split("/");
  let shared = 0;
  while (
    shared < from.length &&
    shared < to.length &&
    from[shared] === to[shared]
  ) {
    shared += 1;
  }
  const parts = [
    ...Array(from.length - shared).fill(".."),
    ...to.slice(shared),
  ];
  return parts.length === 0 ? "." : parts.join("/");
}

/** Encode each segment so spaces and parentheses stay inside a Markdown link. */
export function encodeLinkPath(relative: string): string {
  return relative
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function baseName(pathOrUri: string): string {
  const parsed = pathOrUri.includes("://") ? parseUri(pathOrUri) : undefined;
  const path = parsed ? (decodePath(parsed.pathname) ?? pathOrUri) : pathOrUri;
  const name = path.split("/").pop() ?? "";
  return name || "file";
}

interface ParsedUri {
  readonly protocol: string;
  readonly host: string;
  readonly pathname: string;
}

/** Enough of RFC 3986 to join and compare paths without the URL global. */
function parseUri(uri: string): ParsedUri | undefined {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*:)(\/\/[^/?#]*)?([^?#]*)/.exec(uri);
  if (!match) {
    return undefined;
  }
  const authority = match[2] ?? "";
  return {
    protocol: match[1]!.toLowerCase(),
    host: authority.startsWith("//") ? authority.slice(2) : "",
    pathname: match[3] ?? "",
  };
}

function formatUri(root: ParsedUri, pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${root.protocol}//${root.host}${path}`;
}

function decodePath(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

export function isInsidePath(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

/**
 * True when any existing segment of `relative` is a symbolic link. A link
 * can point outside the project, so writers refuse the path.
 */
export async function walksSymbolicLink(
  relative: string,
  rootUri: string,
  isLink: (uri: string) => Promise<boolean>,
): Promise<boolean> {
  const safe = safeRelative(relative);
  if (!safe) {
    return true;
  }
  let current = rootUri;
  for (const segment of safe.split("/")) {
    const next = joinContained(current, segment);
    if (!next || (await isLink(next))) {
      return true;
    }
    current = next;
  }
  return false;
}
