import type {
  ChangeSpec,
  EditorState,
  Extension,
  Line,
  Transaction,
} from "@codemirror/state";
import { getIndentUnit, indentString } from "@codemirror/language";
import { indentLess, indentMore } from "@codemirror/commands";
import { completionStatus } from "@codemirror/autocomplete";
import { ViewPlugin, type EditorView, type KeyBinding } from "@codemirror/view";
import { renumberAround } from "../../markdown/ordered-lists";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

const listItem = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/;

function width(state: EditorState, text: string): number {
  const space = /^\s*/.exec(text)?.[0] ?? "";
  let column = 0;
  for (const char of space) {
    column =
      char === "\t"
        ? column + state.tabSize - (column % state.tabSize)
        : column + 1;
  }
  return column;
}

/** The list item on `line` and its nested lines, as a line-number range. */
export function itemLines(state: EditorState, line: Line): [number, number] {
  const own = width(state, line.text);
  let last = line.number;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const text = state.doc.line(n).text;
    if (text.trim() === "" || width(state, text) <= own) {
      break;
    }
    last = n;
  }
  return [line.number, last];
}

function reindent(target: Target, delta: number): boolean {
  const { state } = target;
  const line = state.doc.lineAt(state.selection.main.head);
  const [first, last] = itemLines(state, line);
  const unit = getIndentUnit(state);
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    const current = state.doc.line(n);
    const space = /^\s*/.exec(current.text)?.[0] ?? "";
    const next = Math.max(0, width(state, current.text) + delta * unit);
    if (delta < 0 && space.length === 0) {
      continue;
    }
    changes.push({
      from: current.from,
      to: current.from + space.length,
      insert: indentString(state, next),
    });
  }
  if (changes.length === 0) {
    return true;
  }
  // As in Obsidian, ordered lists the item leaves or joins count on again.
  const indented = state.update({ changes }).state;
  const numbers = indented.changes(
    renumberAround(indented.doc, { first, last }, state.tabSize),
  );
  target.dispatch(
    state.update({
      changes: state.changes(changes).compose(numbers),
      scrollIntoView: true,
      userEvent: delta > 0 ? "input.indent" : "delete.dedent",
    }),
  );
  return true;
}

function onListItem(state: EditorState): boolean {
  const { ranges, main } = state.selection;
  return (
    ranges.length === 1 &&
    main.empty &&
    listItem.test(state.doc.lineAt(main.head).text)
  );
}

/**
 * Tab: indent a list item with its children; otherwise indent the lines the
 * selection touches, even with the caret mid-line, as Obsidian does.
 */
export function indentTab(target: Target): boolean {
  if (onListItem(target.state)) {
    return reindent(target, 1);
  }
  return indentMore(target);
}

/** Shift+Tab: outdent a list item with its children or the selected lines. */
export function outdentTab(target: Target): boolean {
  if (onListItem(target.state)) {
    return reindent(target, -1);
  }
  indentLess(target);
  // Shift+Tab never moves focus out of the note, even with nothing to outdent.
  return true;
}

/** Tab / Shift+Tab indent action (BH-040). Pure so unit tests need no DOM. */
export function indentationTabKey(event: {
  key: string;
  shiftKey: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}): "indent" | "outdent" | undefined {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) {
    return undefined;
  }
  if (event.key !== "Tab") {
    return undefined;
  }
  return event.shiftKey ? "outdent" : "indent";
}

/**
 * Capture-phase Tab / Shift+Tab so Vim's override-slot DOM handler cannot
 * swallow indent (BH-040). Prec.highest alone is too late on the note editor
 * because Vim registers in the `override` slot (same pattern as BH-006 image
 * keys). Keep the keymap for Insert / Vim-off; skip while suggest owns Tab.
 */
function captureIndentationTab(view: EditorView, event: KeyboardEvent): void {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.target !== view.contentDOM
  ) {
    return;
  }
  const action = indentationTabKey(event);
  if (!action) {
    return;
  }
  // Suggest owns Tab while a completion is open (Obsidian parity).
  if (completionStatus(view.state) === "active") {
    return;
  }
  const ran = action === "indent" ? indentTab(view) : outdentTab(view);
  if (!ran) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
}

const indentationCapture = ViewPlugin.define((view) => {
  const onKeydown = (event: KeyboardEvent) =>
    captureIndentationTab(view, event);
  view.contentDOM.addEventListener("keydown", onKeydown, true);
  return {
    destroy() {
      view.contentDOM.removeEventListener("keydown", onKeydown, true);
    },
  };
});

export function indentationDom(): Extension {
  return indentationCapture;
}

export const indentationKeymap: readonly KeyBinding[] = [
  { key: "Tab", run: indentTab, shift: outdentTab, preventDefault: true },
];
