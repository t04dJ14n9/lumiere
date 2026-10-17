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
