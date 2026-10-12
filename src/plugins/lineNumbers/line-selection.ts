import {
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import type { Extension, Text, TransactionSpec } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { BlockInfo, DecorationSet } from "@codemirror/view";

/**
 * A whole-line selection made from the line numbers, as in VS Code: the
 * lines `from`..`to` (line starts and ends) plus their line break.
 *
 * The editor selection itself stops at the end of the last line, so nothing
 * on the next line is drawn or revealed (a fence there stays rendered). The
 * line break joins in through this field: copy and cut put it on the
 * clipboard, and typing, deleting or pasting over the selection replace it
 * too (the break before, for the last line of the note).
 */
export interface LineRange {
  from: number;
  to: number;
}

const setLines = StateEffect.define<LineRange | null>();

export const selectedLines = StateField.define<LineRange | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLines)) {
        return effect.value;
      }
    }
    if (!value || tr.docChanged) {
      return null;
    }
    const main = tr.state.selection.main;
    return tr.state.selection.ranges.length === 1 &&
      main.from === value.from &&
      main.to === value.to
      ? value
      : null;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (range) => emptyLineMarks(range)),
});

const emptyLine = Decoration.line({ class: "mw-line-selected-empty" });

/** Empty lines have no text to tint, so they get VS Code's short sliver. */
function emptyLineMarks(
  range: LineRange | null,
): (view: EditorView) => DecorationSet {
  return (view) => {
    if (!range) {
      return Decoration.none;
    }
    const { doc } = view.state;
    const marks = [];
    for (
      let n = doc.lineAt(range.from).number;
      n <= doc.lineAt(range.to).number;
      n++
    ) {
      const line = doc.line(n);
      if (line.length === 0) {
        marks.push(emptyLine.range(line.from));
      }
    }
    return Decoration.set(marks);
  };
}

/** The span a copy, cut or replacement covers: the lines with a break. */
export function withBreak(doc: Text, range: LineRange): LineRange {
  if (range.to < doc.length) {
    return { from: range.from, to: range.to + 1 };
  }
  return { from: Math.max(0, range.from - 1), to: range.to };
}

/**
 * The lines from the anchor block to the head block. The selection's head
 * goes on the side of the head block: the end of its last line when dragging
 * down, the start of its first when dragging up.
 */
export function lineSelectionFor(
  state: EditorState,
  anchor: LineRange,
  head: LineRange,
): { selection: EditorSelection; lines: LineRange } {
  const { doc } = state;
  const down = head.from >= anchor.from;
  const first = down ? anchor : head;
  const last = down ? head : anchor;
  const lines = {
    from: doc.lineAt(first.from).from,
    to: doc.lineAt(last.to).to,
  };
  return {
    selection: down
      ? EditorSelection.single(lines.from, lines.to)
      : EditorSelection.single(lines.to, lines.from),
    lines,
  };
}

/** Typing, deleting or pasting over the whole selection takes the break too. */
const replaceWithBreak = EditorState.transactionFilter.of((tr) => {
  const lines = tr.startState.field(selectedLines, false);
  if (
    !lines ||
    !tr.docChanged ||
    (!tr.isUserEvent("input") && !tr.isUserEvent("delete"))
  ) {
    return tr;
  }
  let exact = true;
  let count = 0;
  let insert = "";
  tr.changes.iterChanges((fromA, toA, ...[, , inserted]) => {
    count++;
    exact &&= fromA === lines.from && toA === lines.to;
    insert = inserted.toString();
  });
  if (count !== 1 || !exact) {
    return tr;
  }
  const span = withBreak(tr.startState.doc, lines);
  const keep =
    span.to === lines.to + 1 && insert !== "" && !insert.endsWith("\n")
      ? "\n"
      : "";
  const spec: TransactionSpec = {
    changes: { from: span.from, to: span.to, insert: insert + keep },
    selection: EditorSelection.cursor(span.from + insert.length),
    scrollIntoView: tr.scrollIntoView,
    annotations:
      tr.annotation(Transaction.userEvent) === undefined
        ? []
        : [Transaction.userEvent.of(tr.annotation(Transaction.userEvent)!)],
  };
  return spec;
});

function clipboard(
  view: EditorView,
  event: ClipboardEvent,
  cut: boolean,
): boolean {
  const lines = view.state.field(selectedLines, false);
  if (!lines || !event.clipboardData) {
    return false;
  }
  const { doc } = view.state;
  const text = doc.sliceString(lines.from, lines.to) + "\n";
  event.clipboardData.clearData();
  event.clipboardData.setData("text/plain", text);
  event.preventDefault();
  if (cut && !view.state.readOnly) {
    const span = withBreak(doc, lines);
    view.dispatch({
      changes: span,
      selection: EditorSelection.cursor(span.from),
      userEvent: "delete.cut",
      scrollIntoView: true,
    });
  }
  return true;
}

export const lineSelection: Extension = [
  selectedLines,
  replaceWithBreak,
  EditorView.domEventHandlers({
    copy: (event, view) => clipboard(view, event, false),
    cut: (event, view) => clipboard(view, event, true),
  }),
];

function blockAtY(view: EditorView, clientY: number): BlockInfo {
  return view.lineBlockAtHeight(clientY - view.documentTop);
}

/** Click, drag and shift+click on a line number, as in VS Code. */
export function startLineSelection(
  view: EditorView,
  block: BlockInfo,
  event: Event,
): boolean {
  const mouse = event as MouseEvent;
  if (mouse.button !== 0) {
    return false;
  }
  // Without this the browser starts a native selection in the gutter.
  mouse.preventDefault();
  view.focus();
  let anchor: LineRange = block;
  if (mouse.shiftKey) {
    const line = view.state.doc.lineAt(view.state.selection.main.anchor);
    anchor = { from: line.from, to: line.to };
  }
  const select = (head: LineRange) => {
    const { selection, lines } = lineSelectionFor(view.state, anchor, head);
    view.dispatch({
      selection,
      effects: setLines.of(lines),
      userEvent: "select.pointer",
      scrollIntoView: false,
    });
  };
  select(block);
  const doc = view.dom.ownerDocument;
  const move = (next: MouseEvent) => {
    if ((next.buttons & 1) === 0) {
      stop();
      return;
    }
    select(blockAtY(view, next.clientY));
  };
  const stop = () => {
    doc.removeEventListener("mousemove", move);
    doc.removeEventListener("mouseup", stop);
  };
  doc.addEventListener("mousemove", move);
  doc.addEventListener("mouseup", stop);
  return true;
}
