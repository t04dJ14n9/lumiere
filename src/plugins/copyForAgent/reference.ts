/** Multi-root and non-file workspaces use an unambiguous full URI. */
export function referencePath(uri: string, roots: readonly string[]): string {
  const source = new URL(uri);
  if (roots.length !== 1 || source.protocol !== "file:") {
    return uri;
  }
  const root = new URL(roots[0]!);
  const prefix = root.pathname.replace(/\/$/, "") + "/";
  if (
    root.protocol !== "file:" ||
    root.host !== source.host ||
    !source.pathname.startsWith(prefix)
  ) {
    return uri;
  }
  return decodeURIComponent(source.pathname.slice(prefix.length));
}
export function formatReference(
  path: string,
  start: number,
  end: number,
): string {
  if (
    !path ||
    Array.from(path).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 1 ||
    end < start
  ) {
    throw new Error("Invalid agent reference");
  }
  return `@${path}#${start === end ? start : `${start}-${end}`}`;
}
