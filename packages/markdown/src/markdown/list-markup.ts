/**
 * The markup at the start of a Markdown line, for the editor's list keys:
 * indentation and blockquote markers, a list marker, a task box.
 */
export interface LineMarkup {
  /** Leading whitespace and blockquote markers, as in `"\t"` or `"> > "`. */
  quotes: string;
  /** The list marker and the space after it (`"- "`, `"1. "`), or `""`. */
  marker: string;
  /** The task box and the space after it (`"[ ] "`), or `""`. */
  task: string;
}

const MARKUP =
  /^((?:[ \t]*>[ \t]?)*[ \t]*)((?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$)((?:\[[^\]\n]\])(?:[ \t]+|$))?)?/u;

export function lineMarkup(text: string): LineMarkup {
  const [, quotes = "", list = "", task = ""] = MARKUP.exec(text) ?? [];
  return { quotes, marker: list.slice(0, list.length - task.length), task };
}

/** Where the line's own text starts, after its markup. */
export function textStart(text: string): number {
  const { quotes, marker, task } = lineMarkup(text);
  return quotes.length + marker.length + task.length;
}

/**
 * What a line continuing this one's block starts with, as Obsidian writes
 * it: the same indentation and quotes, with list markup turned into spaces
 * so the text lines up.
 */
export function continuationPrefix(text: string): string {
  const { quotes, marker, task } = lineMarkup(text);
  return quotes + " ".repeat(marker.length + task.length);
}

/**
 * Optional quotes, then a CommonMark thematic break (≤3 spaces, 3+ of the
 * same `*`/`-`/`_` with optional spaces). Used so Shift+Enter does not treat
 * `- - -` / `* * *` as list items (BH-093).
 */
const thematicBreakLine =
  /^((?:[ \t]*>[ \t]?)*)( {0,3}([-*_])(?:[ \t]*\3){2,}[ \t]*)$/u;

/**
 * Soft-break prefix for Shift+Enter: same as `continuationPrefix`, except a
 * thematic-break line keeps only its quote markers (BH-093). Spaced HRs like
 * `- - -` otherwise look like a list marker and pick up a 2-space indent.
 */
export function isThematicBreakLine(text: string): boolean {
  return thematicBreakLine.test(text);
}

export function softBreakPrefix(text: string): string {
  const match = thematicBreakLine.exec(text);
  if (match) {
    return match[1] ?? "";
  }
  return continuationPrefix(text);
}

/** Whether the line is only blockquote markers, as an empty quoted line is. */
export function isEmptyQuote(text: string): boolean {
  const { quotes, marker } = lineMarkup(text);
  return marker === "" && quotes.includes(">") && quotes.length === text.length;
}

/** The quotes of a line one blockquote level out: `"> > "` becomes `"> "`. */
export function outerQuotes(quotes: string): string {
  return quotes.slice(0, Math.max(0, quotes.lastIndexOf(">")));
}
