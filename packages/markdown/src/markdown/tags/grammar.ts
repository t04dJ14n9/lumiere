import { closesEmphasis, emphasisCloser, followsMarkup } from "./markup";

/**
 * What ends a tag, measured over every BMP code point in Obsidian 1.14.4:
 * whitespace, ASCII punctuation other than `-`, `/` and `_`, General
 * Punctuation (U+2000–206F: dashes, curly quotes, `…`, zero-width
 * characters) and Supplemental Punctuation (U+2E00–2E7F). CJK and full-width
 * punctuation (`。，（）！`), `·`, symbols and emoji are tag characters. Every
 * excluded character is in the BMP, so testing one UTF-16 unit is enough.
 */
const notTagCharacter =
  /[\s!"#$%&'()*+,.:;<=>?@[\\\]^`{|}~\u2000-\u206F\u2E00-\u2E7F]/;

/**
 * The tag that the `#` at `at` starts, without its `#`. A tag starts at the
 * start of the text, after whitespace, right after another tag (`#a#b`) or
 * after inline markup (`**#a**`, `[#a]`, see `followsMarkup`); `(#a)`,
 * `中#a` and `!!#a` are not tags. It runs to the first character that is not
 * a tag character, and is not a tag when that is only ASCII digits (`#1984`;
 * `#1984/`, `#١٢` and `#12a` are tags).
 */
export function readTag(text: string, at: number): string | undefined {
  if (text[at] !== "#" || !startsTag(text, at)) {
    return undefined;
  }
  let end = at + 1;
  while (end < text.length && isTagCharacter(text[end]!)) {
    end++;
  }
  const value = text.slice(at + 1, underscoreEnd(text, at, end));
  return isTagValue(value) ? value : undefined;
}

export function validTag(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 1024 &&
    readTag("#" + value, 0) === value
  );
}

export function tagMatches(value: string, requested: string): boolean {
  value = value.toLowerCase();
  requested = requested.toLowerCase();
  return value === requested || value.startsWith(requested + "/");
}

/** Whether one UTF-16 unit may be part of a tag (see `notTagCharacter`). */
export function isTagCharacter(unit: string): boolean {
  return !notTagCharacter.test(unit);
}

function isTagValue(value: string): boolean {
  return value !== "" && !/^[0-9]+$/.test(value);
}

function startsTag(text: string, at: number): boolean {
  return startsWord(text, at) || followsTag(text, at);
}

function startsWord(text: string, at: number): boolean {
  return followsSpaceOrStart(text, at) || followsMarkup(text, at);
}

/**
 * Whether `at` is the start of the text or follows whitespace: JavaScript's
 * `\s`, as measured (U+200B and U+0085 are not).
 */
export function followsSpaceOrStart(text: string, at: number): boolean {
  return at === 0 || /\s/.test(text[at - 1]!);
}

/**
 * Right after a tag that ends at this `#`: `#a#b` is two tags. A chain
 * breaks at anything that is not a tag, so `#12#b` and `##b` have none.
 */
function followsTag(text: string, at: number): boolean {
  let end = at;
  for (;;) {
    let start = end;
    while (start > 0 && isTagCharacter(text[start - 1]!)) {
      start--;
    }
    const hash = start - 1;
    if (
      start === end ||
      text[hash] !== "#" ||
      !isTagValue(text.slice(start, end))
    ) {
      return false;
    }
    if (startsWord(text, hash)) {
      return true;
    }
    end = hash;
  }
}

/**
 * `_` is a tag character, but in `_#a_` the closing underscore ends the
 * emphasis and so the tag: Obsidian reads `a` there and `a_b` in `_#a_b_`.
 */
function underscoreEnd(text: string, at: number, end: number): number {
  if (text[at - 1] !== "_" || closesEmphasis(text, at)) {
    return end;
  }
  const closer = emphasisCloser(text, at);
  return closer !== undefined && closer < end ? closer : end;
}
