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
    },
  ],
  parseInline: [
    {
      name: "Math",
      before: "Escape",
      parse(cx, next, pos) {
        if (next !== 36 || /\s|\$/.test(cx.slice(pos + 1, pos + 2))) {
          return -1;
        }
        for (let end = pos + 2; end < cx.end; end++) {
          if (cx.char(end) === 10) {
            return -1;
          }
          if (
            cx.char(end) === 36 &&
            cx.char(end - 1) !== 92 &&
            !/\s/.test(cx.slice(end - 1, end))
          ) {
            return cx.addElement(
              cx.elt("InlineMath", pos, end + 1, [
                cx.elt("MathMark", pos, pos + 1),
                cx.elt("MathMark", end, end + 1),
              ]),
            );
          }
        }
        return -1;
      },
    },
  ],
};
