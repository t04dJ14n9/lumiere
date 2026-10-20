import type { MarkdownConfig } from "@lezer/markdown";

/**
 * Footnote markers and definitions.
 *
 * Definitions must be claimed before CommonMark LinkReference: a body that
 * looks like a destination (`[title](url)`, `[[wiki]]`, bare URL, `<url>`)
 * would otherwise become a LinkReference whose URL child is raw text, so Live
 * Preview would never see FootnoteRef / Link / WikiLink on that line.
 *
 * Only true top-level defs (0–3 columns of indent, no list/blockquote base)
 * are claimed. `line.pos` already skips whitespace, so matching
 * `slice(line.pos)` with a leading-space regex would steal IndentedCode and
 * nested list lines that happen to start with `[^label]:`.
 */
export const footnotes: MarkdownConfig = {
  defineNodes: ["FootnoteRef", "InlineFootnote"],
  parseBlock: [
    {
      name: "FootnoteDefinition",
      before: "LinkReference",
      parse(cx, line) {
        // Same scope as footnoteDefinitions metadata: physical line starts
        // with 0–3 spaces then [^label]:, never inside a composite.
        if (line.basePos !== 0 || line.indent > 3) {
          return false;
        }
        if (!/^\[\^([^\]\s]+)\]:/.test(line.text.slice(line.pos))) {
          return false;
        }
        const from = cx.lineStart + line.pos;
        // `content` must stay a contiguous document slice from `from` so
        // parseInline offsets match source (continuation lines keep indent).
        let content = line.text.slice(line.pos);
        let to = cx.lineStart + line.text.length;
        for (;;) {
          const nextText = cx.peekLine();
          if (/^(?: {2,4}| {0,3}\t)/.test(nextText)) {
            cx.nextLine();
            content += "\n" + line.text.slice(line.basePos);
            to = cx.lineStart + line.text.length;
            continue;
          }
          break;
        }
        cx.nextLine();
        cx.addElement(
          cx.elt("Paragraph", from, to, cx.parser.parseInline(content, from)),
        );
        return true;
      },
    },
  ],
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
            // Parse the body so tags/links inside ^[…] are indexed like Obsidian.
            const innerFrom = pos + 2;
            return cx.addElement(
              cx.elt(
                "InlineFootnote",
                pos,
                end + 1,
                cx.parser.parseInline(cx.slice(innerFrom, end), innerFrom),
              ),
            );
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
