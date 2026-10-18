import type { MarkdownConfig } from "@lezer/markdown";
const highlightDelimiter = { resolve: "Highlight", mark: "HighlightMark" };
export const highlight: MarkdownConfig = {
  defineNodes: ["Highlight", "HighlightMark"],
  parseInline: [
    {
      name: "Highlight",
      before: "Escape",
      parse(cx, next, pos) {
        if (next !== 61 || cx.char(pos + 1) !== 61) {
          return -1;
        }
        return cx.addDelimiter(
          highlightDelimiter,
          pos,
          pos + 2,
          !/\s/.test(cx.slice(pos + 2, pos + 3)),
          pos > cx.offset && !/\s/.test(cx.slice(pos - 1, pos)),
        );
      },
    },
  ],
};

/**
 * Obsidian 1.14's highlight colours: one of these emoji right after the
 * opening `==` colours the highlight (`==🔵text==`); any other text does not.
 */
export const HIGHLIGHT_COLOURS = {
  red: "\u{1F534}",
  orange: "\u{1F7E0}",
  yellow: "\u{1F7E1}",
  green: "\u{1F7E2}",
  blue: "\u{1F535}",
  purple: "\u{1F7E3}",
} as const;

export type HighlightColour = keyof typeof HIGHLIGHT_COLOURS;

const byEmoji = new Map<string, HighlightColour>(
  Object.entries(HIGHLIGHT_COLOURS).map(([colour, emoji]) => [
    emoji,
    colour as HighlightColour,
  ]),
);

/** The colour whose emoji starts `text` at `at`, if one does. */
export function highlightColourAt(
  text: string,
  at = 0,
): HighlightColour | undefined {
  return byEmoji.get(text.slice(at, at + 2));
}
