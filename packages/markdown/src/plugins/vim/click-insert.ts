import type { EditorSelection } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { getCM, Vim, type CodeMirrorV } from "@replit/codemirror-vim";
import { CLICK_SELECT } from "../../webview/ui/pointer-selection";

/** A rendered-source selection uses `i` to edit at its head, not a text object. */
export function clickedSourceInsertHead(input: {
  clicked: EditorSelection | null;
  selection: EditorSelection;
  key: string;
  modified: boolean;
  visual: boolean;
}): number | undefined {
  return input.clicked?.eq(input.selection) &&
    input.key === "i" &&
    !input.modified &&
    input.visual
    ? input.selection.main.head
    : undefined;
}

export const insertIntoClickedSource = ViewPlugin.define((view) =>
  trackClickedSource(view),
);

/** Only the first key after an explicit widget selection gets this handoff. */
function trackClickedSource(view: EditorView) {
  let clicked: EditorSelection | null = null;
  const keydown = (event: KeyboardEvent): void => {
    const cm = getCM(view);
    const head = clickedSourceInsertHead({
      clicked,
      selection: view.state.selection,
      key: event.key,
      modified:
        event.ctrlKey || event.altKey || event.metaKey || event.shiftKey,
      visual: Boolean(cm?.state.vim?.visualMode && !cm.state.vim.insertMode),
    });
    clicked = null;
    if (
      !cm ||
      head === undefined ||
      view.compositionStarted ||
      event.defaultPrevented ||
      event.target !== view.contentDOM
    ) {
      return;
    }
    // Vim turns any non-empty external selection into visual mode. Leave it
    // before its key handler sees `i`, then let the ordinary insert mapping run.
    Vim.exitVisualMode(cm as CodeMirrorV, false);
    view.dispatch({ selection: { anchor: head } });
  };
  view.contentDOM.addEventListener("keydown", keydown, true);
  return {
    update(update: ViewUpdate) {
      for (const transaction of update.transactions) {
        if (transaction.isUserEvent(CLICK_SELECT)) {
          clicked = transaction.newSelection;
        } else if (transaction.selection || transaction.docChanged) {
          clicked = null;
        }
      }
    },
    destroy() {
      view.contentDOM.removeEventListener("keydown", keydown, true);
    },
  };
}
