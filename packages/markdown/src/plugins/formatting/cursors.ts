import { EditorSelection } from "@codemirror/state";
import type { Command } from "@codemirror/view";

/** The selection with a caret added at `head`, which becomes the main one. */
export function withCaretAt(
  selection: EditorSelection,
  head: number,
): EditorSelection {
  const ranges = [...selection.ranges, EditorSelection.cursor(head)];
  return EditorSelection.create(ranges, ranges.length - 1);
}

/**
 * Add Cursor Above or Below, as in Obsidian (bound to Cmd+Alt+Up and Down,
 * as in VS Code): a caret on the next line up or down from the main one, at
 * the same place on screen, which becomes the main caret.
 */
export function addCursor(forward: boolean): Command {
  return (view) => {
    const main = view.state.selection.main;
    const moved = view.moveVertically(
      EditorSelection.cursor(main.head),
      forward,
    );
    if (moved.head === main.head) {
      return false;
    }
    view.dispatch({
      selection: withCaretAt(view.state.selection, moved.head),
      scrollIntoView: true,
    });
    return true;
  };
}
