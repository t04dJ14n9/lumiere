import type { SourceSpan } from "../../webview/ui/markdown-widget";

/** The `$` or `$$` around a formula, and whether it is closed. */
export function delimiters(source: string): { width: number; closed: boolean } {
  const width = source.startsWith("$$") ? 2 : 1;
  const closed =
    source.length >= 2 * width && source.endsWith("$".repeat(width));
  return { width, closed };
}

/**
 * The formula inside a math source, without its delimiters and the line
 * breaks next to them: what Obsidian selects when a formula is clicked.
 */
export function mathBody(source: string): SourceSpan {
  const { width, closed } = delimiters(source);
  let from = width;
  let to = closed ? source.length - width : source.length;
  if (source[from] === "\n") {
    from++;
  }
  if (to > from && source[to - 1] === "\n") {
    to--;
  }
  return { from, to: Math.max(from, to) };
}

/** A highlighted part of a formula, as Obsidian colours TeX. */
export interface MathToken {
  from: number;
  to: number;
  type: "command" | "number" | "variable" | "bracket";
}

/** Commands and `^` `_`, numbers, letters, and brackets, in that order of precedence. */
const TOKEN =
  /(\\(?:[a-zA-Z]+|.)|[\^_])|(\d+(?:\.\d+)?)|([a-zA-Z]+)|([{}[\]()])/gu;
const TYPES = ["command", "number", "variable", "bracket"] as const;

/** The highlighted parts of `text`, with offsets into it. */
export function mathTokens(text: string): MathToken[] {
  const tokens: MathToken[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const group = match.slice(1).findIndex((part) => part !== undefined);
    tokens.push({
      from: match.index,
      to: match.index + match[0].length,
      type: TYPES[group]!,
    });
  }
  return tokens;
}
