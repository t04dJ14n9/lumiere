import type { SyntaxNodeRef } from "@lezer/common";
import { markdownParser as inlineParser } from "../../markdown/dialect";

import { decodeMarkdownText } from "../../markdown/html";

/** Visible inline text and its original Markdown offsets, before DOM layout. */
export function inlineSourceMap(source: string): {
  text: string;
  positions: readonly number[];
} {
  return projectInlineText(source, inlineReplacements(source));
}

type Replacement = { from: number; to: number; text: string };
function inlineReplacements(source: string): Replacement[] {
  const replacements: Replacement[] = [];
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
        replacements.push(...codeDelimiters(source, node));
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
      if (node.name === "WikiLink") {
        replacements.push(...wikiLinkDelimiters(source, from, to));
        return false;
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
  return replacements;
}

function projectInlineText(
  source: string,
  replacements: Replacement[],
): { text: string; positions: readonly number[] } {
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
      positions.push(mappedOffset({ from, to, length: value.length, index }));
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
  // markdown-it wraps cell paragraphs in `<p>...</p>\n`, so strip trailing
  // block newlines before comparing against the inline projection.
  const domText = (element.textContent ?? "").replace(/\n+$/, "");
  // Embedded media/math have their own DOM. Do not guess offsets through it.
  if (projection.text !== domText) {
    return undefined;
  }
  const before = document.createRange();
  before.selectNodeContents(element);
  before.setEnd(caret.startContainer, caret.startOffset);
  const index = Math.min(
    before.toString().length,
    projection.positions.length - 1,
  );
  return projection.positions[index];
}

function mappedOffset({
  from,
  to,
  length,
  index,
}: {
  from: number;
  to: number;
  length: number;
  index: number;
}): number {
  if (length === to - from) {
    return from + index + 1;
  }
  return index === length - 1 ? to : from;
}

function wikiLinkDelimiters(
  source: string,
  from: number,
  to: number,
): Replacement[] {
  const inner = source.slice(from + 2, to - 2);
  let separator = -1;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\" && inner[i + 1] === "|") {
      i++;
      continue;
    }
    if (inner[i] === "|") {
      separator = i;
      break;
    }
  }
  const labelStart = separator < 0 ? from + 2 : from + 2 + separator + 1;
  const labelEnd = to - 2;
  const result: Replacement[] = [{ from, to: labelStart, text: "" }];
  for (let pos = labelStart; pos < labelEnd - 1; pos++) {
    if (source.slice(pos, pos + 2) === "\\|") {
      result.push({ from: pos, to: pos + 1, text: "" });
      pos++;
    }
  }
  result.push({ from: labelEnd, to, text: "" });
  return result;
}

function codeDelimiters(source: string, node: SyntaxNodeRef): Replacement[] {
  const from = node.from - 2;
  const to = node.to - 2;
  const marks = node.node.getChildren("CodeMark");
  let start = (marks[0]?.to ?? node.from) - 2;
  let end = (marks.at(-1)?.from ?? node.to) - 2;
  const content = source.slice(start, end);
  if (content.startsWith(" ") && content.endsWith(" ") && /\S/.test(content)) {
    start++;
    end--;
  }
  const result: Replacement[] = [{ from, to: start, text: "" }];
  // GFM table cells unescape `\|` inside inline code before rendering.
  for (let pos = start; pos < end - 1; pos++) {
    if (source.slice(pos, pos + 2) === "\\|") {
      result.push({ from: pos, to: pos + 1, text: "" });
      pos++;
    }
  }
  result.push({ from: end, to, text: "" });
  return result;
}
