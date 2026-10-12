import { diffSequences } from "./myers";
import type { Run } from "./myers";
import { splitLines, wordDiff } from "./lines";
import type { WordBudget } from "./lines";
import { codeSpans } from "./spans";
import type { Segment } from "./lines";

export type BlockKind =
  "frontmatter" | "code" | "math" | "table" | "heading" | "text";

/** A Markdown block: the unit the rendered diff aligns and renders. */
export interface Block {
  readonly kind: BlockKind;
  readonly text: string;
  /** 0-based, half-open source line range. */
  readonly from: number;
  readonly to: number;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}#{1,6}(\s|$)/;
const isTable = (line: string) => line.trimStart().startsWith("|");
const isMath = (line: string) => line.trim().startsWith("$$");

/** Where the block starting at line `i` ends (exclusive), and its kind. */
function blockAt(lines: readonly string[], i: number): [BlockKind, number] {
  const line = lines[i]!;
  const fence = FENCE.exec(line);
  if (fence) {
    const marker = fence[1]!;
    const close = new RegExp(`^ {0,3}\\${marker[0]}{${marker.length},}\\s*$`);
    return ["code", scan(lines, i + 1, (next) => !close.test(next)) + 1];
  }
  if (isMath(line)) {
    const oneLine = line.trim().length > 2 && line.trim().endsWith("$$");
    return [
      "math",
      oneLine
        ? i + 1
        : scan(lines, i + 1, (next) => !next.trim().endsWith("$$")) + 1,
    ];
  }
  if (HEADING.test(line)) {
    return ["heading", i + 1];
  }
  if (isTable(line)) {
    return ["table", scan(lines, i, isTable)];
  }
  const prose = (next: string) =>
    next.trim() !== "" &&
    !FENCE.test(next) &&
    !HEADING.test(next) &&
    !isTable(next) &&
    !isMath(next);
  return ["text", scan(lines, i + 1, prose)];
}

/** The first line at or after `from` that fails `keep`, or the line count. */
function scan(
  lines: readonly string[],
  from: number,
  keep: (line: string) => boolean,
): number {
  let j = from;
  while (j < lines.length && keep(lines[j]!)) {
    j++;
  }
  return j;
}

function frontmatterEnd(lines: readonly string[]): number {
  if (lines[0] !== "---") {
    return 0;
  }
  const close = lines.findIndex(
    (line, index) => index > 0 && (line === "---" || line === "..."),
  );
  return close > 0 ? close + 1 : 0;
}

const LIST_ITEM = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/;

export interface SplitOptions {
  /**
   * Keep a list together across blank lines: an indented paragraph or a
   * further item after a list joins its block, so it renders inside it.
   */
  readonly containers?: boolean;
}

/** Split Markdown into blocks; blank lines separate blocks and belong to none. */
export function splitBlocks(text: string, options: SplitOptions = {}): Block[] {
  const lines = splitLines(text);
  const blocks: Block[] = [];
  const add = (kind: BlockKind, from: number, to: number) =>
    blocks.push({ kind, from, to, text: lines.slice(from, to).join("\n") });
  let i = frontmatterEnd(lines);
  if (i > 0) {
    add("frontmatter", 0, i);
  }
  while (i < lines.length) {
    if (lines[i]!.trim() === "") {
      i++;
      continue;
    }
    const [kind, end] = blockAt(lines, i);
    const to = Math.min(Math.max(end, i + 1), lines.length);
    const last = blocks[blocks.length - 1];
    if (
      options.containers &&
      kind === "text" &&
      last?.kind === "text" &&
      LIST_ITEM.test(lines[last.from]!) &&
      (/^[ \t]+\S/.test(lines[i]!) || LIST_ITEM.test(lines[i]!))
    ) {
      blocks.pop();
      add("text", last.from, to);
    } else {
      add(kind, i, to);
    }
    i = to;
  }
  return blocks;
}

/** One row of a rendered diff: a block on either side, or both. */
export interface BlockRow {
  readonly kind: "equal" | "modified" | "added" | "deleted";
  readonly before?: Block;
  readonly after?: Block;
}

/** Align the blocks of two texts; replaced runs pair up in order when kinds match. */
export function alignBlocks(
  before: string,
  after: string,
  options: SplitOptions = {},
): BlockRow[] {
  const a = splitBlocks(before, options);
  const b = splitBlocks(after, options);
  const rows: BlockRow[] = [];
  const runs = diffSequences(a, b, (x, y) => x.text === y.text);
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r]!;
    if (run.type === "equal") {
      for (let k = 0; k < run.aTo - run.aFrom; k++) {
        rows.push({
          kind: "equal",
          before: a[run.aFrom + k]!,
          after: b[run.bFrom + k]!,
        });
      }
      continue;
    }
    // Gather a delete/insert pair into one replacement.
    let removed = run.type === "delete" ? a.slice(run.aFrom, run.aTo) : [];
    let added = run.type === "insert" ? b.slice(run.bFrom, run.bTo) : [];
    const next = runs[r + 1];
    if (next && next.type !== "equal" && next.type !== run.type) {
      if (next.type === "delete") {
        removed = a.slice(next.aFrom, next.aTo);
      } else {
        added = b.slice(next.bFrom, next.bTo);
      }
      r++;
    }
    rows.push(...pair(removed, added));
  }
  return rows;
}

