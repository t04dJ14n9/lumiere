import {
  splitLinktext,
  withoutNoteExtension,
  type LinkSyntax,
} from "../../shared/vault-path";
import type { VaultIndex } from "../vault/api";

/** Decode once and reject ambiguous paths before the host resolves a target. */
export function linkParts(href: string): { path: string; fragment: string } {
  const clean = href.split("|")[0]!;
  const hash = clean.indexOf("#");
  const path = decodeURIComponent(hash < 0 ? clean : clean.slice(0, hash));
  const fragment = hash < 0 ? "" : clean.slice(hash + 1);
  if (
    [...path].some((char) => char.charCodeAt(0) < 32 || char === "\\") ||
    /%2f|%5c/i.test(path)
  ) {
    throw new Error("Invalid link path");
  }
  return { path, fragment };
}
export function externalScheme(href: string): string | undefined {
  return /^([a-z][a-z\d+.-]*):/i.exec(href)?.[1]?.toLowerCase();
}

/**
 * A wikilink target's key in the host's unresolved set: the path as written
 * without its `#subpath` or a note's `.md` (as Obsidian names it), lower-cased
 * because links resolve regardless of case.
 */
export function unresolvedKey(href: string): string {
  return withoutNoteExtension(
    splitLinktext(href.split("|")[0]!).path,
  ).toLowerCase();
}

/**
 * Where navigation should open an internal link. An explicit OKF miss does
 * not fall through to a different file the filesystem happens to find.
 */
export function openedVaultTarget(
  vault: Pick<VaultIndex, "classifyLink" | "resolveLink" | "file">,
  path: string,
  source: string,
  wiki: boolean,
): { uri: string | undefined; passthrough: boolean } {
  const syntax: LinkSyntax = wiki ? "wikilink" : "markdown";
  const decision = vault.classifyLink(path, source, syntax);
  if (decision?.status === "resolved") {
    return { uri: vault.file(decision.path)?.uri, passthrough: false };
  }
  if (decision?.status === "unresolved") {
    return { uri: undefined, passthrough: false };
  }
  // Outside OKF, Markdown must use source-relative navigation — not the
  // vault's wikilink-style index lookup that would prefer a vault-root twin.
  if (!wiki) {
    return { uri: undefined, passthrough: true };
  }
  return {
    uri: vault.resolveLink(path, source, syntax)?.uri,
    passthrough: true,
  };
}
