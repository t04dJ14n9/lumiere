/**
 * Characters that are a word each, as Obsidian counts them (measured): the
 * main block of Han ideographs, kana with the long-vowel mark `ー`, and
 * Tibetan letters.
 */
const ONE_EACH =
  "\\u3041-\\u3096\\u309D-\\u309F\\u30A1-\\u30FA\\u30FC-\\u30FF\\u4E00-\\u9FFF" +
  "\\u0F00\\u0F40-\\u0F6C\\u0F88-\\u0F8C";

/**
 * A word, as Obsidian counts them (measured): a run of letters, digits,
 * hyphens and apostrophes, where `,` and `.` join digits (`1,000.50`) but
 * nothing else (`e.g.` is two). Korean and other scripts run whole words;
 * Tamil keeps its vowel signs, while other combining marks end a word.
 * Each character of `ONE_EACH` is a word of its own.
 */
const WORD = new RegExp(
  `(?:\\d+(?:[.,]\\d+)*|[-'’]|(?![${ONE_EACH}])[\\p{L}\\p{Script=Tamil}])+|[${ONE_EACH}]`,
  "gu",
);
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\r?(?:\n|$)/;

export interface Counts {
  words: number;
  characters: number;
}

/**
 * Words and characters in a note's body, not counting its properties, or in
 * a selection. Characters are the text's length, each line break one
 * character (`\r\n` too, as Obsidian's editor reads it).
 */
export function countText(text: string, isWholeNote = true): Counts {
  const body = isWholeNote ? text.replace(FRONTMATTER, "") : text;
  return {
    words: body.match(WORD)?.length ?? 0,
    characters: body.replace(/\r\n/g, "\n").length,
  };
}

export function formatCounts({ words, characters }: Counts): string {
  const plural = (count: number, unit: string) =>
    `${count.toLocaleString("en-US")} ${unit}${count === 1 ? "" : "s"}`;
  return `${plural(words, "word")} ${plural(characters, "character")}`;
}
