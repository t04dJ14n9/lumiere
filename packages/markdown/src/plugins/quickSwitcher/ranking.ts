import { fuzzyMatch } from "../../shared/fuzzy";
import type { PickItem } from "../../shared/host";
import { folderOf, stemOf } from "../../shared/vault-path";
import type { VaultFile, VaultIndex } from "../vault/api";

export type SwitcherTarget =
  | { kind: "note"; file: VaultFile }
  | { kind: "unresolved"; linkpath: string }
  | { kind: "create"; name: string };

interface Candidate {
  item: PickItem<SwitcherTarget>;
  /** Texts matched against the query, best first; later ones score lower. */
  texts: string[];
  mtime: number;
  /** Aliases are found by search but not listed for an empty query. */
  isAlias?: boolean;
}

/** A match on a note's path ranks below any match on its name. */
const PATH_PENALTY = 1;

/**
 * Quick switcher items for a query, as Obsidian's switcher: notes by name,
 * then by path, their aliases, and links whose note does not exist yet, best
 * match first. An empty query lists recently modified notes. A query that
 * names no note offers to create it.
 */
export function switcherItems(
  index: VaultIndex,
  query: string,
  limit = 50,
): PickItem<SwitcherTarget>[] {
  const candidates = [...noteCandidates(index), ...unresolvedCandidates(index)];
  const trimmed = query.trim();
  if (!trimmed) {
    return candidates
      .filter(
        (candidate) =>
          candidate.item.value.kind === "note" && !candidate.isAlias,
      )
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map((candidate) => candidate.item);
  }
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: bestScore(trimmed, candidate.texts),
    }))
    .filter(
      (entry): entry is { candidate: Candidate; score: number } =>
        entry.score !== undefined,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ candidate }) => candidate.item);
  return hasNoteNamed(index, trimmed)
    ? ranked
    : [...ranked, createItem(trimmed)];
}

function noteCandidates(index: VaultIndex): Candidate[] {
  return index
    .files()
    .filter((file) => file.extension === "md" && !file.excluded)
    .flatMap((file) => {
      const note: Candidate = {
        item: {
          label: file.basename,
          description: folderOf(file.path),
          value: { kind: "note", file },
        },
        texts: [file.basename, file.path.slice(0, -".md".length)],
        mtime: file.mtime,
      };
      const aliases = (index.metadata(file.path)?.aliases ?? []).map(
        (alias) => ({
          item: {
            label: alias,
            description: `→ ${file.basename}`,
            value: { kind: "note", file } as SwitcherTarget,
          },
          texts: [alias],
          mtime: file.mtime,
          isAlias: true,
        }),
      );
      return [note, ...aliases];
    });
}

function unresolvedCandidates(index: VaultIndex): Candidate[] {
  const seen = new Map<string, string>();
  for (const file of index.files()) {
    for (const linkpath of index.unresolvedLinks(file.path).keys()) {
      seen.set(linkpath.toLowerCase(), linkpath);
    }
  }
  return [...seen.values()].map((linkpath) => ({
    item: {
      label: linkpath,
      description: "Not created yet",
      value: { kind: "unresolved", linkpath },
    },
    texts: [linkpath],
    mtime: 0,
  }));
}

function bestScore(
  query: string,
  texts: readonly string[],
): number | undefined {
  let best: number | undefined;
  texts.forEach((text, position) => {
    const match = fuzzyMatch(query, text);
    if (match) {
      const score = match.score - position * PATH_PENALTY;
      best = best === undefined ? score : Math.max(best, score);
    }
  });
  return best;
}

function hasNoteNamed(index: VaultIndex, name: string): boolean {
  const wanted = stemOf(name).toLowerCase();
  return index
    .files()
    .some(
      (file) =>
        file.extension === "md" && file.basename.toLowerCase() === wanted,
    );
}

function createItem(name: string): PickItem<SwitcherTarget> {
  return {
    label: `$(new-file) Create “${name}”`,
    description: "New note",
    value: { kind: "create", name },
  };
}
