import type { MarkdownConfig } from "@lezer/markdown";
export const footnotes: MarkdownConfig = {
  defineNodes: ["FootnoteRef", "InlineFootnote"],
  parseInline: [
    {
      name: "InlineFootnote",
      before: "Link",
      parse(cx, next, pos) {
        if (next !== 94 || cx.char(pos + 1) !== 91) {
          return -1;
        }
        let depth = 1;
        for (let end = pos + 2; end < cx.end; end++) {
          const char = cx.char(end);
          if (char === 92) {
            end++;
            continue;
          }
          if (char === 96) {
            const tail = cx.slice(end, cx.end);
            const run = /^`+/.exec(tail)![0];
            const code = new RegExp("(?<!`)" + run + "(?!`)", "g");
            code.lastIndex = run.length;
            const close = code.exec(tail);
            if (close) {
              end += close.index + run.length - 1;
              continue;
            }
          }
          if (char === 91) {
            depth++;
          }
          if (char === 93 && --depth === 0) {
            return cx.addElement(cx.elt("InlineFootnote", pos, end + 1));
          }
        }
        return -1;
      },
    },
    {
      name: "FootnoteRef",
      before: "Link",
      parse(cx, next, pos) {
        if (next !== 91 || cx.char(pos + 1) !== 94) {
          return -1;
        }
        const match = /^\[\^([^\]\s]+)\]/.exec(cx.slice(pos, cx.end));
        return match
          ? cx.addElement(cx.elt("FootnoteRef", pos, pos + match[0].length))
          : -1;
      },
    },
  ],
};
