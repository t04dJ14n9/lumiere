import {
  folderOf,
  isMarkdownPath,
  nameOf,
  relativeVaultPath,
} from "../../shared/vault-path";

/** `index.md` and `log.md` at any depth are navigation files, not concepts. */
export function isReservedNote(path: string): boolean {
  const name = nameOf(path).toLowerCase();
  return name === "index.md" || name === "log.md";
}

/** A vault-relative path is inside a bundle root. The vault root bundle is `""`. */
export function isInsideBundle(path: string, bundleRoot: string): boolean {
  if (bundleRoot === "") {
    return true;
  }
  return path === bundleRoot || path.startsWith(`${bundleRoot}/`);
}

/** The innermost bundle root that contains `path`, if any. */
export function owningBundle(
  bundles: readonly string[],
  path: string,
): string | undefined {
  let owner: string | undefined;
  for (const root of bundles) {
    if (!isInsideBundle(path, root)) {
      continue;
    }
    if (owner === undefined || root.length > owner.length) {
      owner = root;
    }
  }
  return owner;
}

/**
 * Link text that round-trips through OKF resolution. The same bundle uses a
 * bundle-absolute path (`/metrics/topic`). A target in another bundle uses an
 * explicit source-relative path, so a later resolve does not treat the new
 * text as a wikilink. Callers keep vault formatting when this is undefined.
 */
export function okfLinkText(
  bundleRoot: string,
  sourcePath: string,
  targetPath: string,
): string | undefined {
  if (!isInsideBundle(sourcePath, bundleRoot)) {
    return undefined;
  }
  if (!isInsideBundle(targetPath, bundleRoot)) {
    return explicitRelative(sourcePath, targetPath);
  }
  const relative =
    bundleRoot === "" ? targetPath : targetPath.slice(bundleRoot.length + 1);
  const text = isMarkdownPath(relative) ? relative.slice(0, -3) : relative;
  return `/${text}`;
}

function explicitRelative(sourcePath: string, targetPath: string): string {
  const relative = relativeVaultPath(folderOf(sourcePath), targetPath);
  const text = isMarkdownPath(targetPath) ? relative.slice(0, -3) : relative;
  if (text.startsWith("/") || text.startsWith("./") || text.startsWith("../")) {
    return text;
  }
  return `./${text}`;
}

export function bundleFolder(path: string): string {
  return folderOf(path);
}
