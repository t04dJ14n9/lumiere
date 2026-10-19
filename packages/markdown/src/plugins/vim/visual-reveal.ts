import { ViewPlugin } from "@codemirror/view";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import {
  EditorState,
  type EditorSelection,
  type Extension,
} from "@codemirror/state";
import { getCM, type CodeMirror } from "@replit/codemirror-vim";
import {
  CLICK_SELECT,
  setVisualRevealFreeze,
  visualRevealFreeze,
} from "../../webview/ui/pointer-selection";

/**
 * A selection made with the mouse while visual mode froze reveal (a drag, or
 * a click that selects a formula or a callout) moves the freeze to it, in the
 * same transaction. The freeze holds the note still while motions extend a
 * selection; a click picks a new one, which reveals as it would outside
 * visual mode. Vim stays in visual mode, so no mode change would move it.
 */
const freezeFollowsPointer = EditorState.transactionExtender.of(
  (transaction) =>
    transaction.selection &&
    (transaction.isUserEvent("select.pointer") ||
      transaction.isUserEvent(CLICK_SELECT)) &&
    transaction.startState.field(visualRevealFreeze, false)
      ? { effects: setVisualRevealFreeze.of(transaction.newSelection) }
      : null,
);

/**
 * While Vim is in visual mode, freeze Live Preview reveal at the selection
 * from when visual started. Extending the selection with motions must not
 * reflow blocks under the growing range (height changes jump the viewport).
 * Thaw when visual ends so the final caret (or a new selection) reveals again.
 */
export function freezeRevealDuringVisual(): Extension {
  return ViewPlugin.define(
    (view) => {
      const cm = getCM(view);
      return cm ? installVisualRevealFreeze(view, cm) : {};
    },
    // Removing Vim drops the freeze in the reconfiguration transaction itself.
    // destroy() must not dispatch while CodeMirror is updating its plugins.
    { provide: () => [visualRevealFreeze, freezeFollowsPointer] },
  );
}

export function installVisualRevealFreeze(view: EditorView, cm: CodeMirror) {
  let visual: boolean | undefined;
  let destroyed = false;
  let scheduled = false;
  let pending: EditorSelection | null = null;
  let document = view.state.doc;

  const flush = () => {
    scheduled = false;
    const current = view.state.field(visualRevealFreeze, false);
    if (destroyed || current === undefined) {
      return;
    }
    const selection = pending;
    pending = null;
    if (selection || current) {
      view.dispatch({ effects: setVisualRevealFreeze.of(selection) });
    }
  };
  const sync = ({ mode }: { mode: string }) => {
    if (visual === (mode === "visual")) {
      return;
    }
    // Insert-mode events precede clearing vim.visualMode for visual c/I/A.
    visual = mode === "visual";
    pending = visual ? view.state.selection : null;
    document = view.state.doc;
    if (!scheduled) {
      scheduled = true;
      // Mode events can originate inside the Vim ViewPlugin's update().
      queueMicrotask(flush);
    }
  };
  cm.on("vim-mode-change", sync);
  const vim = cm.state.vim;
  sync({ mode: vim?.visualMode && !vim.insertMode ? "visual" : "normal" });
  return {
    update(update: ViewUpdate) {
      // An event emitted during this update already captured its new document.
      if (pending && document !== update.state.doc) {
        pending = pending.map(update.changes);
        document = update.state.doc;
      }
    },
    destroy() {
      destroyed = true;
      pending = null;
      cm.off("vim-mode-change", sync);
    },
  };
}
