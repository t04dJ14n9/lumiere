import type { EditorState } from "@codemirror/state";
import { blockIndex } from "./blocks";
import { revealed } from "./registry";

/**
 * Whether the Markdown source at `position` is painted. Inside a rendered
 * block that is not showing its source, the source text is replaced by a
 * widget, so an inline decoration anchored there would appear at the wrong
 * place (or not at all).
 */
export function sourceVisibleAt(state: EditorState, position: number): boolean {
  const block = state
    .field(blockIndex, false)
    ?.find((entry) => entry.from <= position && position <= entry.to);
  if (!block || block.renderer.showSource?.(state, block)) {
    return true;
  }
  return (
    block.renderer.editing === "reveal" && revealed(state, block.from, block.to)
  );
}
