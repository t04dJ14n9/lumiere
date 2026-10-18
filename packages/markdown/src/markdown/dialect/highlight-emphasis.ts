import { InlineContext, type MarkdownConfig } from "@lezer/markdown";
import { highlightColourAt } from "./highlight";

/**
 * Highlight delimiters and their colour are transparent to surrounding
 * emphasis. Otherwise `sent**==🔴ence==**note` loses its bold nodes: `=`
 * counts as punctuation beside a letter, although the highlighted text does not.
 * Both the syntax tree and HTML renderer use these same flanking rules.
 */
export function highlightEmphasisFlags(text: string, from: number, to: number) {
  const opensHighlight = text.slice(to, to + 2) === "==";
  const closesHighlight = text.slice(from - 2, from) === "==";
  if (!opensHighlight && !closesHighlight) {
    return undefined;
  }
  const content = to + 2 + (highlightColourAt(text, to + 2) ? 2 : 0);
  const before = text.slice(
    from - (closesHighlight ? 3 : 1),
    from - (closesHighlight ? 2 : 0),
  );
  const after = text.slice(
    opensHighlight ? content : to,
    opensHighlight ? content + 1 : to + 1,
  );
  const spaceBefore = /^\s?$/u.test(before);
  const spaceAfter = /^\s?$/u.test(after);
  const punctuationBefore = /[\p{P}\p{S}]/u.test(before);
  const punctuationAfter = /[\p{P}\p{S}]/u.test(after);
  return {
    open:
      !spaceAfter && (!punctuationAfter || spaceBefore || punctuationBefore),
    close:
      !spaceBefore && (!punctuationBefore || spaceAfter || punctuationAfter),
  };
}

export const highlightEmphasis: MarkdownConfig = {
  parseInline: [
    {
      name: "HighlightEmphasis",
      before: "Emphasis",
      parse(cx, next, from) {
        if (next !== 42) {
          return -1;
        }
        let to = from + 1;
        while (cx.char(to) === next) {
          to++;
        }
        const flags = highlightEmphasisFlags(
          cx.text,
          from - cx.offset,
          to - cx.offset,
        );
        return flags
          ? cx.addDelimiter(
              InlineContext.emphasisAsterisk,
              from,
              to,
              flags.open,
              flags.close,
            )
          : -1;
      },
    },
  ],
};
