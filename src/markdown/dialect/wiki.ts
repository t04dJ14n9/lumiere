import type { MarkdownConfig } from "@lezer/markdown";
export const wiki: MarkdownConfig = {
  defineNodes: ["WikiLink", "WikiEmbed"],
  parseInline: [
    {
      name: "Wiki",
      before: "Link",
      parse(cx, next, pos) {
        const embed = next === 33 && cx.slice(pos, pos + 3) === "![[";
        if (!embed && (next !== 91 || cx.slice(pos, pos + 2) !== "[[")) {
          return -1;
        }
        const start = pos + (embed ? 3 : 2);
        const end = cx.text.indexOf("]]", start - cx.offset);
        if (end < 0 || cx.slice(start, cx.offset + end).includes("\n")) {
          return -1;
        }
        return cx.addElement(cx.elt(embed ? "WikiEmbed" : "WikiLink", pos, cx.offset + end + 2));
      },
    },
  ],
};
