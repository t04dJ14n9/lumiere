/**
 * POSIX path operations on URI paths (`/notes/a.md`), for code that also
 * runs in the browser, where there is no `node:path`. Each returns what
 * `path.posix` returns for the same absolute path (test/posix-path.test.ts
 * pins them to it).
 */

/** The segments of an absolute path, with `.` and `..` resolved. */
function segments(path: string): string[] {
  const resolved: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "..") {
      resolved.pop();
    } else if (segment && segment !== ".") {
      resolved.push(segment);
    }
  }
  return resolved;
}

/**
 * Whether `target` is `root` or lies under it, by path alone (symbolic links
 * are not resolved). The same as `path.posix.relative(root, target)` not
 * starting with `..`.
 */
export function isInsidePosixPath(root: string, target: string): boolean {
  const base = segments(root);
  const candidate = segments(target);
  return (
    candidate.length >= base.length &&
    base.every((segment, index) => candidate[index] === segment)
  );
}

/** The path from `from` to `to`: `path.posix.relative`. */
export function relativePosixPath(from: string, to: string): string {
  const base = segments(from);
  const target = segments(to);
  let common = 0;
  while (
    common < base.length &&
    common < target.length &&
    base[common] === target[common]
  ) {
    common++;
  }
  return [...base.slice(common).map(() => ".."), ...target.slice(common)].join(
    "/",
  );
}

/** The last segment, ignoring trailing slashes: `path.posix.basename`. */
export function posixBasename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

/** Everything before the last segment: `path.posix.dirname`. */
export function posixDirname(path: string): string {
  if (!path) {
    return ".";
  }
  const hasRoot = path.startsWith("/");
  const trimmed = path.replace(/(.)\/+$/, "$1");
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0) {
    return hasRoot ? "/" : ".";
  }
  if (slash === 0) {
    return "/";
  }
  // As `path.posix.dirname`: a run of slashes before the last segment stays
  // (`/a//b` → `/a/`), and `//a` keeps POSIX's implementation-defined `//`.
  return hasRoot && slash === 1 ? "//" : trimmed.slice(0, slash);
}

/** The last segment's extension, with its dot: `path.posix.extname`. */
export function posixExtname(path: string): string {
  const name = posixBasename(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 || name === ".." ? "" : name.slice(dot);
}

/**
 * Whether `path` is absolute on `platform` (Node's `process.platform`
 * names): `path.win32.isAbsolute` on Windows, `path.posix.isAbsolute`
 * elsewhere.
 */
export function isAbsoluteFilePath(path: string, platform: string): boolean {
  if (platform !== "win32") {
    return path.startsWith("/");
  }
  return /^[\\/]/.test(path) || /^[a-z]:[\\/]/i.test(path);
}
