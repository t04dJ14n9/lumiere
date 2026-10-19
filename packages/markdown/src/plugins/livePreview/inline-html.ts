import type { EditorState } from "@codemirror/state";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
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
  "span",
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
  const end = inlineHtmlEnd(node.node, cx.state);
  if (end === undefined) {
    return;
  }
  const name = openingName(cx.state.sliceDoc(node.from, node.to))!;
  const closingFrom = end - name.length - 3;
  cx.mark(node.to, closingFrom, `md-html md-html-${name}`);
  if (!cx.revealed(node.from, end)) {
    cx.hide(node.from, node.to);
    cx.hide(closingFrom, end);
  }
}

/** Lezer exposes HTML tags as siblings; pair them for decoration and reveal. */
export function inlineHtmlEnd(
  node: SyntaxNode,
  state: EditorState,
): number | undefined {
  if (node.name !== "HTMLTag") {
    return undefined;
  }
  const name = openingName(state.sliceDoc(node.from, node.to));
  if (!name) {
    return undefined;
  }
  let depth = 1;
  for (let next = node.nextSibling; next; next = next.nextSibling) {
    if (next.name !== "HTMLTag") {
      continue;
    }
    const tag = state.sliceDoc(next.from, next.to).toLowerCase();
    if (openingName(tag) === name) {
      depth++;
    } else if (tag === `</${name}>`) {
      depth--;
      if (depth === 0) {
        return next.to;
      }
    }
  }
  return undefined;
}
