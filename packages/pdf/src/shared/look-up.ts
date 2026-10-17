/**
 * macOS Look Up for the PDF viewer: which word is under the pointer, and how
 * it is handed to the system Dictionary. Pure helpers; the wiring is in
 * webview/look-up.ts (events) and extension/plugins/pdfLookUp (the lookup).
 */

/** Longest word sent to the dictionary; anything longer is not a word. */
export const MAX_LOOK_UP_LENGTH = 100;

/** A glyph of a page, as the word finder sees it. */
export interface WordGlyph {
  isSpace: boolean;
  /** Left, top, right, bottom in points; missing for glyphs with no box. */
  box?: [number, number, number, number];
}

/** A gap wider than this many glyph heights ends a word (a column gap, a tab). */
const MAX_GAP_IN_HEIGHTS = 0.6;

/**
 * The glyphs of the word that contains glyph `index`: its neighbours up to the
 * nearest space, line change or wide gap. Returns [start, end) glyph indexes,
 * or undefined when `index` is a space or has no box.
 */
export function wordGlyphRange(
  glyphs: readonly (WordGlyph | undefined)[],
  index: number,
): [number, number] | undefined {
  const here = glyphs[index];
  if (!here || here.isSpace || !here.box) {
    return undefined;
  }
  const joins = (from: WordGlyph, to: WordGlyph | undefined): boolean => {
    if (!to || to.isSpace || !to.box || !from.box) {
      return false;
    }
    const height = Math.max(
      from.box[3] - from.box[1],
      to.box[3] - to.box[1],
      1,
    );
    const sameLine =
      Math.min(from.box[3], to.box[3]) - Math.max(from.box[1], to.box[1]) >
      height * 0.4;
    const gap = Math.max(from.box[0] - to.box[2], to.box[0] - from.box[2]);
    return sameLine && gap <= height * MAX_GAP_IN_HEIGHTS;
  };
  let start = index;
  while (joins(glyphs[start]!, glyphs[start - 1])) {
    start--;
  }
  let end = index + 1;
  while (joins(glyphs[end - 1]!, glyphs[end])) {
    end++;
  }
  return [start, end];
}

/**
 * The word inside what was read from the PDF: surrounding punctuation is
 * dropped, apostrophes and hyphens inside it stay ("don’t", "state-of-the-art").
 * Empty when there are no letters or digits.
 */
export function coreWord(text: string): string {
  const word = text
    .normalize("NFC")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  return /[\p{L}\p{N}]/u.test(word) && word.length <= MAX_LOOK_UP_LENGTH
    ? word
    : "";
}

/** Whether a message from the viewer carries a word the host may look up. */
export function isLookUpWord(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_LOOK_UP_LENGTH &&
    // One word: no control characters or line breaks.
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

/** The Dictionary app's URL for a word: it opens the app at the entry. */
export function lookUpUrl(word: string): string {
  return `dict://${encodeURIComponent(word)}`;
}

/** Whether Look Up applies: macOS only, and the setting on. */
export function lookUpEnabled(platform: string, setting: boolean): boolean {
  return platform === "darwin" && setting;
}
