/**
 * `markdownWorkbench.vault.excludedFiles`, Obsidian's **Excluded files**. A
 * filter without wildcards is a path prefix, as in Obsidian (`Archive/`
 * excludes that folder, `Daily` excludes `Daily.md` and `Daily/…`). A filter
 * with `*`, `?` or `{a,b}` is a glob over the vault path, where `**` crosses
 * folders.
 */
export function exclusionMatcher(
  filters: readonly string[],
): (path: string) => boolean {
  const tests = filters
    .map((filter) => filter.trim().replace(/^\/+/, ""))
    .filter((filter) => filter.length > 0)
    .map(filterTest);
  return (path) => tests.some((matches) => matches(path));
}

function filterTest(filter: string): (path: string) => boolean {
  if (!/[*?{]/.test(filter)) {
    return (path) => isUnderPrefix(path, filter);
  }
  const pattern = globToRegExp(filter);
  return (path) => pattern.test(path);
}

function isUnderPrefix(path: string, prefix: string): boolean {
  if (prefix.endsWith("/")) {
    return path.startsWith(prefix);
  }
  return (
    path === prefix ||
    path.startsWith(prefix + "/") ||
    path.replace(/\.md$/i, "") === prefix
  );
}

/** Translate a glob into an anchored regular expression. */
export function globToRegExp(glob: string): RegExp {
  let source = "";
  let braces = 0;
  for (let at = 0; at < glob.length; at++) {
    const char = glob[at]!;
    if (char === "*" && glob[at + 1] === "*") {
      const slash = glob[at + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      at += slash ? 2 : 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "{") {
      braces++;
      source += "(?:";
    } else if (char === "}" && braces > 0) {
      braces--;
      source += ")";
    } else if (char === "," && braces > 0) {
      source += "|";
    } else {
      source += char.replace(/[.+^$()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/** Folders the index never enters: hidden ones (`.git`, `.obsidian`, `.trash`) and `node_modules`. */
export function isIgnoredPath(path: string): boolean {
  return path
    .split("/")
    .some((segment) => segment.startsWith(".") || segment === "node_modules");
}
