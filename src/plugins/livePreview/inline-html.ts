import type { SyntaxNodeRef } from "@lezer/common";
import type { InlineContext } from "./api";

/** Inline HTML elements Live Preview draws in place, as Obsidian does. */
const STYLED_TAGS = new Set([
  "kbd",
  "u",
  "ins",
  "s",
  "del",
  "mark",
  "sub",
  "sup",
  "b",
  "strong",
  "i",
  "em",
  "small",
]);

/** The element name of a plain opening tag such as `<kbd>`. */
function openingName(tag: string): string | undefined {
  const name = /^<([a-z]+)>$/i.exec(tag)?.[1]?.toLowerCase();
  return name && STYLED_TAGS.has(name) ? name : undefined;
}

/**
 * A `<kbd>…</kbd>`-style pair in a paragraph: its content takes the
 * element's look and both tags hide until the caret is in the pair.
 */
export function decorateInlineHtml(
  node: SyntaxNodeRef,
  cx: InlineContext,
): void {
  if (node.name !== "HTMLTag") {
    return;
  }
  const name = openingName(cx.state.sliceDoc(node.from, node.to));
  if (!name) {
    return;
  }
  const closing = `</${name}>`;
  for (let next = node.node.nextSibling; next; next = next.nextSibling) {
    if (next.name !== "HTMLTag") {
      continue;
    }
    const tag = cx.state.sliceDoc(next.from, next.to).toLowerCase();
    if (tag === closing) {
      cx.mark(node.to, next.from, `md-html md-html-${name}`);
      if (!cx.revealed(node.from, next.to)) {
        cx.hide(node.from, node.to);
        cx.hide(next.from, next.to);
      }
      return;
    }
    if (openingName(tag) === name) {
      return;
    }
  }
}
