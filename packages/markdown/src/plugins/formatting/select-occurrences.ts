import type { EditorView } from "@codemirror/view";
import {
  selectNextOccurrence,
  selectSelectionMatches,
} from "@codemirror/search";

/**
 * VS Code Ctrl/Cmd+Shift+L: with an empty caret, select the word first, then
 * every occurrence (BH-038). CodeMirror's `selectSelectionMatches` noops when
 * `main.empty` (BH-037 wired the non-empty path).
 */
export function selectAllOccurrences(view: EditorView): boolean {
  if (view.state.selection.main.empty) {
    selectNextOccurrence(view);
  }
  return selectSelectionMatches(view);
}
