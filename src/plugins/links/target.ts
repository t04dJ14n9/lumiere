/** Decode once and reject ambiguous paths before the host resolves a target. */
export function linkParts(href: string): { path: string; fragment: string } {
  const clean = href.split("|")[0]!;
  const hash = clean.indexOf("#");
  const path = decodeURIComponent(hash < 0 ? clean : clean.slice(0, hash));
  const fragment = hash < 0 ? "" : clean.slice(hash + 1);
  if (
    [...path].some((char) => char.charCodeAt(0) < 32 || char === "\\") ||
    /%2f|%5c/i.test(path)
  )
    throw new Error("Invalid link path");
  return { path, fragment };
}
export function externalScheme(href: string): string | undefined {
  return /^([a-z][a-z\d+.-]*):/i.exec(href)?.[1]?.toLowerCase();
}
