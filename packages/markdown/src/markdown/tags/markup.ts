/**
 * The inline markup a tag may start right after. Obsidian starts a tag where
 * its inline text starts a word: at the start, after whitespace, or right
 * after a markup token such as `**` or a code span (measured in Obsidian
 * 1.14.4; see the tag table in test/unit/ported/tags.test.ts). These checks
 * read the text around the `#`, not a syntax tree, so the Live Preview parser
 * and the HTML renderer start the same tags.
 */

const asciiPunctuation = /[!-/:-@[-`{-~]/;
const htmlTag =
  /<(?:[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?|\/[A-Za-z][A-Za-z0-9-]*\s*|[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*|[^\s<>@]+@[^\s<>@]+)>$/;
const letterOrDigit = /[\p{L}\p{N}]/u;

/** Whether `text[at]` is ASCII punctuation escaped by a backslash. */
function isEscaped(text: string, at: number): boolean {
  if (!asciiPunctuation.test(text[at] ?? "")) {
    return false;
  }
  let backslashes = 0;
  while (text[at - 1 - backslashes] === "\\") {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

/**
 * Whether the `#` at `at` follows markup after which Obsidian starts a tag:
 * an escape (`\*#a`); the end of a code span, math, a `%%` comment, an HTML
 * tag or autolink, a non-empty `[…]` or a link; an emphasis, highlight or
 * strikethrough delimiter that pairs (`**#a**`); or a `[` that closes later
 * (`[#a]`). Other punctuation before `#` never starts a tag: `(#a)`, `!!#a`,
 * `，#a`, `&amp;#a`.
 */
export function followsMarkup(text: string, at: number): boolean {
  if (isEscaped(text, at - 1)) {
    return true;
  }
  switch (text[at - 1]) {
    case "`":
      return closesCodeSpan(text, at);
    case "$":
      return closesMath(text, at);
    case "%":
      return closesComment(text, at);
    case ">":
      return closesHtml(text, at);
    case "]":
      return closesBracket(text, at);
    case ")":
      return closesLink(text, at);
    case "[":
      return opensBracket(text, at);
    case "*":
    case "_":
    case "=":
    case "~":
      return closesEmphasis(text, at) || emphasisCloser(text, at) !== undefined;
    default:
      return false;
  }
}

/** A code span closes on the next backtick run of its opening length. */
function closesCodeSpan(text: string, at: number): boolean {
  let open = 0;
  let closes = false;
  for (const run of text.slice(0, at).matchAll(/`+/g)) {
    closes = open === run[0].length;
    if (closes) {
      open = 0;
    } else if (!open && !isEscaped(text, run.index)) {
      open = run[0].length;
    }
  }
  return closes;
}

/**
 * Inline math opens on a `$` (or `$$`) not followed by whitespace and closes
 * on one not preceded by it: `$5 and $#a` has no tag (measured).
 */
function closesMath(text: string, at: number): boolean {
  let open = 0;
  let closes = false;
  for (const run of text.slice(0, at).matchAll(/\$+/g)) {
    const end = run.index + run[0].length;
    closes = open === run[0].length && /\S/.test(text[run.index - 1] ?? "");
    if (closes) {
      open = 0;
    } else if (
      !open &&
      !isEscaped(text, run.index) &&
      /\S/.test(text[end] ?? "")
    ) {
      open = run[0].length;
    }
  }
  return closes;
}

function closesComment(text: string, at: number): boolean {
  const delimiters = text.slice(0, at).match(/%%/g)?.length ?? 0;
  return text[at - 2] === "%" && delimiters % 2 === 0;
}

function closesHtml(text: string, at: number): boolean {
  if (text.slice(at - 3, at) === "-->") {
    const open = text.lastIndexOf("<!--", at - 4);
    return open !== -1 && open + 4 <= at - 3;
  }
  const open = text.lastIndexOf("<", at - 1);
  return open !== -1 && htmlTag.test(text.slice(open, at));
}

/** `[x]#a` and `[[n]]#a` start a tag; `[]#a` and `a]#a` do not. */
function closesBracket(text: string, at: number): boolean {
  const open = bracketOpening(text, at - 1);
  return open !== undefined && open < at - 2;
}

/** After a link's destination: `[l](u)#a`, not `(u)#a`. */
function closesLink(text: string, at: number): boolean {
  let depth = 0;
  for (let index = at - 2; index >= 0; index--) {
    if (text[index] === ")") {
      depth++;
    } else if (text[index] === "(" && depth) {
      depth--;
    } else if (text[index] === "(") {
      return (
        text[index - 1] === "]" && bracketOpening(text, index - 1) !== undefined
      );
    }
  }
  return false;
}

/**
 * `[#a]` starts a tag when the bracket closes; `[#a`, an image's `![#a]` and
 * a wikilink's `[[#a]]` do not.
 */
function opensBracket(text: string, at: number): boolean {
  const close = bracketClosing(text, at - 1);
  if (close === undefined || text[at - 2] === "!") {
    return false;
  }
  return !(text[at - 2] === "[" && text[close + 1] === "]");
}

function bracketOpening(text: string, close: number): number | undefined {
  let depth = 0;
  for (let index = close - 1; index >= 0; index--) {
    if (isEscaped(text, index)) {
      continue;
    }
    if (text[index] === "]") {
      depth++;
    } else if (text[index] === "[" && !depth) {
      return index;
    } else if (text[index] === "[") {
      depth--;
    }
  }
  return undefined;
}

function bracketClosing(text: string, open: number): number | undefined {
  let depth = 0;
  for (let index = open + 1; index < text.length; index++) {
    if (isEscaped(text, index)) {
      continue;
    }
    if (text[index] === "[") {
      depth++;
    } else if (text[index] === "]" && !depth) {
      return index;
    } else if (text[index] === "]") {
      depth--;
    }
  }
  return undefined;
}

interface Run {
  from: number;
  to: number;
}

/**
 * Whether the delimiter run before `at` closes an earlier one, as in
 * `*x*#a`.
 */
export function closesEmphasis(text: string, at: number): boolean {
  const char = text[at - 1]!;
  const before = runEndingAt(text, at);
  let open: number | undefined;
  for (const run of runs(text, char, 0, before.from)) {
    if (open !== undefined && closes(text, run, open)) {
      open = undefined;
    } else if (open === undefined && opens(text, run)) {
      open = run.to - run.from;
    }
  }
  return open !== undefined && closes(text, before, open);
}

/**
 * Where the emphasis, highlight or strikethrough opened by the delimiter run
 * before `at` closes, if it does: `*#a*`, `==#a==`, across lines too.
 */
export function emphasisCloser(text: string, at: number): number | undefined {
  const before = runEndingAt(text, at);
  if (!opens(text, before)) {
    return undefined;
  }
  for (const run of runs(text, text[at - 1]!, at, text.length)) {
    if (closes(text, run, before.to - before.from)) {
      return run.from;
    }
  }
  return undefined;
}

/** `*` and `_` runs of up to three open; `==` and `~~` only as a pair. */
function opens(text: string, run: Run): boolean {
  const char = text[run.from]!;
  const length = run.to - run.from;
  if (isEscaped(text, run.from)) {
    return false;
  }
  return char === "*" || char === "_" ? length <= 3 : length === 2;
}

/**
 * Measured pairings: `**` closes on one to three, `*` and `***` only on
 * their own length (`**#a*` pairs, `*#a**` and `***#a*` do not); `==` and
 * `~~` on two or more. A single `_` does not close inside a word (`_#a_b`).
 */
function closes(text: string, run: Run, opening: number): boolean {
  const char = text[run.from]!;
  const length = run.to - run.from;
  if (char === "=" || char === "~") {
    return length >= 2;
  }
  if (char === "_" && length === 1 && letterOrDigit.test(text[run.to] ?? "")) {
    return false;
  }
  return opening === 2 ? length <= 3 : length === opening;
}

function runEndingAt(text: string, at: number): Run {
  let from = at - 1;
  while (from > 0 && text[from - 1] === text[at - 1]) {
    from--;
  }
  return { from, to: at };
}

function* runs(
  text: string,
  char: string,
  from: number,
  to: number,
): Generator<Run> {
  let index = text.indexOf(char, from);
  while (index !== -1 && index < to) {
    let end = index;
    while (end < to && text[end] === char) {
      end++;
    }
    yield { from: index, to: end };
    index = text.indexOf(char, end);
  }
}
