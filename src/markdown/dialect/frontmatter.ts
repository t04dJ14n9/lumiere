import type { MarkdownConfig } from "@lezer/markdown";
export const frontmatter: MarkdownConfig = {
  defineNodes: ["Frontmatter"],
  parseBlock: [
    {
      name: "Frontmatter",
      before: "HorizontalRule",
      parse(cx, line) {
        if (cx.lineStart !== 0 || line.text !== "---") {
          return false;
        }
        const from = cx.lineStart;
        while (cx.nextLine()) {
          if (/^(---|\.\.\.)\s*$/.test(line.text)) {
            const to = cx.lineStart + line.text.length;
            cx.nextLine();
            cx.addElement(cx.elt("Frontmatter", from, to));
            return true;
          }
        }
        cx.addElement(cx.elt("Frontmatter", from, cx.prevLineEnd()));
        return true;
      },
    },
  ],
};
