import { ChangeSet, Text } from "@codemirror/state";
export interface WireUpdate {
  clientID: string;
  changes: unknown[];
}
export function textDocument(text: string): Text {
  return Text.of(text.split(/\r\n?|\n/));
}

/**
 * Turn a host/external rewrite into the smallest set of spans that explain it.
 *
 * A single prefix/suffix hunk will swallow unchanged text in the middle (a new
 * line above a table plus an edit in a later cell is the usual case). Carets
 * inside that swallowed span then map to one edge of the hunk, so typing after
 * an external edit can land in the wrong cell. Split on unique shared lines so
 * unchanged regions keep their positions.
 */
export function difference(before: string, after: string): ChangeSet {
  return ChangeSet.of(hunks(before, after), before.length);
}

function hunks(
  before: string,
  after: string,
): { from: number; to: number; insert: string }[] {
  let from = 0;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (from < oldEnd && from < newEnd && before[from] === after[from]) {
    from++;
  }
  while (
    oldEnd > from &&
    newEnd > from &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  if (from === oldEnd && from === newEnd) {
    return [];
  }
  const oldMid = before.slice(from, oldEnd);
  const newMid = after.slice(from, newEnd);
  if (!oldMid.length || !newMid.length) {
    return [{ from, to: oldEnd, insert: newMid }];
  }
  const shared = sharedAnchor(oldMid, newMid);
  if (!shared) {
    return [{ from, to: oldEnd, insert: newMid }];
  }
  const oldAt = oldMid.indexOf(shared);
  const newAt = newMid.indexOf(shared);
  const afterShared = shared.length;
  return [
    ...shiftHunks(hunks(oldMid.slice(0, oldAt), newMid.slice(0, newAt)), from),
    ...shiftHunks(
      hunks(
        oldMid.slice(oldAt + afterShared),
        newMid.slice(newAt + afterShared),
      ),
      from + oldAt + afterShared,
    ),
  ];
}

function shiftHunks(
  changes: { from: number; to: number; insert: string }[],
  offset: number,
): { from: number; to: number; insert: string }[] {
  return changes.map((change) => ({
    from: change.from + offset,
    to: change.to + offset,
    insert: change.insert,
  }));
}

/** Longest unique shared line, so an unchanged row can anchor the split. */
function sharedAnchor(oldMid: string, newMid: string): string | undefined {
  const oldCounts = lineCounts(oldMid);
  const newCounts = lineCounts(newMid);
  let best: string | undefined;
  for (const [line, count] of oldCounts) {
    if (!line || count !== 1 || newCounts.get(line) !== 1) {
      continue;
    }
    if (!best || line.length > best.length) {
      best = line;
    }
  }
  if (!best) {
    return undefined;
  }
  // Prefer a newline-bounded match so a short cell value cannot false-split.
  const wrapped = `\n${best}\n`;
  if (oldMid.includes(wrapped) && newMid.includes(wrapped)) {
    return wrapped;
  }
  if (occurrences(oldMid, best) === 1 && occurrences(newMid, best) === 1) {
    return best;
  }
  return undefined;
}

function lineCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of text.split("\n")) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
}

function occurrences(text: string, piece: string): number {
  if (!piece) {
    return 0;
  }
  let count = 0;
  for (let at = 0; (at = text.indexOf(piece, at)) >= 0; at += piece.length) {
    count++;
  }
  return count;
}
