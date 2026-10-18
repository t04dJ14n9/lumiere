import type { EditorState } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";
import { WidgetType } from "@codemirror/view";
import {
  highlightColourAt,
  type HighlightColour,
} from "../../markdown/dialect/highlight";
import type { InlineContext } from "./api";

/** The small colour dot that stands for a highlight's emoji while it is edited. */
class HighlightSwatch extends WidgetType {
  constructor(readonly colour: HighlightColour) {
    super();
  }
  override eq(other: HighlightSwatch): boolean {
    return other.colour === this.colour;
  }
  toDOM(): HTMLElement {
    const swatch = document.createElement("span");
    swatch.className = "md-highlight-swatch";
    swatch.dataset.highlight = this.colour;
    return swatch;
  }
}

/** A highlight's classes: `md-highlight`, and its colour's when it has one. */
export function highlightClass(state: EditorState, from: number): string {
  const colour = highlightColourAt(state.sliceDoc(from + 2, from + 4));
  return colour ? `md-highlight md-highlight-${colour}` : "md-highlight";
}

/**
 * A coloured highlight's emoji (`==🔵text==`), as Obsidian 1.14 shows it:
 * hidden, or a swatch in its place while the caret is in the highlight.
 */
export function decorateHighlightColour(
  node: SyntaxNodeRef,
  cx: InlineContext,
): void {
  if (node.name !== "Highlight") {
    return;
  }
  const emoji = node.from + 2;
  const colour = highlightColourAt(cx.state.sliceDoc(emoji, emoji + 2));
  if (!colour) {
    return;
  }
  if (cx.revealed(node.from, node.to)) {
    cx.replace(emoji, emoji + 2, new HighlightSwatch(colour));
  } else {
    cx.hide(emoji, emoji + 2);
  }
}
