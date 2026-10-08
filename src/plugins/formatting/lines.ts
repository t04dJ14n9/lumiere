import type { EditorState, TransactionSpec } from "@codemirror/state";

/** A selection ending at column zero does not include the following line. */
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
  const heading = /^#{0,6} ?$/.test(prefix);
  const all = lines.every((line) =>
    prefix === "1. " ? /^\d+\. /.test(line.text) : line.text.startsWith(prefix),
  );
  const changes = lines.map((line, index) => {
    if (heading) {
      const old = /^#{1,6}\s+/.exec(line.text)?.[0] ?? "";
      return { from: line.from, to: line.from + old.length, insert: prefix };
    }
    const actual = prefix === "1. " ? `${index + 1}. ` : prefix;
    const old = existingListPrefix(line.text, prefix, all);
    return {
      from: line.from,
      to: line.from + (old?.length ?? 0),
      insert: all ? "" : actual,
    };
  });
  return { changes, userEvent: "input" };
}
export function linkEdit(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main;
  const label = state.sliceDoc(from, to);
  return {
    changes: { from, to, insert: `[${label}](url)` },
    selection: {
      anchor: from + label.length + 3,
      head: from + label.length + 6,
    },
    userEvent: "input",
  };
}

function existingListPrefix(
  text: string,
  prefix: string,
  all: boolean,
): string | undefined {
  if (prefix === "1. ") {
    return /^\d+\. /.exec(text)?.[0];
  }
  return all ? prefix : undefined;
}
