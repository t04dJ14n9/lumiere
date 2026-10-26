import type { HostWorkspace } from "../../shared/host";

/** How a resource is checked beyond its path: what the host offers. */
export interface ResourceChecks {
  /** Whether a path component is a symbolic link, where links are refused. */
  readonly inspect?: (uri: string) => Promise<{ symbolicLink: boolean }>;
  /** Symbolic links resolved on a local disk; absent where there is none. */
  readonly realContains?: HostWorkspace["realContains"];
}

export function contains(root: string, uri: string): boolean {
  if (/%(?:2f|5c)/i.test(uri)) {
    return false;
  }
  const base = new URL(root);
  const target = new URL(uri);
  if (base.protocol !== target.protocol || base.host !== target.host) {
    return false;
  }
  return isInsidePath(
    decodeURIComponent(base.pathname),
    decodeURIComponent(target.pathname),
  );
}

/**
 * Check a resource against its vault: by path, then through symbolic links,
 * resolved on a local disk or, where files have no real path, refused
 * component by component.
 */
export async function containedResource(
  root: string,
  uri: string,
  symbolicLink: boolean,
  checks: ResourceChecks = {},
): Promise<void> {
  if (!contains(root, uri)) {
    throw new Error("Resource escapes the vault");
  }
  if (new URL(uri).protocol === "file:" && checks.realContains) {
    if (!(await checks.realContains(root, uri))) {
      throw new Error("Resource symlink escapes the vault");
    }
    return;
  }
  if (symbolicLink) {
    throw new Error("Virtual symbolic links are not supported");
  }
  if (checks.inspect) {
    await refuseLinkedAncestors(root, uri, checks.inspect);
  }
}

async function refuseLinkedAncestors(
  root: string,
  uri: string,
  inspect: (uri: string) => Promise<{ symbolicLink: boolean }>,
): Promise<void> {
  const target = new URL(uri);
  const base = new URL(root);
  const parts = target.pathname
    .slice(base.pathname.replace(/\/$/, "").length)
    .split("/")
    .filter(Boolean);
  let current = base.pathname.replace(/\/$/, "");
  for (const part of parts) {
    current += "/" + part;
    const at = new URL(base);
    at.pathname = current;
    if ((await inspect(at.href)).symbolicLink) {
      throw new Error("Virtual symbolic links are not supported");
    }
  }
}

/**
 * Whether absolute path `target` is `base` or inside it once `.` and `..`
 * are resolved, as `path.posix.relative` decides it.
 */
function isInsidePath(base: string, target: string): boolean {
  const from = normalize(base);
  const to = normalize(target);
  return from === "/" || to === from || to.startsWith(from + "/");
}

function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") {
      parts.pop();
    } else if (part !== "" && part !== ".") {
      parts.push(part);
    }
  }
  return "/" + parts.join("/");
}
