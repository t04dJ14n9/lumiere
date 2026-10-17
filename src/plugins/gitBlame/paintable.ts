import type { EditorState } from "@codemirror/state";
import { blockIndex } from "../livePreview/blocks";
import { revealed } from "../livePreview/registry";

/**
 * Whether an EOL ghost at `position` would sit on visible source text.
 * Inside an unrevealed Live Preview replace the source is not painted, so an
 * inline widget at that offset can appear at the wrong visual Y (GitLens only
 * anchors to a visible caret-line baseline).
 */
export function canPaintBlameAt(state: EditorState, position: number): boolean {
  const blocks = state.field(blockIndex, false);
  if (!blocks) {
    return true;
  }
  const block = blocks.find(
    (entry) => entry.from <= position && position <= entry.to,
  );
  if (!block) {
    return true;
  }
  if (block.renderer.showSource?.(state, block)) {
    return true;
  }
  if (
    block.renderer.editing === "reveal" &&
    revealed(state, block.from, block.to)
  ) {
    return true;
  }
  return false;
}
