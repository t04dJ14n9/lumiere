import type { EditorSelection, Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { getCM, type CodeMirror } from "@replit/codemirror-vim";
import { selectionFitsDoc } from "../../webview/ui/preserve-caret";

type ModeChange = { mode?: string };

/**
 * Whether leaving insert should put the insert-mode caret back.
 * Classic Vim shifts left onto the last character; we keep the insert column.
 */
export function shouldRestoreInsertExitCaret(input: {
  wasInsert: boolean;
  mode: string | undefined;
  saved: EditorSelection | null | undefined;
  current: EditorSelection;
  docLength: number;
}): boolean {
  if (!input.wasInsert || input.mode !== "normal" || !input.saved) {
    return false;
  }
  if (input.saved.eq(input.current)) {
    return false;
  }
  return selectionFitsDoc(input.saved, { length: input.docLength });
}

/**
 * Keep the exact insert-mode caret when Esc (or any leave-insert path) enters
 * normal mode. Mirrors `vim.sync`'s restore after `exitInsertMode(..., true)`.
 */
export function keepInsertExitCaret(): Extension {
  return ViewPlugin.define((view) => {
    const cm = getCM(view);
    return cm ? installKeepInsertExitCaret(view, cm) : {};
  });
}

/** Testable installer shared with the ViewPlugin. */
export function installKeepInsertExitCaret(view: EditorView, cm: CodeMirror) {
  let saved: EditorSelection | null = null;
  let wasInsert = false;
  const onMode = (event?: ModeChange) => {
    const mode = event?.mode;
    if (mode === "insert") {
      wasInsert = true;
      saved = view.state.selection;
      return;
    }
    if (
      !shouldRestoreInsertExitCaret({
        wasInsert,
        mode,
        saved,
        current: view.state.selection,
        docLength: view.state.doc.length,
      })
    ) {
      wasInsert = mode === "insert";
      if (!wasInsert) {
        saved = null;
      }
      return;
    }
    const restore = saved!;
    wasInsert = false;
    saved = null;
    queueMicrotask(() => restoreInsertCaret(view, restore));
  };
  cm.on("vim-mode-change", onMode);
  if (cm.state.vim?.insertMode) {
    wasInsert = true;
    saved = view.state.selection;
  }
  return {
    update(update: ViewUpdate) {
      if (getCM(update.view)?.state.vim?.insertMode) {
        wasInsert = true;
        saved = update.state.selection;
      }
    },
    destroy() {
      cm.off("vim-mode-change", onMode);
    },
  };
}

function restoreInsertCaret(view: EditorView, saved: EditorSelection): void {
  if (!view.dom.isConnected) {
    return;
  }
  if (!selectionFitsDoc(saved, view.state.doc)) {
    return;
  }
  if (!saved.eq(view.state.selection)) {
    view.dispatch({ selection: saved, scrollIntoView: false });
  }
}
