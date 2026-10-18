import { fuzzyMatch } from "../../shared/fuzzy";
import type { PickItem } from "../../shared/host";
import { folderOf, nameOf, stemOf } from "../../shared/vault-path";
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
  /** Only notes are listed for an empty query. */
  isAttachment?: boolean;
  /** An excluded file ranks 10 points lower, as in Obsidian. */
  penalty: number;
}

/** A match on a note's path is a point lower than one on its name. */
const PATH_PENALTY = 1;

/**
 * Files Obsidian's switcher lists besides notes, with its default "Show
 * attachments": images, audio, video, PDFs, canvases and bases.
 */
const ATTACHMENTS = new Set([
  ...["bmp", "png", "jpg", "jpeg", "gif", "svg", "webp", "avif"],
  ...["mp3", "wav", "m4a", "3gp", "flac", "ogg", "oga", "opus"],
  ...["mp4", "webm", "ogv", "mov", "mkv", "pdf", "canvas", "base"],
]);

/**
 * Quick switcher items for a query, as Obsidian's switcher: notes and
 * attachments by name, then by path, notes' aliases, and links whose note
 * does not exist yet, best match first (excluded files 10 points lower). An
 * empty query lists recently modified notes. A query that names no note
 * offers to create it.
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
          candidate.item.value.kind === "note" &&
          !candidate.isAlias &&
          !candidate.isAttachment &&
          candidate.penalty === 0,
      )
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map((candidate) => candidate.item);
  }
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: bestScore(trimmed, candidate.texts, candidate.penalty),
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
    .filter(
      (file) =>
        file.extension === "md" ||
        ATTACHMENTS.has(file.extension.toLowerCase()),
    )
    .flatMap((file) => {
      const isNote = file.extension === "md";
      const label = isNote ? file.basename : nameOf(file.path);
      const penalty = file.excluded ? 10 : 0;
      const note: Candidate = {
        item: {
          label,
          description: folderOf(file.path),
          value: { kind: "note", file },
        },
        texts: [label, isNote ? file.path.slice(0, -".md".length) : file.path],
        mtime: file.mtime,
        penalty,
        ...(!isNote && { isAttachment: true }),
      };
      if (!isNote) {
        return [note];
      }
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
          penalty,
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
    penalty: 0,
  }));
}

/** The first of `texts` the query matches, each later one a point lower. */
function bestScore(
  query: string,
  texts: readonly string[],
  penalty: number,
): number | undefined {
  for (const [position, text] of texts.entries()) {
    const match = fuzzyMatch(query, text);
    if (match) {
      return match.score - position * PATH_PENALTY - penalty;
    }
  }
  return undefined;
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
