import { findClusterBreak } from "@codemirror/state";
import type { CellPosition } from "../../markdown/tables/model";

export type WordMotion = "w" | "W" | "e" | "E" | "b" | "B" | "ge" | "gE";
export interface WordTarget extends CellPosition {
  head: number;
}
interface CellWord {
  start: WordTarget;
  end: WordTarget;
}

/** Cell separators are whitespace, not Markdown pipes or the delimiter row. */
export function tableWordTarget(options: {
  cells: readonly (readonly string[])[];
  current: WordTarget;
  motion: WordMotion;
  count?: number;
}): WordTarget | undefined {
  const { cells, current, motion } = options;
  const words = cells.flatMap((row, rowIndex) =>
    row.flatMap((text, column) =>
      cellWords(
        text,
        { row: rowIndex, column },
        motion !== motion.toLowerCase(),
      ),
    ),
  );
  if (!words.length) {
    return undefined;
  }
  const isEnd = motion.toLowerCase().endsWith("e");
  const isForward = !["b", "ge"].includes(motion.toLowerCase());
  const endpoints = words.map((word) => (isEnd ? word.end : word.start));
  const candidates = endpoints.filter((point) =>
    isForward ? compare(point, current) > 0 : compare(point, current) < 0,
  );
  if (!isForward) {
    candidates.reverse();
  }
  const count = Math.max(1, options.count ?? 1);
  const destination = candidates[count - 1];
  if (destination) {
    return destination;
  }
  // Match normal Vim's clamping at buffer edges without creating table rows.
  const edge = isForward ? words.at(-1)?.end : words[0]?.start;
  if (
    !edge ||
    (isForward ? compare(edge, current) < 0 : compare(edge, current) > 0)
  ) {
    return current;
  }
  return edge;
}

function cellWords(
  text: string,
  position: CellPosition,
  bigWord: boolean,
): CellWord[] {
  const words: CellWord[] = [];
  let previousClass = 0;
  for (let head = 0; head < text.length;) {
    const next = findClusterBreak(text, head);
    const cluster = text.slice(head, next);
    const characterClass = wordClass(cluster, bigWord);
    if (characterClass) {
      const point = { ...position, head };
      const previous = words.at(-1);
      if (previous && previousClass === characterClass) {
        previous.end = point;
      } else {
        words.push({ start: point, end: point });
      }
    }
    previousClass = characterClass;
    head = next;
  }
  return words;
}

/** Same definition as @replit/codemirror-vim's CodeMirror.isWordChar. */
const wordChar = (() => {
  try {
    return new RegExp("[\\w\\p{Alphabetic}\\p{Number}_]", "u");
  } catch {
    return /[\w]/;
  }
})();

function isWordChar(ch: string): boolean {
  return wordChar.test(ch);
}

function wordClass(cluster: string, bigWord: boolean): number {
  if (/\s/u.test(cluster)) {
    return 0;
  }
  // Match Vim's Unicode alphabetic/number definition, including CJK.
  // Inspect a code point so astral letters and combining graphemes stay whole.
  return bigWord || isWordChar([...cluster][0] ?? "") ? 1 : 2;
}

function compare(left: WordTarget, right: WordTarget): number {
  return (
    left.row - right.row || left.column - right.column || left.head - right.head
  );
}
