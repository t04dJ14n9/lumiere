import type { EditorState, TransactionSpec } from "@codemirror/state";

/** A list item's indentation and marker: a bullet, a number, or a task. */
const LIST_ITEM = /^(\s*)((?:[-*+]|\d+[.)]) (?:\[.\] )?)?/u;

/** Whether a line already is the kind of line `prefix` makes. */
function isKind(text: string, prefix: string): boolean {
  if (prefix === "1. ") {
    return /^\s*\d+[.)] (?!\[.\] )/u.test(text);
  }
  if (prefix === "- ") {
    return /^\s*[-*+] (?!\[.\] )/u.test(text);
  }
  return text.startsWith(prefix);
}

/**
 * Headings, lists and quotes on the selected lines, as in Obsidian: a
 * heading replaces the line's heading; a list marker replaces another list's
 * (a task's checkbox goes too), or comes off when every line has it; a quote
 * marker goes on, or comes off. A caret on an empty line ends up after the
 * marker. A selection ending at column zero does not include that line.
 */
export function lineEdit(state: EditorState, prefix: string): TransactionSpec {
  const selection = state.selection.main;
  const first = state.doc.lineAt(selection.from);
  const last = state.doc.lineAt(
    selection.empty ? selection.to : Math.max(selection.from, selection.to - 1),
  );
  const lines = Array.from(
    { length: last.number - first.number + 1 },
    (_, index) => state.doc.line(first.number + index),
  );
  const all = lines.every((line) => isKind(line.text, prefix));
  const changes = state.changes(
    lines.map((line, index) => {
      if (/^#{0,6} ?$/u.test(prefix)) {
        const old = /^#{1,6}\s+/u.exec(line.text)?.[0] ?? "";
        return { from: line.from, to: line.from + old.length, insert: prefix };
      }
      if (prefix === "> ") {
        return all
          ? { from: line.from, to: line.from + prefix.length }
          : { from: line.from, insert: prefix };
      }
      const [, indent = "", marker = ""] = LIST_ITEM.exec(line.text)!;
      const from = line.from + indent.length;
      const insert = prefix === "1. " ? `${index + 1}. ` : prefix;
      return { from, to: from + marker.length, insert: all ? "" : insert };
    }),
  );
  return {
    changes,
    selection: state.selection.map(changes, 1),
    userEvent: "input",
  };
}
/**
 * Insert Link, as in Obsidian: the selection becomes the label and the caret
 * goes into the empty URL; with no selection, into the empty label.
 */
export function linkEdit(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main;
  const label = state.sliceDoc(from, to);
  return {
    changes: { from, to, insert: `[${label}]()` },
    selection: { anchor: label ? from + label.length + 3 : from + 1 },
    userEvent: "input",
  };
}

/**
 * Insert Horizontal Rule, as in Obsidian: the rule replaces the selection on
 * a line of its own, after a blank line unless it starts its line, and the
 * caret goes to the start of the line after it.
 */
export function ruleEdit(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main;
  const before = state.sliceDoc(state.doc.lineAt(from).from, from);
  const insert = `${before ? "\n\n" : "\n"}---\n`;
  return {
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: "input",
  };
}
