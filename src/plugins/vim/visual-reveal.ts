import { ViewPlugin } from "@codemirror/view";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import type { EditorSelection, Extension } from "@codemirror/state";
import { getCM, type CodeMirror } from "@replit/codemirror-vim";
import {
  setVisualRevealFreeze,
  visualRevealFreeze,
} from "../../webview/ui/pointer-selection";

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
    { provide: () => visualRevealFreeze },
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
