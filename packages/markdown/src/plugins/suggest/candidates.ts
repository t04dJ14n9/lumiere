import type { VaultIndex, VaultFile } from "../vault/api";
import { tagTree } from "../../markdown/tags/tree";
import { nameOf } from "../../shared/vault-path";
export type Value =
  | { kind: "literal"; text: string }
  | { kind: "file"; target: VaultFile; alias?: string }
  | { kind: "block"; target: VaultFile; id: string }
  | { kind: "heading"; target: VaultFile; text: string };
export interface Candidate {
  label: string;
  detail: string;
  value: Value;
  /** What the query matches: the label, or a tag lower-cased. */
  text: string;
  /** A note's path without `.md`, matched a point lower than its name. */
  path?: string;
  /** How much lower it ranks: an excluded note ranks 10 lower. */
  penalty: number;
  /** A block matches when its text has every word of the query. */
  words?: boolean;
  order: string;
}
/**
 * A suggestion, matching a query on its own text as in Obsidian: a note on
 * its name, else on its path; an alias, heading or tag on its text, never
 * on its detail.
 */
export function candidate(
  label: string,
  detail: string,
  value: Value,
  options: Partial<Pick<Candidate, "text" | "path" | "penalty" | "words">> = {},
): Candidate {
  return {
    label,
    detail,
    value,
    text: options.text ?? label,
    penalty: options.penalty ?? 0,
    ...(options.path !== undefined && { path: options.path }),
    ...(options.words && { words: true }),
    order: candidateOrder(value),
  };
}
function candidateOrder(value: Value): string {
  if (value.kind === "literal" || value.kind === "heading") {
    return value.text;
  }
  return value.target.path;
}
export function fileCandidates(
  vault: VaultIndex,
  file: VaultFile,
  kind: "link" | "heading" | "block",
): Candidate[] {
  const metadata = vault.metadata(file.path);
  if (kind === "heading") {
    return (metadata?.headings ?? []).map(({ heading, level }) =>
      candidate(heading, `H${level} · ${file.path}`, {
        kind: "heading",
        target: file,
        text: heading,
      }),
    );
  }
  if (kind === "block") {
    return Object.values(metadata?.blocks ?? {}).map(({ id, text }) =>
      candidate(
        id,
        `${text.slice(0, 512)} · ${file.path}`,
        { kind: "block", target: file, id },
        { text: text.slice(0, 512), words: true },
      ),
    );
  }
  const penalty = file.excluded ? 10 : 0;
  return [
    candidate(
      file.extension === "md" ? file.basename : nameOf(file.path),
      file.path,
      { kind: "file", target: file },
      {
        path: file.extension === "md" ? file.path.slice(0, -3) : file.path,
        penalty,
      },
    ),
    ...(metadata?.aliases ?? []).map((alias) =>
      candidate(
        alias,
        file.path,
        { kind: "file", target: file, alias },
        { penalty },
      ),
    ),
  ];
}
const byName = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
}).compare;

/**
 * Every tag in the vault, as Obsidian suggests them: parents too (`#a` for
 * `#a/b`), case variants under the most used spelling, by name; the query
 * matches a tag lower-cased.
 */
export function tagCandidates(vault: VaultIndex): Candidate[] {
  const notes = vault
    .files()
    .filter((file) => !file.excluded)
    .map((file) => ({
      id: file.path,
      tags: (vault.metadata(file.path)?.tags ?? []).map(({ tag }) =>
        tag.replace(/^#/, ""),
      ),
    }));
  return tagTree(notes, false, false)
    .sort((a, b) => byName(a.tag, b.tag))
    .map(({ tag, count }) =>
      candidate(
        tag,
        `${count} occurrences`,
        { kind: "literal", text: tag },
        { text: tag.toLowerCase() },
      ),
    );
}
