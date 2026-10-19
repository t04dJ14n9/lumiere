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

/** Whether the line is only blockquote markers, as an empty quoted line is. */
export function isEmptyQuote(text: string): boolean {
  const { quotes, marker } = lineMarkup(text);
  return marker === "" && quotes.includes(">") && quotes.length === text.length;
}

/** The quotes of a line one blockquote level out: `"> > "` becomes `"> "`. */
export function outerQuotes(quotes: string): string {
  return quotes.slice(0, Math.max(0, quotes.lastIndexOf(">")));
}
