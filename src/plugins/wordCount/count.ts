/** Han, kana and Hangul characters each count as a word, as in Obsidian. */
const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
/** Other words: runs of letters and digits, with inner apostrophes, hyphens and dots (`3.14`). */
const WORD = /[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}_'’.-]*[\p{L}\p{N}\p{M}])?/gu;
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\r?(?:\n|$)/;

export interface Counts {
  words: number;
  characters: number;
}

/**
 * Words and characters in a note's body, not counting its properties.
 * Markdown punctuation (`#`, `**`, `-`) is not a word; characters exclude
 * line breaks.
 */
export function countText(text: string, isWholeNote = true): Counts {
  const body = isWholeNote ? text.replace(FRONTMATTER, "") : text;
  const cjk = body.match(CJK)?.length ?? 0;
  const words = body.replace(CJK, " ").match(WORD)?.length ?? 0;
  const characters = [...body.replace(/\r?\n/g, "")].length;
  return { words: cjk + words, characters };
}

export function formatCounts({ words, characters }: Counts): string {
  const plural = (count: number, unit: string) =>
    `${count.toLocaleString("en-US")} ${unit}${count === 1 ? "" : "s"}`;
  return `${plural(words, "word")} ${plural(characters, "character")}`;
}
