import { diffSequences } from "./myers";

/** One contiguous change between a baseline and the current text, in lines. */
export interface LineHunk {
  readonly kind: "added" | "modified" | "deleted";
  /** 0-based, half-open line range in the baseline. */
  readonly oldFrom: number;
  readonly oldTo: number;
  /** 0-based, half-open line range in the current text. Empty for `deleted`. */
  readonly newFrom: number;
  readonly newTo: number;
}

export function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

/**
 * The changes from `before` to `after`, grouped like VS Code's quick diff: a
 * run of removed lines followed by added ones is one `modified` hunk.
 */
export function lineHunks(before: string, after: string): LineHunk[] {
  const a = splitLines(before);
  const b = splitLines(after);
  // A file that ends in a newline has an empty last "line" on both sides.
  const hunks: LineHunk[] = [];
  let open:
    | { oldFrom: number; oldTo: number; newFrom: number; newTo: number }
    | undefined;
  const close = () => {
    if (!open) {
      return;
    }
    const removed = open.oldTo > open.oldFrom;
    const added = open.newTo > open.newFrom;
    hunks.push({
      kind: hunkKind(removed, added),
      ...open,
    });
    open = undefined;
  };
  for (const run of diffSequences(a, b)) {
    if (run.type === "equal") {
      close();
      continue;
    }
    open ??= {
      oldFrom: run.aFrom,
      oldTo: run.aFrom,
      newFrom: run.bFrom,
      newTo: run.bFrom,
    };
    open.oldTo = run.aTo;
    open.newTo = run.bTo;
  }
  close();
  return hunks;
}

function hunkKind(removed: boolean, added: boolean): LineHunk["kind"] {
  if (removed && added) {
    return "modified";
  }
  return added ? "added" : "deleted";
}

/** A word-level piece of a changed passage. */
export interface Segment {
  readonly type: "equal" | "delete" | "insert";
  readonly text: string;
}

const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

export function tokens(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/** How many word diffs ran and over how many tokens; for budget tests. */
export const wordDiffStats = { calls: 0, tokens: 0 };

/**
 * Whether a word diff of two texts may run now (spending its cost if so).
 * Without one, word diffs always run.
 */
export interface WordBudget {
  spend(before: string, after: string): boolean;
}

/** A budget that admits nothing: the line-level view. */
export const LINES_ONLY: WordBudget = { spend: () => false };

/**
 * Word diff: whitespace, words and single punctuation characters are the
 * units. A lone space between two changes joins them, so "a b" -> "c d"
 * reads as one replacement rather than four.
 */
export function wordDiff(before: string, after: string): Segment[] {
  const a = tokens(before);
  const b = tokens(after);
  wordDiffStats.calls++;
  wordDiffStats.tokens += a.length + b.length;
  const raw: Segment[] = [];
  for (const run of diffSequences(a, b)) {
    if (run.type === "insert") {
      raw.push({ type: "insert", text: b.slice(run.bFrom, run.bTo).join("") });
    } else {
      raw.push({
        type: run.type,
        text: a.slice(run.aFrom, run.aTo).join(""),
      });
    }
  }
  // Fold whitespace-only equal runs between changes into the changes.
  const joined: Segment[] = [];
  for (let i = 0; i < raw.length; i++) {
    const segment = raw[i]!;
    const prev = raw[i - 1];
    const next = raw[i + 1];
    if (
      segment.type === "equal" &&
      /^[ \t]+$/.test(segment.text) &&
      prev &&
      prev.type !== "equal" &&
      next &&
      next.type !== "equal"
    ) {
      joined.push({ type: "delete", text: segment.text });
      joined.push({ type: "insert", text: segment.text });
      continue;
    }
    joined.push(segment);
  }
  return normalize(joined);
}

/** Merge neighbours and order each change as deletion, then insertion. */
function normalize(segments: readonly Segment[]): Segment[] {
  const out: Segment[] = [];
  let del = "";
  let ins = "";
  const flush = () => {
    if (del) {
      out.push({ type: "delete", text: del });
    }
    if (ins) {
      out.push({ type: "insert", text: ins });
    }
    del = "";
    ins = "";
  };
  for (const segment of segments) {
    if (segment.type === "delete") {
      del += segment.text;
    } else if (segment.type === "insert") {
      ins += segment.text;
    } else {
      flush();
      const last = out.at(-1);
      if (last?.type === "equal") {
        out[out.length - 1] = { type: "equal", text: last.text + segment.text };
      } else {
        out.push(segment);
      }
    }
  }
  flush();
  return out;
}
