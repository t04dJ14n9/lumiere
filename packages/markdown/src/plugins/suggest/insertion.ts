import type { VaultIndex } from "../vault/api";
import type { Candidate, Value } from "./candidates";
import type { Suggestion } from "./protocol";
import { folderOf, relativeVaultPath } from "../../shared/vault-path";
export function materialize(options: {
  vault: VaultIndex;
  source: string;
  entry: Candidate;
  globalBlock: boolean;
  /** `^` was typed without `#`: the link's `#` comes with the id. */
  bare?: boolean;
  useWikilinks: boolean;
}): Suggestion {
  const { vault, source, entry, globalBlock, useWikilinks } = options;
  const base = {
    label: entry.label,
    detail: entry.detail,
    ...blockIdOf(entry, source),
  };
  if (!useWikilinks) {
    return { ...base, insert: markdownLink(entry, source), replaceLink: true };
  }
  const text = wikiText(vault, source, entry.value, globalBlock);
  const bare = options.bare && entry.value.kind === "block" && !globalBlock;
  return { ...base, insert: bare ? `#^${text}` : text };
}

/** The id a picked block without one gets, as Obsidian adds it. */
function blockIdOf(entry: Candidate, source: string) {
  const value = entry.value;
  if (value.kind !== "block" || !value.newId) {
    return {};
  }
  return {
    blockId: {
      uri: value.target.uri,
      ...value.newId,
      here: value.target.path === source,
    },
  };
}
function wikiText(
  vault: VaultIndex,
  source: string,
  value: Value,
  globalBlock: boolean,
): string {
  if (value.kind === "literal" || value.kind === "heading") {
    return value.text;
  }
  if (value.kind === "block") {
    return globalBlock
      ? `${vault.linkText(value.target, source)}#^${value.id}`
      : value.id;
  }
  return (
    vault.linkText(value.target, source) +
    (value.alias ? `|${value.alias}` : "")
  );
}
function markdownLink(entry: Candidate, source: string): string {
  const value = entry.value;
  let path: string;
  if (value.kind === "literal") {
    path = /\.[^/]+$/.test(value.text) ? value.text : `${value.text}.md`;
  } else {
    path = relativeVaultPath(folderOf(source), value.target.path);
  }
  const destination =
    path.split("/").map(encodeDestination).join("/") + fragment(value);
  const label = entry.label.replace(/([\\[\]])/g, "\\$1");
  return `[${label}](${destination})`;
}
function fragment(value: Value): string {
  if (value.kind === "heading") {
    return `#${encodeDestination(value.text)}`;
  }
  return value.kind === "block" ? `#^${encodeDestination(value.id)}` : "";
}
function encodeDestination(value: string): string {
  return encodeURIComponent(value).replace(
    /[()]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
