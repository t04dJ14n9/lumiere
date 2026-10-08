import { markdownParser as inlineParser } from "../../markdown/dialect";

import { decodeMarkdownText } from "../../markdown/html";

/** Visible inline text and its original Markdown offsets, before DOM layout. */
export function inlineSourceMap(source: string): {
  text: string;
  positions: readonly number[];
} {
  const replacements: { from: number; to: number; text: string }[] = [];
  // A prefix keeps cell contents such as "# heading" in an inline paragraph.
  inlineParser.parse("x " + source).iterate({
    enter(node) {
      const from = node.from - 2;
      const to = node.to - 2;
      const raw = source.slice(from, to);
      const replace = (text: string): false => {
        replacements.push({ from, to, text });
        return false;
      };
      if (node.name === "InlineCode") {
        const marks = node.node.getChildren("CodeMark");
        let start = (marks[0]?.to ?? node.from) - 2;
        let end = (marks.at(-1)?.from ?? node.to) - 2;
        const content = source.slice(start, end);
        if (
          content.startsWith(" ") &&
          content.endsWith(" ") &&
          /\S/.test(content)
        ) {
          start++;
          end--;
        }
        replacements.push(
          { from, to: start, text: "" },
          { from: end, to, text: "" },
        );
        return false;
      }
      if (
        [
          "EmphasisMark",
          "StrikethroughMark",
          "HighlightMark",
          "HTMLTag",
          "ObsidianComment",
          "Image",
        ].includes(node.name)
      ) {
        return replace("");
      }
      if (node.name === "Escape") {
        replacements.push({ from, to: from + 1, text: "" });
        return false;
      }
      if (node.name === "Entity") {
        return replace(decodeMarkdownText(raw));
      }
      if (node.name === "Link") {
        const marks = node.node.getChildren("LinkMark");
        const closing = marks[1];
        if (closing) {
          replacements.push(
            { from, to: from + 1, text: "" },
            { from: closing.from - 2, to, text: "" },
          );
        }
      }
      return undefined;
    },
  });
  let text = "";
  const positions: number[] = [];
  const append = (
    from: number,
    to: number,
    value = source.slice(from, to),
  ): void => {
    if (!value) {
      return;
    }
    if (!positions.length) {
      positions.push(from);
    }
    for (let index = 0; index < value.length; index++) {
      positions.push(
        value.length === to - from
          ? from + index + 1
          : index === value.length - 1
            ? to
            : from,
      );
    }
    text += value;
  };
  let cursor = 0;
  for (const part of replacements.sort((a, b) => a.from - b.from)) {
    if (part.from < cursor) {
      continue;
    }
    append(cursor, part.from);
    append(part.from, part.to, part.text);
    cursor = part.to;
  }
  append(cursor, source.length);
  return { text, positions: positions.length ? positions : [0] };
}

/** Resolve against the rendered DOM before editing exposes Markdown syntax. */
export function renderedPosition(
  source: string,
  element: HTMLElement,
  point: { clientX: number; clientY: number },
): number | undefined {
  const caret = document.caretRangeFromPoint(point.clientX, point.clientY);
  if (!caret || !element.contains(caret.startContainer)) {
    return undefined;
  }
  const projection = inlineSourceMap(source);
  // Embedded media/math have their own DOM. Do not guess offsets through it.
  if (projection.text !== element.textContent) {
    return undefined;
  }
  const before = document.createRange();
  before.selectNodeContents(element);
  before.setEnd(caret.startContainer, caret.startOffset);
  return projection.positions[before.toString().length];
}
