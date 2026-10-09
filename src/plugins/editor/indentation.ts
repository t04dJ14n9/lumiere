import { EditorSelection } from "@codemirror/state";
import type {
  ChangeSpec,
  EditorState,
  Line,
  Transaction,
} from "@codemirror/state";
import { getIndentUnit, indentString, indentUnit } from "@codemirror/language";
import { indentLess, indentMore } from "@codemirror/commands";
import type { KeyBinding } from "@codemirror/view";

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
  target.dispatch(
    state.update({
      changes,
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

/** Tab: indent a list item with its children or the selected lines; otherwise insert indentation. */
export function indentTab(target: Target): boolean {
  const { state } = target;
  if (onListItem(state)) {
    return reindent(target, 1);
  }
  if (state.selection.ranges.some((range) => !range.empty)) {
    return indentMore(target);
  }
  const insert = state.facet(indentUnit);
  target.dispatch(
    state.update(
      state.changeByRange((range) => ({
        changes: { from: range.from, insert },
        range: EditorSelection.cursor(range.from + insert.length),
      })),
      { scrollIntoView: true, userEvent: "input" },
    ),
  );
  return true;
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

export const indentationKeymap: readonly KeyBinding[] = [
  { key: "Tab", run: indentTab, shift: outdentTab, preventDefault: true },
];
