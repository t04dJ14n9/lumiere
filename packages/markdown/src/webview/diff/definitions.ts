/**
 * Link reference and footnote definitions, found the way CommonMark finds
 * them, by hand-written linear scans (no backtracking regexes on note text).
 *
 * A reference definition is `[label]:`, optional whitespace with at most one
 * line ending, a destination (`<…>` on one line, or a run of non-space
 * characters with balanced parentheses), then optionally whitespace and a
 * title in `"…"`, `'…'` or `(…)` that may span lines but no blank line, and
 * nothing but spaces after it on its last line. A title that fails leaves the
 * definition ending at its destination when that line has nothing after it;
 * otherwise there is no definition. Definitions start a paragraph (they
 * cannot interrupt one) and may follow one another. Inside lists and block
 * quotes they count for the whole document.
 */
import type { Block } from "../../shared/diff";

export interface Definition {
  readonly kind: "reference" | "footnote";
  readonly label: string;
  /** The definition's source, container prefixes removed. */
  readonly text: string;
}

const MAX_LABEL = 999;
const isSpace = (ch: string | undefined) => ch === " " || ch === "\t";

function skipSpaces(p: string, at: number): number {
  while (isSpace(p[at])) {
    at++;
  }
  return at;
}

/** Up to three spaces, then `[label]:`; the label and the index past ":". */
function label(p: string, at: number): { label: string; end: number } | null {
  let i = 0;
  while (i < 3 && p[at] === " ") {
    at++;
    i++;
  }
  if (p[at] !== "[") {
    return null;
  }
  let j = at + 1;
  while (j < p.length && j - at <= MAX_LABEL + 1) {
    const ch = p[j];
    if (ch === "\\") {
      j += 2;
    } else if (ch === "[") {
      return null;
    } else if (ch === "]") {
      const text = p.slice(at + 1, j);
      return p[j + 1] === ":" && text.trim() !== ""
        ? { label: text, end: j + 2 }
        : null;
    } else {
      j++;
    }
  }
  return null;
}

/** Angle destinations allow spaces and escaped closers, but no line ending. */
function angleDestination(p: string, at: number): number {
  for (let j = at + 1; j < p.length; j++) {
    const ch = p[j];
    if (ch === "\\") {
      j++;
    } else if (ch === ">") {
      return j + 1;
    } else if (ch === "<" || ch === "\n") {
      return -1;
    }
  }
  return -1;
}

/** The end of a destination starting at `at`, or -1. */
function destination(p: string, at: number): number {
  if (p[at] === "<") {
    return angleDestination(p, at);
  }
  let depth = 0;
  let j = at;
  for (; j < p.length; j++) {
    const ch = p[j]!;
    if (ch === "\\" && j + 1 < p.length) {
      j++;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      if (depth === 0) {
        break;
      }
      depth--;
    } else if (ch <= " ") {
      break;
    }
  }
  return j > at && depth === 0 ? j : -1;
}

/** The end of a title opening at `at` (past its closer), or -1. */
function title(p: string, at: number): number {
  const open = p[at];
  const close = open === "(" ? ")" : open;
  if (open !== '"' && open !== "'" && open !== "(") {
    return -1;
  }
  for (let j = at + 1; j < p.length; j++) {
    const ch = p[j];
    if (ch === "\\") {
      j++;
    } else if (ch === close) {
      return j + 1;
    } else if (open === "(" && ch === "(") {
      return -1;
    } else if (ch === "\n" && p[skipSpaces(p, j + 1)] === "\n") {
      return -1; // a blank line ends the paragraph
    }
  }
  return -1;
}

/** Whether only spaces follow `at` on its line; the line's end if so. */
function lineEnd(p: string, at: number): number {
  const j = skipSpaces(p, at);
  return j === p.length || p[j] === "\n" ? j : -1;
}

/** A reference definition at `at`, with the index of its last line's end. */
function reference(
  p: string,
  at: number,
): { label: string; end: number } | null {
  const head = label(p, at);
  if (!head || head.label.startsWith("^")) {
    return null;
  }
  let i = skipSpaces(p, head.end);
  if (p[i] === "\n") {
    i = skipSpaces(p, i + 1);
  }
  const dest = destination(p, i);
  if (dest < 0) {
    return null;
  }
  const bare = lineEnd(p, dest);
  let t = skipSpaces(p, dest);
  if (p[t] === "\n") {
    t = skipSpaces(p, t + 1);
  }
  if (t > dest) {
    const closed = title(p, t);
    const end = closed < 0 ? -1 : lineEnd(p, closed);
    if (end >= 0) {
      return { label: head.label, end };
    }
  }
  return bare >= 0 ? { label: head.label, end: bare } : null;
}

