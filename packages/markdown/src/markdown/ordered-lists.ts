import type { ChangeSpec, Text } from "@codemirror/state";

/**
 * Numbering of ordered lists, for the editor's list keys. A run is the items
 * of one list level: ordered items with the same indentation and delimiter,
 * with only blank lines and deeper lines between them.
 */

const ORDERED = /^((?:[ \t]*>[ \t]?)*[ \t]*)(\d{1,9})([.)])(?=[ \t]|$)/u;

interface OrderedItem {
  line: number;
  /** Indentation in columns, quotes included. */
  depth: number;
  number: number;
  delimiter: string;
  /** Where the number starts and ends in the document. */
  from: number;
  to: number;
}

function columns(text: string, tabSize: number): number {
  let column = 0;
  for (const char of text) {
    column = char === "\t" ? column + tabSize - (column % tabSize) : column + 1;
  }
  return column;
}

function lineDepth(text: string, tabSize: number): number {
  return columns(/^(?:[ \t]*>[ \t]?)*[ \t]*/u.exec(text)![0], tabSize);
}

function orderedItem(
  doc: Text,
  line: number,
  tabSize: number,
): OrderedItem | undefined {
  const { text, from } = doc.line(line);
  const match = ORDERED.exec(text);
  if (!match) {
    return undefined;
  }
  const [, prefix = "", digits = "", delimiter = ""] = match;
  return {
    line,
    depth: columns(prefix, tabSize),
    number: Number(digits),
    delimiter,
    from: from + prefix.length,
    to: from + prefix.length + digits.length,
  };
}

/** The items of the run the ordered item on `line` belongs to, in order. */
export function orderedRun(
  doc: Text,
  line: number,
  tabSize: number,
): OrderedItem[] {
  const item = orderedItem(doc, line, tabSize);
  if (!item) {
    return [];
  }
  const sameRun = (other: OrderedItem | undefined): boolean =>
    other !== undefined &&
    other.depth === item.depth &&
    other.delimiter === item.delimiter;
  // Blank and deeper lines lie inside the run; anything else ends it.
  const inside = (n: number): boolean => {
    const text = doc.line(n).text;
    return text.trim() === "" || lineDepth(text, tabSize) > item.depth;
  };
  const items = [item];
  for (let n = line - 1; n >= 1; n--) {
    const other = orderedItem(doc, n, tabSize);
    if (sameRun(other)) {
      items.unshift(other!);
    } else if (!inside(n)) {
      break;
    }
  }
  for (let n = line + 1; n <= doc.lines; n++) {
    const other = orderedItem(doc, n, tabSize);
    if (sameRun(other)) {
      items.push(other!);
    } else if (!inside(n)) {
      break;
    }
  }
  return items;
}

/**
 * Number the runs holding the `candidates` lines consecutively, each from
 * its first item, or from 1 where its first item lies in `restart`.
 */
export function renumberRuns(
  doc: Text,
  candidates: Iterable<number>,
  tabSize: number,
  restart?: { first: number; last: number },
): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  const done = new Set<number>();
  for (const candidate of candidates) {
    if (candidate < 1 || candidate > doc.lines) {
      continue;
    }
    const run = orderedRun(doc, candidate, tabSize);
    const head = run[0];
    if (!head || done.has(head.line)) {
      continue;
    }
    done.add(head.line);
    const restarts =
      restart !== undefined &&
      head.line >= restart.first &&
      head.line <= restart.last;
    let next = restarts ? 1 : head.number;
    for (const item of run) {
      if (item.number !== next) {
        changes.push({ from: item.from, to: item.to, insert: String(next) });
      }
      next++;
    }
  }
  return changes;
}

/**
 * Number the runs around `lines` consecutively, as Obsidian does after an
 * item moves in or out a level: each run counts on from its first item, or
 * from 1 where its first item is one that moved.
 */
export function renumberAround(
  doc: Text,
  lines: { first: number; last: number },
  tabSize: number,
): ChangeSpec[] {
  return renumberRuns(
    doc,
    [lines.first - 1, lines.first, lines.last + 1],
    tabSize,
    lines,
  );
}
