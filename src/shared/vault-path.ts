/**
 * Vault paths are POSIX-style, relative to the vault root, with no leading
 * slash: `folder/Note.md`. These helpers are pure so that the host, the
 * indexing worker and tests share one definition.
 */

/** A link target split into its path and its `#heading` or `#^block` part. */
export interface Linkpath {
  path: string;
  subpath: string;
}

export function splitLinktext(linktext: string): Linkpath {
  const hash = linktext.indexOf("#");
  if (hash < 0) {
    return { path: linktext.trim(), subpath: "" };
  }
  return {
    path: linktext.slice(0, hash).trim(),
    subpath: linktext.slice(hash),
  };
}

/** `a/b/Note.md` → `a/b`; a file at the root has the folder `""`. */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

/** `a/b/Note.md` → `Note.md`. */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** `Note.md` → `md`; `Note` → `""`. A leading dot does not start an extension. */
export function extensionOf(path: string): string {
  const name = nameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

/** `a/Note.md` → `Note`. */
export function stemOf(path: string): string {
  const name = nameOf(path);
  const extension = extensionOf(name);
  return extension ? name.slice(0, -extension.length - 1) : name;
}

export function isMarkdownPath(path: string): boolean {
  return extensionOf(path).toLowerCase() === "md";
}

/**
 * The key Obsidian's `uniqueFileLookup` uses: the lower-case basename for
 * notes (`Note.md` and the link `note` both give `note`), the lower-case file
 * name for anything else (`image.png`).
 */
export function lookupKey(path: string): string {
  const key = isMarkdownPath(path) ? stemOf(path) : nameOf(path);
  return key.toLowerCase();
}

/** The key of a link path, which may omit the `.md` extension. */
export function linkLookupKey(linkpath: string): string {
  const name = nameOf(linkpath);
  return lookupKey(extensionOf(name) ? name : `${name}.md`);
}

/**
 * Join and normalize segments, resolving `.` and `..`. Returns `undefined`
 * when the result would leave the vault root.
 */
export function joinVaultPath(...parts: string[]): string | undefined {
  const segments: string[] = [];
  for (const segment of parts.join("/").split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment !== "..") {
      segments.push(segment);
      continue;
    }
    if (segments.length === 0) {
      return undefined;
    }
    segments.pop();
  }
  return segments.join("/");
}

/** The path of `target` relative to `folder`, using `../` where needed. */
export function relativeVaultPath(folder: string, target: string): string {
  const from = folder ? folder.split("/") : [];
  const to = target.split("/");
  let common = 0;
  while (
    common < from.length &&
    common < to.length - 1 &&
    from[common] === to[common]
  ) {
    common++;
  }
  const up = from.slice(common).map(() => "..");
  return [...up, ...to.slice(common)].join("/");
}

/** Folder steps between two folders: 0 for the same folder. */
export function folderDistance(from: string, to: string): number {
  const a = from ? from.split("/") : [];
  const b = to ? to.split("/") : [];
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) {
    common++;
  }
  return a.length - common + (b.length - common);
}

/** `https:`, `mailto:`, `obsidian:` and similar links never name vault files. */
export function isExternalLink(link: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(link);
}

/** Markdown link destinations are percent-encoded; wikilinks are not. */
export function decodeLinkPath(link: string): string {
  try {
    return decodeURIComponent(link);
  } catch {
    return link;
  }
}
