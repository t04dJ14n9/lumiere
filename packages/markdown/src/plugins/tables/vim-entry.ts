import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { VimMode, VimService } from "../vim/api";
import type { EditorState } from "@codemirror/state";
import { activeTables, tableProjection } from "./state";
import { enterTableAtSourcePosition } from "./widget";

type SelectionUpdate = Pick<
  ViewUpdate,
  "selectionSet" | "docChanged" | "state" | "transactions"
> & { focusChanged?: boolean };

export function canEnterVimTable(
  update: SelectionUpdate,
  mode: VimMode | undefined,
  settled = true,
): boolean {
  if (
    !update.selectionSet ||
    update.docChanged ||
    !isNormalVim(mode, settled)
  ) {
    return false;
  }
  const selection = update.state.selection;
  return (
    selection.ranges.length === 1 &&
    selection.main.empty &&
    !update.transactions.some(
      (transaction) =>
        transaction.annotation(tableProjection) ||
        transaction.isUserEvent("select.pointer"),
    )
  );
}

/**
 * `settled` also requires no pending operator, count or key prefix. While
 * Vim is still applying the very motion that moved the caret its input state
 * has not been cleared yet, so the update itself only checks the mode and the
 * deferred entry checks the settled state.
 */
function isNormalVim(mode: VimMode | undefined, settled: boolean): boolean {
  if (!mode || mode.insertMode || mode.visualMode) {
    return false;
  }
  if (!settled) {
    return true;
  }
  const input = mode.inputState;
  return !(
    input?.operator ||
    input?.keyBuffer?.length ||
    input?.prefixRepeat?.length ||
    input?.motionRepeat?.length
  );
}

/**
 * `vim` is read once, when the tables plugin starts: it restarts when Vim
 * comes or goes. A getter reading the plugin's context would throw once the
 * plugin is stopping, and the editor still updates this view plugin then
 * (each extension released before it reconfigures the editor).
 */
export function vimTableEntry(vim: VimService | undefined) {
  return ViewPlugin.define((view) => observeVimTableEntry(view, vim));
}

export function observeVimTableEntry(
  view: EditorView,
  vim: VimService | undefined,
) {
  let live = true;
  let generation = 0;
  const cancel = () => {
    generation++;
  };
  const stopWatching = watchEntryCancellation(view, vim, cancel);
  // A Vim operator edits the document and then places the caret in a second
  // transaction of the same task. That caret is part of the edit, not a motion
  // into a table (e.g. `dk` below a table must not open the row it leaves).
  let editedThisTask = false;
  return {
    update(update: SelectionUpdate) {
      if (update.selectionSet || update.docChanged || update.focusChanged) {
        cancel();
      }
      if (update.docChanged) {
        editedThisTask = true;
        queueMicrotask(() => {
          editedThisTask = false;
        });
      }
      if (
        !update.selectionSet ||
        editedThisTask ||
        activeTables.get(view) ||
        !canEnterVimTable(update, vim?.mode(view), false)
      ) {
        return;
      }
      const state = update.state;
      const pending = generation;
      // Opening projects a caret into the outer view. CM forbids dispatch
      // during an update; a newer edit or caret move, or disposal, cancels this entry (an unrelated update, such as Vim's cursor layer, does not).
      queueMicrotask(() => {
        if (
          !live ||
          pending !== generation ||
          !canCompleteEntry(view, state, vim)
        ) {
          return;
        }
        enterTableAtSourcePosition(view, state.selection.main.head);
      });
    },
    destroy() {
      live = false;
      cancel();
      stopWatching();
    },
  };
}

function canCompleteEntry(
  view: EditorView,
  state: EditorState,
  vim: VimService | undefined,
): boolean {
  const selection = view.state.selection;
  return (
    view.state.doc === state.doc &&
    selection.eq(state.selection) &&
    selection.ranges.length === 1 &&
    selection.main.empty &&
    !view.composing &&
    !activeTables.get(view) &&
    view.contentDOM.ownerDocument.activeElement === view.contentDOM &&
    isNormalVim(vim?.mode(view), true)
  );
}

function watchEntryCancellation(
  view: EditorView,
  vim: VimService | undefined,
  cancel: () => void,
): () => void {
  const unwatchMode = vim?.watchMode?.(view, cancel);
  view.contentDOM.addEventListener("blur", cancel);
  return () => {
    view.contentDOM.removeEventListener("blur", cancel);
    unwatchMode?.();
  };
}
