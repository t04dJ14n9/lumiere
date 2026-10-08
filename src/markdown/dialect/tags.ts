import type { MarkdownConfig } from "@lezer/markdown";
import { readTag } from "../tags/grammar";
export const tags: MarkdownConfig = {
  defineNodes: ["Tag"],
  parseInline: [
    {
      name: "Tag",
      before: "Link",
      parse(cx, next, pos) {
        if (next !== 35) {
          return -1;
        }
        const tag = readTag(cx.text, pos - cx.offset);
        return tag ? cx.addElement(cx.elt("Tag", pos, pos + tag.length + 1)) : -1;
      },
    },
  ],
};
