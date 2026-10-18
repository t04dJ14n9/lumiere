import type { MarkdownConfig } from "@lezer/markdown";
export const math: MarkdownConfig = {
  defineNodes: ["MathBlock", "InlineMath", "MathMark"],
  parseBlock: [
    {
      name: "MathBlock",
      before: "FencedCode",
      parse(cx, line) {
        if (!line.text.slice(line.pos).startsWith("$$")) {
          return false;
        }
        const from = cx.lineStart + line.pos;
        const sameLine = line.text.indexOf("$$", line.pos + 2);
        if (sameLine >= 0) {
          const to = cx.lineStart + sameLine + 2;
          cx.nextLine();
          cx.addElement(cx.elt("MathBlock", from, to));
          return true;
        }
        while (cx.nextLine()) {
          const end = line.text.indexOf("$$");
          if (end >= 0) {
            const to = cx.lineStart + end + 2;
            cx.nextLine();
            cx.addElement(cx.elt("MathBlock", from, to));
            return true;
          }
        }
        cx.addElement(cx.elt("MathBlock", from, cx.prevLineEnd()));
        return true;
      },
      // As in Obsidian, a `$$` line starts display math even right after a
      // paragraph line, without a blank line between.
      endLeaf: (_cx, line) => line.text.slice(line.pos).startsWith("$$"),
    },
  ],
  parseInline: [
    {
      name: "Math",
      before: "Escape",
      parse(cx, next, pos) {
        if (next !== 36) {
          return -1;
        }
        const width = cx.char(pos + 1) === 36 ? 2 : 1;
        if (width === 1 && /\s/.test(cx.slice(pos + 1, pos + 2))) {
          return -1;
        }
        for (let end = pos + width + 1; end < cx.end; end++) {
          if (cx.char(end) === 10) {
            return -1;
          }
          if (
            cx.char(end) === 36 &&
            cx.char(end - 1) !== 92 &&
            (width === 1 || cx.char(end + 1) === 36) &&
            (width === 2 || !/\s/.test(cx.slice(end - 1, end)))
          ) {
            return cx.addElement(
              cx.elt("InlineMath", pos, end + width, [
                cx.elt("MathMark", pos, pos + width),
                cx.elt("MathMark", end, end + width),
              ]),
            );
          }
        }
        return -1;
      },
    },
  ],
};
