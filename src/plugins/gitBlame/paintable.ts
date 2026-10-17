import { Facet } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";

/**
 * Says whether the source at a position is painted. Live Preview supplies it
 * (through its service) because only it knows which ranges a rendered block
 * replaces; without a provider all source is visible.
 */
export const sourceVisibility =
  Facet.define<(state: EditorState, position: number) => boolean>();

/**
 * Whether an EOL ghost at `position` would sit on visible source text.
 * Inside an unrevealed Live Preview replace the source is not painted, so an
 * inline widget at that offset can appear at the wrong visual Y (GitLens only
 * anchors to a visible caret-line baseline).
 */
export function canPaintBlameAt(state: EditorState, position: number): boolean {
  return state
    .facet(sourceVisibility)
    .every((isVisible) => isVisible(state, position));
}
