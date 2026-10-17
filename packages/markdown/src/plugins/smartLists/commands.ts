import { ChangeSet, EditorSelection } from "@codemirror/state";
import type { EditorState, Transaction } from "@codemirror/state";
import {
  deleteMarkupBackward,
  insertNewlineContinueMarkupCommand,
} from "@codemirror/lang-markdown";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

// An empty item ends the list instead of making it loose, as in Obsidian.
const continueMarkup = insertNewlineContinueMarkupCommand({
  nonTightLists: false,
});
const prefix = String.raw`^(\s*(?:>\s?)*\s*(?:[-*+]|\d+[.)]))`;
const task = new RegExp(`${prefix}(\\s+\\[[^\\]\\n]\\])(\\s|$)`);
const bareMarker = new RegExp(`${prefix}(?:\\s+\\[[^\\]\\n]\\])?\\s?$`);
const listStart = new RegExp(`${prefix}\\s$`);

function run(state: EditorState): Transaction | null {
  let result: Transaction | null = null;
  const ok = continueMarkup({
    state,
    dispatch: (tr) => {
      result = tr;
    },
  });
  return ok ? result : null;
}

/** Enter: continue bullets, numbers and tasks; leave the list on an empty item. */
export function continueList(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  const match = task.exec(line.text);
  if (!match || range.head < line.from + match[0].length) {
    return dispatchResult(target, run(state));
  }
  const [, marker = "", taskBox = ""] = match;
  const box = {
    from: line.from + marker.length,
    to: line.from + marker.length + taskBox.length,
  };
  if (line.text.slice(match[0].length).trim() === "") {
    return emptyTask(target, box);
  }
  const tr = run(state);
  if (!tr) {
    return false;
  }
  const head = tr.newSelection.main.head;
  const next = tr.newDoc.lineAt(head);
  if (!listStart.test(next.text.slice(0, head - next.from))) {
    return dispatchResult(target, tr);
  }
  const box2 = ChangeSet.of([{ from: head, insert: "[ ] " }], tr.newDoc.length);
  target.dispatch(
    state.update({
      changes: tr.changes.compose(box2),
      selection: EditorSelection.cursor(head + 4),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}

function emptyTask(target: Target, box: { from: number; to: number }): boolean {
  const { state } = target;
  const removeBox = state.changes(box);
  const next = state.update({ changes: removeBox }).state;
  const tr = run(next);
  if (!tr) {
    return false;
  }
  target.dispatch(
    state.update({
      changes: removeBox.compose(tr.changes),
      selection: tr.newSelection,
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}

function dispatchResult(target: Target, tr: Transaction | null): boolean {
  if (!tr) {
    return false;
  }
  target.dispatch(tr);
  return true;
}

/** Backspace right after an item's marker removes the marker. */
export function removeMarker(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  const before = line.text.slice(0, range.head - line.from);
  const match = bareMarker.exec(before);
  if (!match || /^\s*>/.test(before)) {
    return deleteMarkupBackward(target);
  }
  const from = line.from + (/^\s*/.exec(before)?.[0].length ?? 0);
  target.dispatch(
    state.update({
      changes: { from, to: range.head },
      selection: EditorSelection.cursor(from),
      scrollIntoView: true,
      userEvent: "delete.backward",
    }),
  );
  return true;
}