function pair(removed: readonly Block[], added: readonly Block[]): BlockRow[] {
  const rows: BlockRow[] = [];
  let i = 0;
  let j = 0;
  while (i < removed.length || j < added.length) {
    const x = removed[i];
    const y = added[j];
    if (x && y && x.kind === y.kind) {
      rows.push({ kind: "modified", before: x, after: y });
      i++;
      j++;
    } else if (x && (!y || removed.length - i >= added.length - j)) {
      rows.push({ kind: "deleted", before: x });
      i++;
    } else {
      rows.push({ kind: "added", after: y! });
      j++;
    }
  }
  return rows;
}

/** Text a run can be wrapped in inline HTML without breaking Markdown syntax. */
const PLAIN = /^[\p{L}\p{N}\s.,;:!?'"()%/+\-\u2013\u2014]+$/u;

export const DEL_CLASS = "mw-gd-del";
export const INS_CLASS = "mw-gd-ins";

/**
 * One side of a word diff as Markdown: changed plain-text runs on this side
 * are wrapped in `<del>`/`<ins>`. Runs that contain Markdown syntax are left
 * bare (the block is still marked as changed), so the diff never breaks the
 * rendering of emphasis, links or table pipes.
 */
export function markSide(
  segments: readonly Segment[],
  side: "before" | "after",
): string {
  const own = side === "before" ? "delete" : "insert";
  const tag = side === "before" ? "del" : "ins";
  const cls = side === "before" ? DEL_CLASS : INS_CLASS;
  const sideText = segments
    .filter((segment) => segment.type === "equal" || segment.type === own)
    .map((segment) => segment.text)
    .join("");
  const guarded = protectedRanges(sideText);
  let out = "";
  let at = 0;
  for (const segment of segments) {
    if (segment.type === "equal") {
      out += segment.text;
      at += segment.text.length;
    } else if (segment.type === own) {
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(
        segment.text,
      )!;
      const from = at + lead!.length;
      const to = from + core!.length;
      const safe =
        core &&
        PLAIN.test(core) &&
        !core.includes("\n") &&
        !guarded.some(([x, y]) => from < y && to > x);
      out += safe
        ? `${lead}<${tag} class="${cls}">${core}</${tag}>${trail}`
        : segment.text;
      at += segment.text.length;
    }
  }
  return out;
}

/**
 * Syntax that is not text: line prefixes (quotes, list and task markers,
 * heading marks), reference definitions, link destinations, code spans of any
 * fence length, math, autolinks, HTML tags and wikilinks.
 */
const PROTECTED = new RegExp(
  [
    String.raw`^[ \t]{0,3}(?:>[ \t]?)*(?:(?:[-+*]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?(?=[ \t]|$)|#{1,6}(?=[ \t]|$))`,
    String.raw`^[ \t]{0,3}\[[^\]\n]+\]:[^\n]*`,
    String.raw`\$[^$\n]+\$`,
    String.raw`\]\([^)\n]*\)`,
    String.raw`<[^>\n]*>`,
    String.raw`\[\[[^\]\n]*\]\]`,
    String.raw`\w+:\/\/\S+`,
  ].join("|"),
  "gm",
);

function protectedRanges(text: string): [number, number][] {
  const pattern = new RegExp(PROTECTED);
  const ranges: [number, number][] = [...text.matchAll(pattern)].map((m) => [
    m.index,
    m.index + m[0].length,
  ]);
  return ranges.concat(codeSpans(text));
}

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * A code, math source or frontmatter block as a one-line HTML block: each
 * source line a span marked kept, removed or added. One line, because a
 * blank line would end a Markdown HTML block.
 */
export function lineBlockHtml(
  before: string | undefined,
  after: string | undefined,
  side: "before" | "after",
  kind: BlockKind,
): string {
  const a = before === undefined ? [] : splitLines(before);
  const b = after === undefined ? [] : splitLines(after);
  const spans: string[] = [];
  for (const run of diffSequences(a, b)) {
    if (run.type === "equal") {
      const lines =
        side === "before"
          ? a.slice(run.aFrom, run.aTo)
          : b.slice(run.bFrom, run.bTo);
      spans.push(...lines.map((line) => span("", line)));
    } else if (run.type === "delete" && side === "before") {
      spans.push(
        ...a
          .slice(run.aFrom, run.aTo)
          .map((line) => span("mw-gd-line-del", line)),
      );
    } else if (run.type === "insert" && side === "after") {
      spans.push(
        ...b
          .slice(run.bFrom, run.bTo)
          .map((line) => span("mw-gd-line-ins", line)),
      );
    }
  }
  return `<pre class="mw-gd-lines mw-gd-${kind}"><code>${spans.join("")}</code></pre>`;
  function span(cls: string, line: string): string {
    return `<span class="mw-gd-line${cls ? ` ${cls}` : ""}">${escapeHtml(line) || "&#8203;"}</span>`;
  }
}

/** Code and frontmatter diff by line; math only when it changed. */
function asLines(row: BlockRow["kind"], kind: string): boolean {
  if (kind === "math") {
    return row === "modified";
  }
  return kind === "code" || kind === "frontmatter";
}

const SEPARATOR = /^\s*\|?\s*:?-{3,}/;

/** A whole table row added or removed: each cell's text marked. */
function markRow(
  line: string,
  side: "before" | "after",
  words?: WordBudget,
): string {
  if (SEPARATOR.test(line)) {
    return line;
  }
  if (words && !words.spend(line, "")) {
    return line;
  }
  return line
    .split("|")
    .map((cell) =>
      markSide(
        side === "before" ? wordDiff(cell, "") : wordDiff("", cell),
        side,
      ),
    )
    .join("|");
}

/**
 * One side of a changed table, row by row: a rewritten row gets word marks,
 * an added or removed row has every cell marked, so the table stays a table.
 */
function tableSide(
  before: string,
  after: string,
  side: "before" | "after",
  words?: WordBudget,
): string {
  const a = splitLines(before);
  const b = splitLines(after);
  const runs = diffSequences(a, b);
  const out: string[] = [];
  const old = (run: Run) => a.slice(run.aFrom, run.aTo);
  const now = (run: Run) => b.slice(run.bFrom, run.bTo);
  runs.forEach((run, index) => {
    if (run.type === "equal") {
      out.push(...(side === "before" ? old(run) : now(run)));
    } else if (run.type === "delete" && side === "before") {
      const next = runs[index + 1];
      const theirs = next?.type === "insert" ? now(next) : [];
      out.push(
        ...old(run).map((line, i) => rowLine(line, theirs[i], side, words)),
      );
    } else if (run.type === "insert" && side === "after") {
      const previous = runs[index - 1];
      const theirs = previous?.type === "delete" ? old(previous) : [];
      out.push(
        ...now(run).map((line, i) => rowLine(theirs[i], line, side, words)),
      );
    }
  });
  return out.join("\n");
}

/** A rewritten row's word marks, or a whole added or removed row. */
function rowLine(
  before: string | undefined,
  after: string | undefined,
  side: "before" | "after",
  words?: WordBudget,
): string {
  if (before === undefined || after === undefined) {
    return markRow((before ?? after)!, side, words);
  }
  if (words && !words.spend(before, after)) {
    return side === "before" ? before : after;
  }
  return markSide(wordDiff(before, after), side);
}

/** Both sides of a rewritten block with changed words (or table rows) marked. */
function modifiedSides(
  before: string,
  after: string,
  kind: BlockKind,
  words?: WordBudget,
): { before: string; after: string } {
  if (kind === "table") {
    return {
      before: tableSide(before, after, "before", words),
      after: tableSide(before, after, "after", words),
    };
  }
  if (words && !words.spend(before, after)) {
    // Line-level: the sides as they are, with no word marks.
    return { before, after };
  }
  const segments = wordDiff(before, after);
  return {
    before: markSide(segments, "before"),
    after: markSide(segments, "after"),
  };
}

/** The Markdown each side of a row renders; undefined for an empty side. */
export function rowMarkdown(
  row: BlockRow,
  words?: WordBudget,
): {
  before?: string;
  after?: string;
} {
  const { before, after } = row;
  const kind = (before ?? after)!.kind;
  // The renderer drops a leading frontmatter, so it always shows as lines.
  if (row.kind === "equal" && kind !== "frontmatter") {
    return { before: before!.text, after: after!.text };
  }
  if (asLines(row.kind, kind)) {
    return {
      ...(before && {
        before: lineBlockHtml(before.text, after?.text, "before", kind),
      }),
      ...(after && {
        after: lineBlockHtml(before?.text, after.text, "after", kind),
      }),
    };
  }
  if (row.kind === "modified") {
    return modifiedSides(before!.text, after!.text, kind, words);
  }
  return {
    ...(before && { before: before.text }),
    ...(after && { after: after.text }),
  };
}
