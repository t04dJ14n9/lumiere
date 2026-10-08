import type { MarkdownConfig } from "@lezer/markdown";
export const comments: MarkdownConfig = {
  defineNodes: ["ObsidianComment"],
  parseInline: [
    {
      name: "ObsidianComment",
      before: "Escape",
      parse(cx, next, pos) {
        if (next !== 37 || cx.char(pos + 1) !== 37) {
          return -1;
        }
        const end = cx.text.indexOf("%%", pos + 2 - cx.offset);
        return end < 0 ? -1 : cx.addElement(cx.elt("ObsidianComment", pos, end + cx.offset + 2));
      },
    },
  ],
};