/** A footnote definition at `at`: to the next definition or the end. */
function footnote(
  p: string,
  at: number,
): { label: string; end: number } | null {
  const head = label(p, at);
  if (!head?.label.startsWith("^")) {
    return null;
  }
  let end = p.indexOf("\n", head.end);
  while (end >= 0 && !startsDefinition(p, end + 1)) {
    end = p.indexOf("\n", end + 1);
  }
  return { label: head.label.slice(1), end: end < 0 ? p.length : end };
}

/**
 * Whether a line starts like a definition (`[label]:`). Only the bounded
 * label is checked, so a footnote's end is found in linear time.
 */
function startsDefinition(p: string, at: number): boolean {
  return label(p, at) !== null;
}

/**
 * The definitions at the start of paragraph `p`, and where they stop
 * (`p.length` when they are the whole paragraph).
 */
export function paragraphDefinitions(p: string): {
  found: Definition[];
  end: number;
} {
  const found: Definition[] = [];
  let at = 0;
  while (at < p.length) {
    const ref = reference(p, at);
    const note = ref ? null : footnote(p, at);
    const hit = ref ?? note;
    if (!hit) {
      break;
    }
    found.push({
      kind: ref ? "reference" : "footnote",
      label: hit.label,
      text: p.slice(at, hit.end),
    });
    at = hit.end + 1;
  }
  return { found, end: Math.min(at, p.length) };
}

const LIST_MARKER = (line: string, at: number): number => {
  let j = at;
  if (line[j] === "-" || line[j] === "+" || line[j] === "*") {
    j++;
  } else {
    const start = j;
    while (j - start < 9 && line[j]! >= "0" && line[j]! <= "9") {
      j++;
    }
    if (j === start || (line[j] !== "." && line[j] !== ")")) {
      return -1;
    }
    j++;
  }
  return isSpace(line[j]) || j === line.length ? j : -1;
};

/**
 * A block's paragraphs with container prefixes (block quote markers, list
 * markers and their content indentation) removed. Indented or fenced code
 * is skipped: it holds no definitions.
 */
export function containerParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let indent = 0;
  let fence = "";
  const flush = () => {
    if (current.length) {
      paragraphs.push(current.join("\n"));
    }
    current = [];
  };
  for (const raw of text.split("\n")) {
    let at = 0;
    for (;;) {
      const j = skipSpaces(raw, at);
      if (raw[j] === ">" && j - at < 4) {
        at = raw[j + 1] === " " ? j + 2 : j + 1;
      } else {
        break;
      }
    }
    let lead = skipSpaces(raw, at) - at;
    const marker = LIST_MARKER(raw, at + lead);
    if (marker >= 0 && lead < indent + 4) {
      flush();
      const content = skipSpaces(raw, marker);
      indent = lead + (content - (at + lead));
      at = content;
      lead = 0;
    } else {
      at += lead;
      lead = Math.max(0, lead - indent);
    }
    const line = raw.slice(at);
    if (fence) {
      if (line.startsWith(fence)) {
        fence = "";
      }
      continue;
    }
    if (line.startsWith("```") || line.startsWith("~~~")) {
      flush();
      fence = line.slice(0, 3);
      continue;
    }
    if (line.trim() === "") {
      flush();
    } else if (lead >= 4 && current.length === 0) {
      continue; // indented code
    } else {
      current.push(line);
    }
  }
  flush();
  return paragraphs;
}

/** Every definition in a block, inside containers too, for side context. */
export function blockDefinitions(block: Block): Definition[] {
  if (block.kind !== "text") {
    return [];
  }
  return containerParagraphs(block.text).flatMap(
    (p) => paragraphDefinitions(p).found,
  );
}

/**
 * The definitions a top-level block consists of, or undefined when it holds
 * anything else (such a block renders normally).
 */
export function definitions(block: Block): Definition[] | undefined {
  if (block.kind !== "text") {
    return undefined;
  }
  const { found, end } = paragraphDefinitions(block.text);
  return found.length > 0 && end >= block.text.length ? found : undefined;
}

/** The footnote labels a text cites (`[^label]` not followed by ":"). */
export function citations(text: string): Set<string> {
  const out = new Set<string>();
  // The next "]" and line end, advanced only forwards: linear overall.
  let close = -1;
  let newline = -1;
  let open = 0;
  for (let at = text.indexOf("[^"); at >= 0; at = text.indexOf("[^", at + 2)) {
    if (close < at + 2) {
      close = text.indexOf("]", at + 2);
    }
    if (close < 0) {
      break;
    }
    if (newline >= 0 && newline < at + 2) {
      newline = -1;
    }
    if (newline < 0) {
      newline = text.indexOf("\n", at + 2);
      newline = newline < 0 ? text.length : newline;
    }
    if (open >= 0 && open < at + 2) {
      open = text.indexOf("[", at + 2);
    }
    // Valid only with no "[" or line end before the "]": slice only then.
    const clean = (open < 0 || open > close) && close < newline;
    if (clean && close > at + 2 && text[close + 1] !== ":") {
      out.add(text.slice(at + 2, close));
    }
  }
  return out;
}
