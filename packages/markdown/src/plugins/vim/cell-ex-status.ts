import type { Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";

type StatusHost = { state: { statusbar?: HTMLElement | null } };

/**
 * Point a nested cell Vim adapter's dialog host at the outer note status bar.
 * Cells keep `vim({ status: false })` (no permanent cell chrome); sharing
 * `statusbar` makes `:`, `/`, and `?` mount via `updateStatus` on the note bar
 * instead of a nested `showVimPanel`.
 */
export function proxyCellExDialogToOuterStatus(
  cell: StatusHost,
  outer: StatusHost | null | undefined,
): () => void {
  const host = outer?.state.statusbar;
  if (!host) {
    return () => {};
  }
  const previous = cell.state.statusbar;
  cell.state.statusbar = host;
  return () => {
    if (cell.state.statusbar === host) {
      cell.state.statusbar = previous;
    }
  };
}

/** Install the outer-status share on nested (status: false) cell editors. */
export function shareOuterStatusForCellDialogs(outer: EditorView): Extension {
  return ViewPlugin.fromClass(
    class {
      private restore: () => void = () => {};
      constructor(view: EditorView) {
        this.restore = proxyCellExDialogToOuterStatus(
          getCM(view) ?? { state: {} },
          getCM(outer),
        );
      }
      destroy() {
        this.restore();
      }
    },
  );
}
