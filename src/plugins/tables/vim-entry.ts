import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { VimMode, VimService } from "../vim/api";
import { activeTables, tableProjection } from "./state";
import { enterTableAtSourcePosition } from "./widget";

type SelectionUpdate = Pick<
  ViewUpdate,
  "selectionSet" | "docChanged" | "state" | "transactions"
>;

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

export function vimTableEntry(service: () => VimService | undefined) {
  return ViewPlugin.define((view) => observeVimTableEntry(view, service));
}

export function observeVimTableEntry(
  view: EditorView,
  service: () => VimService | undefined,
) {
  let live = true;
  // A Vim operator edits the document and then places the caret in a second
  // transaction of the same task. That caret is part of the edit, not a motion
  // into a table (e.g. `dk` below a table must not open the row it leaves).
  let editedThisTask = false;
  return {
    update(update: SelectionUpdate) {
      if (update.docChanged) {
        editedThisTask = true;
        queueMicrotask(() => {
          editedThisTask = false;
        });
      }
      if (
        editedThisTask ||
        activeTables.get(view) ||
        !canEnterVimTable(update, service()?.mode(view), false)
      ) {
        return;
      }
      const state = update.state;
      // Opening projects a caret into the outer view. CM forbids dispatch
      // during an update; a newer edit or caret move, or disposal, cancels this entry (an unrelated update, such as Vim's cursor layer, does not).
      queueMicrotask(() => {
        if (
          !live ||
          view.state.doc !== state.doc ||
          view.state.selection.main.head !== state.selection.main.head ||
          !view.state.selection.main.empty ||
          view.composing ||
          activeTables.get(view) ||
          !isNormalVim(service()?.mode(view), true)
        ) {
          return;
        }
        enterTableAtSourcePosition(view, state.selection.main.head);
      });
    },
    destroy() {
      live = false;
    },
  };
}
